import os
import json
import re
import logging
import time

log = logging.getLogger("gemini_client")

_client = None
_client_key = None  # Track which key the cached client uses

# Track rate limit state (cooldown timestamp) per key
_key_cooldowns = {}


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



def _get_gemini_keys():
    """Return all available Gemini API keys in priority order."""
    keys = [k for k in [
        os.environ.get("GEMINI_API_KEY"),
        os.environ.get("GEMINI_API_KEY_2"),
        os.environ.get("GEMINI_API_KEY_3"),
        os.environ.get("GEMINI_API_KEY_4"),
    ] if k and k.strip()]
    return [k.strip() for k in keys]


def sanitize_text(text) -> str:
    """Remove ALL invisible control characters that break JSON serialization.
    Covers C0 (\x00-\x08, \x0b, \x0c, \x0e-\x1f) and C1 (\x7f-\x9f) ranges.
    Keeps tab (\t), newline (\n), carriage return (\r).
    Replaces with space to preserve word boundaries."""
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)
    # Strip C0 control chars (except \t \n \r) and C1 control chars
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', ' ', text)


def _get_client(api_key: str = ""):
    """Return a genai Client, optionally for a specific key.
    If api_key is provided and differs from the cached one, create a fresh client."""
    global _client, _client_key
    if not api_key:
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set in Render Environment.")
    if _client is None or _client_key != api_key:
        from google import genai
        _client = genai.Client(api_key=api_key)
        _client_key = api_key
    return _client


