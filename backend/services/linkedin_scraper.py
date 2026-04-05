"""
LinkedIn Scraper — 10-Strategy Cascade Engine (DevXray)
═══════════════════════════════════════════════════════════
World-class LinkedIn profile extraction WITHOUT paid APIs.

Strategies (tried in order, stops at first success):
  1. LinkedIn Voyager API (li_at cookie → full structured JSON)
  2. Authenticated Browser Render (li_at cookie → DOM parse)
  3. Google Custom Search API (structured, reliable)
  4. Google Search scrape (snippets)
  5. Bing Search scrape (backup search)
  6. DuckDuckGo HTML search (never rate-limits)
  7. Direct public profile scrape (OG/LD+JSON meta)
  8. Google Cache (cached public profile)
  9. Wayback Machine (Internet Archive)
  10. AI-Enhanced Extraction (Gemini structures raw text)

Anti-detection: 40+ rotating UAs, randomized fingerprints,
human-like delays, proper referer chains, exponential backoff.
"""
import os
import re
import json
import asyncio
import hashlib
import random
from typing import Dict, Any, List, Optional
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

from services.linkedin_config import (
    get_li_at, get_csrf_token, get_linkedin_api_headers,
    get_authenticated_browser_headers, get_random_headers,
    get_google_cse_key, get_google_cse_cx,
    is_strategy_enabled, rate_limit_check, rate_limit_record,
    get_delay, cache_get, cache_set,
)


def _extract_linkedin_username(url: str) -> str:
    """Extract LinkedIn username/slug from any LinkedIn URL format."""
    patterns = [
        r'linkedin\.com/in/([^/?#&]+)',
        r'linkedin\.com/pub/([^/?#&]+)',
        r'linkedin\.com/profile/view\?id=([^&]+)',
    ]
    for pat in patterns:
        m = re.search(pat, url, re.I)
        if m:
            return m.group(1).strip("/").strip()
    return ""


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 0: Scrapin API
# ═══════════════════════════════════════════════════════════════════════════════

