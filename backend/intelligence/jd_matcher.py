from services.gemini_client import generate_json
from utils.logging_config import get_logger

log = get_logger("jd_matcher")


async def match_jd(
    job_description: str,
    candidate_skills: list,
    candidate_tier: str = "Unknown",
    years_experience: int = 0,
    github_repos_summary: str = "",
    commit_forensics: dict = None,
) -> dict:
    """
    Match a candidate against a specific job description.
    
    This is how HRs actually think:
    - Does this person have the required skills?
    - Are the skills verified by actual code or just claimed?
    - What's missing?
    - Should I interview them for THIS role?
    """
    if not job_description:
        return {"error": "No job description provided"}

    forensics_context = ""
    if commit_forensics and commit_forensics.get("stuffer_detected"):
        forensics_context = f"""
WARNING: Commit burst detected — {commit_forensics.get('stuffer_evidence', {}).get('commits', 0)} commits 
on a single day. Developer may have padded GitHub before applying.
"""

    prompt = f"""You are a senior technical recruiter with 15 years experience.

JOB DESCRIPTION:
{job_description[:3000]}

CANDIDATE DATA:
- Verified Skills (from GitHub code analysis): {candidate_skills}
- Developer Tier: {candidate_tier}
- Years of experience: {years_experience}
- GitHub repos summary: {github_repos_summary[:500] if github_repos_summary else "Not provided"}
{forensics_context}

Analyze this candidate against this specific job. Be precise and honest.
Do NOT be generous — if skills are missing, say so clearly.

Return ONLY this JSON, no markdown:
{{
    "overall_fit": "STRONG FIT / GOOD FIT / PARTIAL FIT / WEAK FIT / NOT A FIT",
    "hire_recommendation": "YES / MAYBE / NO",
    "match_percentage": 0-100,
    "required_skills_found": ["skills from JD that candidate has — verified"],
    "required_skills_missing": ["skills from JD that candidate lacks"],
    "nice_to_have_found": ["bonus skills candidate has"],
    "experience_match": "EXCEEDS / MEETS / BELOW / FAR BELOW",
    "red_flags_for_this_role": ["specific concerns for THIS job"],
    "strengths_for_this_role": ["why they'd be good for THIS specific role"],
    "suggested_interview_questions": [
        {{
            "question": "specific technical question for this role",
            "tests_for": "what skill/gap this question probes"
        }}
    ],
    "salary_fit": "ABOVE BUDGET / WITHIN RANGE / BELOW RANGE / UNKNOWN",
    "one_line_verdict": "One sentence: hire or not and why"
}}"""

    try:
        result = await generate_json(prompt, temperature=0)
        result["jd_analyzed"] = True
        return result
    except Exception as e:
        log.warning(f"JD matching failed: {e}")
        return {
            "overall_fit": "UNKNOWN",
            "hire_recommendation": "MAYBE",
            "match_percentage": 0,
            "error": str(e),
            "jd_analyzed": False
        }
