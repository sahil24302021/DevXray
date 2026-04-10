import asyncio
import os
import json
import re
import time
import logging

log = logging.getLogger("gemini_client")

_client = None

# Rate limiter: free tier = 15 RPM, we pace at 10 RPM to be safe
_rate_lock = None
_last_call_time = 0.0
_MIN_INTERVAL = 4.0  # 4s between calls


def _get_client():
    global _client
    if _client is None:
        from google import genai
        key = os.getenv("GEMINI_API_KEY", "").strip()
        if not key:
            raise RuntimeError("GEMINI_API_KEY not set in Render Environment.")
        _client = genai.Client(api_key=key)
    return _client


async def _rate_limit():
    global _last_call_time, _rate_lock
    if _rate_lock is None:
        _rate_lock = asyncio.Lock()
    async with _rate_lock:
        now = time.monotonic()
        elapsed = now - _last_call_time
        if elapsed < _MIN_INTERVAL:
            wait = _MIN_INTERVAL - elapsed
            log.info(f"[GeminiClient] Rate limiting: waiting {wait:.1f}s before next call")
            await asyncio.sleep(wait)
        _last_call_time = time.monotonic()


async def generate_json(prompt: str, temperature: float = 0.0) -> dict:
    """
    Gemini JSON generation.

    Model strategy (as of April 2026):
    - gemini-2.5-flash: works on new API keys, sometimes 503 (overloaded) — retry
    - gemini-2.5-pro:   works on new API keys, slower but more reliable
    - gemini-1.5-pro:   fallback, stable
    
    503 UNAVAILABLE = server overloaded, RETRY (not a key problem)
    403 PERMISSION_DENIED = wrong key or model not available for this key
    404 NOT_FOUND = model name wrong or deprecated
    """
    from google.genai import types

    # Only models confirmed working on new API keys (April 2026)
    # gemini-2.5-flash first (fast, free), then fallbacks
    models_to_try = [
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-2.0-flash-exp",
    ]
    last_error = None

    for attempt in range(5):  # 5 total attempts
        for model_name in models_to_try:
            try:
                await _rate_limit()
                client = _get_client()
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
                content = _clean_json(content)
                result = json.loads(content)
                log.info(f"[GeminiClient] Success with {model_name} on attempt {attempt+1}")
                return result

            except Exception as e:
                error_str = str(e).lower()
                last_error = e
                log.warning(f"[GeminiClient] {model_name} attempt {attempt+1} failed: {e}")

                if "503" in error_str or "unavailable" in error_str or "overload" in error_str:
                    # 503 = server overloaded, NOT a key issue — retry with backoff
                    wait_time = min(5 * (attempt + 1), 30)
                    log.info(f"[GeminiClient] 503 overloaded. Waiting {wait_time}s then retrying...")
                    await asyncio.sleep(wait_time)
                    break  # retry from top of models list after wait

                elif "429" in error_str or "quota" in error_str or "resource_exhausted" in error_str:
                    wait_time = 15 * (attempt + 1)
                    log.info(f"[GeminiClient] Quota hit. Waiting {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    break

                elif "403" in error_str or "permission" in error_str or "denied" in error_str:
                    # This model not available for this key — try next model
                    log.warning(f"[GeminiClient] {model_name} denied for this key, trying next model")
                    continue

                elif "404" in error_str or "not_found" in error_str or "not found" in error_str:
                    # Model deprecated/renamed — try next model
                    log.warning(f"[GeminiClient] {model_name} not found (deprecated), trying next model")
                    continue

                # Unknown error — try next model
                continue

    try:
        import httpx as _httpx_groq, json as _json_groq, os as _os_groq
        groq_key = _os_groq.getenv("GROQ_API_KEY", "")
        if groq_key:
            log.info("[GeminiClient] Trying Groq fallback (free LLaMA 3.1 70B)")
            async with _httpx_groq.AsyncClient(timeout=30.0) as _c:
                _r = await _c.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                    json={
                        "model": "llama-3.1-70b-versatile",
                        "messages": [
                            {"role": "system", "content": "You are a JSON generator. Reply ONLY with valid JSON. No markdown, no explanation."},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0,
                        "max_tokens": 4000,
                    }
                )
                _r.raise_for_status()
                _txt = _r.json()["choices"][0]["message"]["content"].strip()
                _txt = _txt.replace("```json", "").replace("```", "").strip()
                _result = _json_groq.loads(_txt)
                log.info("[GeminiClient] Groq fallback succeeded")
                return _result
    except Exception as _groq_err:
        log.warning(f"[GeminiClient] Groq fallback also failed: {_groq_err}")

    raise RuntimeError(
        f"All Gemini models failed after 5 attempts. Last error: {last_error}. "
        f"Check GEMINI_API_KEY in Render Environment. "
        f"Get a new key: https://aistudio.google.com/app/apikey"
    )


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
