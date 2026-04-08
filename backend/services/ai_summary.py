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
    top_repos_info = []
    for r in sorted(non_fork_repos, key=lambda x: x.get("stars", 0), reverse=True)[:5]:
        top_repos_info.append(f"{r.get('name', '?')} ({r.get('language', '?')}, ⭐{r.get('stars', 0)})")

    prompt = f"""You are a senior engineering manager at a top tech company reviewing a developer for hiring.
Write a hiring intelligence summary. Return ONLY valid JSON — no markdown, no explanation.

DEVELOPER PROFILE:
- GitHub: @{data['username']}
- Account age: {data.get('account_age_plain', 'unknown')}
- Original repos: {len(non_fork_repos)}
- Top repos: {', '.join(top_repos_info) if top_repos_info else 'none'}
- Languages: {', '.join(data['top_languages'])}
- Recent activity: {data['recent_pushes']} pushes in last 30 days
- DIP Score: {score or 'not computed'}/100
- Tier: {tier or 'unknown'}
- Risk level: {risk_level or 'unknown'}
- Confirmed strengths: {strengths or []}
- Detected weaknesses: {weaknesses or []}

Return this exact JSON:
{{
    "tl_dr": "One sentence verdict for a busy HR manager. Max 20 words. Start with the candidate name or @username.",
    "hire_signal": "STRONG HIRE | HIRE | INTERN ONLY | NO HIRE",
    "confidence": "High | Medium | Low",
    "for_recruiter": "2-3 sentences explaining what kind of developer this is, what role they fit, and one key concern. Written for a non-technical HR person.",
    "for_hiring_manager": "2-3 sentences about code quality, technical depth, and growth trajectory. Written for a technical person.",
    "standout_quality": "The single most impressive thing about this developer backed by evidence",
    "biggest_concern": "The single most important thing to probe in the interview",
    "growth_assessment": "Rapidly improving | Steady growth | Plateau | Declining | Insufficient data",
    "recommended_role_level": "Intern | Junior | Mid | Senior | Lead",
    "interview_must_ask": "The one question you absolutely must ask this candidate in the interview",
    "summary": "A concise 2-3 sentence professional hiring summary (for backwards compatibility)"
}}"""

    try:
        if HAS_GEMINI:
            result = await generate_json(prompt, temperature=0)
            # Ensure required fields with safe defaults
            result.setdefault("tl_dr", f"@{data['username']} — analysis complete")
            result.setdefault("hire_signal", "INTERN ONLY")
            result.setdefault("summary", result.get("tl_dr", ""))
            return result
    except Exception as e:
        log.warning(f"AI summary failed: {e}")

    return _generate_fallback_summary(
        data["username"],
        score or 0,
        strengths or [],
        weaknesses or [],
        tier,
    )


def _generate_fallback_summary(
    username: str,
    score: int,
    strengths: List[str],
    weaknesses: List[str],
    tier: Optional[str] = None,
) -> Dict[str, Any]:
    """Rule-based fallback when Gemini is unavailable."""
    if score >= 80:
        summary = (
            f"@{username} demonstrates a strong engineering profile with consistent output "
            f"and meaningful project ownership. Recommended for roles requiring "
            f"independent technical leadership."
        )
        hire_signal = "STRONG HIRE"
        role_level = "Mid"
    elif score >= 60:
        weak = weaknesses[0].lower() if weaknesses else "some areas needing improvement"
        summary = (
            f"@{username} shows a functional development profile with decent engagement, "
            f"though {weak}. Suggests a mid-level engineer who could grow "
            f"with the right mentorship."
        )
        hire_signal = "HIRE"
        role_level = "Junior"
    elif score >= 40:
        summary = (
            f"@{username}'s GitHub profile shows emerging potential but notable gaps. "
            f"Limited original work suggests this candidate needs growth "
            f"before senior-level roles."
        )
        hire_signal = "INTERN ONLY"
        role_level = "Intern"
    else:
        summary = (
            f"@{username}'s GitHub profile raises concerns. Limited original work, "
            f"inconsistent activity suggest this candidate may not yet meet "
            f"the bar for production engineering."
        )
        hire_signal = "NO HIRE"
        role_level = "Intern"

    return {
        "summary": summary,
        "tl_dr": f"@{username} — {tier or role_level}-level developer, score {score}/100",
        "hire_signal": hire_signal,
        "confidence": "Low",
        "for_recruiter": f"AI summary unavailable. {summary}",
        "for_hiring_manager": "Manual review required — AI summary could not be generated.",
        "standout_quality": strengths[0] if strengths else "Not assessed",
        "biggest_concern": weaknesses[0] if weaknesses else "Not assessed",
        "growth_assessment": "Insufficient data",
        "recommended_role_level": role_level,
        "interview_must_ask": "Walk me through the architecture of your most complex project.",
    }