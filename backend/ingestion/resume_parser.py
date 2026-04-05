
import io
import os
import json
import re
import hashlib
from typing import Dict, Any, List

_resume_parse_cache: dict = {}

# PDF Support
try:
    import PyPDF2
    HAS_PDF = True
except ImportError:
    HAS_PDF = False

# DOCX Support
try:
    import docx2txt
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False

from services.gemini_client import generate_json


def _normalize_resume_keys(resume_data: dict) -> dict:
    """Force canonical key names regardless of what Gemini returns.

    FIX 5: Gemini is nondeterministic in key names for projects.
    It might use 'project_name', 'title', 'tech_stack', 'tools', etc.
    This normalizes them to consistent keys: 'name', 'description', 'technologies'.
    """
    KEY_MAP = {
        "project_name": "name",
        "title": "name",
        "project_title": "name",
        "summary": "description",
        "details": "description",
        "tech_stack": "technologies",
        "tools": "technologies",
        "skills_used": "technologies",
        "stack": "technologies",
        "skill": "name",
    }
    projects = resume_data.get("projects", [])
    normalized_projects = []
    for proj in projects:
        if not isinstance(proj, dict):
            continue
        clean = {}
        for k, v in proj.items():
            canonical = KEY_MAP.get(k.lower(), k)
            clean[canonical] = v
        # Ensure required keys exist
        if "name" not in clean:
            clean["name"] = clean.get("project_name", clean.get("title", ""))
        if "technologies" not in clean:
            clean["technologies"] = (
                clean.get("tech_stack", clean.get("tools", []))
            )
        normalized_projects.append(clean)

    resume_data["projects"] = normalized_projects
    return resume_data


def _extract_text(file_content: bytes, filename: str) -> str:
    """Extract raw text from PDF, DOCX, or plain text files."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    text = ""

    if ext == "pdf" and HAS_PDF:
        try:
            reader = PyPDF2.PdfReader(io.BytesIO(file_content))
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        except Exception as e:
            print(f"[ResumeParser] PDF extraction error: {e}")

    elif ext in ("doc", "docx") and HAS_DOCX:
        try:
            text = docx2txt.process(io.BytesIO(file_content))
        except Exception as e:
            print(f"[ResumeParser] DOCX extraction error: {e}")

    # Fallback: treat as plain text
    if not text.strip():
        text = file_content.decode("utf-8", errors="ignore")

    return text.strip()


def _extract_urls(text: str) -> List[str]:
    """Extract all URLs from the resume text."""
    url_pattern = r'https?://[^\s<>"\')\]},]+'
    return list(set(re.findall(url_pattern, text)))


async def parse_resume_with_gemini(file_content: bytes, filename: str) -> Dict[str, Any]:
    """
    Extracts deeply structured data from a resume file using Gemini AI.
    This is the core intelligence of the Resume Analyzer.
    """
    text = _extract_text(file_content, filename)
    if not text:
        raise ValueError("Could not extract any text from the uploaded document.")

    cache_key = hashlib.md5(text.encode("utf-8")).hexdigest()
    if cache_key in _resume_parse_cache:
        print(f"[ResumeParser] Cache HIT ({cache_key[:8]})")
        return _resume_parse_cache[cache_key]

    # Also do a regex pass to find URLs the AI might miss
    found_urls = _extract_urls(text)

    prompt = f"""You are a world-class technical recruiter and resume intelligence engine.
Your job is to deeply parse the following resume and extract EVERY piece of verifiable information.

CRITICAL INSTRUCTIONS:
1. Extract the REAL data from the resume. Do NOT invent or hallucinate anything.
2. If a field is not found in the resume, use an empty string "" or empty list [].
3. For "claims", extract EVERY factual statement the candidate makes about their work.
   Include project descriptions, achievements, technologies used, scale/impact statements.
   Be thorough — extract at least 5-15 claims if the resume contains them.
4. For "github_username", extract ONLY the username part (e.g., "sahil24302021" not the full URL).
   If you see a URL like "github.com/username", extract just "username".
5. For "projects", extract every project mentioned with its description and technologies.

Respond with a JSON object matching this EXACT schema — no extra keys, no markdown:

{{
    "name": "Full Name of the candidate",
    "email": "email@example.com",
    "phone": "phone number if found",
    "github_username": "just the username, not URL",
    "github_url": "Extract GitHub profile URL. Look for 'github.com/username' (not github.com/username/reponame). Prepend https:// if missing.",
    "linkedin_url": "Extract the FULL LinkedIn URL. Look for 'linkedin.com/in/...' anywhere in the text. If found as 'linkedin.com/in/xyz' without https://, prepend https://www. Return empty string if not found.",
    "portfolio_url": "Extract the personal website/portfolio URL. Look for custom domains (anything.online, anything.dev, anything.io, yourname.com), NOT github.com or linkedin.com. If found without https://, prepend https://. Return empty string if not found.",
    "other_links": ["any other URLs found in resume"],
    "github_repo_links": ["any github.com/username/reponame URLs found in resume project descriptions"],
    "location": "city/country if mentioned",
    "current_role": "their current or most recent job title",
    "years_of_experience": 0,
    "education": [
        {{
            "degree": "B.Tech / MS / etc",
            "institution": "University Name",
            "year": "2020-2024",
            "field": "Computer Science"
        }}
    ],
    "technical_skills": {{
        "languages": ["Python", "JavaScript"],
        "frameworks": ["React", "Flask", "Express"],
        "databases": ["PostgreSQL", "MongoDB"],
        "tools": ["Git", "Docker", "AWS"],
        "other": ["REST APIs", "Machine Learning"]
    }},
    "projects": [
        {{
            "name": "Project Name",
            "description": "What the project does",
            "technologies": ["React", "Node.js"],
            "role": "Solo Developer / Team Lead",
            "highlights": ["Key achievement 1", "Key achievement 2"]
        }}
    ],
    "work_experience": [
        {{
            "company": "Company Name",
            "role": "Software Engineer",
            "duration": "Jan 2022 - Present",
            "highlights": ["Built X", "Reduced Y by Z%"]
        }}
    ],
    "claims": [
        "Every verifiable factual claim the candidate makes",
        "Built a full-stack AI-powered productivity dashboard",
        "Integrated OpenAI API for natural language task creation",
        "Designed REST APIs with JWT authentication",
        "Deployed the system using cloud infrastructure",
        "Developed a modular backend platform using Python and Flask",
        "Built a real-time hand gesture recognition system using OpenCV"
    ],
    "certifications": ["Any certifications mentioned"],
    "experience_timeline": [
        "ITM Skills University (2025-Present) - B.Tech CS",
        "Personal Projects (2024-Present) - Solo Developer"
    ],
    "summary": "A 2-3 sentence summary of the candidate's profile"
}}