async def _strategy_scrapin(username: str) -> Optional[Dict[str, Any]]:
    """
    Strategy 0: Scrapin.io API — residential proxy, most reliable.
    Set SCRAPIN_API_KEY in your .env to enable.
    """
    api_key = os.environ.get("SCRAPIN_API_KEY", "").strip()
    if not api_key:
        print("[LinkedIn·S0] Scrapin skipped — no SCRAPIN_API_KEY set")
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                "https://api.scrapin.io/enrichment/profile",
                params={
                    "apikey": api_key,
                    "linkedInUrl": f"https://www.linkedin.com/in/{username}/"
                }
            )
            if r.status_code == 200:
                data = r.json()
                person = data.get("person", data)
                return {
                    "name": person.get("firstName", "") + " " + person.get("lastName", ""),
                    "headline": person.get("headline", ""),
                    "location": person.get("location", ""),
                    "summary": person.get("summary", ""),
                    "positions": person.get("positions", []),
                    "skills": [s.get("name", s) if isinstance(s, dict) else s
                               for s in person.get("skills", [])],
                    "education": person.get("schools", []),
                    "source": "scrapin_api"
                }
            else:
                print(f"[LinkedIn·S0] Scrapin returned {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"[LinkedIn·S0] Scrapin error: {e}")
    return None

# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 1: LinkedIn Voyager API (HIGHEST quality — full structured JSON)
# ═══════════════════════════════════════════════════════════════════════════════

async def _strategy_voyager_api(username: str) -> Optional[Dict[str, Any]]:
    """
    Hit LinkedIn's internal Voyager API — same API their frontend uses.
    Returns fully structured JSON: experiences, skills, education, certs.
    Requires li_at session cookie.
    """
    if not is_strategy_enabled("voyager_api"):
        return None

    headers = get_linkedin_api_headers()
    if not headers:
        print("[LinkedIn·S1] Voyager API skipped — no li_at cookie configured")
        return None

    # LinkedIn Voyager profile endpoint
    profile_url = (
        f"https://www.linkedin.com/voyager/api/identity/dash/profiles"
        f"?q=memberIdentity&memberIdentity={username}"
        f"&decorationId=com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-24"
    )

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(profile_url, headers=headers)

            if resp.status_code == 401 or resp.status_code == 403:
                print(f"[LinkedIn·S1] Voyager API: auth failed (status {resp.status_code}) — li_at may be expired")
                return None
            if resp.status_code == 429:
                print("[LinkedIn·S1] Voyager API: rate limited (429)")
                return None
            if resp.status_code != 200:
                print(f"[LinkedIn·S1] Voyager API: status {resp.status_code}")
                return None

            data = resp.json()
            elements = data.get("elements", [])
            if not elements:
                # Try the included array
                elements = data.get("included", [])

            if not elements:
                print("[LinkedIn·S1] Voyager API: empty response")
                return None

            # Parse the Voyager response into structured data
            result = _parse_voyager_response(data)
            if result:
                result["_source"] = "voyager_api"
                result["_quality"] = "FULL"
                print(f"[LinkedIn·S1] ✓ Voyager API success: {result.get('full_name', '?')}")
            return result

    except Exception as e:
        print(f"[LinkedIn·S1] Voyager API error: {e}")
        return None


def _parse_voyager_response(data: dict) -> Optional[Dict[str, Any]]:
    """Parse LinkedIn Voyager API response into structured profile data."""
    result = {}
    included = data.get("included", [])
    elements = data.get("elements", [])

    # Find the profile entity
    profile = None
    for item in included + elements:
        entity_type = item.get("$type", "") or item.get("entityUrn", "")
        if "Profile" in str(entity_type) or "miniProfile" in str(item):
            if item.get("firstName") or item.get("publicIdentifier"):
                profile = item
                break

    if not profile and elements:
        profile = elements[0]

    if not profile:
        return None

    result["full_name"] = f"{profile.get('firstName', '')} {profile.get('lastName', '')}".strip()
    result["headline"] = profile.get("headline", "") or profile.get("occupation", "")
    result["summary"] = profile.get("summary", "")
    result["location"] = profile.get("locationName", "") or profile.get("geoLocationName", "")
    result["industry"] = profile.get("industryName", "") or profile.get("industry", "")
    result["connections"] = profile.get("connectionsCount", 0) or profile.get("numConnections", 0)
    result["public_identifier"] = profile.get("publicIdentifier", "")

    # Extract experiences from included entities
    experiences = []
    education = []
    skills = []
    certifications = []
    languages = []

    for item in included:
        item_type = str(item.get("$type", ""))

        # Experiences
        if "Position" in item_type or "position" in item_type.lower():
            exp = {
                "title": item.get("title", ""),
                "company": item.get("companyName", ""),
                "description": item.get("description", ""),
                "location": item.get("locationName", ""),
            }
            ts = item.get("timePeriod", {}) or {}
            start = ts.get("startDate", {}) or {}
            end = ts.get("endDate", {})
            exp["starts_at"] = {"year": start.get("year"), "month": start.get("month", 1)}
            exp["ends_at"] = {"year": end.get("year"), "month": end.get("month", 1)} if end else None
            if exp["title"] or exp["company"]:
                experiences.append(exp)

        # Education
        elif "Education" in item_type or "education" in item_type.lower():
            edu = {
                "school": item.get("schoolName", "") or item.get("school", ""),
                "degree_name": item.get("degreeName", "") or item.get("degree", ""),
                "field_of_study": item.get("fieldOfStudy", ""),
            }
            ts = item.get("timePeriod", {}) or {}
            start = ts.get("startDate", {}) or {}
            end = ts.get("endDate", {})
            edu["starts_at"] = {"year": start.get("year")}
            edu["ends_at"] = {"year": end.get("year")} if end else None
            if edu["school"] or edu["degree_name"]:
                education.append(edu)

        # Skills
        elif "Skill" in item_type:
            skill_name = item.get("name", "")
            if skill_name:
                skills.append({
                    "name": skill_name,
                    "endorsement_count": item.get("endorsementCount", 0),
                })

        # Certifications
        elif "Certification" in item_type:
            cert = {
                "name": item.get("name", ""),
                "authority": item.get("authority", ""),
            }
            if cert["name"]:
                certifications.append(cert)

        # Languages
        elif "Language" in item_type:
            lang = item.get("name", "")
            if lang:
                languages.append(lang)

    result["experiences"] = experiences
    result["education"] = education
    result["skills"] = skills
    result["certifications"] = certifications
    result["languages"] = languages

    # Only return if we got meaningful data
    if result.get("full_name") or experiences or skills:
        return result
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 2: Authenticated Browser Render
# ═══════════════════════════════════════════════════════════════════════════════

async def _strategy_authenticated_render(username: str) -> Optional[Dict[str, Any]]:
    """
    Fetch LinkedIn profile page with li_at cookie authentication.
    Parses JSON-LD, embedded code blocks, and DOM structure.
    """
    if not is_strategy_enabled("authenticated_render"):
        return None

    headers = get_authenticated_browser_headers()
    if not headers:
        print("[LinkedIn·S2] Authenticated render skipped — no li_at cookie")
        return None

    profile_url = f"https://www.linkedin.com/in/{username}/"

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(profile_url, headers=headers)

            if resp.status_code in (401, 403, 999):
                print(f"[LinkedIn·S2] Auth render blocked (status {resp.status_code})")
                return None
            if resp.status_code == 429:
                print("[LinkedIn·S2] Rate limited (429)")
                return None
            if resp.status_code != 200:
                return None

            html = resp.text
            if len(html) < 1000 or "authwall" in html.lower() or "sign in" in html.lower()[:2000]:
                print("[LinkedIn·S2] Auth render: got auth wall, cookie may be expired")
                return None

            result = _parse_linkedin_html_deep(html)
            if result:
                result["_source"] = "authenticated_render"
                result["_quality"] = "FULL"
                print(f"[LinkedIn·S2] ✓ Auth render success: {result.get('full_name', '?')}")
            return result

    except Exception as e:
        print(f"[LinkedIn·S2] Auth render error: {e}")
        return None


def _parse_linkedin_html_deep(html: str) -> Optional[Dict[str, Any]]:
    """
    Deep parse of a LinkedIn profile HTML page.
    Extracts data from JSON-LD, embedded <code> blocks, and meta tags.
    """
    soup = BeautifulSoup(html, "html.parser")
    result = {}

    # 1. JSON-LD structured data (always present on profile pages)
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            ld = json.loads(script.string or "")
            if isinstance(ld, dict) and ld.get("@type") == "ProfilePage":
                main = ld.get("mainEntity", ld)
                result["full_name"] = main.get("name", "")
                result["headline"] = main.get("jobTitle", "") or main.get("description", "")
                result["location"] = main.get("address", {}).get("addressLocality", "") if isinstance(main.get("address"), dict) else ""
                result["summary"] = main.get("description", "")

                # Work experience from interactionStatistic or other fields
                works_for = main.get("worksFor", [])
                if isinstance(works_for, dict):
                    result["current_company"] = works_for.get("name", "")
                elif isinstance(works_for, list) and works_for:
                    result["current_company"] = works_for[0].get("name", "") if isinstance(works_for[0], dict) else ""

                alumni_of = main.get("alumniOf", [])
                if isinstance(alumni_of, list):
                    education = []
                    for a in alumni_of:
                        if isinstance(a, dict):
                            education.append({
                                "school": a.get("name", ""),
                                "degree_name": a.get("member", {}).get("description", "") if isinstance(a.get("member"), dict) else "",
                            })
                    result["education"] = education

            elif isinstance(ld, dict) and ld.get("@type") == "Person":
                result["full_name"] = ld.get("name", "")
                result["headline"] = ld.get("jobTitle", "")
                if ld.get("worksFor"):
                    wf = ld["worksFor"]
                    result["current_company"] = wf.get("name", "") if isinstance(wf, dict) else ""
        except (json.JSONDecodeError, TypeError, AttributeError):
            continue

    # 2. Open Graph meta tags
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content") and not result.get("full_name"):
        result["full_name"] = og_title["content"].split(" - ")[0].strip()

    og_desc = soup.find("meta", property="og:description")
    if og_desc and og_desc.get("content"):
        desc = og_desc["content"]
        if not result.get("headline"):
            result["headline"] = desc[:200]
        result["og_description"] = desc

    # 3. Meta description
    meta_desc = soup.find("meta", attrs={"name": "description"})
    if meta_desc and meta_desc.get("content"):
        result["meta_description"] = meta_desc["content"]

    # 4. Embedded <code> blocks (LinkedIn stores pre-rendered data here)
    experiences = result.get("experiences", [])
    skills = result.get("skills", [])
    for code_block in soup.find_all("code"):
        try:
            code_text = code_block.string or ""
            if len(code_text) < 50:
                continue
            code_data = json.loads(code_text)
            if isinstance(code_data, dict):
                _extract_from_code_block(code_data, result, experiences, skills)
            elif isinstance(code_data, list):
                for item in code_data:
                    if isinstance(item, dict):
                        _extract_from_code_block(item, result, experiences, skills)
        except (json.JSONDecodeError, TypeError):
            continue

    if experiences:
        result["experiences"] = experiences
    if skills:
        result["skills"] = skills

    # 5. Visible text extraction for raw_text
    for tag in soup(["script", "style", "noscript", "meta", "link", "svg", "path"]):
        tag.extract()
    text = soup.get_text(separator=" ", strip=True)
    result["raw_text"] = re.sub(r'\s+', ' ', text)[:8000]

    # Extract skills from visible text patterns
    if not result.get("skills"):
        skill_section = re.search(r'Skills?\s*[:\-]?\s*([\s\S]{20,500}?)(?:Education|Experience|Certifications|Languages|$)', result.get("raw_text", ""), re.I)
        if skill_section:
            skill_text = skill_section.group(1)
            found_skills = [s.strip() for s in re.split(r'[,·•|]', skill_text) if 2 < len(s.strip()) < 40]
            result["skills"] = [{"name": s} for s in found_skills[:25]]

    if result.get("full_name") or result.get("experiences") or result.get("skills"):
        return result
    return None


def _extract_from_code_block(data: dict, result: dict, experiences: list, skills: list):
    """Extract profile data from LinkedIn embedded code blocks."""
    # Check for profile data
    if data.get("firstName") and not result.get("full_name"):
        result["full_name"] = f"{data.get('firstName', '')} {data.get('lastName', '')}".strip()
    if data.get("headline") and not result.get("headline"):
        result["headline"] = data["headline"]
    if data.get("summary") and not result.get("summary"):
        result["summary"] = data["summary"]

    # Extract position data
    if data.get("title") and data.get("companyName"):
        exp = {
            "title": data["title"],
            "company": data["companyName"],
            "description": data.get("description", ""),
        }
        tp = data.get("timePeriod", {}) or {}
        start = tp.get("startDate", {}) or {}
        end = tp.get("endDate")
        exp["starts_at"] = {"year": start.get("year"), "month": start.get("month", 1)}
        exp["ends_at"] = {"year": end.get("year"), "month": end.get("month", 1)} if end else None
        experiences.append(exp)

    # Extract skill data
    if data.get("name") and data.get("endorsementCount") is not None:
        skills.append({"name": data["name"], "endorsement_count": data.get("endorsementCount", 0)})

    # Recurse into nested included/elements
    for key in ("included", "elements", "*elements"):
        nested = data.get(key, [])
        if isinstance(nested, list):
            for item in nested[:50]:
                if isinstance(item, dict):
                    _extract_from_code_block(item, result, experiences, skills)


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 3: Google Custom Search API
# ═══════════════════════════════════════════════════════════════════════════════

async def _strategy_google_cse_api(username: str, name_hint: str = "") -> Optional[Dict[str, Any]]:
    """Use Google Custom Search JSON API for reliable, structured results."""
    if not is_strategy_enabled("google_cse_api"):
        return None

    api_key = get_google_cse_key()
    cx = get_google_cse_cx()
    if not api_key or not cx:
        return None

    query = f'site:linkedin.com/in/{username}'
    if name_hint:
        query = f'site:linkedin.com/in/ "{name_hint}"'

    try:
        url = f"https://www.googleapis.com/customsearch/v1?key={api_key}&cx={cx}&q={quote_plus(query)}&num=5"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return None

            data = resp.json()
            items = data.get("items", [])
            if not items:
                return None

            texts = []
            for item in items[:3]:
                title = item.get("title", "")
                snippet = item.get("snippet", "")
                if "linkedin" in (title + snippet).lower():
                    texts.append(f"{title} {snippet}")

            if texts:
                combined = " | ".join(texts)
                parsed = _parse_search_snippet(combined)
                if parsed.get("full_name") or len(parsed.get("raw_text", "")) > 50:
                    parsed["_source"] = "google_cse_api"
                    parsed["_quality"] = "SNIPPET"
                    print(f"[LinkedIn·S3] ✓ Google CSE API success")
                    return parsed

    except Exception as e:
        print(f"[LinkedIn·S3] Google CSE API error: {e}")
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 4: Google Search Scrape
# ═══════════════════════════════════════════════════════════════════════════════

async def _strategy_google_search(username: str, name_hint: str = "") -> Optional[Dict[str, Any]]:
    """Scrape Google search results for LinkedIn profile snippets."""
    if not is_strategy_enabled("google_search"):
        return None

    queries = [
        f'site:linkedin.com/in/{username}',
        f'site:linkedin.com "{username.replace("-", " ")}"',
    ]
    if name_hint:
        queries.insert(0, f'site:linkedin.com/in/ "{name_hint}"')

    for query in queries:
        try:
            search_url = f"https://www.google.com/search?q={quote_plus(query)}&num=5&hl=en"
            headers = get_random_headers()
            headers["Referer"] = "https://www.google.com/"

            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.get(search_url, headers=headers)
                if resp.status_code != 200:
                    continue

                soup = BeautifulSoup(resp.text, "html.parser")
                results = []
                for div in soup.find_all("div", class_=re.compile(r"g|tF2Cxc|MjjYud")):
                    title_el = div.find(["h3", "a"])
                    snippet_el = div.find(["span", "div"], class_=re.compile(r"st|VwiC3b|yXK7lf"))
                    title = title_el.get_text(strip=True) if title_el else ""
                    snippet = snippet_el.get_text(strip=True) if snippet_el else ""
                    if "linkedin.com" in (title + snippet).lower():
                        results.append(f"{title} {snippet}")

                if results:
                    combined = " | ".join(results[:3])
                    parsed = _parse_search_snippet(combined)
                    if parsed.get("full_name") or len(parsed.get("raw_text", "")) > 50:
                        parsed["_source"] = "google_search"
                        parsed["_quality"] = "SNIPPET"
                        print(f"[LinkedIn·S4] ✓ Google search success")
                        return parsed

            await asyncio.sleep(0.5)
        except Exception as e:
            print(f"[LinkedIn·S4] Google search error: {e}")
            continue
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 5: Bing Search
# ═══════════════════════════════════════════════════════════════════════════════

async def _strategy_bing_search(username: str, name_hint: str = "") -> Optional[Dict[str, Any]]:
    """Bing is less aggressive at blocking scrapers."""
    if not is_strategy_enabled("bing_search"):
        return None

    query = f'site:linkedin.com/in/{username}'
    if name_hint:
        query = f'site:linkedin.com/in/ "{name_hint}" {username}'

    try:
        search_url = f"https://www.bing.com/search?q={quote_plus(query)}&count=5"
        headers = get_random_headers()
        headers["Referer"] = "https://www.bing.com/"

        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(search_url, headers=headers)
            if resp.status_code != 200:
                return None

            soup = BeautifulSoup(resp.text, "html.parser")
            results = []
            for li in soup.find_all("li", class_="b_algo"):
                text = li.get_text(separator=" ", strip=True)
                if "linkedin.com" in text.lower():
                    results.append(text)

            if results:
                combined = " | ".join(results[:3])
                parsed = _parse_search_snippet(combined)
                if parsed.get("full_name") or len(parsed.get("raw_text", "")) > 50:
                    parsed["_source"] = "bing_search"
                    parsed["_quality"] = "SNIPPET"
                    print(f"[LinkedIn·S5] ✓ Bing search success")
                    return parsed

    except Exception as e:
        print(f"[LinkedIn·S5] Bing search error: {e}")
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 6: DuckDuckGo HTML Search
# ═══════════════════════════════════════════════════════════════════════════════

async def _strategy_duckduckgo(username: str, name_hint: str = "") -> Optional[Dict[str, Any]]:
    """DuckDuckGo NEVER rate limits and doesn't require JavaScript."""
    if not is_strategy_enabled("duckduckgo"):
        return None

    queries = [
        f'site:linkedin.com/in/{username}',
        f'linkedin.com/in/{username}',
        f'"{username.replace("-", " ")}" linkedin developer',
    ]
    if name_hint:
        queries.insert(0, f'site:linkedin.com "{name_hint}"')

    for query in queries:
        try:
            search_url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
            headers = get_random_headers()
            headers["Referer"] = "https://duckduckgo.com/"

            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                resp = await client.get(search_url, headers=headers)
                if resp.status_code != 200:
                    continue

                soup = BeautifulSoup(resp.text, "html.parser")
                results = []

                # DDG HTML search uses multiple layout variants — try all known selectors
                # Selector set 1: Classic layout
                for div in soup.find_all("div", class_="result"):
                    title_el = div.find("a", class_="result__a")
                    snippet_el = div.find("a", class_="result__snippet") or div.find("div", class_="result__snippet")
                    text = ""
                    if title_el:
                        text += title_el.get_text(strip=True) + " "
                    if snippet_el:
                        text += snippet_el.get_text(strip=True)
                    if "linkedin" in text.lower() and len(text) > 10:
                        results.append(text)

                # Selector set 2: New DDG layout (links-only variant)
                if not results:
                    for div in soup.find_all("div", class_=re.compile(r"result|web-result|nrn-react-div")):
                        text = div.get_text(separator=" ", strip=True)
                        if "linkedin" in text.lower() and len(text) > 20:
                            results.append(text[:500])

                # Selector set 3: Fallback — grab all anchor tags pointing to linkedin
                if not results:
                    for a_tag in soup.find_all("a", href=True):
                        href = a_tag.get("href", "")
                        if "linkedin.com/in/" in href:
                            parent = a_tag.find_parent(["div", "li", "article"])
                            if parent:
                                text = parent.get_text(separator=" ", strip=True)
                                if len(text) > 10:
                                    results.append(text[:500])

                if results:
                    combined = " | ".join(results[:5])
                    parsed = _parse_search_snippet(combined)
                    if parsed.get("full_name") or len(parsed.get("raw_text", "")) > 15:
                        parsed["_source"] = "duckduckgo"
                        parsed["_quality"] = "SNIPPET"
                        print(f"[LinkedIn·S6] ✓ DuckDuckGo success ({len(results)} results)")
                        return parsed

            await asyncio.sleep(0.3)
        except Exception as e:
            print(f"[LinkedIn·S6] DuckDuckGo error: {e}")
            continue
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 6b: Startpage Search (Privacy-focused, good LinkedIn indexing)
# ═══════════════════════════════════════════════════════════════════════════════

async def _strategy_startpage(username: str, name_hint: str = "") -> Optional[Dict[str, Any]]:
    """Startpage proxies Google results without rate-limiting."""
    query = f'site:linkedin.com/in/{username}'
    if name_hint:
        query = f'site:linkedin.com "{name_hint}"'

    try:
        search_url = f"https://www.startpage.com/do/dsearch?query={quote_plus(query)}&cat=web"
        headers = get_random_headers()
        headers["Referer"] = "https://www.startpage.com/"

        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            resp = await client.get(search_url, headers=headers)
            if resp.status_code != 200:
                return None

            soup = BeautifulSoup(resp.text, "html.parser")
            results = []
            for div in soup.find_all(["div", "article"], class_=re.compile(r"result|w-gl")):
                text = div.get_text(separator=" ", strip=True)
                if "linkedin" in text.lower() and len(text) > 20:
                    results.append(text[:500])

            if results:
                combined = " | ".join(results[:3])
                parsed = _parse_search_snippet(combined)
                if parsed.get("full_name") or len(parsed.get("raw_text", "")) > 30:
                    parsed["_source"] = "startpage"
                    parsed["_quality"] = "SNIPPET"
                    print(f"[LinkedIn·S6b] ✓ Startpage success")
                    return parsed

    except Exception as e:
        print(f"[LinkedIn·S6b] Startpage error: {e}")
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 7: Direct Public Profile Scrape
# ═══════════════════════════════════════════════════════════════════════════════

async def _strategy_direct_scrape(clean_url: str) -> Optional[Dict[str, Any]]:
    """Direct scrape with anti-detection headers — parses OG/LD+JSON/meta."""
    if not is_strategy_enabled("direct_scrape"):
        return None

    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            resp = await client.get(clean_url, headers=get_random_headers())

            if resp.status_code in (999, 403, 429):
                print(f"[LinkedIn·S7] Direct scrape blocked ({resp.status_code})")
                return None
            if resp.status_code != 200:
                return None

            soup = BeautifulSoup(resp.text, "html.parser")
            result = {}

            # Open Graph
            og_title = soup.find("meta", property="og:title")
            if og_title and og_title.get("content"):
                result["full_name"] = og_title["content"].split(" - ")[0].strip()

            og_desc = soup.find("meta", property="og:description")
            if og_desc and og_desc.get("content"):
                result["headline"] = og_desc["content"][:300]

            desc_meta = soup.find("meta", attrs={"name": "description"})
            if desc_meta and desc_meta.get("content"):
                result["summary"] = desc_meta["content"]

            # JSON-LD
            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    ld = json.loads(script.string or "")
                    if isinstance(ld, dict) and ld.get("@type") == "Person":
                        result["full_name"] = ld.get("name", result.get("full_name", ""))
                        result["headline"] = ld.get("jobTitle", result.get("headline", ""))
                        wf = ld.get("worksFor")
                        if isinstance(wf, dict):
                            result["current_company"] = wf.get("name", "")
                        elif isinstance(wf, list) and wf:
                            result["current_company"] = wf[0].get("name", "") if isinstance(wf[0], dict) else ""
                except (json.JSONDecodeError, TypeError):
                    continue

            for tag in soup(["script", "style", "noscript", "meta", "link", "svg"]):
                tag.extract()
            text = soup.get_text(separator=" ", strip=True)
            result["raw_text"] = re.sub(r'\s+', ' ', text)[:6000]
            result["_source"] = "direct_scrape"
            result["_quality"] = "META"

            if result.get("full_name") or result.get("headline") or len(result.get("raw_text", "")) > 200:
                print(f"[LinkedIn·S7] ✓ Direct scrape success: {result.get('full_name', '?')}")
                return result

    except Exception as e:
        print(f"[LinkedIn·S7] Direct scrape error: {e}")
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 8: Google Cache
# ═══════════════════════════════════════════════════════════════════════════════

async def _strategy_google_cache(clean_url: str) -> Optional[Dict[str, Any]]:
    """Fetch Google's cached version of the LinkedIn profile."""
    if not is_strategy_enabled("google_cache"):
        return None

    try:
        search_query = clean_url.replace("https://www.", "").replace("http://www.", "").replace("https://", "")
        cache_url = f"https://webcache.googleusercontent.com/search?q=cache:{search_query}"

        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(cache_url, headers=get_random_headers())

            if resp.status_code != 200 or len(resp.text) < 500:
                return None

            soup = BeautifulSoup(resp.text, "html.parser")
            result = {}

            title = soup.find("title")
            if title:
                t = title.get_text()
                if " - " in t:
                    parts = t.split(" - ")
                    result["full_name"] = parts[0].strip()
                    if len(parts) > 1:
                        result["headline"] = parts[1].strip()

            for tag in soup(["script", "style", "noscript"]):
                tag.extract()
            text = soup.get_text(separator=" ", strip=True)
            result["raw_text"] = re.sub(r'\s+', ' ', text)[:6000]
            result["_source"] = "google_cache"
            result["_quality"] = "CACHED"

            if result.get("full_name") or len(result.get("raw_text", "")) > 200:
                print(f"[LinkedIn·S8] ✓ Google cache success")
                return result

    except Exception as e:
        print(f"[LinkedIn·S8] Google cache error: {e}")
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 9: Wayback Machine
# ═══════════════════════════════════════════════════════════════════════════════

async def _strategy_wayback_machine(clean_url: str) -> Optional[Dict[str, Any]]:
    """Internet Archive — LinkedIn profiles are archived regularly."""
    if not is_strategy_enabled("wayback_machine"):
        return None

    try:
        api_url = f"https://archive.org/wayback/available?url={quote_plus(clean_url)}"
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(api_url)
            if resp.status_code != 200:
                return None

            data = resp.json()
            closest = data.get("archived_snapshots", {}).get("closest", {})
            if not closest.get("available"):
                return None

            archive_url = closest["url"]
            print(f"[LinkedIn·S9] Found archive at {archive_url}")

            resp2 = await client.get(archive_url, headers=get_random_headers(), follow_redirects=True)
            if resp2.status_code != 200:
                return None

            soup = BeautifulSoup(resp2.text, "html.parser")
            result = {}

            og_title = soup.find("meta", property="og:title")
            if og_title and og_title.get("content"):
                result["full_name"] = og_title["content"].split(" - ")[0].strip()

            og_desc = soup.find("meta", property="og:description")
            if og_desc and og_desc.get("content"):
                result["headline"] = og_desc["content"][:300]

            for tag in soup(["script", "style", "noscript"]):
                tag.extract()
            text = soup.get_text(separator=" ", strip=True)
            result["raw_text"] = re.sub(r'\s+', ' ', text)[:6000]
            result["_source"] = "wayback_machine"
            result["_quality"] = "ARCHIVED"
            result["archived_date"] = closest.get("timestamp", "")

            if result.get("full_name") or len(result.get("raw_text", "")) > 200:
                print(f"[LinkedIn·S9] ✓ Wayback success")
                return result

    except Exception as e:
        print(f"[LinkedIn·S9] Wayback error: {e}")
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 10: AI-Enhanced Extraction (Gemini)
# ═══════════════════════════════════════════════════════════════════════════════

async def _strategy_ai_extraction(raw_text: str, username: str) -> Optional[Dict[str, Any]]:
    """
    Takes any raw text (from search snippets, cached pages, etc.) and uses
    Gemini to extract structured profile data with high accuracy.
    This is the accuracy-boosting stage that makes even search snippets useful.
    """
    if not is_strategy_enabled("ai_extraction") or not raw_text or len(raw_text) < 30:
        return None

    try:
        from services.gemini_client import generate_json

        prompt = f"""You are a LinkedIn profile data extractor. Given the following raw text scraped from search results or cached pages about a LinkedIn profile (username: {username}), extract ALL available structured data.

RAW TEXT:
{raw_text[:4000]}

Extract and return a JSON object with these fields (use empty string/list if not found):
{{
    "full_name": "Person's full name",
    "headline": "Professional headline/title",
    "current_company": "Current employer",
    "location": "Location/city",
    "summary": "About/summary text",
    "years_experience": 0,
    "experiences": [
        {{"title": "Job Title", "company": "Company Name", "description": "", "starts_at": {{"year": 2020, "month": 1}}, "ends_at": null}}
    ],
    "education": [
        {{"school": "University Name", "degree_name": "Degree", "field_of_study": "Field"}}
    ],
    "skills": ["skill1", "skill2"],
    "certifications": ["cert1"],
    "connections": 0,
    "languages": ["English"]
}}

RULES:
- Extract ONLY what is explicitly mentioned in the text. Do NOT guess or hallucinate.
- For years_experience, calculate from the earliest job start date if available.
- If a field has no data in the text, use empty string, empty list, or 0.
- Return ONLY the JSON, no markdown or explanation."""

        result = await generate_json(prompt, temperature=0)
        if result and (result.get("full_name") or result.get("experiences") or result.get("skills")):
            # Normalize skills to dict format if they're strings
            raw_skills = result.get("skills", [])
            if raw_skills and isinstance(raw_skills[0], str):
                result["skills"] = [{"name": s} for s in raw_skills]
            result["_source"] = "ai_extraction"
            result["_quality"] = "AI_ENHANCED"
            print(f"[LinkedIn·S10] ✓ AI extraction success: {result.get('full_name', '?')}")
            return result

    except Exception as e:
        print(f"[LinkedIn·S10] AI extraction error: {e}")
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# SEARCH SNIPPET PARSER
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_search_snippet(text: str) -> Dict[str, Any]:
    """Parse structured data from search engine snippets about a LinkedIn profile."""
    result = {}
    text = re.sub(r'\s+', ' ', text).strip()

    # Extract name (usually first part before " - " or " · ")
    parts = re.split(r'\s*[-·|]\s*', text, maxsplit=4)
    if parts:
        name = parts[0].strip()
        name = re.sub(r"View\s+\w+'s?\s+.*", "", name).strip()
        name = re.sub(r"\s*LinkedIn$", "", name).strip()
        if name and 2 < len(name) < 60:
            result["full_name"] = name

    if len(parts) > 1:
        headline = parts[1].strip()
        headline = re.sub(r"\s*LinkedIn$", "", headline).strip()
        if headline and len(headline) > 2:
            result["headline"] = headline

    # Years experience
    exp_matches = re.findall(r'(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience)?', text, re.I)
    if exp_matches:
        result["years_experience"] = int(exp_matches[0])

    # Skills
    for pat in [r'(?:skills?|expertise|technologies?):\s*([^.]+)', r'(?:experienced?\s+(?:in|with))\s+([^.]+)']:
        m = re.search(pat, text, re.I)
        if m:
            skills_text = m.group(1)
            skills = [s.strip() for s in re.split(r'[,;&|]', skills_text) if s.strip()]
            result["skills"] = [{"name": s} for s in skills[:15]]
            break

    # Company mentions
    company_patterns = [
        r'(?:at|@)\s+([A-Z][A-Za-z\s&.]+?)(?:\s*[-·|]|\s*$)',
        r'(?:works?\s+at|employed\s+at)\s+(.+?)(?:\s*[-·|]|\s*$)',
    ]
    for cp in company_patterns:
        m = re.search(cp, text)
        if m:
            result["current_company"] = m.group(1).strip()[:80]
            break

    result["raw_text"] = text
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# DATA NORMALIZER
# ═══════════════════════════════════════════════════════════════════════════════

def _normalize_linkedin_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize data from any strategy into a consistent, rich structure."""
    # Name normalization
    name = (data.get("full_name") or data.get("fullName") or
            f"{data.get('firstName', '')} {data.get('lastName', '')}").strip()
    name = re.sub(r'\s*\|.*$', '', name)
    name = re.sub(r'\s*-\s*LinkedIn$', '', name)
    name = name.strip()

    # Experience normalization
    experiences = data.get("experiences") or data.get("experience") or []
    if not isinstance(experiences, list):
        experiences = []

    exp_text_parts = []
    for e in experiences:
        title = e.get("title") or e.get("position") or ""
        company = e.get("company") or e.get("companyName") or e.get("company_name") or ""
        desc = e.get("description", "")
        start = e.get("starts_at") or e.get("start") or {}
        end = e.get("ends_at") or e.get("end") or {}
        start_yr = start.get("year", "?") if isinstance(start, dict) else "?"
        end_yr = end.get("year", "present") if isinstance(end, dict) and end else "present"
        line = f"{title} at {company} ({start_yr}-{end_yr})"
        if desc:
            line += f": {desc[:150]}"
        exp_text_parts.append(line)

    # Skills normalization
    skills_raw = data.get("skills") or []
    skills = []
    for s in skills_raw:
        if isinstance(s, dict):
            skills.append(s.get("name", ""))
        elif isinstance(s, str):
            skills.append(s)
    skills = [s for s in skills if s]

    # Education normalization
    education = data.get("education") or data.get("educations") or []
    edu_parts = []
    for e in education:
        if isinstance(e, dict):
            degree = e.get("degree_name") or e.get("degree") or e.get("degreeName") or ""
            school = e.get("school") or e.get("schoolName") or e.get("school_name") or ""
            field = e.get("field_of_study") or e.get("fieldOfStudy") or ""
            part = f"{degree} at {school}"
            if field:
                part += f" ({field})"
            edu_parts.append(part)

    # Certifications
    certs = data.get("certifications") or []
    cert_parts = []
    for c in certs:
        if isinstance(c, dict):
            cert_parts.append(f"{c.get('name', '')} ({c.get('authority', '')})")
        elif isinstance(c, str):
            cert_parts.append(c)

    headline = data.get("headline") or data.get("title") or ""
    about = data.get("summary") or data.get("about") or ""

    # Build comprehensive raw text
    raw_text = f"{name}\n{headline}\n\n{about}\n\n"
    if exp_text_parts:
        raw_text += "Experience:\n" + "\n".join(exp_text_parts) + "\n\n"
    if skills:
        raw_text += f"Skills: {', '.join(skills[:30])}\n\n"
    if edu_parts:
        raw_text += "Education:\n" + "\n".join(edu_parts) + "\n"
    if cert_parts:
        raw_text += "Certifications:\n" + "\n".join(cert_parts) + "\n"

    # Fallback to raw_text from scrape if structured data is thin
    if len(raw_text.strip()) < 50 and data.get("raw_text"):
        raw_text = data["raw_text"]

    return {
        "name": name,
        "headline": headline,
        "about": about,
        "experiences": experiences,
        "skills": skills,
        "education": education,
        "certifications": certs,
        "connections": data.get("connections") or data.get("connectionsCount") or 0,
        "years_experience": data.get("years_experience", 0),
        "current_company": data.get("current_company", ""),
        "location": data.get("location", ""),
        "industry": data.get("industry", ""),
        "languages": data.get("languages", []),
        "raw_text": raw_text[:8000],
        "_source": data.get("_source", "unknown"),
        "_quality": data.get("_quality", "unknown"),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN SCRAPER — 10-Strategy Cascade
# ═══════════════════════════════════════════════════════════════════════════════

async def scrape_linkedin(url: str) -> Dict[str, Any]:
    """
    World-class LinkedIn profile extraction.
    10-strategy cascade — tries each strategy in order, stops at first success.

    Returns structured profile data including:
    - Name, headline, location, industry
    - Full work experience history with dates
    - Education, certifications, languages
    - Skills with endorsement counts
    - Connections count
    - Raw text for cross-referencing
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
        "experiences": [],
        "skills": [],
        "education": [],
        "certifications": [],
        "connections": 0,
        "years_experience": 0,
        "current_company": "",
        "location": "",
        "languages": [],
        "source": "none",
        "_quality": "none",
    }

    # Pre-flight: Check if li_at cookie is likely expired
    from services.linkedin_config import get_li_at_status
    cookie_status = get_li_at_status()
    if cookie_status["has_cookie"] and cookie_status["age_hours"] and cookie_status["age_hours"] > 24:
        print(f"[LinkedIn] WARNING: Cookie is {cookie_status['age_hours']}h old — likely expired. Strategies 1-2 will probably fail.")
    elif not cookie_status["has_cookie"]:
        print(f"[LinkedIn] INFO: No li_at cookie configured. Strategies 1-2 will be skipped. Search engine strategies (4-9) will run.")

    if not url or "linkedin.com" not in url:
        result["note"] = "No valid LinkedIn URL provided."
        result["recommendation"] = "Ask the candidate to provide their LinkedIn profile URL."
        return result

    clean_url = url.rstrip("/")
    if not clean_url.startswith("http"):
        clean_url = "https://" + clean_url
    result["url"] = clean_url

    # Check cache
    cache_key = hashlib.md5(clean_url.encode()).hexdigest()
    cached = cache_get(cache_key)
    if cached and cached.get("accessible"):
        print(f"[LinkedIn] Cache hit for {clean_url}")
        return cached

    # Rate limit check
    if not rate_limit_check():
        result["note"] = "LinkedIn scraper rate limit reached. Try again later."
        result["recommendation"] = "Wait a few minutes before scanning another profile."
        return result

    username = _extract_linkedin_username(clean_url)
    if not username:
        result["note"] = "Could not extract LinkedIn username from URL."
        return result

    data = None
    raw_text_for_ai = ""  # Collect raw text for Strategy 10
    _partial_raw_texts = []  # Collect partial text from ALL strategies
    _strategy_log = []  # Track which strategies were tried and their outcome

    result = await _strategy_scrapin(username)
    if result:
        return result
    # ... then continue with existing strategies 1-10

    # ─── Strategy 1: Voyager API (BEST quality) ───
    print(f"[LinkedIn] S1: Voyager API for '{username}'...")
    data = await _strategy_voyager_api(username)
    if data:
        rate_limit_record()
        _strategy_log.append("S1:Voyager ✓")
    else:
        _strategy_log.append("S1:Voyager ✗" if get_li_at() else "S1:Voyager SKIP(no cookie)")

    # ─── Strategy 2: Authenticated Render ───
    if not data:
        print(f"[LinkedIn] S2: Authenticated Render...")
        await asyncio.sleep(get_delay())
        data = await _strategy_authenticated_render(username)
        if data:
            rate_limit_record()
            raw_text_for_ai = data.get("raw_text", "")
            _partial_raw_texts.append(raw_text_for_ai)
            _strategy_log.append("S2:AuthRender ✓")
        else:
            _strategy_log.append("S2:AuthRender ✗" if get_li_at() else "S2:AuthRender SKIP(no cookie)")

    # ─── Strategy 3: Google CSE API ───
    if not data:
        print(f"[LinkedIn] S3: Google Custom Search API...")
        await asyncio.sleep(get_delay() * 0.5)
        data = await _strategy_google_cse_api(username)
        if data:
            raw_text_for_ai = data.get("raw_text", "")
            _partial_raw_texts.append(raw_text_for_ai)
            _strategy_log.append("S3:GoogleCSE ✓")
        else:
            _strategy_log.append("S3:GoogleCSE ✗" if get_google_cse_key() else "S3:GoogleCSE SKIP(no key)")

    # ─── Strategies 4-6: Parallel Search Execution ───
    # Run Google, Bing, DuckDuckGo in parallel for speed + more raw text
    if not data:
        print(f"[LinkedIn] S4-S6: Parallel search (Google+Bing+DDG+Startpage)...")
        search_tasks = [
            _strategy_google_search(username),
            _strategy_bing_search(username),
            _strategy_duckduckgo(username),
            _strategy_startpage(username),
        ]
        search_results = await asyncio.gather(*search_tasks, return_exceptions=True)
        search_names = ["S4:Google", "S5:Bing", "S6:DDG", "S6b:Startpage"]

        for i, sr in enumerate(search_results):
            if isinstance(sr, dict) and sr:
                if not data:
                    data = sr
                    _strategy_log.append(f"{search_names[i]} ✓ (used)")
                else:
                    _strategy_log.append(f"{search_names[i]} ✓ (collected text)")
                # Always collect raw text from successful searches
                sr_text = sr.get("raw_text", "")
                if sr_text:
                    _partial_raw_texts.append(sr_text)
            elif isinstance(sr, Exception):
                _strategy_log.append(f"{search_names[i]} ✗ ({type(sr).__name__})")
            else:
                _strategy_log.append(f"{search_names[i]} ✗")

    # ─── Strategy 7: Direct Scrape ───
    if not data:
        print(f"[LinkedIn] S7: Direct Scrape...")
        await asyncio.sleep(get_delay())
        data = await _strategy_direct_scrape(clean_url)
        if data:
            raw_text_for_ai = data.get("raw_text", "")
            _partial_raw_texts.append(raw_text_for_ai)
            _strategy_log.append("S7:DirectScrape ✓")
        else:
            _strategy_log.append("S7:DirectScrape ✗")

    # ─── Strategy 8: Google Cache ───
    if not data:
        print(f"[LinkedIn] S8: Google Cache...")
        data = await _strategy_google_cache(clean_url)
        if data:
            raw_text_for_ai = data.get("raw_text", "")
            _partial_raw_texts.append(raw_text_for_ai)
            _strategy_log.append("S8:Cache ✓")
        else:
            _strategy_log.append("S8:Cache ✗")

    # ─── Strategy 9: Wayback Machine ───
    if not data:
        print(f"[LinkedIn] S9: Wayback Machine...")
        data = await _strategy_wayback_machine(clean_url)
        if data:
            raw_text_for_ai = data.get("raw_text", "")
            _partial_raw_texts.append(raw_text_for_ai)
            _strategy_log.append("S9:Wayback ✓")
        else:
            _strategy_log.append("S9:Wayback ✗")

    # ─── Aggregate raw text for AI extraction ───
    # Always try to collect raw text even if no structured data was found
    if not raw_text_for_ai:
        # Try multiple search engines in parallel just for raw text collection
        try:
            raw_queries = [
                f"linkedin.com/in/{username} developer",
                f'"{username.replace("-", " ")}" linkedin profile',
            ]
            for rq in raw_queries:
                if raw_text_for_ai:
                    break
                ddg_url = f"https://html.duckduckgo.com/html/?q={quote_plus(rq)}"
                async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                    resp = await client.get(ddg_url, headers=get_random_headers())
                    if resp.status_code == 200:
                        soup = BeautifulSoup(resp.text, "html.parser")
                        snippets = []
                        # Use broader selectors
                        for el in soup.find_all(["div", "a", "span"], class_=re.compile(r"result|snippet|desc")):
                            text = el.get_text(separator=" ", strip=True)
                            if "linkedin" in text.lower() and len(text) > 15:
                                snippets.append(text)
                        # Fallback — grab all text near linkedin links
                        if not snippets:
                            for a_tag in soup.find_all("a", href=True):
                                if "linkedin.com" in a_tag.get("href", ""):
                                    parent = a_tag.find_parent(["div", "li"])
                                    if parent:
                                        t = parent.get_text(separator=" ", strip=True)
                                        if len(t) > 15:
                                            snippets.append(t[:500])
                        if snippets:
                            raw_text_for_ai = " ".join(snippets[:5])[:3000]
                            print(f"[LinkedIn] DDG fallback collected {len(raw_text_for_ai)} chars of raw text")
        except Exception:
            pass

    # Merge any partial texts collected from ALL strategies
    if _partial_raw_texts:
        merged = " | ".join(t for t in _partial_raw_texts if t)[:5000]
        if len(merged) > len(raw_text_for_ai):
            raw_text_for_ai = merged

    # ─── Strategy 10: AI-Enhanced Extraction ───
    # Run AI extraction when we have raw_text, regardless of whether data exists
    if raw_text_for_ai and (not data or data.get("_quality") in ("SNIPPET", "CACHED", "ARCHIVED", "META", None)):
        quality_label = data.get('_quality', 'raw_text') if data else 'raw_text_only'
        print(f"[LinkedIn] S10: AI Enhancement on {quality_label} data ({len(raw_text_for_ai)} chars)...")
        ai_data = await _strategy_ai_extraction(raw_text_for_ai if not data else (raw_text_for_ai or data.get("raw_text", "")), username)
        if ai_data:
            if data:
                # Merge AI extraction with existing data (prefer AI for structured fields)
                for key in ["experiences", "education", "certifications", "languages"]:
                    if ai_data.get(key) and not data.get(key):
                        data[key] = ai_data[key]
                for key in ["skills"]:
                    ai_skills = ai_data.get(key, [])
                    existing_skills = data.get(key, [])
                    if len(ai_skills) > len(existing_skills):
                        data[key] = ai_skills
                for key in ["full_name", "headline", "summary", "current_company", "location", "years_experience"]:
                    if ai_data.get(key) and not data.get(key):
                        data[key] = ai_data[key]
                data["_quality"] = "AI_ENHANCED"
                data["_source"] = f"{data.get('_source', 'unknown')}+ai"
            else:
                # No data at all — use AI result directly
                data = ai_data
            _strategy_log.append("S10:AI ✓")
        else:
            _strategy_log.append("S10:AI ✗")
    elif not data and raw_text_for_ai:
        # Last resort: run AI on whatever raw text we collected
        print(f"[LinkedIn] S10: AI extraction from raw text ({len(raw_text_for_ai)} chars)...")
        data = await _strategy_ai_extraction(raw_text_for_ai, username)
        _strategy_log.append(f"S10:AI {'✓' if data else '✗'}")

    # ─── Process result ───
    strategy_summary = " → ".join(_strategy_log)
    if data:
        normalized = _normalize_linkedin_data(data)
        if result is None:
            result = {}
        result["accessible"] = True
        result["name"] = normalized["name"]
        result["headline"] = normalized["headline"]
        result["about"] = normalized["about"]
        result["raw_text"] = normalized["raw_text"]
        result["experiences"] = normalized["experiences"]
        result["skills"] = normalized["skills"]
        result["education"] = normalized["education"]
        result["certifications"] = normalized.get("certifications", [])
        result["connections"] = normalized["connections"]
        result["years_experience"] = normalized["years_experience"]
        result["current_company"] = normalized["current_company"]
        result["location"] = normalized.get("location", "")
        result["languages"] = normalized.get("languages", [])
        result["source"] = normalized["_source"]
        result["_quality"] = normalized["_quality"]
        result["note"] = f"LinkedIn data extracted via {normalized['_source'].replace('_', ' ')} (quality: {normalized['_quality']})."
        result["recommendation"] = "Profile data available for cross-reference with resume."
        print(f"[LinkedIn] ✓ SUCCESS via {normalized['_source']}: {normalized['name']} [quality={normalized['_quality']}]")
        print(f"[LinkedIn] Strategy log: {strategy_summary}")

        # Cache successful result
        cache_set(cache_key, result)
    else:
        result["blocked"] = True
        # Build informative error message showing what was tried
        has_cookie = bool(get_li_at())
        has_cse = bool(get_google_cse_key())
        tips = []
        if not has_cookie:
            tips.append("Set LINKEDIN_LI_AT env var for Voyager API + Authenticated Render")
        if not has_cse:
            tips.append("Set GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX for reliable Google Custom Search")
        tips_text = " Tips: " + "; ".join(tips) if tips else ""
        result["note"] = (
            f"LinkedIn automated access unavailable — tried: {strategy_summary}.{tips_text} "
            f"Use the 'Paste LinkedIn' feature to manually provide profile text."
        )
        result["recommendation"] = (
            "Visit the LinkedIn URL directly and use the 'Paste LinkedIn text' feature. "
            "Check: work history dates, endorsements, connections count, and activity level."
        )
        result["source"] = "none"
        print(f"[LinkedIn] ✗ All strategies failed for {clean_url}")
        print(f"[LinkedIn] Strategy log: {strategy_summary}")

    return result
