import os
import json
import re
import logging
import time

log = logging.getLogger("gemini_client")

_client = None
_client_key = None  # Track which key the cached client uses

# ── Circuit Breaker ──────────────────────────────────────────────
# Tracks failures per provider. If a provider fails, skip it for CIRCUIT_BREAKER_COOLDOWN seconds.
# This prevents the cascade of 20+ failed requests that was causing 44-second delays.
_circuit_breaker: dict[str, float] = {}  # provider_key -> cooldown_until timestamp
CIRCUIT_BREAKER_COOLDOWN = 600  # 10 minutes

# Track rate limit state (cooldown timestamp) per key
_key_cooldowns = {}


def _is_circuit_open(provider_key: str) -> bool:
    """Check if a provider is in circuit-breaker cooldown (should be skipped)."""
    until = _circuit_breaker.get(provider_key, 0)
    if time.time() < until:
        remaining = int(until - time.time())
        log.debug(f"[CircuitBreaker] {provider_key} is open — {remaining}s remaining, skipping")
        return True
    return False


def _trip_circuit(provider_key: str, reason: str, cooldown: int = CIRCUIT_BREAKER_COOLDOWN):
    """Open the circuit breaker for a provider after a non-transient failure."""
    _circuit_breaker[provider_key] = time.time() + cooldown
    log.warning(f"[CircuitBreaker] Tripped for {provider_key} ({reason}) — skipping for {cooldown}s")


def _is_non_retryable(status_code: int) -> bool:
    """Returns True for HTTP status codes that will never succeed on retry."""
    # 400 = bad request, 401 = unauthorized, 403 = forbidden, 404 = not found, 422 = unprocessable
    return status_code in (400, 401, 403, 404, 422)


def safe_parse_json_response(response_text: str, fallback: dict = None) -> dict:
    """Safely parse AI JSON responses — handles both string and dict returns, strips markdown."""
    if fallback is None:
        fallback = {}
    
    if isinstance(response_text, dict):
        return response_text  # Already parsed
    
    if not isinstance(response_text, str):
        return fallback
    
    # Strip markdown code fences if present
    clean = response_text.strip()
    if clean.startswith("```json"):
        clean = clean[7:]
    elif clean.startswith("```"):
        clean = clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    clean = clean.strip()
    
    try:
        parsed = json.loads(clean)
        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, list):
            return {"items": parsed}
        return fallback
    except json.JSONDecodeError:
        # Try to extract JSON object from mixed text
        json_match = re.search(r'\{.*\}', clean, re.DOTALL)
        if json_match:
            try:
                parsed = json.loads(json_match.group())
                if isinstance(parsed, dict):
                    return parsed
            except:
                pass
        return fallback



PRIMARY_MODEL = "gemini-3.8-flash"


def _get_gemini_keys() -> list[str]:
    """Return all available Gemini API keys in priority order (key-1, key-2, key-3)."""
    keys = [
        os.environ.get("GEMINI_API_KEY"),
        os.environ.get("GEMINI_API_KEY_2"),
        os.environ.get("GEMINI_API_KEY_3"),
    ]
    return [k.strip() for k in keys if k and k.strip()]


def sanitize_text(text) -> str:
    """Remove ALL invisible control characters that break JSON serialization.
    Covers C0 (\x00-\x08, \x0b, \x0c, \x0e-\x1f) and C1 (\x7f-\x9f) ranges.
    Keeps tab (\t), newline (\n), carriage return (\r).
    Replaces with space to preserve word boundaries."""
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', ' ', text)


def _get_client(api_key: str = ""):
    """Return a genai Client, optionally for a specific key.
    If api_key is provided and differs from the cached one, create a fresh client."""
    global _client, _client_key
    if not api_key:
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set in Environment.")
    if _client is None or _client_key != api_key:
        from google import genai
        _client = genai.Client(api_key=api_key)
        _client_key = api_key
    return _client