URLs found in resume (for reference): {json.dumps(found_urls)}

=== RESUME TEXT ===
{text[:12000]}
=== END RESUME TEXT ===
"""

    try:
        result = await generate_json(prompt, temperature=0)

        # ─── FIX 5: Normalize nondeterministic key names ───
        result = _normalize_resume_keys(result)

        # Post-process: ensure github_username is clean
        gh_username = result.get("github_username", "")
        gh_url = result.get("github_url", "")
        
        # If AI returned full URL in username field, extract just the username
        if gh_username and "/" in gh_username:
            parts = [p for p in gh_username.split("/") if p]
            gh_username = parts[-1] if parts else ""
            result["github_username"] = gh_username
        
        # If no username but we have a URL, extract from URL
        if not gh_username and gh_url:
            parts = [p for p in gh_url.rstrip("/").split("/") if p]
            if parts:
                result["github_username"] = parts[-1]

        # ─── URL normalization (Bug 6 fix) ───
        for url_field in ["linkedin_url", "portfolio_url", "github_url"]:
            val = result.get(url_field, "") or ""
            if val and not val.startswith("http"):
                if "linkedin.com" in val:
                    val = "https://www." + val.lstrip("/")
                else:
                    val = "https://" + val.lstrip("/")
                result[url_field] = val

        # ── v2 FIX: Stronger regex fallback for LinkedIn URL ──
        # Handles: linkedin.com/in/xyz, www.linkedin.com/in/xyz, https://linkedin.com/in/xyz
        if not result.get("linkedin_url"):
            li_patterns = [
                r'(?:https?://)?(?:www\.)?linkedin\.com/in/([\w\-]+)',
                r'linkedin[\s.:]+com[\s/]+in[\s/]+([\w\-]+)',  # OCR-mangled URLs
                r'(?:LinkedIn|Linkedin|LINKEDIN)[\s:]*(?:https?://)?(?:www\.)?linkedin\.com/in/([\w\-]+)',
            ]
            for pat in li_patterns:
                li_match = re.search(pat, text, re.I)
                if li_match:
                    username_part = li_match.group(1) if li_match.lastindex else li_match.group(0)
                    if "/" in username_part:
                        username_part = username_part.split("/")[-1]
                    result["linkedin_url"] = f"https://www.linkedin.com/in/{username_part}"
                    print(f"[ResumeParser] LinkedIn URL found via regex: {result['linkedin_url']}")
                    break

        # ── v2 FIX: Stronger regex fallback for Portfolio URL ──
        if not result.get("portfolio_url"):
            domain_patterns = [
                r'\b([\w\-]+\.(?:online|dev|io|me|site|app|tech|co|vercel\.app|netlify\.app|pages\.dev|web\.app))\b',
                r'\b([\w\-]+\.(?:com|org|net))\b',
            ]
            for pat in domain_patterns:
                for domain_match in re.finditer(pat, text, re.I):
                    candidate_domain = domain_match.group(0)
                    # Make sure it's not github/linkedin/google/npm/etc
                    excluded = ["github", "linkedin", "google", "npmjs", "pypi", "medium",
                                "stackoverflow", "leetcode", "hackerrank", "codechef"]
                    if not any(exc in candidate_domain.lower() for exc in excluded):
                        result["portfolio_url"] = "https://" + candidate_domain
                        print(f"[ResumeParser] Portfolio URL found via regex: {result['portfolio_url']}")
                        break
                if result.get("portfolio_url"):
                    break

        # Store raw text for downstream fallback matching
        result["_raw_text"] = text[:5000]

        # Ensure claims is always a non-empty list
        if not result.get("claims"):
            result["claims"] = []
            # Auto-generate claims from projects
            for proj in result.get("projects", []):
                if proj.get("description"):
                    result["claims"].append(proj["description"])
                for h in proj.get("highlights", []):
                    result["claims"].append(h)
        
        _resume_parse_cache[cache_key] = result
        return result
        
    except Exception as e:
        error_msg = str(e).lower()
        print(f"[ResumeParser] AI Error: {e}")
        
        if "quota" in error_msg or "429" in error_msg or "exhausted" in error_msg:
            raise ValueError(
                "Gemini API quota exceeded. Please wait a minute and try again, "
                "or upgrade your API key to a paid tier."
            )
        
        # Re-raise all other errors — no more silent fallback to mock data!
        raise ValueError(f"Resume parsing failed: {e}")
