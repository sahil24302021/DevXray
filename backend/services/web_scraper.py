"""
Web Scraper — scrapes portfolio websites and LinkedIn public profiles.
Extracts structured data for cross-referencing with resume claims.
Enhanced with deep portfolio verification and tech detection.
"""
import os
import httpx
from bs4 import BeautifulSoup
import re
import json
from typing import Dict, Any, List

# Shared HTTP client config
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

KNOWN_TEMPLATES = [
    "html5up", "creative-tim", "bootstrapmade",
    "colorlib", "themewagon", "startbootstrap",
    "devfolio", "github.io default",
]


async def scrape_portfolio(url: str) -> str:
    """
    Fetches and extracts readable text from a portfolio website.
    Aggressive timeout (6s) to keep the pipeline fast.
    """
    if not url or not url.startswith("http"):
        return ""

    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
            response = await client.get(url, headers=_HEADERS)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")
            for tag in soup(["script", "style", "noscript", "meta", "link", "svg", "path"]):
                tag.extract()

            text = soup.get_text(separator=" ", strip=True)
            text = re.sub(r'\s+', ' ', text)
            return text[:6000]

    except Exception as e:
        print(f"[Scraper] Portfolio scrape failed for {url}: {e}")
        return ""


async def scrape_portfolio_deep(url: str) -> Dict[str, Any]:
    """Enhanced portfolio analysis with tech detection and template identification."""
    result = {
        "url": url,
        "is_live": False,
        "tech_stack": [],
        "is_template": False,
        "template_name": None,
        "last_modified": None,
        "raw_text": "",
        "projects_found": [],
        "social_links": [],
    }

    if not url or not url.startswith("http"):
        return result

    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=_HEADERS)
            result["is_live"] = resp.status_code == 200

            if not result["is_live"]:
                return result

            result["last_modified"] = resp.headers.get("Last-Modified", "")

            # Tech detection from headers
            powered_by = resp.headers.get("X-Powered-By", "")
            if "Next.js" in powered_by:
                result["tech_stack"].append("Next.js")
            if "Express" in powered_by:
                result["tech_stack"].append("Express/Node.js")

            soup = BeautifulSoup(resp.text, "html.parser")

            # Generator meta tag
            generator = soup.find("meta", {"name": "generator"})
            if generator:
                gen_content = generator.get("content", "")
                result["tech_stack"].append(f"Generator: {gen_content}")
                for tmpl in KNOWN_TEMPLATES:
                    if tmpl.lower() in gen_content.lower():
                        result["is_template"] = True
                        result["template_name"] = tmpl

            # Script-based tech detection
            scripts = [s.get("src", "") for s in soup.find_all("script", src=True)]
            if any("react" in s.lower() for s in scripts):
                result["tech_stack"].append("React")
            if any("vue" in s.lower() for s in scripts):
                result["tech_stack"].append("Vue")
            if any("angular" in s.lower() for s in scripts):
                result["tech_stack"].append("Angular")
            if any("next" in s.lower() for s in scripts):
                result["tech_stack"].append("Next.js")

            # Template detection from common class names
            html_text = resp.text.lower()
            for tmpl in KNOWN_TEMPLATES:
                if tmpl.replace("-", "") in html_text or tmpl in html_text:
                    result["is_template"] = True
                    result["template_name"] = tmpl

            # Extract project names mentioned
            headings = [h.get_text(strip=True) for h in soup.find_all(["h1", "h2", "h3"])]
            result["projects_found"] = headings[:10]

            # Social links
            links = [a.get("href", "") for a in soup.find_all("a", href=True)]
            social = [
                l for l in links
                if any(s in l for s in ["github.com", "linkedin.com", "twitter.com", "leetcode"])
            ]
            result["social_links"] = social[:10]

            # Raw text
            for tag in soup(["script", "style"]):
                tag.extract()
            result["raw_text"] = soup.get_text(separator=" ", strip=True)[:6000]

    except Exception as e:
        result["error"] = str(e)[:120]

    return result


