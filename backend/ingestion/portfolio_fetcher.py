"""
Portfolio & LinkedIn Auto-Fetcher for GitHub-Only Scans.

Extracts portfolio/LinkedIn data from GitHub profile metadata:
1. If blog URL exists → scrape for technologies, projects, contact info, YoE claims
2. If bio contains LinkedIn URL → extract username → scrape via Voyager if li_at set
3. Returns structured portfolio_data + linkedin_data for the report
4. Builds cross-validation text: "Claims X on LinkedIn vs Y evidence on GitHub"
"""
import re
import asyncio
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from utils.logging_config import get_logger

log = get_logger("portfolio_fetcher")


# ── LinkedIn URL patterns ──
_LINKEDIN_PATTERNS = [
    re.compile(r"linkedin\.com/in/([a-zA-Z0-9\-_]+)", re.IGNORECASE),
    re.compile(r"linkedin\.com/pub/([a-zA-Z0-9\-_]+)", re.IGNORECASE),
]

# ── Technology keywords for portfolio extraction ──
_TECH_KEYWORDS = {
    # Languages
    "python", "javascript", "typescript", "java", "c++", "c#", "go", "golang",
    "rust", "ruby", "php", "swift", "kotlin", "scala", "dart", "r",
    # Frontend
    "react", "vue", "angular", "svelte", "next.js", "nextjs", "nuxt",
    "tailwind", "bootstrap", "html5", "css3", "sass", "webpack",
    # Backend
    "node.js", "nodejs", "express", "django", "flask", "fastapi", "spring",
    "rails", "laravel", "asp.net", "graphql", "rest api",
    # Data/ML
    "tensorflow", "pytorch", "keras", "scikit-learn", "pandas", "numpy",
    "machine learning", "deep learning", "ai", "nlp", "computer vision",
    "opencv", "llm", "gpt", "transformers",
    # Cloud/DevOps
    "aws", "gcp", "azure", "docker", "kubernetes", "terraform", "ci/cd",
    "jenkins", "github actions",
    # Databases
    "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "firebase",
    "supabase", "dynamodb",
    # Mobile
    "react native", "flutter", "ios", "android",
}

# ── Years of experience patterns ──
_YOE_PATTERNS = [
    re.compile(r"(\d+)\+?\s*years?\s*(?:of\s*)?(?:experience|exp)", re.IGNORECASE),
    re.compile(r"(\d+)\+?\s*years?\s*(?:in\s*)?(?:software|development|engineering|coding|programming)", re.IGNORECASE),
    re.compile(r"(?:over|more than|about)\s*(\d+)\s*years?", re.IGNORECASE),
]

# ── Contact info patterns ──
_EMAIL_PATTERN = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_PHONE_PATTERN = re.compile(r"[\+]?[\d\s\-\(\)]{10,15}")


def extract_linkedin_from_bio(bio: str, blog: str = "") -> Optional[str]:
    """
    Extract LinkedIn username from GitHub bio text or blog URL.
    Returns the LinkedIn username (e.g., 'sahilkumar') or None.
    """
    text = f"{bio or ''} {blog or ''}"
    for pattern in _LINKEDIN_PATTERNS:
        match = pattern.search(text)
        if match:
            username = match.group(1).strip("/")
            if len(username) > 2:
                log.info(f"Extracted LinkedIn username from bio: {username}")
                return username
    return None


def _extract_technologies(text: str) -> List[str]:
    """Extract technology keywords from portfolio text."""
    text_lower = text.lower()
    found = []
    for tech in _TECH_KEYWORDS:
        # Word boundary check to avoid partial matches
        if re.search(r'\b' + re.escape(tech) + r'\b', text_lower):
            found.append(tech.title())
    return sorted(set(found))


def _extract_yoe_claims(text: str) -> Optional[int]:
    """Extract years of experience claims from portfolio text."""
    for pattern in _YOE_PATTERNS:
        match = pattern.search(text)
        if match:
            try:
                return int(match.group(1))
            except (ValueError, IndexError):
                pass
    return None


