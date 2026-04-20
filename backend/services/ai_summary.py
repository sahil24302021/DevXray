"""
AI Summary Generator — Hiring Intelligence Edition.

Generates structured hiring intelligence summaries using Gemini.
Accepts profile/repos/events objects plus scoring data to produce
actionable hiring recommendations for HR managers.
"""
import json
from typing import Dict, Any, List, Optional

from utils.logging_config import get_logger

log = get_logger("ai_summary")

try:
    from services.gemini_client import generate_json
    HAS_GEMINI = True
except Exception:
    HAS_GEMINI = False


def _extract_summary_data(
    profile: Dict[str, Any],
    repos: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Extract the fields needed for the AI summary prompt from raw API data."""
    username = profile.get("username") or profile.get("login", "unknown")

    non_fork = [r for r in repos if not r.get("is_fork", r.get("fork", False))]
    repo_count = len(non_fork)
    total_stars = sum(r.get("stars", r.get("stargazers_count", 0)) for r in non_fork)

    # Top languages by repo count
    lang_counts: Dict[str, int] = {}
    for r in non_fork:
        lang = r.get("language")
        if lang:
            lang_counts[lang] = lang_counts.get(lang, 0) + 1
    top_languages = sorted(lang_counts, key=lang_counts.get, reverse=True)[:5]

    # Recent activity indicator
    push_count = sum(1 for e in events if e.get("type") == "PushEvent")

    # Account age
    account_age_plain = "unknown"
    created_at = profile.get("created_at", "")
    if created_at:
        try:
            from datetime import datetime, timezone
            created_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            delta = datetime.now(timezone.utc) - created_dt
            days = delta.days
            if days < 365:
                account_age_plain = f"{round(days / 30.4, 1)} months"
            else:
                account_age_plain = f"{round(days / 365.25, 1)} years"
        except Exception:
            account_age_plain = created_at

    return {
        "username": username,
        "repo_count": repo_count,
        "total_stars": total_stars,
        "top_languages": top_languages,
        "recent_pushes": push_count,
        "followers": profile.get("followers", 0),
        "account_age_plain": account_age_plain,
    }


async def generate_ai_summary(
    profile: Dict[str, Any],
    repos: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    # Scoring data for richer summaries
    score: Optional[int] = None,
    verdict: Optional[str] = None,
    risk_level: Optional[str] = None,
    strengths: Optional[List[str]] = None,
    weaknesses: Optional[List[str]] = None,
    tier: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate a structured AI hiring intelligence summary.

    Returns JSON with tl_dr, hire_signal, for_recruiter, for_hiring_manager, etc.
    Falls back to rule-based summary when Gemini is unavailable.
    """
    data = _extract_summary_data(profile, repos, events)

    non_fork_repos = [r for r in repos if not r.get("is_fork", r.get("fork", False))]

    # Build rich repo context for the prompt
    top_repos_info = []
    for r in sorted(non_fork_repos, key=lambda x: x.get("stars", 0), reverse=True)[:5]:
        desc = r.get("description", "") or ""
        top_repos_info.append(
            f"  - {r.get('name', '?')} ({r.get('language', '?')}, ⭐{r.get('stars', 0)})"
            + (f": {desc[:80]}" if desc else "")
        )

    strengths_text = "\n".join([f"  - {s}" for s in (strengths or [])[:4]]) or "  - None significant"
    weaknesses_text = "\n".join([f"  - {w}" for w in (weaknesses or [])[:4]]) or "  - None significant"

    prompt = f"""You are a senior engineering hiring manager writing a forensic developer assessment.
Write in plain, direct English. Be specific. Reference actual evidence.

DEVELOPER: @{data['username']}
ACCOUNT: {data.get('account_age_plain', 'unknown')} old
FOLLOWERS: {data.get('followers', 0)} ({
    'top developer — significant social proof' if data.get('followers', 0) >= 1000
    else 'limited following' if data.get('followers', 0) < 50
    else 'moderate following'
})
ORIGINAL REPOS: {len(non_fork_repos)}
TOTAL STARS: {data.get('total_stars', 0)}

TOP REPOSITORIES:
{chr(10).join(top_repos_info) if top_repos_info else '  - No notable repos'}

TOP LANGUAGES: {', '.join(data['top_languages'][:4]) or 'Unknown'}
DIP SCORE: {score or 'N/A'}/100
TIER: {tier or 'Unknown'}
RISK LEVEL: {risk_level or 'Unknown'}

VERIFIED STRENGTHS (from code analysis):
{strengths_text}

DETECTED WEAKNESSES (from code analysis):
{weaknesses_text}

BANNED PHRASES — do NOT use any of these:
- "significant improvement needed"
- "authenticity concerns detected"
- "irregular activity patterns"
- "code quality needs significant improvement"
- "notable gaps"
- "this candidate may not yet meet the bar"

REQUIREMENTS:
1. The "ai_assessment" field MUST reference at least one specific repository by its actual name from the list above
2. Every sentence must be specific to THIS developer — not copy-pasteable to any other report
3. If followers >= 1000, acknowledge this as a real signal of credibility
4. If total_stars >= 100, mention this as evidence of real-world impact
5. The "for_recruiter" field must be readable by a non-technical HR manager
6. "interview_must_ask" must reference something specific from their code or repos

Return ONLY this JSON (no markdown, no explanation):
{{
    "tl_dr": "One sentence, max 20 words. Must name @{data['username']} and state the verdict.",
    "ai_assessment": "2-3 sentences describing THIS developer specifically. Must reference at least one repo name from the list above by name.",
    "for_recruiter": "2-3 non-technical sentences. What kind of developer, what role they fit, and one key concern. Written for HR.",
    "for_hiring_manager": "2-3 technical sentences. Specific code quality, patterns, growth signal. Not generic.",
    "standout_quality": "Most impressive specific thing backed by evidence from their repos.",
    "biggest_concern": "Most important concern with specific evidence.",
    "recommended_role_level": "Intern | Junior | Mid | Senior | Lead",
    "interview_must_ask": "One targeted question based on something specific in their code or repos.",
    "confidence": "High | Medium | Low",
    "hire_signal": "STRONG HIRE | HIRE | MAYBE | INTERN ONLY | NO HIRE",
    "summary": "Same as ai_assessment (for backwards compatibility)"
}}"""

    try:
        if HAS_GEMINI:
            result = await generate_json(prompt, temperature=0)
            # Ensure required fields with safe defaults
            result.setdefault("tl_dr", f"@{data['username']} — analysis complete")
            result.setdefault("hire_signal", "INTERN ONLY")
            result.setdefault("summary", result.get("ai_assessment", result.get("tl_dr", "")))
            return result
    except Exception as e:
        log.warning(f"AI summary failed: {e}")

    return _generate_fallback_summary(
        data["username"],
        score or 0,
        strengths or [],
        weaknesses or [],
        tier,
        top_repos=[r.get("name", "") for r in non_fork_repos[:3]],
        followers=data.get("followers", 0),
        total_stars=data.get("total_stars", 0),
    )


def _generate_fallback_summary(
    username: str,
    score: int,
    strengths: List[str],
    weaknesses: List[str],
    tier: Optional[str] = None,
    top_repos: List[str] = None,
    followers: int = 0,
    total_stars: int = 0,
) -> Dict[str, Any]:
    """
    Fallback summary when Gemini is unavailable.
    Must be unique per developer — references actual data points.
    Never uses banned generic phrases.
    """
    tier_str = tier or "Unknown"
    top_repos = top_repos or []

    # Build a specific assessment from actual data
    repo_mention = f" Their top project is {top_repos[0]}." if top_repos else ""
    follower_note = (
        f" With {followers:,} GitHub followers, they have measurable community credibility."
        if followers >= 500 else ""
    )
    star_note = (
        f" Their work has earned {total_stars:,} stars across original repositories."
        if total_stars >= 50 else ""
    )

    strength_1 = strengths[0] if strengths else "Technical skills detected across multiple repositories"
    weakness_1 = weaknesses[0] if weaknesses else "Limited data available for full assessment"

    if score >= 75:
        tl_dr = f"@{username} is a strong {tier_str.lower()} developer with verified technical depth."
        hire_signal = "HIRE"
        role_level = "Mid"
    elif score >= 55:
        tl_dr = f"@{username} shows solid fundamentals as a {tier_str.lower()} developer with room to grow."
        hire_signal = "MAYBE"
        role_level = "Junior"
    elif score >= 35:
        tl_dr = f"@{username} is an early-career developer — suitable for junior/intern roles with mentorship."
        hire_signal = "INTERN ONLY"
        role_level = "Intern"
    else:
        tl_dr = f"@{username} has limited verifiable development activity at this time."
        hire_signal = "NO HIRE"
        role_level = "Intern"

    assessment = (
        f"@{username}'s GitHub shows a {tier_str.lower()} profile with {strength_1.lower()}."
        f"{repo_mention}{follower_note}{star_note}"
        f" Primary concern: {weakness_1.lower()}."
    )

    return {
        "tl_dr": tl_dr,
        "ai_assessment": assessment,
        "for_recruiter": f"{tl_dr} {strength_1}. Key concern to probe: {weakness_1}.",
        "for_hiring_manager": f"Code analysis indicates {tier_str.lower()} level work. {strength_1}. {weakness_1}.",
        "standout_quality": strength_1,
        "biggest_concern": weakness_1,
        "growth_assessment": "Insufficient data",
        "recommended_role_level": role_level,
        "interview_must_ask": (
            f"Walk me through the architecture of {top_repos[0]} and the hardest decision you made building it."
            if top_repos
            else "Walk me through the architecture of your most complex project and the hardest decision you made building it."
        ),
        "confidence": "Medium" if score >= 50 else "Low",
        "hire_signal": hire_signal,
        "summary": assessment,
    }