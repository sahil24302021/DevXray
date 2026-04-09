import asyncio
import os
import json
import re
import time
import logging

log = logging.getLogger("gemini_client")

_client = None

# ═══ Global rate limiter ═══
# Free-tier Gemini allows ~15 RPM. We pace to max 10 RPM to be safe.
_rate_lock = asyncio.Lock() if hasattr(asyncio, 'Lock') else None
_last_call_time = 0.0
_MIN_INTERVAL = 4.0  # seconds between calls (= 15 RPM max)


def _get_client():
    global _client
    if _client is None:
        from google import genai
        key = os.getenv("GEMINI_API_KEY", "").strip()
        if not key:
            raise RuntimeError("GEMINI_API_KEY is not set. Add it to Render dashboard under Environment.")
        _client = genai.Client(api_key=key)
    return _client


async def _rate_limit():
    """Enforce minimum interval between Gemini API calls to avoid 429s."""
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
    Gemini JSON generation using new google-genai SDK.
    Includes global rate limiting to prevent 429 quota exhaustion on free tier.
    Tries gemini-2.0-flash first (fast + free), falls back to gemini-1.5-flash-latest.
    """
    from google.genai import types
    
    models_to_try = [
        "gemini-2.0-flash",
        "gemini-1.5-flash-latest", 
        "gemini-1.5-flash-8b",
    ]
    last_error = None

    for attempt in range(3):
        for model_name in models_to_try:
            try:
                # Rate limit BEFORE making the call
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
                return json.loads(content)
            except Exception as e:
                error_str = str(e).lower()
                last_error = e
                log.warning(f"[GeminiClient] {model_name} attempt {attempt+1} failed: {e}")

                if "quota" in error_str or "429" in error_str or "resource_exhausted" in error_str:
                    wait_time = (attempt + 1) * 15  # More aggressive backoff: 15s, 30s, 45s
                    log.info(f"[GeminiClient] Quota hit. Waiting {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    break
                elif "403" in error_str or "denied" in error_str:
                    raise RuntimeError(f"Gemini API key denied. Check GEMINI_API_KEY in Render. Error: {e}")
                # 404 or other — try next model
                continue

    raise RuntimeError(f"All Gemini models failed after 3 attempts. Last error: {last_error}")

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
