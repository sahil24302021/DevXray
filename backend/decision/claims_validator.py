
import json
from datetime import datetime, timezone
from typing import Dict, Any, List

from services.gemini_client import generate_json


def _get_today_str() -> str:
    return datetime.now(timezone.utc).strftime("%B %d, %Y")


def _compute_account_age_plain(account_created: str) -> str:
    """Returns plain-English account age for LLM context."""
    if not account_created:
        return "Account creation date: unknown"
    try:
        created_dt = datetime.fromisoformat(account_created.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        days = (now - created_dt).days
        if days < 0:
            return f"WARNING: account created {abs(days)} days in the future — possible data integrity issue."
        if days < 30:
            return f"Account is {days} days old — very new."
        if days < 365:
            return f"Account is {round(float(days)/30.4, 1)} months old — recently created."
        return f"Account is {round(float(days)/365.25, 1)} years old ({days} days ago as of today {_get_today_str()})."
    except Exception:
        return f"Account creation date: {account_created}"


def _extract_repos_for_llm(github_data: dict) -> List[Dict]:
    """
    Extract the actual repo list from the github report regardless of
    which key structure the report uses.

    The report_generator may store repos under different keys depending on version.
    This function tries all known locations.
    """
    repos: List[Dict[str, Any]] = []

    # Try the direct repos list (most reliable)
    if github_data.get("repos"):
        r = github_data.get("repos")
        if isinstance(r, list): repos = r
    # Try top_repos (legacy)
    elif github_data.get("top_repos"):
        r = github_data.get("top_repos")
        if isinstance(r, list): repos = r
    # Try inside projects
    elif github_data.get("projects"):
        # projects have repo names we can use
        for p in github_data["projects"][:8]:
            if p.get("repo_name") or p.get("name"):
                repos.append({
                    "name": p.get("repo_name") or p.get("name"),
                    "description": p.get("description", ""),
                    "language": p.get("primary_language", ""),
                    "stars": p.get("stars", 0),
                })
    # Try repo_data keys from deep_data embedded in the report
    elif github_data.get("repo_data"):
        for repo_name in github_data["repo_data"].keys():
            repos.append({"name": repo_name})

    # Also try repo_context string that was injected into the report
    if not repos and github_data.get("repo_context"):
        # Parse the repo_context string to extract repo names
        import re as _re
        context_str = github_data["repo_context"]
        # Pattern: "  1. RepoName | Python | ⭐0 | ..."
        found = _re.findall(r'\d+\.\s+(\S+)\s+\|', context_str)
        for name in found[:10]:
            repos.append({"name": name})

    # Build clean LLM-friendly list
    clean: List[Dict[str, Any]] = []
    safe_repos = repos if isinstance(repos, list) else []
    for repo in safe_repos[:10]:
        if not repo:
            continue
        name = repo.get("name") or repo.get("full_name", "")
        if not name:
            continue
        clean.append({
            "name": name,
            "description": (repo.get("description") or "")[:120],
            "language": repo.get("language") or repo.get("primary_language", ""),
            "stars": repo.get("stars", repo.get("stargazers_count", 0)),
            "updated": (repo.get("updated_at") or repo.get("pushed_at") or "")[:10],
        })

    return clean


def _build_skills_context(github_data: dict) -> Dict:
    """Extract verified skills in a clean format for the prompt."""
    # Try multiple known structures
    verified_skills = github_data.get("verified_skills", [])
    if not verified_skills:
        skills_data = github_data.get("skills", {})
        verified_skills = skills_data.get("skills", skills_data.get("verified_skills", []))

    skill_names = []
    for s in verified_skills:
        if isinstance(s, dict):
            name = s.get("skill_name") or s.get("name") or s.get("skill", "")
            score = s.get("skill_score") or s.get("score", 0)
            if name:
                skill_names.append(f"{name} ({score}/10)" if score else name)
        elif isinstance(s, str):
            skill_names.append(s)

    return {
        "verified_skills_list": skill_names,
        "total_verified": len(skill_names),
    }


async def validate_claims(
    resume_data: dict,
    github_data: dict,
    portfolio_text: str = ""
) -> dict:
    """
    Forensic cross-reference of resume claims against verified GitHub data.
    Returns authenticity scoring, per-claim validation, and red flags.
    """
    today = _get_today_str()
    claims = resume_data.get("claims", [])

    # If claims are empty, auto-generate them from projects and skills
    if not claims:
        projects = resume_data.get("projects", [])
        skills = resume_data.get("technical_skills", {})

        auto_claims = []
        for proj in projects[:5]:
            name = proj.get("name", "")
            desc = proj.get("description", "")
            techs = proj.get("technologies", [])
            if name and desc:
                auto_claims.append(f"Built {name}: {desc}")
            if techs:
                auto_claims.append(f"Used {', '.join(techs[:4])} in {name or 'a project'}")

        # Add skill claims
        all_skills: list = []
        if isinstance(skills, dict):
            for v in skills.values():
                if isinstance(v, list):
                    all_skills.extend(v[:3])
        if all_skills:
            auto_claims.append(f"Proficient in: {', '.join(all_skills[:6])}")

        claims = auto_claims
        if claims:
            print(f"[ClaimsValidator] Auto-generated {len(claims)} claims from projects/skills")

    if not claims:
        # Truly nothing to validate
        return {
            "authenticity_score": 50,
            "overall_assessment": "No verifiable claims found. GitHub data used for baseline assessment.",
            "validations": [],
            "red_flags": ["No specific technical claims found in resume to cross-reference"],
            "strengths_confirmed": [],
            "hiring_recommendation": "MAYBE — Insufficient resume detail for automated verification"
        }

    # ── Build account age context ──
    account_created = github_data.get("created_at", "")
    age_plain = _compute_account_age_plain(account_created)

    # ── Extract actual repos (fixes "top_repos empty" bug) ──
    actual_repos = _extract_repos_for_llm(github_data)
    repo_count = len(actual_repos)

    # ── Extract verified skills ──
    skills_ctx = _build_skills_context(github_data)

    # ── Build GitHub context with all real data ──
    github_context = {
        "username": github_data.get("username"),
        "public_repos_count": github_data.get("public_repos", repo_count),
        "followers": github_data.get("followers"),
        "total_stars": github_data.get("total_stars", 0),
        "account_created_raw": account_created,
        "account_age_explanation": age_plain,
        "top_languages": github_data.get("top_languages", []),
        "repositories": actual_repos,  # REAL repos, not empty list
        "repository_count_in_report": repo_count,
        "dip_score": github_data.get("final_score") or github_data.get("score"),
        "developer_tier": github_data.get("developer_tier"),
        "risk_level": github_data.get("risk_level"),
        "strengths": github_data.get("strengths", []),
        "weaknesses": github_data.get("weaknesses", []),
        "risk_flags": [
            f.get("flag") if isinstance(f, dict) else str(f)
            for f in github_data.get("risk_flags", [])
        ],
        "authenticity_score_raw": github_data.get("authenticity", {}).get("authenticity_score"),
        **skills_ctx,
        # Inject actual repo count so LLM knows the real scale
        "total_repos_on_profile": github_data.get("public_repos", repo_count),
        "note_for_validator": (
            f"This developer has {github_data.get('public_repos', repo_count)} total repos. "
            f"We deep-analyzed {repo_count} of them. The remaining repos may contain "
            f"additional skill evidence not visible here. Do NOT penalize for repos we "
            f"couldn't analyze — absence of evidence is NOT evidence of absence."
        ),
    }

    resume_skills = resume_data.get("technical_skills", {})
    resume_projects = resume_data.get("projects", [])
    resume_experience = resume_data.get("work_experience", [])
    resume_education = resume_data.get("education", [])

    prompt = f"""You are an elite forensic technical auditor for a hiring intelligence platform.
Your job is to RIGOROUSLY but FAIRLY cross-reference a candidate's resume claims against their verified GitHub activity.

Think like a skeptical but fair hiring manager who wants the TRUTH — not a witch hunt.

=== CRITICAL DATE CONTEXT — READ THIS FIRST ===
TODAY IS: {today}
GitHub Account Created: {account_created}
Account Age: {age_plain}

IMPORTANT: The account creation date above is BEFORE today ({today}).
This is NOT a "future date" issue. Do NOT use the account creation date as a reason
to mark claims as unverifiable unless the age_explanation explicitly says "future."
A developer can have a 7-month-old account AND have real projects on it.
==================================================

=== RESUME CLAIMS TO VERIFY ===
{json.dumps(claims, indent=2)}

=== RESUME SKILLS CLAIMED ===
{json.dumps(resume_skills, indent=2)}

=== RESUME PROJECTS ===
{json.dumps(resume_projects, indent=2)}

=== RESUME EDUCATION ===
{json.dumps(resume_education, indent=2)}

=== VERIFIED GITHUB DATA ===
{json.dumps(github_context, indent=2)}

=== PORTFOLIO WEBSITE TEXT ===
\"\"\"{str(portfolio_text)[:3000] if portfolio_text else "Not available"}\"\"\"

=== CRITICAL VALIDATION RULES ===

STATUS DEFINITIONS (use these exactly):
- "SUPPORTED": GitHub repositories and/or skills data DIRECTLY confirms this claim.
  Use when: A matching repo exists, OR the skill is in the verified_skills_list.
- "PARTIALLY_SUPPORTED": Some evidence exists but not complete confirmation.
  Use when: Related repo exists but doesn't perfectly match, OR skill is adjacent to verified skills.
- "WEAK_SIGNAL": Plausible but no direct GitHub evidence found.
  Use when: Claim is consistent with overall profile but specific evidence is absent.
- "UNVERIFIABLE": Cannot verify due to missing data (private repos, LinkedIn blocked, etc.).
  This is NOT the same as "fake" — absence of evidence is not evidence of absence.
- "DISCREPANCY": Something in the GitHub data CONTRADICTS this claim.
  Use ONLY when there is a specific contradiction, not just lack of evidence.

SCORING RULES (start at 50 — neutral baseline):
- Each SUPPORTED claim: +6 to +10 points
- Each PARTIALLY_SUPPORTED: +3 to +5 points
- Each WEAK_SIGNAL: 0 (neutral)
- Each UNVERIFIABLE: -2 (slight uncertainty only)
- Each DISCREPANCY: -8 to -15 points (only when actively contradicted)
- Verified skills bonus: +2 per verified skill confirmed (max +20)
- Cap final score: 0-100

IMPORTANT: Do NOT mark a claim as DISCREPANCY just because you couldn't find the
specific project in the repository list. Only use DISCREPANCY when the evidence
ACTIVELY contradicts the claim (e.g., resume says 5 years experience but account
is 3 months old and has 2 repos).

=== GENERATE JSON OUTPUT ===
{{
    "authenticity_score": 75,
    "overall_assessment": "2-3 sentence factual summary of the candidate's credibility based on evidence",
    "validations": [
        {{
            "claim": "The exact claim text",
            "status": "SUPPORTED | PARTIALLY_SUPPORTED | WEAK_SIGNAL | UNVERIFIABLE | DISCREPANCY",
            "confidence": "High | Medium | Low",
            "reasoning": "1-2 sentence explanation citing SPECIFIC evidence from GitHub data",
            "evidence": "Specific repo name, skill score, or data point that supports or contradicts"
        }}
    ],
    "red_flags": [
        "Only list GENUINE concerns with specific evidence. Do not flag normal developer behavior."
    ],
    "strengths_confirmed": [
        "Specific verified strengths with evidence (e.g., 'React confirmed at 7.3/10 via code analysis')"
    ],
    "skill_match_analysis": {{
        "verified_skills": ["Skills confirmed by GitHub repo analysis"],
        "unverified_skills": ["Skills claimed but no code evidence (not necessarily fake)"],
        "hidden_skills": ["Skills found in GitHub that candidate didn't mention on resume"]
    }},
    "timeline_consistency": "Fair assessment. Note: a relatively new GitHub account does not invalidate real skills.",
    "hiring_recommendation": "HIRE / MAYBE / PASS — 1-sentence justification based on actual evidence"
}}
"""

    try:
        result = await generate_json(prompt, temperature=0)

        # Ensure required fields with safe defaults
        result.setdefault("authenticity_score", 50)
        result.setdefault("validations", [])
        result.setdefault("red_flags", [])
        result.setdefault("strengths_confirmed", [])
        result.setdefault("hiring_recommendation", "MAYBE — Manual review recommended")
        result.setdefault("overall_assessment", "")

        # Safety clamp on score
        raw_score = result.get("authenticity_score", 50)
        try:
            result["authenticity_score"] = max(0, min(100, int(raw_score)))
        except (TypeError, ValueError):
            result["authenticity_score"] = 50

        return result

    except Exception as e:
        error_msg = str(e).lower()
        print(f"[ClaimsValidator] AI Error: {e}")

        if "quota" in error_msg or "429" in error_msg or "exhausted" in error_msg:
            raise ValueError("Gemini API quota exceeded during claims validation.")

        raise ValueError(f"Claims validation failed: {e}")