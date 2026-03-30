"""
Job Description Matcher — Computes alignment between candidate skills and a pasted JD.
"""
from typing import Dict, Any, List
from services.gemini_client import generate_json

async def match_jd(
    job_description: str,
    candidate_skills: List[str],
    candidate_tier: str = "Unknown",
    years_experience: int = 0
) -> Dict[str, Any]:
    """
    Match candidate profile against a job description.
    """
    if not job_description or not job_description.strip():
        return {
            "match_percentage": 0,
            "role_fit": "No JD provided",
            "skill_gaps": [],
            "matched_skills": [],
            "recommendation": "Cannot compute without JD"
        }

    prompt = f"""You are an expert technical recruiter and hiring manager.
Analyze the following Job Description and compare it against the verified Candidate Profile.

=== JOB DESCRIPTION ===
{job_description[:3000]}

=== CANDIDATE PROFILE ===
Verified Skills: {', '.join(candidate_skills) if candidate_skills else 'None detected'}
Developer Tier: {candidate_tier}
Estimated Years of Experience: {years_experience}

=== TASK ===
1. Extract the core required skills and nice-to-have skills from the JD.
2. Cross-reference them with the Candidate Profile's Verified Skills.
3. Determine a match percentage (0-100) based on how well the candidate meets the core requirements.
4. Provide a clear role fit summary and recommendation.

=== GENERATE JSON OUTPUT ===
{{
    "match_percentage": 85,
    "role_fit": "Highly aligned / Moderately aligned / Poorly aligned",
    "matched_skills": ["List of JD skills the candidate has"],
    "skill_gaps": ["List of core JD skills the candidate is missing"],
    "recommendation": "1-2 sentence recommendation for the hiring manager regarding this candidate for this specific role."
}}
"""
    try:
        result = await generate_json(prompt, temperature=0.1)
        
        # Ensure safe defaults
        result.setdefault("match_percentage", 0)
        result.setdefault("role_fit", "Unknown")
        result.setdefault("matched_skills", [])
        result.setdefault("skill_gaps", [])
        result.setdefault("recommendation", "Analysis incomplete")
        
        return result
    except Exception as e:
        print(f"[JD Matcher] AI Error: {e}")
        return {
            "match_percentage": 0,
            "role_fit": "Analysis failed",
            "skill_gaps": [],
            "matched_skills": [],
            "recommendation": "AI analysis failed."
        }
