"""
AI Summary Generator — Hiring Intelligence Edition.

Generates structured hiring intelligence summaries using Gemini.
Accepts profile/repos/events objects plus scoring data to produce
actionable hiring recommendations for HR managers.
"""
import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from utils.logging_config import get_logger

log = get_logger("ai_summary")

try:
    from services.gemini_client import generate_json, sanitize_text
    HAS_GEMINI = True
except Exception:
    HAS_GEMINI = False


# ── AI/ML signal keywords ──
_AIML_KEYWORDS = {
    "tensorflow", "pytorch", "keras", "scikit-learn", "sklearn", "opencv",
    "transformers", "huggingface", "llm", "gpt", "bert", "yolo", "neural",
    "deep-learning", "machine-learning", "ml", "ai", "nlp", "computer-vision",
    "model", "training", "inference", "onnx", "stable-diffusion", "langchain",
}


def _rank_skills_by_evidence(repos: List[Dict[str, Any]]) -> List[str]:
    """
    Rank languages/skills by EVIDENCE from actual repos:
    score = repo_count * 2 + total_stars + (recency_bonus).
    This replaces naive repo-count-only ranking.
    """
    non_fork = [r for r in repos if not r.get("is_fork", r.get("fork", False))]

    lang_evidence: Dict[str, float] = {}
    now = datetime.now(timezone.utc)

    for r in non_fork:
        lang = r.get("language")
        if not lang:
            continue
        stars = r.get("stars", r.get("stargazers_count", 0))
        # Recency bonus: repos updated in last 6 months get +3
        recency_bonus = 0
        updated_at = r.get("updated_at", r.get("pushed_at", ""))
        if updated_at:
            try:
                updated_dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
                days_ago = (now - updated_dt).days
                if days_ago < 180:
                    recency_bonus = 3
                elif days_ago < 365:
                    recency_bonus = 1
            except Exception:
                pass

        lang_evidence[lang] = lang_evidence.get(lang, 0) + 2 + stars + recency_bonus

    # Check if candidate has AI/ML repos → force Python into top 3
    has_aiml = False
    for r in non_fork:
        name_desc = (
            (r.get("name", "") + " " + (r.get("description", "") or "")).lower()
        )
        topics = " ".join(r.get("topics", []) if isinstance(r.get("topics"), list) else [])
        combined = name_desc + " " + topics
        if any(kw in combined for kw in _AIML_KEYWORDS):
            has_aiml = True
            break

    ranked = sorted(lang_evidence, key=lang_evidence.get, reverse=True)

    if has_aiml and "Python" in lang_evidence and "Python" not in ranked[:3]:
        # Move Python into position 2 (after whatever is #1)
        if "Python" in ranked:
            ranked.remove("Python")
        ranked.insert(min(2, len(ranked)), "Python")

    return ranked[:5]


