"""
AI Summary Generator.

FIX: Updated function signature to accept `profile`, `repos`, `events` objects
(as called from main.py) instead of flat scalar parameters.
Data is extracted internally so the caller doesn't need to pre-compute everything.
"""
import json
from typing import Dict, Any, List, Optional

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

    return {
        "username": username,
        "repo_count": repo_count,
        "total_stars": total_stars,
        "top_languages": top_languages,
        "recent_pushes": push_count,
        "followers": profile.get("followers", 0),
    }


async def generate_ai_summary(
    profile: Dict[str, Any],
    repos: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    # Optional override params (for backward compatibility)
    score: Optional[int] = None,
    verdict: Optional[str] = None,
    risk_level: Optional[str] = None,
    strengths: Optional[List[str]] = None,
    weaknesses: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Generate a concise AI hiring summary.

    Accepts profile/repos/events objects (preferred) or flat scalar params (legacy).
    """
    data = _extract_summary_data(profile, repos, events)
    username = data["username"]
    repo_count = data["repo_count"]
    total_stars = data["total_stars"]
    top_languages = data["top_languages"]

    # Use overrides if provided, otherwise generate defaults
    score_val = score if score is not None else 0
    verdict_val = verdict or "Developing Talent"
    risk_val = risk_level or "Medium"
    strengths_val = strengths or []
    weaknesses_val = weaknesses or []

    prompt = f"""You are an expert hiring consultant analyzing a developer's GitHub profile.

Developer: @{username}
Repositories: {repo_count} original (non-fork)
Total Stars: {total_stars}
Top Languages: {', '.join(top_languages) if top_languages else 'Not determined'}
Recent Activity: {data['recent_pushes']} push events
Followers: {data['followers']}
{f'Intelligence Score: {score_val}/100' if score_val else ''}
{f'Verdict: {verdict_val}' if verdict_val else ''}
{f'Risk Level: {risk_val}' if risk_val else ''}
{f'Key Strengths: {", ".join(strengths_val)}' if strengths_val else ''}
{f'Key Weaknesses: {", ".join(weaknesses_val)}' if weaknesses_val else ''}

Write a concise, professional hiring summary (2-3 sentences) that:
1. Assesses whether this developer would be a good hire
2. Highlights the most important signal (positive or negative)
3. Feels written by a senior engineering manager

Respond in JSON: {{"summary": "..."}}
"""

    try:
        if HAS_GEMINI:
            result = await generate_json(prompt, temperature=0.7)
            if result and result.get("summary"):
                return result
    except Exception as e:
        print(f"AI summary error: {e}")

    return _generate_fallback_summary(username, score_val, strengths_val, weaknesses_val)


def _generate_fallback_summary(
    username: str,
    score: int,
    strengths: List[str],
    weaknesses: List[str],
) -> Dict[str, Any]:
    """Rule-based fallback when Gemini is unavailable."""
    if score >= 80:
        return {
            "summary": (
                f"@{username} demonstrates a strong engineering profile with consistent output "
                f"and meaningful project ownership. The data suggests a capable developer who "
                f"maintains high-quality, original work. Recommended for roles requiring "
                f"independent technical leadership."
            )
        }
    elif score >= 60:
        weak = weaknesses[0].lower() if weaknesses else "some areas needing improvement"
        return {
            "summary": (
                f"@{username} shows a functional development profile with decent engagement, "
                f"though {weak}. The profile suggests a mid-level engineer who could grow "
                f"with the right mentorship and challenging projects."
            )
        }
    elif score >= 40:
        return {
            "summary": (
                f"@{username}'s GitHub profile shows emerging potential but with notable gaps. "
                f"Limited original work and inconsistent patterns suggest this candidate "
                f"needs significant growth before senior-level roles."
            )
        }
    else:
        return {
            "summary": (
                f"@{username}'s GitHub profile raises several concerns. Limited original work, "
                f"inconsistent activity, and shallow project depth suggest this candidate "
                f"may not yet meet the bar for production engineering roles."
            )
        }