"""
Web Scraper — scrapes portfolio websites and LinkedIn public profiles.
Extracts structured data for cross-referencing with resume claims.

LinkedIn Scraping: 6-strategy engine that works WITHOUT any paid API keys.
Strategies (tried in order):
  1. Google Search snippets (most reliable — Google always works)
  2. Bing Search snippets (backup search engine)
  3. DuckDuckGo HTML search (no rate limits)
  4. Google Cache of public profile
  5. Direct public profile scrape with anti-detection headers
  6. Wayback Machine (Internet Archive) fallback

Portfolio Scraping: Deep tech detection, template identification, project extraction.
"""
import os
import httpx
from bs4 import BeautifulSoup
import re
import json
import random
import asyncio
import hashlib
from typing import Dict, Any, List, Optional
from urllib.parse import quote_plus, urlencode

# ─── Cache for scraped data ──────────────────────────────────────────────────
_SCRAPE_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_TTL = 3600  # 1 hour

# ─── User Agent pool ─────────────────────────────────────────────────────────
_USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0",
]

def _random_headers() -> Dict[str, str]:
    """Generate realistic browser headers with random User-Agent."""
    return {
        "User-Agent": random.choice(_USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Cache-Control": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
    }

KNOWN_TEMPLATES = [
    "html5up", "creative-tim", "bootstrapmade",
    "colorlib", "themewagon", "startbootstrap",
    "devfolio", "github.io default",
]


# ═══════════════════════════════════════════════════════════════════════════════
# PORTFOLIO SCRAPER
# ═══════════════════════════════════════════════════════════════════════════════

async def scrape_portfolio(url: str) -> str:
    """Fetches and extracts readable text from a portfolio website."""
    if not url or not url.startswith("http"):
        return ""

    for attempt in range(2):  # Try twice
        try:
            timeout = 12.0 if attempt == 0 else 18.0
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                response = await client.get(url, headers=_random_headers())
                response.raise_for_status()
                soup = BeautifulSoup(response.text, "html.parser")
                for tag in soup(["script", "style", "noscript", "meta", "link", "svg", "path"]):
                    tag.extract()
                text = soup.get_text(separator=" ", strip=True)
                result = re.sub(r'\s+', ' ', text)[:8000]
                if len(result) > 200:
                    return result
        except Exception as e:
            print(f"[Scraper] Portfolio attempt {attempt+1} failed for {url}: {e}")
            if attempt == 0:
                await asyncio.sleep(2)
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
            resp = await client.get(url, headers=_random_headers())
            result["is_live"] = resp.status_code == 200
            if not result["is_live"]:
                return result
            result["last_modified"] = resp.headers.get("Last-Modified", "")
            powered_by = resp.headers.get("X-Powered-By", "")
            if "Next.js" in powered_by: result["tech_stack"].append("Next.js")
            if "Express" in powered_by: result["tech_stack"].append("Express/Node.js")
            soup = BeautifulSoup(resp.text, "html.parser")
            generator = soup.find("meta", {"name": "generator"})
            if generator:
                gen_content = generator.get("content", "")
                result["tech_stack"].append(f"Generator: {gen_content}")
                for tmpl in KNOWN_TEMPLATES:
                    if tmpl.lower() in gen_content.lower():
                        result["is_template"] = True
                        result["template_name"] = tmpl
            scripts = [s.get("src", "") for s in soup.find_all("script", src=True)]
            if any("react" in s.lower() for s in scripts): result["tech_stack"].append("React")
            if any("vue" in s.lower() for s in scripts): result["tech_stack"].append("Vue")
            if any("angular" in s.lower() for s in scripts): result["tech_stack"].append("Angular")
            if any("next" in s.lower() for s in scripts): result["tech_stack"].append("Next.js")
            html_text = resp.text.lower()
            for tmpl in KNOWN_TEMPLATES:
                if tmpl.replace("-", "") in html_text or tmpl in html_text:
                    result["is_template"] = True
                    result["template_name"] = tmpl
            headings = [h.get_text(strip=True) for h in soup.find_all(["h1", "h2", "h3"])]
            result["projects_found"] = headings[:10]
            links = [a.get("href", "") for a in soup.find_all("a", href=True)]
            social = [l for l in links if any(s in l for s in ["github.com", "linkedin.com", "twitter.com", "leetcode"])]
            result["social_links"] = social[:10]
            for tag in soup(["script", "style"]): tag.extract()
            result["raw_text"] = soup.get_text(separator=" ", strip=True)[:6000]

            # Find internal links to scrape (projects, about, work pages)
            internal_links = []
            for a in soup.find_all("a", href=True):
                href = a.get("href", "")
                if href.startswith("/") and len(href) > 1 and "." not in href.split("/")[-1]:
                    full_url = url.rstrip("/") + href
                    if full_url not in internal_links:
                        internal_links.append(full_url)

            # Scrape up to 3 subpages
            subpage_texts = []
            for subpage_url in internal_links[:3]:
                try:
                    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as sub_client:
                        sub_resp = await sub_client.get(subpage_url, headers=_random_headers())
                        if sub_resp.status_code == 200:
                            sub_soup = BeautifulSoup(sub_resp.text, "html.parser")
                            for tag in sub_soup(["script", "style", "noscript"]):
                                tag.extract()
                            sub_text = sub_soup.get_text(separator=" ", strip=True)
                            subpage_texts.append(re.sub(r'\s+', ' ', sub_text)[:2000])
                except Exception:
                    pass

            if subpage_texts:
                result["raw_text"] = result.get("raw_text", "") + " | " + " | ".join(subpage_texts)
                result["raw_text"] = result["raw_text"][:10000]
    except Exception as e:
        result["error"] = str(e)[:120]
    return result


def score_portfolio(portfolio_data: Dict[str, Any]) -> Dict[str, Any]:
    """Score portfolio website data."""
    if not portfolio_data.get("is_live"):
        return {"portfolio_score": 0, "is_live": False}
    score = 5
    if portfolio_data.get("tech_stack"): score += min(5, len(portfolio_data["tech_stack"]) * 2)
    if portfolio_data.get("is_template"): score -= 3
    if portfolio_data.get("projects_found"): score += min(3, len(portfolio_data["projects_found"]))
    if portfolio_data.get("social_links"): score += 2
    return {
        "portfolio_score": max(0, min(score, 15)),
        "is_live": True,
        "is_template": portfolio_data.get("is_template", False),
        "tech_detected": portfolio_data.get("tech_stack", []),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# LINKEDIN SCRAPER — 10-Strategy Cascade Engine
# Upgraded: Voyager API, Authenticated Render, Google CSE, AI-Enhanced,
#           plus all original search engine strategies with 40+ rotating UAs.
# Implementation lives in services/linkedin_scraper.py
# ═══════════════════════════════════════════════════════════════════════════════

from services.linkedin_scraper import (
    scrape_linkedin,
    _extract_linkedin_username,
    _normalize_linkedin_data,
)


# ═══════════════════════════════════════════════════════════════════════════════
# CROSS-REFERENCE ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

def cross_reference_linkedin(linkedin_data: Dict, resume_data: Dict, github_data: Dict = None) -> Dict[str, Any]:
    """Cross-reference LinkedIn data with resume and GitHub for consistency checks."""
    flags = []

    if not linkedin_data or not linkedin_data.get("accessible"):
        return {"flags": [], "cross_reference_score": 0, "not_available": True}

    # Check 1: Name consistency
    li_name = (linkedin_data.get("name") or "").lower().strip()
    resume_name = (resume_data.get("name") or "").lower().strip()
    if li_name and resume_name and li_name != resume_name:
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
        any_overlap = any(lt in rt or rt in lt for lt in li_titles for rt in resume_titles)
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


# ═══════════════════════════════════════════════════════════════════════════════
# GENERIC URL SCRAPER
# ═══════════════════════════════════════════════════════════════════════════════

async def scrape_any_url(url: str) -> str:
    """Generic URL scraper for any link found in the resume."""
    if not url or not url.startswith("http"):
        return ""
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            response = await client.get(url, headers=_random_headers())
            if response.status_code != 200:
                return ""
            soup = BeautifulSoup(response.text, "html.parser")
            for tag in soup(["script", "style", "noscript", "meta", "link", "svg"]):
                tag.extract()
            text = soup.get_text(separator=" ", strip=True)
            return re.sub(r'\s+', ' ', text)[:3000]
    except Exception:
        return ""