def score_portfolio(portfolio_data: Dict[str, Any]) -> Dict[str, Any]:
    """Score portfolio website data."""
    if not portfolio_data.get("is_live"):
        return {"portfolio_score": 0, "is_live": False}

    score = 5  # Base for having a live portfolio
    if portfolio_data.get("tech_stack"):
        score += min(5, len(portfolio_data["tech_stack"]) * 2)
    if portfolio_data.get("is_template"):
        score -= 3  # Penalty for template usage
    if portfolio_data.get("projects_found"):
        score += min(3, len(portfolio_data["projects_found"]))
    if portfolio_data.get("social_links"):
        score += 2

    return {
        "portfolio_score": max(0, min(score, 15)),
        "is_live": True,
        "is_template": portfolio_data.get("is_template", False),
        "tech_detected": portfolio_data.get("tech_stack", []),
    }


async def _try_rapidapi_primary(clean_url: str, rapidapi_key: str) -> Dict[str, Any] | None:
    """Strategy 1: RapidAPI 'Fresh LinkedIn Profile Data' (paid tier)."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://fresh-linkedin-profile-data.p.rapidapi.com/get-linkedin-profile",
                params={
                    "linkedin_url": clean_url,
                    "include_skills": "true",
                    "include_certifications": "true",
                    "include_education": "true",
                    "include_experience": "true",
                },
                headers={
                    "X-RapidAPI-Key": rapidapi_key,
                    "X-RapidAPI-Host": "fresh-linkedin-profile-data.p.rapidapi.com",
                },
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        print(f"[LinkedIn] RapidAPI primary failed: {e}")
    return None


async def _try_rapidapi_alt(clean_url: str, rapidapi_key: str) -> Dict[str, Any] | None:
    """Strategy 2: Alternative RapidAPI LinkedIn endpoints (try multiple)."""
    alt_apis = [
        {
            "url": "https://linkedin-data-api.p.rapidapi.com/get-profile-data-by-url",
            "host": "linkedin-data-api.p.rapidapi.com",
            "params": {"url": clean_url},
        },
        {
            "url": "https://linkedin-api8.p.rapidapi.com/get-profile-data-by-url",
            "host": "linkedin-api8.p.rapidapi.com",
            "params": {"url": clean_url},
        },
        {
            "url": "https://linkedin-bulk-data-scraper.p.rapidapi.com/profile",
            "host": "linkedin-bulk-data-scraper.p.rapidapi.com",
            "params": {"url": clean_url},
        },
    ]
    for api in alt_apis:
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.get(
                    api["url"],
                    params=api["params"],
                    headers={
                        "X-RapidAPI-Key": rapidapi_key,
                        "X-RapidAPI-Host": api["host"],
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    # Normalize: some APIs nest data inside "data" key
                    if "data" in data and isinstance(data["data"], dict):
                        data = data["data"]
                    if data.get("full_name") or data.get("firstName") or data.get("fullName"):
                        return data
        except Exception as e:
            print(f"[LinkedIn] Alt API {api['host']} failed: {e}")
            continue
    return None


async def _try_google_cache(clean_url: str) -> Dict[str, Any] | None:
    """Strategy 3: Google's cached version of LinkedIn public profile."""
    try:
        # Extract the LinkedIn slug for Google search
        search_query = clean_url.replace("https://www.", "").replace("http://www.", "")
        google_url = f"https://webcache.googleusercontent.com/search?q=cache:{search_query}"

        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(google_url, headers={
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml",
            })
            if resp.status_code == 200 and len(resp.text) > 500:
                soup = BeautifulSoup(resp.text, "html.parser")
                # Extract name from title
                title = soup.find("title")
                name = ""
                headline = ""
                if title:
                    t = title.get_text()
                    if " - " in t:
                        parts = t.split(" - ")
                        name = parts[0].strip()
                        if len(parts) > 1:
                            headline = parts[1].strip()

                for tag in soup(["script", "style", "noscript"]):
                    tag.extract()
                text = soup.get_text(separator=" ", strip=True)
                text = re.sub(r'\s+', ' ', text)[:4000]

                if name or len(text) > 200:
                    return {
                        "full_name": name,
                        "headline": headline,
                        "summary": "",
                        "raw_text": text,
                        "_source": "google_cache",
                    }
    except Exception as e:
        print(f"[LinkedIn] Google cache failed: {e}")
    return None


