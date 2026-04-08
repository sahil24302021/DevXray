import asyncio
import os
import json
import re
import google.generativeai as genai

_configured = False

def _ensure_configured():
    global _configured
    if not _configured:
        key = os.getenv("GEMINI_API_KEY", "").strip()
        if not key:
            raise RuntimeError("GEMINI_API_KEY is not set in environment variables. Add it to Render dashboard under Environment.")
        genai.configure(api_key=key)
        _configured = True

def get_model(model_name: str = "gemini-1.5-flash"):
    _ensure_configured()
    return genai.GenerativeModel(model_name)

async def generate_json(prompt: str, temperature: float = 0.0) -> dict:
    """
    Gemini-only JSON generation with retry logic.
    Uses gemini-1.5-flash as primary, gemini-1.5-pro as fallback for complex prompts.
    """
    _ensure_configured()
    
    models_to_try = ["gemini-1.5-flash", "gemini-1.5-pro"]
    last_error = None
    
    for attempt in range(3):  # 3 retries total
        for model_name in models_to_try:
            try:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(
                    prompt,
                    generation_config=genai.GenerationConfig(
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
                    # Quota hit — wait before retry
                    wait_time = (attempt + 1) * 5  # 5s, 10s, 15s
                    print(f"[GeminiClient] Quota hit. Waiting {wait_time}s before retry...")
                    await asyncio.sleep(wait_time)
                    break  # Break model loop, retry with same model after wait
                elif "403" in error_str or "denied" in error_str:
                    raise RuntimeError(f"Gemini API access denied. Check your GEMINI_API_KEY in Render environment variables. Error: {e}")
                # Other errors — try next model
                continue
        
    raise RuntimeError(f"All Gemini models failed after 3 attempts. Last error: {last_error}")

def _clean_json(content: str) -> str:
    """Strip markdown fences and fix trailing commas."""
    content = content.strip()
    if content.startswith("```json"):
        content = content[7:]
    elif content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()
    # Fix trailing commas before } or ]
    content = re.sub(r',(\s*[}\]])', r'\1', content)
    return content
