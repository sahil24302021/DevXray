
from typing import Any, Dict, List, Optional, Union

from scoring.scoring_engine import normalize_authenticity
from utils.logging_config import get_logger

log = get_logger("report_generator")


# BUG 9 FIX: _normalize_auth_score() removed — use normalize_authenticity from
# scoring_engine as the single source of truth (avoids divergence between the two).


def _format_hiring_recommendation(rec: Any) -> dict:
    """
    BUG 1 FIX: Normalize hiring_recommendation to always return a structured dict with:
    - 'summary': a readable string (e.g. "Hire for Junior/Intern role(s)")
    - 'recommendation': the role-level YES/NO/MAYBE dict
    - 'reasoning': list of reason strings

    Handles: plain string, structured dict from scoring engine, or empty value.
    """
    if isinstance(rec, str):
        return {"summary": rec, "recommendation": {}, "reasoning": []}
    if isinstance(rec, dict):
        roles = rec.get("recommendation", {})
        yes_roles = [r.capitalize() for r, v in roles.items() if v == "YES"]
        maybe_roles = [r.capitalize() for r, v in roles.items() if v == "MAYBE"]
        if yes_roles:
            summary = f"Hire for {'/'.join(yes_roles)} role(s)"
        elif maybe_roles:
            summary = f"Consider for {'/'.join(maybe_roles)} role(s)"
        else:
            summary = "Not recommended at this time"
        return {
            "summary": summary,
            "recommendation": roles,
            "reasoning": rec.get("reasoning", []),
        }
    return {"summary": "Insufficient data", "recommendation": {}, "reasoning": []}


