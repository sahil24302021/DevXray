import os
import json
import re
import logging

log = logging.getLogger("gemini_client")

_client = None


def _get_client():
    global _client
    if _client is None:
        from google import genai
        key = os.getenv("GEMINI_API_KEY", "").strip()
        if not key:
            raise RuntimeError("GEMINI_API_KEY not set in Render Environment.")
        _client = genai.Client(api_key=key)
    return _client


async def generate_json(prompt: str, temperature: float = 0.0) -> dict:
    import httpx as _hx, json as _j, os as _os

    # ── STEP 1: Try Groq first (free, unlimited, fast) ──────────────
    groq_key = _os.getenv("GROQ_API_KEY", "")
    if groq_key:
        # Truncate prompt for Groq — free tier has token limits
        groq_prompt = prompt if len(prompt) <= 6000 else prompt[:6000] + "\n\n[...truncated for token limit. Complete the JSON with the data provided above.]"
        try:
            async with _hx.AsyncClient(timeout=20.0) as c:
                r = await c.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {groq_key}",
                             "Content-Type": "application/json"},
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "messages": [
                            {"role": "system", "content": "You are a JSON generator. Reply ONLY with valid JSON. No markdown, no explanation, no extra text."},
                            {"role": "user", "content": groq_prompt}
                        ],
                        "temperature": temperature,
                        "max_tokens": 4000,
                    }
                )
                r.raise_for_status()
                txt = r.json()["choices"][0]["message"]["content"].strip()
                txt = txt.replace("```json", "").replace("```", "").strip()
                result = _j.loads(txt)
                log.info("[GeminiClient] Groq succeeded (primary)")
                return result
        except Exception as groq_err:
            log.warning(f"[GeminiClient] Groq primary failed: {groq_err} — trying Gemini")

    # ── STEP 2: Try Together AI (free $25 credit, never expires) ────
    together_key = _os.getenv("TOGETHER_API_KEY", "")
    if together_key:
        try:
            async with _hx.AsyncClient(timeout=20.0) as c:
                r = await c.post(
                    "https://api.together.xyz/v1/chat/completions",
                    headers={"Authorization": f"Bearer {together_key}",
                             "Content-Type": "application/json"},
                    json={
                        "model": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
                        "messages": [
                            {"role": "system", "content": "Reply ONLY with valid JSON. No markdown."},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": temperature,
                        "max_tokens": 4000,
                    }
                )
                r.raise_for_status()
                txt = r.json()["choices"][0]["message"]["content"].strip()
                txt = txt.replace("```json", "").replace("```", "").strip()
                result = _j.loads(txt)
                log.info("[GeminiClient] Together AI succeeded (secondary)")
                return result
        except Exception as together_err:
            log.warning(f"[GeminiClient] Together AI failed: {together_err} — trying Gemini")

    # ── STEP 3: Gemini flash as last resort ─────────────────────────
    from google.genai import types
    models_to_try = ["gemini-2.0-flash", "gemini-2.0-flash-lite"]
    last_error = None
    for model_name in models_to_try:
        try:
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
            result = _j.loads(content)
            log.info(f"[GeminiClient] Gemini {model_name} succeeded (fallback)")
            return result
        except Exception as e:
            last_error = e
            log.warning(f"[GeminiClient] Gemini {model_name} failed: {e}")
            continue

    raise RuntimeError(
        f"All AI providers failed. Last error: {last_error}. "
        f"Check GROQ_API_KEY in Render environment."
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