def _extract_contact_info(text: str) -> Dict[str, str]:
    """Extract contact information from portfolio text."""
    contact = {}
    emails = _EMAIL_PATTERN.findall(text)
    if emails:
        # Filter out common false positives
        real_emails = [
            e for e in emails
            if not any(x in e.lower() for x in ["example", "test", "placeholder", "noreply"])
        ]
        if real_emails:
            contact["email"] = real_emails[0]
    return contact


def _extract_projects(text: str, headings: List[str] = None) -> List[str]:
    """Extract project names from portfolio text and headings."""
    projects = []
    if headings:
        project_headings = [
            h for h in headings
            if any(kw in h.lower() for kw in ["project", "work", "portfolio", "built", "created"])
        ]
        projects.extend(project_headings[:5])
    return projects


async def fetch_portfolio_data(
    blog_url: str,
) -> Dict[str, Any]:
    """
    Scrape a portfolio/blog URL and extract structured intelligence data.
    Returns technologies, projects, contact info, and years of experience.
    """
    result = {
        "url": blog_url,
        "is_live": False,
        "technologies": [],
        "projects_listed": [],
        "contact_info": {},
        "yoe_claimed": None,
        "tech_stack": [],
        "social_links": [],
        "raw_text_snippet": "",
    }

    if not blog_url or not blog_url.startswith("http"):
        return result

    try:
        from services.web_scraper import scrape_portfolio_deep
        deep_data = await scrape_portfolio_deep(blog_url)

        result["is_live"] = deep_data.get("is_live", False)
        result["tech_stack"] = deep_data.get("tech_stack", [])
        result["social_links"] = deep_data.get("social_links", [])
        result["projects_listed"] = deep_data.get("projects_found", [])[:10]
        result["is_template"] = deep_data.get("is_template", False)
        result["template_name"] = deep_data.get("template_name")

        raw_text = deep_data.get("raw_text", "")
        result["raw_text_snippet"] = raw_text[:500]

        if raw_text:
            # Extract technologies mentioned in the portfolio
            result["technologies"] = _extract_technologies(raw_text)
            # Extract years of experience claims
            result["yoe_claimed"] = _extract_yoe_claims(raw_text)
            # Extract contact info
            result["contact_info"] = _extract_contact_info(raw_text)
            # Extract project names
            result["projects_listed"] = (
                _extract_projects(raw_text, deep_data.get("projects_found", []))
                or result["projects_listed"]
            )

            # Also check for LinkedIn in portfolio social links
            for link in result["social_links"]:
                li_user = extract_linkedin_from_bio(link)
                if li_user:
                    result["linkedin_from_portfolio"] = li_user
                    break

    except Exception as e:
        log.warning(f"Portfolio fetch failed for {blog_url}: {e}")
        result["error"] = str(e)[:120]

    return result