def generate_report(
    profile: Dict[str, Any],
    projects: List[Dict[str, Any]],
    code_analysis: Dict[str, Any],
    system_design: Dict[str, Any],
    skills: Dict[str, Any],
    truth: Dict[str, Any],
    authenticity: Dict[str, Any],
    consistency: Dict[str, Any],
    growth: Dict[str, Any],
    scoring: Dict[str, Any],
    proof_list: List[Dict[str, Any]],
    deep_data: Optional[Dict[str, Any]] = None,
    pinned_code_reviews: Optional[List[Dict[str, Any]]] = None,
    ai_summary: Optional[Dict[str, Any]] = None,
    jd_match: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Assemble the complete Developer Intelligence Report.
    """
    username = profile.get("username", "")
    final_score = scoring.get("final_score", 0)
    breakdown = scoring.get("score_breakdown", {})
    benchmark = scoring.get("benchmark", {})

    # ── Normalize authenticity score to 0-100 ONCE here ──
    # BUG 9 FIX: Use scoring_engine.normalize_authenticity as single source of truth
    auth_pct = authenticity.get("authenticity_score_pct")
    if auth_pct is None:
        raw_auth = authenticity.get("authenticity_score", 0)
        auth_pct = normalize_authenticity(raw_auth)  # single source of truth

    # Aggregate all risk flags
    all_risk_flags: List[Dict[str, Any]] = []
    all_risk_flags.extend(authenticity.get("risk_flags", []))
    all_risk_flags.extend(consistency.get("risk_flags", []))

    template_info = code_analysis.get("template_detection", {})
    ai_info = code_analysis.get("ai_generation_detection", {})
    if template_info.get("is_template"):
        all_risk_flags.append({
            "flag": "Template/tutorial project detected", "severity": "HIGH"
        })
    if ai_info.get("likely_ai_generated"):
        all_risk_flags.append({
            "flag": "AI-generated code patterns detected", "severity": "HIGH"
        })

    # Strengths & weaknesses now receive normalized auth_pct (0-100)
    strengths = _generate_strengths(
        code_analysis, skills, auth_pct, consistency, growth, scoring
    )
    weaknesses = _generate_weaknesses(
        code_analysis, skills, auth_pct, consistency, growth
    )

    interview_questions = _generate_interview_questions(
        skills.get("top_skills", []),
        weaknesses,
        all_risk_flags,
        scoring.get("role_fit", {}),
    )

    report = {
        # ─── Profile ───
        "username": username,
        "avatar_url": profile.get("avatar_url", ""),
        "bio": profile.get("bio", ""),
        "name": profile.get("name", ""),
        "location": profile.get("location", ""),
        "followers": profile.get("followers", 0),
        "following": profile.get("following", 0),
        "public_repos": profile.get("public_repos", 0),
        "created_at": profile.get("created_at", ""),

        # ─── Core Intelligence Scores ───
        "final_score": final_score,
        "score_breakdown": breakdown,
        "feature_importance": scoring.get("feature_importance", []),
        "decision_trace": scoring.get("decision_trace", []),
        "developer_tier": scoring.get("developer_tier", "Unknown"),
        "benchmark": benchmark,
        "confidence_score": 0,   # Overridden by orchestrator
        "is_low_confidence": False,
        "warning": "",

        # ─── Hiring Intelligence ───
        # BUG 1 FIX: Always normalize to structured dict with 'summary' key
        "hiring_recommendation": _format_hiring_recommendation(
            scoring.get("hiring_recommendation", "")
        ),
        "role_fit": scoring.get("role_fit", {}),
        "interview_difficulty": scoring.get("interview_difficulty", ""),
        "salary_estimate": scoring.get("salary_estimate", {}),

        # ─── Engine Results ───
        "projects": projects,
        "code_analysis": {
            "code_quality_score": code_analysis.get("code_quality_score", 0),
            "maintainability_score": code_analysis.get("maintainability_score", 0),
            "test_coverage_indicator": code_analysis.get("test_coverage_indicator", "None"),
            "architecture_type": code_analysis.get("project_structure", {}).get("architecture_type", "Unknown"),
            "folder_maturity": code_analysis.get("project_structure", {}).get("folder_maturity", "Basic"),
            "api_design_quality": code_analysis.get("project_structure", {}).get("api_design_quality", 0),
            "files_analyzed": code_analysis.get("files_analyzed", 0),
            "metrics": code_analysis.get("metrics", {}),
            "template_detection": template_info,
            "ai_generation_detection": ai_info,
        },
        "system_design": system_design,
        "skills": skills.get("skills", []),
        "skill_summary": skills.get("skill_summary", {}),
        "top_skills": skills.get("top_skills", []),
        "truth_analysis": truth,
        "authenticity": {
            # FIX: Store as 0-100 percentage, not 0-1 fraction
            "authenticity_score": auth_pct,
            "authenticity_score_pct": auth_pct,  # explicit alias for frontend
            "bulk_commits_percentage": round(
                (1 - authenticity.get("commit_frequency", {})
                 .get("organic_ratio", 1)) * 100, 1
            ),
            "commit_frequency": authenticity.get("commit_frequency", {}),
            "message_entropy": authenticity.get("message_entropy", {}),
            "pr_analysis": authenticity.get("pr_analysis", {}),
            "ownership_analysis": authenticity.get("ownership_analysis", {}),
            "code_repetition": authenticity.get("code_repetition", {}),
        },
        "consistency": {
            "consistency_score": consistency.get("consistency_score", 0),
            "activity_stability": consistency.get("activity_stability", 0),
            "largest_gap_days": consistency.get("largest_gap_days", 0),
            "completion_ratio": consistency.get("completion_ratio", 0),
            "commit_interval_variance": consistency.get("commit_interval_variance", {}),
            "streak_weeks": consistency.get("streak_weeks", {}),
        },
        "growth": {
            "growth_score": growth.get("growth_score", 0),
            "learning_curve": growth.get("learning_curve", "Unknown"),
            "activity_timeline": growth.get("activity_timeline", {}),
            "complexity_progression": growth.get("complexity_progression", {}),
            "tech_evolution": growth.get("tech_evolution", {}),
            "contribution_streaks": growth.get("contribution_streaks", {}),
        },

        # ─── Aggregated Insights ───
        "risk_flags": all_risk_flags,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "interview_questions": interview_questions,
        "proof": proof_list[:50],

        # ─── AI Summary ───
        "summary": (ai_summary or {}).get("summary", ""),

        # ─── Legacy Compatibility Fields ───
        "score": int(final_score),
        "verdict": _score_to_verdict(final_score),
        "verdict_explanation": _generate_verdict_explanation(final_score, breakdown, all_risk_flags),
        "risk_level": _score_to_risk_level(final_score, all_risk_flags),
        # BUG 7 FIX: Add risk_assessment alias (frontend reads this field name)
        "risk_assessment": _score_to_risk_level(final_score, all_risk_flags),
        "risk_analysis": _generate_risk_analysis(final_score, all_risk_flags),
        "total_stars": profile.get("_total_stars", 0),
        "total_repos": profile.get("public_repos", 0),
        # ACCURACY 4 FIX: Use actual technology names from top_skills, not category keys
        "top_languages": [
            s.get("skill_name", "")
            for s in skills.get("top_skills", [])[:8]
            if s.get("skill_name")
        ],

        # FIX: authenticity_score as percentage (0-100) for all consumers
        "authenticity_score": auth_pct,
        "organic_commits_percentage": round(
            authenticity.get("commit_frequency", {}).get("organic_ratio", 0) * 100, 1
        ),
        "verified_skills": [s["skill_name"] for s in skills.get("top_skills", [])[:10]],
        "account_age_years": profile.get("_account_age_years", 0),
        "percentile": benchmark.get("percentile", 0),

        # ─── JD Matcher ───
        "jd_match": jd_match or {},

        # ─── Pinned Code Reviews ───
        "pinned_code_reviews": pinned_code_reviews or [],

        # Deep analysis data
        "repos_deep_analyzed": deep_data.get("repos_analyzed", 0) if deep_data else 0,
    }

    # ACCURACY 1 FIX: Add legacy-compatible 'scoring' block that frontend still references
    # in several places. Mirrors the real score_breakdown data for backward compatibility.
    bd = breakdown.get("breakdown", {}) if isinstance(breakdown, dict) else {}
    report["scoring"] = {
        "final_score": final_score,
        "code_quality_score": bd.get("code_quality", 0),
        "skill_depth_score": bd.get("skill_depth", 0),
        "authenticity_score": auth_pct,
        "consistency_score": consistency.get("consistency_score", 0),
        "growth_score": growth.get("growth_score", 0),
        "truth_score": truth.get("truth_score", 0),
    }

    return report


# ═══════════════════════════════════════════════════════
#  HELPER GENERATORS (DETERMINISTIC)
# ═══════════════════════════════════════════════════════

def _generate_strengths(
    code: Dict,
    skills: Dict,
    auth_pct: float,       # FIX: now receives 0-100 value
    consistency: Dict,
    growth: Dict,
    scoring: Dict,
) -> List[str]:
    """Generate strengths list from engine outputs."""
    strengths = []

    cq = code.get("code_quality_score", 0)
    if cq >= 70:
        strengths.append("Exceptional code quality with mature architecture")
    elif cq >= 50:
        strengths.append("Solid code quality with organized structure")

    top = skills.get("top_skills", [])
    if top and top[0].get("skill_score", 0) >= 7:
        score_display = top[0].get("formatted_score", f"{top[0]['skill_score']}/10")
        strengths.append(
            f"Deep expertise in {top[0]['skill_name']} — score: {score_display}"
        )

    skill_count = skills.get("total_skills_detected", 0)
    if skill_count >= 8:
        strengths.append(f"Versatile skill set: {skill_count} technologies verified at depth")

    # FIX: auth_pct is now correctly 0-100 (was 0-1 before)
    if auth_pct >= 80:
        strengths.append("Highly authentic profile — organic contribution patterns")

    consistency_score = consistency.get("consistency_score", 0)
    if consistency_score >= 70:
        strengths.append("Very consistent contributor — regular, sustained activity")

    growth_score = growth.get("growth_score", 0)
    if growth_score >= 70:
        strengths.append("Strong growth trajectory — actively learning and improving")

    if code.get("project_structure", {}).get("has_ci_cd"):
        strengths.append("Uses CI/CD pipelines — production-ready engineering practices")

    if code.get("project_structure", {}).get("has_docker"):
        strengths.append("Containerizes applications — deployment-ready mindset")

    # Strengths: Surface hidden skills as key findings (Bug 5b fix)
    hidden_skills = skills.get("hidden_skills", [])
    if hidden_skills:
        hidden_names = [s.get("skill_name", s) if isinstance(s, dict) else str(s) for s in hidden_skills[:6]]
        if hidden_names:
            strengths.append(
                f"Unreported skills found in GitHub code: {', '.join(hidden_names)} — "
                f"candidate is likely more skilled than resume shows"
            )

    return strengths[:8]


def _generate_weaknesses(
    code: Dict,
    skills: Dict,
    auth_pct: float,       # FIX: now receives 0-100 value
    consistency: Dict,
    growth: Dict,
) -> List[str]:
    """Generate weaknesses list from engine outputs."""
    weaknesses = []

    cq = code.get("code_quality_score", 0)
    if cq < 30:
        weaknesses.append("Code quality below expectations — lacks structure and best practices")
    elif cq < 50:
        weaknesses.append("Code quality has room for improvement")

    depth = skills.get("skill_depth_average", 0)
    if depth < 3.0:
        weaknesses.append("Skills detected but at shallow depth — limited advanced usage")

    # FIX: auth_pct is now correctly 0-100 (was 0-1 before, so this check
    # previously always triggered because 0.84 < 50 is True)
    if auth_pct < 50:
        weaknesses.append("Profile authenticity concerns — unusual contribution patterns detected")

    consistency_score = consistency.get("consistency_score", 0)
    if consistency_score < 30:
        weaknesses.append("Highly inconsistent activity — large gaps between contributions")

    growth_score = growth.get("growth_score", 0)
    if growth_score < 30:
        weaknesses.append("Limited growth trajectory — not expanding skills or complexity")

    if code.get("test_coverage_indicator", "None") == "None":
        weaknesses.append("No tests detected — absence of testing culture")

    return weaknesses[:6]


def _generate_interview_questions(
    top_skills: List[Dict],
    weaknesses: List[str],
    risk_flags: List[Dict],
    role_fit: Dict,
) -> List[Dict[str, str]]:
    """Generate targeted interview questions based on analysis."""
    questions = []

    if top_skills:
        primary = top_skills[0]
        score_display = primary.get("formatted_score", f"{primary.get('skill_score', 0)}/10")
        questions.append({
            "category": "Technical Depth",
            "question": (
                f"Walk me through the architecture of your most complex "
                f"{primary['skill_name']} project. What were the key technical decisions?"
            ),
            "why": f"Primary skill ({score_display}) — verify genuine depth",
        })

    for weakness in weaknesses[:2]:
        if "test" in weakness.lower():
            questions.append({
                "category": "Engineering Practices",
                "question": "How do you approach testing in your projects? What testing strategies have you used?",
                "why": "No tests detected — assess testing awareness",
            })
            break
        elif "inconsist" in weakness.lower():
            questions.append({
                "category": "Commitment",
                "question": "I noticed gaps in your contribution history. Can you walk me through what you were working on during those periods?",
                "why": "Inconsistent activity pattern — verify engagement",
            })
            break

    for flag in risk_flags[:2]:
        flag_text = flag.get("flag", "") if isinstance(flag, dict) else str(flag)
        if "template" in flag_text.lower() or "tutorial" in flag_text.lower():
            questions.append({
                "category": "Originality",
                "question": "Can you describe a project where you designed the architecture from scratch? What problem were you solving?",
                "why": "Template/tutorial code detected — verify original problem-solving",
            })
            break

    role = role_fit.get("primary_role", "")
    if role:
        questions.append({
            "category": "Role-Specific",
            "question": (
                f"As a {role}, what's the most challenging production issue "
                f"you've debugged? How did you approach it?"
            ),
            "why": f"Assess real-world {role} experience",
        })

    questions.append({
        "category": "System Design",
        "question": "If you had to design a system that handles 1M daily active users, what would your high-level architecture look like?",
        "why": "Assess architectural thinking beyond code-level skills",
    })

    return questions[:6]


def _score_to_verdict(score: float) -> str:
    if score >= 80:
        return "Strong Developer"
    elif score >= 65:
        return "Solid Developer"
    elif score >= 50:
        return "Moderate Developer"
    elif score >= 35:
        return "Developing Talent"
    else:
        return "Risky Hire"


def _score_to_risk_level(score: float, flags: List[Any]) -> str:
    critical = sum(
        1 for f in flags
        if isinstance(f, dict) and str(f.get("severity", "")).upper() in ("CRITICAL", "HIGH")
    )
    if score >= 70 and critical == 0:
        return "Low"
    elif score >= 50 and critical <= 2:
        return "Medium"
    else:
        return "High"


def _generate_verdict_explanation(score: float, breakdown: Dict, flags: List[Dict]) -> str:
    parts = []
    if breakdown.get("code_quality", 0) >= 60:
        parts.append("demonstrates strong code quality")
    elif breakdown.get("code_quality", 0) < 30:
        parts.append("code quality needs significant improvement")

    if breakdown.get("authenticity", 0) >= 70:
        parts.append("shows highly authentic contribution patterns")
    elif breakdown.get("authenticity", 0) < 40:
        parts.append("authenticity concerns detected")

    if breakdown.get("consistency", 0) >= 60:
        parts.append("maintains consistent development activity")
    elif breakdown.get("consistency", 0) < 30:
        parts.append("shows irregular activity patterns")

    base = f"This developer {', '.join(parts)}." if parts else "Mixed development profile."

    if flags:
        flag_texts: List[str] = []
        for f in flags[:2]:
            if isinstance(f, dict):
                # use detail if available, else flag, else str(f)
                text = f.get("detail", f.get("flag", str(f)))
                flag_texts.append(str(text))
            else:
                flag_texts.append(str(f))
        base = base + f" Notable flags: {'; '.join(flag_texts)}."

    return base


def _generate_risk_analysis(score: float, flags: List[Dict]) -> str:
    if score >= 75 and not flags:
        return "Low risk. Strong signals across all dimensions."
    elif score >= 50:
        return "Moderate risk. Decent fundamentals with some areas needing verification."
    else:
        return "High risk. Multiple concerns detected. Thorough vetting recommended."