async def _try_direct_scrape(clean_url: str) -> Dict[str, Any] | None:
    """Strategy 4: Direct scrape with enhanced anti-detection headers."""
    enhanced_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(clean_url, headers=enhanced_headers)
            if response.status_code in (999, 403, 429):
                return None  # Blocked
            if response.status_code != 200:
                return None

            soup = BeautifulSoup(response.text, "html.parser")
            result = {}

            og_title = soup.find("meta", property="og:title")
            if og_title and og_title.get("content"):
                result["full_name"] = og_title["content"]

            og_desc = soup.find("meta", property="og:description")
            if og_desc and og_desc.get("content"):
                result["headline"] = og_desc["content"]

            desc_meta = soup.find("meta", {"name": "description"})
            if desc_meta and desc_meta.get("content"):
                result["summary"] = desc_meta["content"]

            for tag in soup(["script", "style", "noscript", "meta", "link", "svg"]):
                tag.extract()
            text = soup.get_text(separator=" ", strip=True)
            result["raw_text"] = re.sub(r'\s+', ' ', text)[:4000]
            result["_source"] = "direct_scrape"

            if result.get("full_name") or result.get("headline") or len(result.get("raw_text", "")) > 200:
                return result
    except Exception as e:
        print(f"[LinkedIn] Direct scrape failed: {e}")
    return None