async def fetch_linkedin_data(
    linkedin_username: str,
) -> Dict[str, Any]:
    """
    Scrape LinkedIn profile data using existing scraper infrastructure.
    Returns job title, company, experience, education, skills.
    """
    result = {
        "username": linkedin_username,
        "accessible": False,
        "current_title": None,
        "current_company": None,
        "years_of_experience": None,
        "education": [],
        "top_skills": [],
        "headline": None,
        "connections": 0,
    }

    if not linkedin_username:
        return result

    try:
        # Uses the FREE 10-strategy cascade scraper (Google, Bing, DuckDuckGo, etc.)
        # NOT the paid Voyager API — works without any paid keys or li_at cookie
        from services.web_scraper import scrape_linkedin
        linkedin_url = f"https://www.linkedin.com/in/{linkedin_username}"
        li_data = await scrape_linkedin(linkedin_url)

        if not li_data or not li_data.get("accessible"):
            result["note"] = "LinkedIn profile not accessible"
            return result

        result["accessible"] = True
        result["headline"] = li_data.get("headline", "")
        result["connections"] = li_data.get("connections", 0)
        result["full_name"] = li_data.get("name", "")

        # Extract current job
        experiences = li_data.get("experiences", [])
        if experiences:
            current = experiences[0]
            result["current_title"] = current.get("title", "")
            result["current_company"] = current.get("company", "")

            # Calculate total years of experience
            total_months = 0
            for exp in experiences:
                start = exp.get("starts_at") or {}
                end = exp.get("ends_at") or {}
                if start.get("year"):
                    start_dt = datetime(start.get("year", 2020), start.get("month", 1), 1)
                    end_dt = (
                        datetime(end.get("year", 2025), end.get("month", 1), 1)
                        if end.get("year")
                        else datetime.now()
                    )
                    total_months += max(0, (end_dt - start_dt).days / 30.4)
            result["years_of_experience"] = round(total_months / 12, 1)

        # Extract education
        education = li_data.get("education", [])
        result["education"] = [
            {
                "school": e.get("school", ""),
                "degree": e.get("degree_name", ""),
                "field": e.get("field_of_study", ""),
            }
            for e in education[:3]
        ]

        # Extract skills
        skills = li_data.get("skills", [])
        if isinstance(skills, list):
            result["top_skills"] = [
                s.get("name", s) if isinstance(s, dict) else str(s)
                for s in skills[:15]
            ]

    except Exception as e:
        log.warning(f"LinkedIn fetch failed for {linkedin_username}: {e}")
        result["error"] = str(e)[:120]

    return result


