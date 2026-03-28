import os
import json
import google.generativeai as genai

_configured = False

def _ensure_configured():
    global _configured
    if not _configured:
        key = os.getenv("GEMINI_API_KEY", "").strip()
        if not key:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. Add it to backend/.env"
            )
        genai.configure(api_key=key)
        _configured = True


def get_model(model_name: str = "gemini-2.5-flash"):
    """Returns a configured GenerativeModel, ensuring API key is set."""
    _ensure_configured()
    return genai.GenerativeModel(model_name)


async def generate_json(prompt: str, temperature: float = 0.1) -> dict:
    """
    Sends a prompt to Gemini and returns parsed JSON.
    Raises descriptive errors instead of silently failing.
    """
    _ensure_configured()
    model = genai.GenerativeModel("gemini-2.5-flash")
    
    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            temperature=temperature,
        ),
    )
    
    content = response.text
    if not content:
        raise ValueError("Gemini returned an empty response.")
    
    # Clean markdown fences if present
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()
    
    import re
    # Remove trailing commas that break strict JSON parsing
    content = re.sub(r',(\s*[}\]])', r'\1', content)
    
    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        # If it still fails, print a snippet of the broken JSON to help debug
        print(f"[Gemini Client] Broken JSON snippet: {content[max(0, e.pos-50):e.pos+50]}")
        raise