def _normalize_linkedin_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize data from various API formats into a consistent structure."""
    # Handle different field names from different APIs
    name = (data.get("full_name") or data.get("fullName") or
            f"{data.get('firstName', '')} {data.get('lastName', '')}").strip()

    experiences = data.get("experiences") or data.get("experience") or data.get("position") or []
    if not isinstance(experiences, list):
        experiences = []

    exp_text_parts = []
    for e in experiences:
        title = e.get("title") or e.get("position") or ""
        company = e.get("company") or e.get("companyName") or e.get("company_name") or ""
        start = e.get("starts_at") or e.get("start") or {}
        end = e.get("ends_at") or e.get("end") or {}
        start_yr = start.get("year", "?") if isinstance(start, dict) else "?"
        end_yr = end.get("year", "present") if isinstance(end, dict) and end else "present"
        exp_text_parts.append(f"{title} at {company} ({start_yr}-{end_yr})")

    skills_raw = data.get("skills") or []
    skills = []
    for s in skills_raw:
        if isinstance(s, dict):
            skills.append(s.get("name", ""))
        elif isinstance(s, str):
            skills.append(s)

    education = data.get("education") or data.get("educations") or []
    edu_parts = []
    for e in education:
        if isinstance(e, dict):
            degree = e.get("degree_name") or e.get("degree") or e.get("degreeName") or ""
            school = e.get("school") or e.get("schoolName") or e.get("school_name") or ""
            edu_parts.append(f"{degree} at {school}")

    headline = data.get("headline") or data.get("title") or ""
    about = data.get("summary") or data.get("about") or ""

    raw_text = (
        f"{headline}\n{about}\n\n"
        f"Experience:\n" + "\n".join(exp_text_parts) +
        f"\n\nSkills: {', '.join(skills[:20])}" +
        f"\n\nEducation:\n" + "\n".join(edu_parts)
    )[:4000]

    # Use raw_text from scrape if API didn't provide structured data
    if len(raw_text.strip()) < 50 and data.get("raw_text"):
        raw_text = data["raw_text"]

    return {
        "name": name,
        "headline": headline,
        "about": about,
        "experiences": experiences,
        "skills": skills,
        "education": education,
        "connections": data.get("connections") or data.get("connectionsCount") or 0,
        "raw_text": raw_text,
    }


async def scrape_linkedin(url: str) -> Dict[str, Any]:
    """
    Multi-strategy LinkedIn profile extraction.

    Tries up to 4 strategies in order:
    1. RapidAPI 'Fresh LinkedIn Profile Data' (paid — most reliable)
    2. Alternative RapidAPI LinkedIn endpoints (free tiers available)
    3. Google's cached version of the public profile page
    4. Direct scrape with enhanced anti-detection headers

    Falls back to manual review recommendation if all fail.
    """
    result = {
        "url": url,
        "accessible": False,
        "name": "",
        "headline": "",
        "about": "",
        "raw_text": "",
        "note": "",
        "recommendation": "",
        "blocked": False,
    }

    if not url or "linkedin.com" not in url:
        result["note"] = "No valid LinkedIn URL provided."
        result["recommendation"] = "Ask the candidate to provide their LinkedIn profile URL."
        return result

    clean_url = url.rstrip("/")
    if not clean_url.startswith("http"):
        clean_url = "https://" + clean_url
    result["url"] = clean_url

    rapidapi_key = os.environ.get("RAPIDAPI_KEY", "")
    data = None
    source = "none"

    # Strategy 1: RapidAPI Primary
    if rapidapi_key:
        print("[LinkedIn] Trying Strategy 1: RapidAPI Primary...")
        data = await _try_rapidapi_primary(clean_url, rapidapi_key)
        if data:
            source = "rapidapi_primary"

    # Strategy 2: RapidAPI Alternatives
    if not data and rapidapi_key:
        print("[LinkedIn] Trying Strategy 2: RapidAPI Alternatives...")
        data = await _try_rapidapi_alt(clean_url, rapidapi_key)
        if data:
            source = "rapidapi_alt"

    # Strategy 3: Google Cache
    if not data:
        print("[LinkedIn] Trying Strategy 3: Google Cache...")
        data = await _try_google_cache(clean_url)
        if data:
            source = "google_cache"

    # Strategy 4: Direct Scrape
    if not data:
        print("[LinkedIn] Trying Strategy 4: Direct Scrape...")
        data = await _try_direct_scrape(clean_url)
        if data:
            source = "direct_scrape"

    # ─── Process result ───
    if data:
        normalized = _normalize_linkedin_data(data)
        result["accessible"] = True
        result["name"] = normalized["name"]
        result["headline"] = normalized["headline"]
        result["about"] = normalized["about"]
        result["raw_text"] = normalized["raw_text"]
        result["experiences"] = normalized["experiences"]
        result["skills"] = normalized["skills"]
        result["education"] = normalized["education"]
        result["connections"] = normalized["connections"]
        result["source"] = source
        result["note"] = f"LinkedIn data extracted via {source.replace('_', ' ')}."
        result["recommendation"] = "Profile data available for cross-reference with resume."
        print(f"[LinkedIn] SUCCESS via {source}: {normalized['name']}")
    else:
        result["blocked"] = True
        result["note"] = (
            "LinkedIn automated access unavailable (all 4 strategies failed). "
            "Use the 'Paste LinkedIn' feature in the frontend to manually provide profile text."
        )
        result["recommendation"] = (
            "Visit the LinkedIn URL directly and use the 'Paste LinkedIn text' feature. "
            "Check: work history dates, endorsements, connections count, and activity level."
        )
        result["source"] = "none"
        print(f"[LinkedIn] All strategies failed for {clean_url}")

    return result


def cross_reference_linkedin(linkedin_data: Dict, resume_data: Dict, github_data: Dict = None) -> Dict[str, Any]:
    """Cross-reference LinkedIn data with resume and GitHub for consistency checks."""
    flags = []

    if not linkedin_data or not linkedin_data.get("accessible"):
        return {"flags": [], "cross_reference_score": 0, "not_available": True}

    # Check 1: Name consistency
    li_name = (linkedin_data.get("name") or "").lower().strip()
    resume_name = (resume_data.get("name") or "").lower().strip()
    if li_name and resume_name and li_name != resume_name:
        # Fuzzy check — at least first/last name should overlap
        li_parts = set(li_name.split())
        resume_parts = set(resume_name.split())
        overlap = li_parts & resume_parts
        if len(overlap) == 0:
            flags.append({"type": "NAME_MISMATCH", "severity": "HIGH",
                          "detail": f"LinkedIn: '{linkedin_data.get('name')}' vs Resume: '{resume_data.get('name')}'"})

    # Check 2: Experience timeline consistency
    experiences = linkedin_data.get("experiences", [])
    if experiences:
        from datetime import datetime
        li_months = 0
        for exp in experiences:
            start = exp.get("starts_at") or {}
            end = exp.get("ends_at") or {}
            if start.get("year"):
                start_dt = datetime(start.get("year", 2020), start.get("month", 1), 1)
                end_dt = datetime(end.get("year", 2025), end.get("month", 1), 1) if end.get("year") else datetime.now()
                li_months += max(0, (end_dt - start_dt).days / 30.4)

        li_years = li_months / 12
        resume_years = resume_data.get("years_of_experience", 0) or 0
        if resume_years and abs(li_years - resume_years) > 2:
            flags.append({"type": "EXPERIENCE_DISCREPANCY", "severity": "HIGH",
                          "detail": f"LinkedIn: ~{li_years:.1f} years vs Resume: {resume_years} years"})

    # Check 3: Job titles match
    li_titles = [e.get("title", "").lower() for e in experiences if e.get("title")]
    resume_exp = resume_data.get("experience", [])
    resume_titles = [e.get("title", "").lower() for e in resume_exp if e.get("title")]
    if li_titles and resume_titles:
        any_overlap = any(
            lt in rt or rt in lt
            for lt in li_titles for rt in resume_titles
        )
        if not any_overlap:
            flags.append({"type": "JOB_TITLE_MISMATCH", "severity": "MEDIUM",
                          "detail": "No overlapping job titles between LinkedIn and resume"})

    # Check 4: Connections count
    connections = linkedin_data.get("connections", 0)
    if isinstance(connections, int) and connections > 0 and connections < 30:
        flags.append({"type": "LOW_CONNECTIONS", "severity": "LOW",
                      "detail": f"Only {connections} LinkedIn connections — account may be new/fake"})

    # Check 5: Skills endorsed vs claimed
    li_skills_raw = linkedin_data.get("skills", [])
    endorsed_skills = []
    if isinstance(li_skills_raw, list):
        for s in li_skills_raw:
            if isinstance(s, dict):
                endorsed_skills.append(s.get("name", ""))
            elif isinstance(s, str):
                endorsed_skills.append(s)

    resume_skills_flat = []
    tech_skills = resume_data.get("technical_skills", {})
    if isinstance(tech_skills, dict):
        for v in tech_skills.values():
            if isinstance(v, list):
                resume_skills_flat.extend(v)
            elif isinstance(v, str):
                resume_skills_flat.append(v)
    elif isinstance(tech_skills, list):
        resume_skills_flat = tech_skills

    return {
        "flags": flags,
        "cross_reference_score": max(0, 100 - len(flags) * 15),
        "endorsed_skills": endorsed_skills[:20],
    }


async def scrape_any_url(url: str) -> str:
    """
    Generic URL scraper for any link found in the resume.
    Quick 5s timeout to keep things fast.
    """
    if not url or not url.startswith("http"):
        return ""

    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            response = await client.get(url, headers=_HEADERS)
            if response.status_code != 200:
                return ""

            soup = BeautifulSoup(response.text, "html.parser")
            for tag in soup(["script", "style", "noscript", "meta", "link", "svg"]):
                tag.extract()

            text = soup.get_text(separator=" ", strip=True)
            text = re.sub(r'\s+', ' ', text)
            return text[:3000]

    except Exception:
        return ""