def build_crossval_comparison(
    linkedin_data: Dict[str, Any],
    portfolio_data: Dict[str, Any],
    github_languages: List[str],
    github_repos: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Build explicit cross-validation comparison:
    "Claims X on LinkedIn vs Y evidence on GitHub"
    """
    comparisons = []
    flags = []

    non_fork = [r for r in github_repos if not r.get("is_fork", r.get("fork", False))]
    github_repo_count = len(non_fork)
    github_langs_lower = [l.lower() for l in github_languages[:5]]

    # ── LinkedIn vs GitHub comparisons ──
    if linkedin_data and linkedin_data.get("accessible"):
        # 1. Job title vs GitHub evidence
        title = linkedin_data.get("current_title", "") or ""
        if title:
            title_lower = title.lower()
            # Check if title matches GitHub activity
            if "senior" in title_lower and github_repo_count < 5:
                comparisons.append({
                    "claim": f"LinkedIn title: '{title}'",
                    "evidence": f"GitHub has only {github_repo_count} original repos",
                    "match": "weak",
                })
            elif any(kw in title_lower for kw in ["python", "ml", "data", "ai"]):
                if "python" in github_langs_lower:
                    comparisons.append({
                        "claim": f"LinkedIn title: '{title}'",
                        "evidence": "Python confirmed as active GitHub language",
                        "match": "strong",
                    })
                else:
                    comparisons.append({
                        "claim": f"LinkedIn title: '{title}'",
                        "evidence": f"Top GitHub languages: {', '.join(github_languages[:3])}",
                        "match": "weak",
                    })

        # 2. Years of experience vs GitHub account age
        li_yoe = linkedin_data.get("years_of_experience")
        if li_yoe and li_yoe > 0:
            comparisons.append({
                "claim": f"LinkedIn shows ~{li_yoe:.0f} years of experience",
                "evidence": f"GitHub has {github_repo_count} original repos to verify",
                "match": "neutral",
            })

        # 3. LinkedIn skills vs GitHub languages
        li_skills = linkedin_data.get("top_skills", [])
        if li_skills and github_languages:
            li_skills_lower = [s.lower() for s in li_skills[:5]]
            matched = [s for s in li_skills_lower if s in github_langs_lower]
            unmatched = [s for s in li_skills_lower if s not in github_langs_lower]
            if matched:
                comparisons.append({
                    "claim": f"LinkedIn skills: {', '.join(li_skills[:5])}",
                    "evidence": f"GitHub confirms: {', '.join(matched)}",
                    "match": "strong",
                })
            if unmatched:
                comparisons.append({
                    "claim": f"LinkedIn claims: {', '.join(unmatched)}",
                    "evidence": "Not found in GitHub repositories",
                    "match": "unverified",
                })

    # ── Portfolio vs GitHub comparisons ──
    if portfolio_data and portfolio_data.get("is_live"):
        portfolio_techs = portfolio_data.get("technologies", [])
        if portfolio_techs:
            portfolio_lower = [t.lower() for t in portfolio_techs]
            gh_matched = [t for t in portfolio_lower if t in github_langs_lower]
            if gh_matched:
                comparisons.append({
                    "claim": f"Portfolio mentions: {', '.join(portfolio_techs[:5])}",
                    "evidence": f"GitHub confirms: {', '.join(gh_matched)}",
                    "match": "strong",
                })

        port_yoe = portfolio_data.get("yoe_claimed")
        if port_yoe:
            comparisons.append({
                "claim": f"Portfolio claims {port_yoe} years of experience",
                "evidence": f"GitHub has {github_repo_count} original repos",
                "match": "neutral",
            })

    # ── Build summary text ──
    summary_parts = []
    for comp in comparisons:
        if comp["match"] == "strong":
            summary_parts.append(f"✓ {comp['claim']} — {comp['evidence']}")
        elif comp["match"] == "weak":
            summary_parts.append(f"⚠ {comp['claim']} — {comp['evidence']}")
        elif comp["match"] == "unverified":
            summary_parts.append(f"? {comp['claim']} — {comp['evidence']}")

    return {
        "comparisons": comparisons,
        "flags": flags,
        "summary_text": "\n".join(summary_parts) if summary_parts else "",
        "total_comparisons": len(comparisons),
        "strong_matches": sum(1 for c in comparisons if c["match"] == "strong"),
        "weak_matches": sum(1 for c in comparisons if c["match"] == "weak"),
    }


async def auto_fetch_profile_intelligence(
    profile: Dict[str, Any],
    repos: List[Dict[str, Any]],
    github_languages: List[str],
) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """
    Main entry point: automatically extract and scrape portfolio + LinkedIn
    from a GitHub profile during GitHub-only scans.

    Returns: (portfolio_data, linkedin_data, crossval_data)
    """
    bio = profile.get("bio", "") or ""
    blog = profile.get("blog", "") or ""

    # ── Step 1: Extract LinkedIn username from bio + blog ──
    linkedin_username = extract_linkedin_from_bio(bio, blog)

    # Also check social links in profile
    twitter = profile.get("twitter_username", "")

    # ── Step 2: Fetch portfolio and LinkedIn in parallel ──
    tasks = []

    # Portfolio
    portfolio_url = blog
    if portfolio_url and not portfolio_url.startswith("http"):
        portfolio_url = f"https://{portfolio_url}"

    portfolio_task = fetch_portfolio_data(portfolio_url) if portfolio_url else None
    linkedin_task = fetch_linkedin_data(linkedin_username) if linkedin_username else None

    portfolio_data = {}
    linkedin_data = {}

    if portfolio_task and linkedin_task:
        portfolio_data, linkedin_data = await asyncio.gather(
            portfolio_task, linkedin_task
        )
    elif portfolio_task:
        portfolio_data = await portfolio_task
    elif linkedin_task:
        linkedin_data = await linkedin_task

    # ── Step 3: Check if portfolio had a LinkedIn link we missed ──
    if not linkedin_username and portfolio_data.get("linkedin_from_portfolio"):
        linkedin_username = portfolio_data["linkedin_from_portfolio"]
        linkedin_data = await fetch_linkedin_data(linkedin_username)

    # ── Step 4: Build cross-validation comparison ──
    crossval_data = build_crossval_comparison(
        linkedin_data=linkedin_data,
        portfolio_data=portfolio_data,
        github_languages=github_languages,
        github_repos=repos,
    )

    log.info(
        f"Profile intelligence: portfolio={'live' if portfolio_data.get('is_live') else 'none'}, "
        f"linkedin={'found' if linkedin_data.get('accessible') else 'none'}, "
        f"crossval_comparisons={crossval_data.get('total_comparisons', 0)}"
    )

    return portfolio_data, linkedin_data, crossval_data
