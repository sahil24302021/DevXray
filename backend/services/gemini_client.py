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
    Primary: Claude Sonnet 3.5 (better structured JSON).
    Fallback: Gemini (if no ANTHROPIC_API_KEY or Claude fails).
    """
    # ── Try Claude first ──
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if anthropic_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=anthropic_key)
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                temperature=temperature,
                messages=[{"role": "user", "content": prompt}],
            )
            content = response.content[0].text
            if content:
                content = _clean_json(content)
                return json.loads(content)
        except Exception as e:
            print(f"[AI Client] Claude failed, falling back to Gemini: {e}")

    # ── Fallback: Gemini ──
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

    content = _clean_json(content)

    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        print(f"[Gemini Client] Broken JSON snippet: {content[max(0, e.pos-50):e.pos+50]}")
        raise


def _clean_json(content: str) -> str:
    """Strip markdown fences and fix trailing commas."""
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()
    content = re.sub(r',(\s*[}\]])', r'\1', content)
    return content
