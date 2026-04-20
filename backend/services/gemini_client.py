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
    import asyncio as _aio
    import httpx as _hx, json as _j, os as _os

    last_error = None

    # ── STEP 1: Try Groq first (free, unlimited, fast) ──────────────
    groq_key = _os.getenv("GROQ_API_KEY", "")
    if groq_key:
        groq_prompt = prompt if len(prompt) <= 15000 else prompt[:15000] + "\n\n[...truncated for token limit. Complete the JSON with ALL the data provided above. Be thorough and specific.]"
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
                                {"role": "system", "content": "You are a JSON generator. Reply ONLY with valid JSON. No markdown, no explanation, no extra text. Be thorough, specific, and evidence-based in every field."},
                                {"role": "user", "content": groq_prompt}
                            ],
                            "temperature": temperature,
                            "max_tokens": 8000,
                        }
                    )
                    r.raise_for_status()
                    raw_body = r.text.strip()
                    if not raw_body:
                        raise ValueError("Empty response body from Groq")
                    response_json = _j.loads(raw_body)
                    txt = response_json["choices"][0]["message"]["content"].strip()
                    txt = txt.replace("```json", "").replace("```", "").strip()
                    result = _j.loads(txt)
                    log.info("[GeminiClient] Groq succeeded (primary)")
                    return result
            except Exception as groq_err:
                last_error = groq_err
                err_str = str(groq_err).lower()
                if ("429" in err_str or "too many" in err_str or "rate" in err_str) and attempt == 0:
                    wait_time = 3
                    log.warning(f"[GeminiClient] Groq rate limited — retrying in {wait_time}s")
                    await _aio.sleep(wait_time)
                    continue
                log.warning(f"[GeminiClient] Groq failed: {groq_err} — trying next provider")
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
                    txt = txt.replace("```json", "").replace("```", "").strip()
                    result = _j.loads(txt)
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
        for attempt in range(2):
            try:
                async with _hx.AsyncClient(timeout=30.0) as c:
                    r = await c.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {openrouter_key}",
                            "Content-Type": "application/json",
                            "HTTP-Referer": "https://dev-xray.vercel.app",
                        },
                        json={
                            "model": "meta-llama/llama-3.1-8b-instruct:free",
                            "messages": [
                                {"role": "system", "content": "Reply ONLY with valid JSON. No markdown."},
                                {"role": "user", "content": prompt}
                            ],
                            "temperature": temperature,
                            "max_tokens": 4000,
                        }
                    )
                    r.raise_for_status()
                    raw_body = r.text.strip()
                    if not raw_body:
                        raise ValueError("Empty response body from OpenRouter")
                    txt = _j.loads(raw_body)["choices"][0]["message"]["content"].strip()
                    txt = txt.replace("```json", "").replace("```", "").strip()
                    result = _j.loads(txt)
                    log.info("[GeminiClient] OpenRouter succeeded (tertiary)")
                    return result
            except Exception as or_err:
                last_error = or_err
                err_str = str(or_err).lower()
                if ("429" in err_str or "rate" in err_str) and attempt == 0:
                    log.warning("[GeminiClient] OpenRouter rate limited — retrying in 3s")
                    await _aio.sleep(3)
                    continue
                log.warning(f"[GeminiClient] OpenRouter failed: {or_err} — trying Gemini")
                break

    # ── STEP 4: Gemini flash as last resort ─────────────────────────
    from google.genai import types
    models_to_try = ["gemini-2.0-flash", "gemini-2.0-flash-lite"]
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