async def generate_json(prompt: str, temperature: float = 0.0) -> dict:
    import asyncio as _aio
    import httpx as _hx, json as _j, os as _os
    import time as _time

    global _key_cooldowns
    last_error = None

    # ── Sanitize the prompt to remove control characters that break JSON ──
    prompt = sanitize_text(prompt)

    # ── STEP 1: Try Groq first (free, unlimited, fast) ──────────────
    # Support multiple Groq keys for rotation, both as separate env variables and comma-separated
    groq_keys = []
    # 1. Comma-separated list
    for k in _os.getenv("GROQ_API_KEYS", "").split(","):
        if k.strip() and k.strip() not in groq_keys:
            groq_keys.append(k.strip())
    # 2. Individual key variables
    for key_var in ["GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GROQ_API_KEY_4"]:
        k = _os.getenv(key_var, "").strip()
        if k and k not in groq_keys:
            groq_keys.append(k)

    for groq_idx, groq_key in enumerate(groq_keys):
        groq_label = f"key-{groq_idx + 1}"
        
        # Skip keys in cooldown
        cooldown_until = _key_cooldowns.get(groq_key, 0)
        if _time.time() < cooldown_until:
            log.info(f"[GeminiClient] Groq key-{groq_idx + 1} is in active cooldown, skipping")
            continue

        # Groq free tier: keep prompt under ~6000 chars (~1500 tokens) to avoid 413 Payload Too Large
        GROQ_MAX_CHARS = 6000
        groq_prompt = prompt if len(prompt) <= GROQ_MAX_CHARS else prompt[:GROQ_MAX_CHARS] + "\n\n[...truncated. Complete the JSON with ALL data above. Be thorough.]"
        for attempt in range(2):  # Retry once on rate limit
            try:
                async with _hx.AsyncClient(timeout=30.0) as c:
                    r = await c.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={"Authorization": f"Bearer {groq_key}",
                                 "Content-Type": "application/json"},
                        json={
                            "model": "llama-3.3-70b-versatile",
                            "messages": [
                                {"role": "system", "content": "Reply ONLY with valid JSON. No markdown. Be specific and evidence-based."},
                                {"role": "user", "content": groq_prompt}
                            ],
                            "temperature": temperature,
                            "max_tokens": 4000,
                        }
                    )
                    
                    if r.status_code == 429:
                        _key_cooldowns[groq_key] = _time.time() + 60
                        log.warning(f"[GeminiClient] Groq {groq_label} rate limited (429) — cooling down for 60s")
                        break

                    r.raise_for_status()
                    raw_body = r.text.strip()
                    if not raw_body:
                        raise ValueError("Empty response body from Groq")
                    response_json = _j.loads(raw_body)
                    txt = response_json["choices"][0]["message"]["content"].strip()
                    
                    result = safe_parse_json_response(txt)
                    if not result:
                        raise ValueError("Safe JSON parsing returned empty result")
                    log.info(f"[GeminiClient] Groq ({groq_label}) succeeded (primary)")
                    return result
            except Exception as groq_err:
                last_error = groq_err
                err_str = str(groq_err).lower()
                # 413 = Payload Too Large — don't retry, fall through immediately
                if "413" in err_str or "payload too large" in err_str or "too large" in err_str:
                    log.warning(f"[GeminiClient] Groq ({groq_label}) 413 payload too large — skipping to next provider")
                    break
                if ("429" in err_str or "too many" in err_str or "rate" in err_str):
                    _key_cooldowns[groq_key] = _time.time() + 60
                    if attempt == 0:
                        wait_time = 3
                        log.warning(f"[GeminiClient] Groq ({groq_label}) rate limited — retrying in {wait_time}s")
                        await _aio.sleep(wait_time)
                        continue
                    else:
                        # Retry exhausted — try next Groq key
                        log.warning(f"[GeminiClient] Groq ({groq_label}) rate limited after retry — rotating to next key")
                        break
                log.warning(f"[GeminiClient] Groq ({groq_label}) failed: {groq_err} — trying next provider")
                break

    # ── STEP 2: Try Together AI (free $25 credit, never expires) ────
    together_key = _os.getenv("TOGETHER_API_KEY", "")
    if together_key:
        for attempt in range(2):
            try:
                async with _hx.AsyncClient(timeout=30.0) as c:
                    r = await c.post(
                        "https://api.together.xyz/v1/chat/completions",
                        headers={"Authorization": f"Bearer {together_key}",
                                 "Content-Type": "application/json"},
                        json={
                            "model": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
                            "messages": [
                                {"role": "system", "content": "Reply ONLY with valid JSON. No markdown. Be thorough, specific, and evidence-based."},
                                {"role": "user", "content": prompt}
                            ],
                            "temperature": temperature,
                            "max_tokens": 8000,
                        }
                    )
                    r.raise_for_status()
                    raw_body = r.text.strip()
                    if not raw_body:
                        raise ValueError("Empty response body from Together AI")
                    response_json = _j.loads(raw_body)
                    txt = response_json["choices"][0]["message"]["content"].strip()
                    
                    result = safe_parse_json_response(txt)
                    if not result:
                        raise ValueError("Safe JSON parsing returned empty result")
                    log.info("[GeminiClient] Together AI succeeded (secondary)")
                    return result
            except Exception as together_err:
                last_error = together_err
                err_str = str(together_err).lower()
                if ("429" in err_str or "rate" in err_str) and attempt == 0:
                    log.warning("[GeminiClient] Together AI rate limited — retrying in 4s")
                    await _aio.sleep(4)
                    continue
                log.warning(f"[GeminiClient] Together AI failed: {together_err} — trying Gemini")
                break

    # ── STEP 3: Try OpenRouter (free tier, 100+ models) ────────
    openrouter_key = _os.getenv("OPENROUTER_API_KEY", "")
    if openrouter_key:
        OR_MODELS = [
            "meta-llama/llama-3.2-3b-instruct:free",     # Works consistently
            "google/gemma-2-9b-it:free",                    # Google model, usually available
            "microsoft/phi-3-mini-128k-instruct:free",      # Microsoft, reliable
            "mistralai/mistral-small-3.2-24b-instruct:free", # Mistral free tier
            "deepseek/deepseek-r1:free",                    # DeepSeek free
            "qwen/qwen2.5-7b-instruct:free",               # Qwen free
        ]
        for or_model in OR_MODELS:
            try:
                async with _hx.AsyncClient(timeout=25.0) as c:
                    r = await c.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {openrouter_key}",
                            "Content-Type": "application/json",
                            "HTTP-Referer": "https://dev-xray.vercel.app",
                            "X-Title": "DevXray AI",
                        },
                        json={
                            "model": or_model,
                            "messages": [
                                {"role": "system", "content": "Reply ONLY with valid JSON. No markdown, no explanation, no code blocks."},
                                {"role": "user", "content": prompt[:10000]}  # Trim to avoid context limits
                            ],
                            "temperature": temperature,
                            "max_tokens": 2500,
                        }
                    )

                    if r.status_code in (404, 400, 422):
                        log.warning(f"[GeminiClient] OpenRouter model {or_model} unavailable ({r.status_code}), trying next")
                        continue

                    if r.status_code == 429:
                        log.warning(f"[GeminiClient] OpenRouter rate limited on {or_model} — trying next model")
                        continue

                    r.raise_for_status()
                    raw_body = r.text.strip()
                    if not raw_body:
                        log.warning(f"[GeminiClient] OpenRouter {or_model} returned empty body")
                        continue

                    response_data = _j.loads(raw_body)
                    txt = response_data["choices"][0]["message"]["content"].strip()
                    
                    result = safe_parse_json_response(txt)
                    if not result:
                        continue
                    log.info(f"[GeminiClient] OpenRouter succeeded with {or_model}")
                    return result

            except Exception as or_err:
                last_error = or_err
                err_str = str(or_err).lower()
                if "429" in err_str or "rate" in err_str:
                    log.warning(f"[GeminiClient] OpenRouter rate limited on {or_model} — trying next model")
                    continue
                log.warning(f"[GeminiClient] OpenRouter {or_model} failed: {or_err}")
                continue
        log.warning("[GeminiClient] All OpenRouter models failed — trying Gemini")

    # ── STEP 4: Gemini flash as last resort (multi-key rotation) ──────
    from google.genai import types
    gemini_keys = _get_gemini_keys()
    models_to_try = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro"]

    for key_idx, api_key in enumerate(gemini_keys):
        key_label = f"key-{key_idx + 1}"
        for model_name in models_to_try:
            try:
                client = _get_client(api_key)
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=temperature,
                    ),
                )
                content = response.text
                if not content:
                    continue
                
                result = safe_parse_json_response(content)
                if not result:
                    raise ValueError("Gemini safe JSON parsing returned empty result")
                log.info(f"[GeminiClient] Gemini {model_name} ({key_label}) succeeded (fallback)")
                return result
            except Exception as e:
                last_error = e
                err_str = str(e).lower()
                is_quota = "429" in err_str or "quota" in err_str or "resource" in err_str or "rate" in err_str
                if is_quota and key_idx < len(gemini_keys) - 1:
                    log.warning(f"[GeminiClient] Gemini {model_name} ({key_label}) hit quota — rotating to next key")
                    break  # Break inner model loop → try next key
                log.warning(f"[GeminiClient] Gemini {model_name} ({key_label}) failed: {e}")
                continue

    # All retries exhausted — raise generic message (never surface quota details)
    log.error(f"All AI providers failed. Last error: {last_error}")
    raise RuntimeError("AI generation temporarily unavailable")


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