def _get_most_recent_repo(repos: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Return the most recently updated non-fork repo."""
    non_fork = [r for r in repos if not r.get("is_fork", r.get("fork", False))]
    if not non_fork:
        return None

    def _sort_key(r):
        updated = r.get("pushed_at", r.get("updated_at", "2000-01-01"))
        try:
            return datetime.fromisoformat(updated.replace("Z", "+00:00"))
        except Exception:
            return datetime.min.replace(tzinfo=timezone.utc)

    return max(non_fork, key=_sort_key)


def _build_resume_crossval_text(
    resume_data: Optional[Dict[str, Any]],
    repos: List[Dict[str, Any]],
    top_languages: List[str],
) -> str:
    """
    Build cross-validation text when resume is uploaded.
    Returns empty string if no resume data.
    """
    if not resume_data:
        return ""

    claims = []
    non_fork = [r for r in repos if not r.get("is_fork", r.get("fork", False))]

    # Check claimed skills/languages vs GitHub evidence
    resume_skills = resume_data.get("skills", [])
    if isinstance(resume_skills, list):
        resume_skill_names = [
            (s.get("name", s) if isinstance(s, dict) else str(s)).lower()
            for s in resume_skills[:10]
        ]
    else:
        resume_skill_names = []

    # Find languages claimed in resume that appear in GitHub
    top_langs_lower = [l.lower() for l in top_languages]
    for skill in resume_skill_names[:5]:
        if skill in top_langs_lower:
            # Find a repo that uses this language
            matching_repos = [
                r for r in non_fork
                if (r.get("language", "") or "").lower() == skill
            ]
            if matching_repos:
                best = max(matching_repos, key=lambda r: r.get("stars", 0))
                repo_name = best.get("name", "")
                # Calculate months of activity
                updated = best.get("pushed_at", best.get("updated_at", ""))
                created = best.get("created_at", "")
                months = 0
                if updated and created:
                    try:
                        u = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                        c = datetime.fromisoformat(created.replace("Z", "+00:00"))
                        months = max(1, int((u - c).days / 30.4))
                    except Exception:
                        months = 0

                if repo_name and months > 0:
                    claims.append(
                        f"Resume claims {skill.title()} — GitHub confirms active "
                        f"{skill.title()} usage in {repo_name} over {months} months"
                    )
                elif repo_name:
                    claims.append(
                        f"Resume claims {skill.title()} — GitHub confirms usage in {repo_name}"
                    )

    # Check years of experience claim
    yoe = resume_data.get("years_of_experience")
    if yoe and isinstance(yoe, (int, float)) and yoe > 0:
        claims.append(f"Resume states {yoe} years of experience")

    if not claims:
        return ""

    return "\nRESUME CROSS-VALIDATION:\n" + "\n".join(f"  ✓ {c}" for c in claims[:4])


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

    # Top languages BY EVIDENCE (not just repo count)
    top_languages = _rank_skills_by_evidence(repos)

    # Recent activity indicator
    push_count = sum(1 for e in events if e.get("type") == "PushEvent")

    # Account age
    account_age_plain = "unknown"
    created_at = profile.get("created_at", "")
    if created_at:
        try:
            created_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            delta = datetime.now(timezone.utc) - created_dt
            days = delta.days
            if days < 365:
                account_age_plain = f"{round(days / 30.4, 1)} months"
            else:
                account_age_plain = f"{round(days / 365.25, 1)} years"
        except Exception:
            account_age_plain = created_at

    # Most recently updated repo
    most_recent = _get_most_recent_repo(repos)

    return {
        "username": username,
        "repo_count": repo_count,
        "total_stars": total_stars,
        "top_languages": top_languages,
        "recent_pushes": push_count,
        "followers": profile.get("followers", 0),
        "account_age_plain": account_age_plain,
        "most_recent_repo": most_recent,
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
    resume_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Generate a structured AI hiring intelligence summary.

    Returns JSON with tl_dr, hire_signal, for_recruiter, for_hiring_manager, etc.
    Falls back to rule-based summary when Gemini is unavailable.
    """
    data = _extract_summary_data(profile, repos, events)

    non_fork_repos = [r for r in repos if not r.get("is_fork", r.get("fork", False))]

    # Build rich repo context — sorted by MOST RECENTLY UPDATED first
    def _updated_sort_key(r):
        updated = r.get("pushed_at", r.get("updated_at", "2000-01-01"))
        try:
            return datetime.fromisoformat(updated.replace("Z", "+00:00"))
        except Exception:
            return datetime.min.replace(tzinfo=timezone.utc)

    recent_repos = sorted(non_fork_repos, key=_updated_sort_key, reverse=True)

    top_repos_info = []
    for r in recent_repos[:5]:
        desc = sanitize_text(r.get("description", "") or "")
        stars = r.get("stars", r.get("stargazers_count", 0))
        updated = r.get("pushed_at", r.get("updated_at", ""))[:10]
        top_repos_info.append(
            f"  - {r.get('name', '?')} ({r.get('language', '?')}, ⭐{stars}, updated: {updated})"
            + (f": {desc[:80]}" if desc else "")
        )

    strengths_text = "\n".join([f"  - {s}" for s in (strengths or [])[:4]]) or "  - None significant"
    weaknesses_text = "\n".join([f"  - {w}" for w in (weaknesses or [])[:4]]) or "  - None significant"

    # Build resume cross-validation section
    crossval_text = _build_resume_crossval_text(
        resume_data, repos, data["top_languages"]
    )

    # Most recent repo name for prompt
    most_recent_name = ""
    if data["most_recent_repo"]:
        most_recent_name = data["most_recent_repo"].get("name", "")

    prompt = f"""Assess @{data['username']} for hiring. Be specific, reference evidence.

PROFILE: {data.get('account_age_plain', '?')} old, {data.get('followers', 0)} followers, {len(non_fork_repos)} repos, {data.get('total_stars', 0)} stars
REPOS: {chr(10).join(top_repos_info[:3]) if top_repos_info else 'None'}
ACTIVE PROJECT: {most_recent_name or 'Unknown'}
SKILLS: {', '.join(data['top_languages'][:4]) or 'Unknown'}
SCORE: {score or 'N/A'}/100 | TIER: {tier or '?'} | RISK: {risk_level or '?'}
STRENGTHS: {'; '.join((strengths or [])[:3]) or 'None'}
WEAKNESSES: {'; '.join((weaknesses or [])[:3]) or 'None'}
{crossval_text}

Return ONLY JSON:
{{
    "tl_dr": "One sentence, name @{data['username']}, state verdict.",
    "ai_assessment": "2-3 sentences. Reference {most_recent_name or 'their project'} and {', '.join(data['top_languages'][:2]) or 'skills'}.",
    "for_recruiter": "2-3 non-technical sentences for HR.",
    "for_hiring_manager": "2-3 technical sentences.",
    "standout_quality": "Best thing with evidence.",
    "biggest_concern": "Key concern with evidence.",
    "recommended_role_level": "Intern|Junior|Mid|Senior|Lead",
    "interview_must_ask": "One specific question from their code.",
    "confidence": "High|Medium|Low",
    "hire_signal": "STRONG HIRE|HIRE|MAYBE|INTERN ONLY|NO HIRE",
    "summary": "Same as ai_assessment"
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
        top_repos=[r.get("name", "") for r in recent_repos[:3]],
        followers=data.get("followers", 0),
        total_stars=data.get("total_stars", 0),
        top_languages=data["top_languages"],
        crossval_text=crossval_text,
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
    top_languages: List[str] = None,
    crossval_text: str = "",
) -> Dict[str, Any]:
    """
    Fallback summary when Gemini is unavailable.
    Must be unique per developer — references actual data points.
    Never uses banned generic phrases.
    """
    tier_str = tier or "Unknown"
    top_repos = top_repos or []
    top_languages = top_languages or []

    # Build skill mention from evidence-ranked list
    skill_mention = f" specializing in {' and '.join(top_languages[:2])}" if top_languages else ""

    # Build a specific assessment from actual data
    repo_mention = f" Their most recently active project is {top_repos[0]}." if top_repos else ""
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
        tl_dr = f"@{username} is a strong {tier_str.lower()} developer{skill_mention} with verified technical depth."
        hire_signal = "HIRE"
        role_level = "Mid"
    elif score >= 55:
        tl_dr = f"@{username} shows solid fundamentals as a {tier_str.lower()} developer{skill_mention} with room to grow."
        hire_signal = "MAYBE"
        role_level = "Junior"
    elif score >= 35:
        tl_dr = f"@{username} is an early-career developer{skill_mention} — suitable for junior/intern roles with mentorship."
        hire_signal = "INTERN ONLY"
        role_level = "Intern"
    else:
        tl_dr = f"@{username} has limited verifiable development activity at this time."
        hire_signal = "NO HIRE"
        role_level = "Intern"

    assessment = (
        f"@{username}'s GitHub shows a {tier_str.lower()} profile{skill_mention} with {strength_1.lower()}."
        f"{repo_mention}{follower_note}{star_note}"
        f" Primary concern: {weakness_1.lower()}."
    )

    # Append cross-validation if available
    if crossval_text:
        assessment += f" {crossval_text.strip()}"

    return {
        "tl_dr": tl_dr,
        "ai_assessment": assessment,
        "for_recruiter": f"{tl_dr} {strength_1}. Key concern to probe: {weakness_1}.",
        "for_hiring_manager": f"Code analysis indicates {tier_str.lower()} level work{skill_mention}. {strength_1}. {weakness_1}.",
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