async def generate_json(prompt: str, temperature: float = 0.0) -> dict:
    """Generate structured JSON using Gemini 3.8 Flash as the primary provider with multi-key rotation.

    Active Flow:
      1. Gemini key-1 -> gemini-3.8-flash -> Success (return immediately)
      2. If 429/quota -> rotate to Gemini key-2 -> gemini-3.8-flash
      3. If 429/quota -> rotate to Gemini key-3 -> gemini-3.8-flash

    Error Handling:
      - 200: Return success immediately
      - 429/quota/rate limit: Immediately move to the next Gemini key (no delay on current key)
      - 400/404: Do not retry; move to the next key
      - 500/502/503: Retry at most once after 1 second, then move to the next key
      - Timeout/network error: Retry at most once after 1 second, then move to the next key
    """
    import asyncio as _aio
    from google.genai import types

    # 1. Sanitize prompt to eliminate control characters that break JSON
    prompt = sanitize_text(prompt)

    gemini_keys = _get_gemini_keys()
    if not gemini_keys:
        log.error("[AI] No Gemini API keys configured (GEMINI_API_KEY missing)")
        raise RuntimeError("No Gemini API keys configured")

    last_error = None

    for key_idx, api_key in enumerate(gemini_keys):
        key_label = f"key-{key_idx + 1}"
        next_key_label = f"key-{key_idx + 2}" if (key_idx + 1 < len(gemini_keys)) else None

        # Max 2 attempts for transient errors (500/502/503/timeout), exactly 1 attempt for 400/404/429
        for attempt in range(2):
            log.info(f"[AI] Gemini {key_label} → {PRIMARY_MODEL}")

            try:
                client = _get_client(api_key)

                # Run synchronous SDK call in thread pool to avoid blocking the event loop
                response = await _aio.to_thread(
                    client.models.generate_content,
                    model=PRIMARY_MODEL,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=temperature,
                    ),
                )

                content = response.text
                if not content:
                    raise ValueError(f"Gemini {PRIMARY_MODEL} returned empty text")

                result = safe_parse_json_response(content)
                if not result:
                    raise ValueError("Gemini safe JSON parsing returned empty result")

                log.info("[AI] Gemini success")
                return result

            except Exception as e:
                last_error = e
                err_str = str(e).lower()

                # 1. 429 / Rate limit / Quota -> immediately move to next Gemini key (no delay on same key)
                is_quota = any(term in err_str for term in ["429", "quota", "resource_exhausted", "rate_limit", "rate limit"])
                if is_quota:
                    if next_key_label:
                        log.warning(f"[AI] Gemini {key_label} rate limited → trying {next_key_label}")
                    else:
                        log.warning(f"[AI] Gemini {key_label} rate limited → no more Gemini keys")
                    break  # Move immediately to next key

                # 2. 400 (Bad Request) or 404 (Not Found / Model Not Found) -> do not retry, move to next key
                is_client_error = any(term in err_str for term in ["400", "404", "invalid_argument", "not_found", "not found", "no longer available"])
                if is_client_error:
                    log.warning(f"[AI] Gemini {key_label} client error ({e}) — not retrying, moving to next key")
                    break

                # 3. 500 / 502 / 503 (Server / Unavailable) or Timeout / Network -> retry at most once after 1s
                is_transient = any(term in err_str for term in ["500", "502", "503", "unavailable", "internal", "timeout", "timed out", "connection", "network"])
                if is_transient and attempt == 0:
                    log.warning(f"[AI] Gemini {key_label} transient error ({e}) — retrying once in 1s")
                    await _aio.sleep(1.0)
                    continue

                log.warning(f"[AI] Gemini {key_label} failed ({e}) — moving to next key")
                break

    # All Gemini keys exhausted
    log.error(f"[AI] All Gemini keys exhausted. Last error: {last_error}")
    raise RuntimeError("AI generation temporarily unavailable")


# ═════════════════════════════════════════════════════════════════════
# DORMANT PROVIDERS (Preserved for future use; not called in active path)
# ═════════════════════════════════════════════════════════════════════

async def _dormant_groq_call(prompt: str, temperature: float = 0.0) -> dict:
    """Legacy Groq implementation preserved for future reference."""
    import httpx as _hx
    groq_keys = [k for k in [
        os.environ.get("GROQ_API_KEY"),
        os.environ.get("GROQ_API_KEY_2"),
        os.environ.get("GROQ_API_KEY_3"),
    ] if k and k.strip()]
    if not groq_keys:
        return {}
    async with _hx.AsyncClient(timeout=30.0) as c:
        r = await c.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_keys[0]}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt[:6000]}],
                "temperature": temperature,
            }
        )
        if r.status_code == 200:
            return safe_parse_json_response(r.json()["choices"][0]["message"]["content"])
    return {}


async def _dormant_together_call(prompt: str, temperature: float = 0.0) -> dict:
    """Legacy Together AI implementation preserved for future reference."""
    import httpx as _hx
    together_key = os.environ.get("TOGETHER_API_KEY", "").strip()
    if not together_key:
        return {}
    async with _hx.AsyncClient(timeout=30.0) as c:
        r = await c.post(
            "https://api.together.xyz/v1/chat/completions",
            headers={"Authorization": f"Bearer {together_key}", "Content-Type": "application/json"},
            json={
                "model": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
            }
        )
        if r.status_code == 200:
            return safe_parse_json_response(r.json()["choices"][0]["message"]["content"])
    return {}


async def _dormant_openrouter_call(prompt: str, temperature: float = 0.0) -> dict:
    """Legacy OpenRouter implementation preserved for future reference."""
    import httpx as _hx
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not openrouter_key:
        return {}
    async with _hx.AsyncClient(timeout=25.0) as c:
        r = await c.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {openrouter_key}", "Content-Type": "application/json"},
            json={
                "model": "meta-llama/llama-3.2-3b-instruct:free",
                "messages": [{"role": "user", "content": prompt[:10000]}],
                "temperature": temperature,
            }
        )
        if r.status_code == 200:
            return safe_parse_json_response(r.json()["choices"][0]["message"]["content"])
    return {}


def _clean_json(content: str) -> str:
    content = content.strip()
    if content.startswith("```json"):
        content = content[7:]
    elif content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()
    content = re.sub(r',(\s*[}\]])', r'\1', content)
    return content
