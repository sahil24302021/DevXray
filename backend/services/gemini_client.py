import asyncio
import os
import json
import re

_client = None

def _get_client():
    global _client
    if _client is None:
        from google import genai
        key = os.getenv("GEMINI_API_KEY", "").strip()
        if not key:
            raise RuntimeError("GEMINI_API_KEY is not set. Add it to Render dashboard under Environment.")
        _client = genai.Client(api_key=key)
    return _client

async def generate_json(prompt: str, temperature: float = 0.0) -> dict:
    """
    Gemini JSON generation using new google-genai SDK.
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
                print(f"[GeminiClient] {model_name} attempt {attempt+1} failed: {e}")

                if "quota" in error_str or "429" in error_str or "resource_exhausted" in error_str:
                    wait_time = (attempt + 1) * 5
                    print(f"[GeminiClient] Quota hit. Waiting {wait_time}s...")
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
