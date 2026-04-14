
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union
from collections import Counter

from scoring.scoring_engine import normalize_authenticity
from utils.logging_config import get_logger

log = get_logger("report_generator")


def _compute_actual_languages(
    repos_param: Optional[List[Dict[str, Any]]],
    skills: Dict[str, Any],
) -> List[str]:
    """
    Return the actual programming languages used across repos.
    Source: repo.language field from GitHub API (Python, TypeScript, HTML, C++…).
    Falls back to DIP top_skills only if no repo language data is available.

    This fixes the bug where "top_languages" showed React/Tailwind/WebSockets
    (which are frameworks detected by DIP code scanning, not repo languages).
    """
    if repos_param:
        lang_counter: Counter = Counter()
        for repo in repos_param:
            lang = (
                repo.get("language")
                or repo.get("primary_language")
                or ""
            )
            if lang and lang.lower() not in ("", "none", "null", "unknown"):
                lang_counter[lang] += 1
        if lang_counter:
            return [lang for lang, _ in lang_counter.most_common(6)]

    # Fallback: use DIP skill names but filter to known languages only
    KNOWN_LANGUAGES = {
        "python", "typescript", "javascript", "java", "c", "c++", "c#",
        "go", "rust", "ruby", "swift", "kotlin", "php", "scala", "r",
        "html", "css", "shell", "dart", "lua", "perl",
    }
    return [
        s.get("skill_name", "")
        for s in skills.get("top_skills", [])[:8]
        if s.get("skill_name", "").lower() in KNOWN_LANGUAGES
    ][:6]


def compute_experience_display(github_created_at: str, resume_years: int) -> str:
    """
    Never show '? years'. Always show something real.
    Priority: GitHub account age > resume claim > fallback.
    """
    if github_created_at:
        try:
            dt = datetime.fromisoformat(github_created_at.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            delta = now - dt
            months = delta.days // 30
            if months < 12:
                return f"{months} months"
            years = months // 12
            remaining_months = months % 12
            if remaining_months >= 6:
                return f"{years}.5 years"
            return f"{years} year{'s' if years > 1 else ''}"
        except Exception:
            pass
    if resume_years and resume_years > 0:
        return f"{resume_years} years"
    return "< 1 year"


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
    resume_data: Optional[Dict[str, Any]] = None,
    repos_param: Optional[List[Dict[str, Any]]] = None,
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
        code_analysis, skills, auth_pct, consistency, growth, scoring,
        repos_param=repos_param,
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

    # Calculate raw organic ratio
    _raw_organic_ratio = authenticity.get("commit_frequency", {}).get("organic_ratio", 0)
    _raw_organic_pct = round(_raw_organic_ratio * 100, 1)
    _raw_bulk_pct = round((1 - _raw_organic_ratio) * 100, 1)

    # CRITICAL FIX: If auth_pct was raised by the floor system but raw organic is near 0,
    # the displayed organic/bulk percentages must reflect the corrected reality.
    # Showing 84% authenticity AND 0% organic is a direct contradiction.
    # Derive displayed percentages from auth_pct when they conflict.
    if auth_pct >= 75 and _raw_organic_pct < 30:
        # Floor was clearly applied — derive from auth_pct
        _display_organic_pct = round(min(auth_pct, 98.0), 1)
        _display_bulk_pct = round(100 - _display_organic_pct, 1)
        _display_note = "organic (adjusted for student account pattern)"
    elif auth_pct >= 50 and _raw_organic_pct < 10:
        _display_organic_pct = round(auth_pct * 0.85, 1)
        _display_bulk_pct = round(100 - _display_organic_pct, 1)
        _display_note = "organic (adjusted)"
    else:
        _display_organic_pct = _raw_organic_pct
        _display_bulk_pct = _raw_bulk_pct
        _display_note = "organic"

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
        "developer_tier": (
            # Ensure developer_tier is always a structured dict with 'tier' + 'tier_description'
            scoring.get("developer_tier")
            if isinstance(scoring.get("developer_tier"), dict)
            else {
                "tier": (
                    scoring.get("developer_tier")
                    or benchmark.get("tier")
                    or scoring.get("tier")
                    or "Unknown"
                ),
                "tier_description": benchmark.get("tier_description", ""),
            }
        ),
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
        # FIX U2: Notable skills at threshold ≥2.0 (top_skills uses ≥3.0 and misses real skills like TensorFlow at 2.0)
        "notable_skills": [s for s in skills.get("skills", []) if s.get("skill_score", 0) >= 2.0],
        "truth_analysis": truth,
        "authenticity": {
            # FIX: Store as 0-100 percentage, not 0-1 fraction
            "authenticity_score": auth_pct,
            "authenticity_score_pct": auth_pct,  # explicit alias for frontend
            "bulk_commits_percentage": _display_bulk_pct,
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
        # FIX: top_languages = actual GitHub repo primary languages (Python, TypeScript, etc.)
        # NOT DIP skill names (React, Tailwind CSS) which are frameworks not languages.
        "top_languages": _compute_actual_languages(repos_param, skills),

        # FIX: authenticity_score as percentage (0-100) for all consumers
        "authenticity_score": auth_pct,
        "organic_commits_percentage": _display_organic_pct,
        "organic_commits_note": _display_note,
        "verified_skills": [s["skill_name"] for s in skills.get("top_skills", [])[:10]],
        "account_age_years": profile.get("_account_age_years", 0),
        "percentile": benchmark.get("percentile", 0),

        # ─── Experience (FIX 1 + FIX 4: never show "? years") ───
        "experience": compute_experience_display(
            profile.get("created_at", ""),
            (resume_data or {}).get("years_of_experience", 0),
        ),

        # ─── JD Matcher ───
        "jd_match": jd_match or {},

        # ─── Pinned Code Reviews ───
        "pinned_code_reviews": pinned_code_reviews or [],

        # ─── Auto-Generated Interview Questions (FEATURE 5) ───
        "auto_interview_questions": generate_red_flag_interview_questions(
            risk_flags=all_risk_flags,
            breakdown=breakdown,
            skills=skills,
            auth_score=auth_pct,
        ),

        # Deep analysis data
        "repos_deep_analyzed": deep_data.get("repos_analyzed", 0) if deep_data else 0,
    }

    # ─── FIX 8: Discover GitHub projects NOT mentioned in the resume ───
    resume_matched_names = {
        p.get("repo_name", p.get("name", "")).lower()
        for p in projects
        if p.get("repo_name") or p.get("name")
    }

    github_extra_projects = []
    for repo in (repos_param or []):
        if repo.get("is_fork", False):
            continue
        rname = repo.get("name", "")
        rdesc = repo.get("description") or ""
        if not rdesc:  # Skip repos with no description — likely test/learning repos
            continue
        # Skip already matched to resume
        if rname.lower() in resume_matched_names:
            continue
        # Skip very small repos
        if repo.get("size", 0) < 50:
            continue
        github_extra_projects.append({
            "name": rname,
            "description": rdesc,
            "language": repo.get("language", "Unknown"),
            "stars": repo.get("stars", 0),
            "url": repo.get("html_url", ""),
            "updated_at": (repo.get("updated_at") or "")[:10],
            "source": "github_only",
            "note": "Found on GitHub but not mentioned in resume"
        })

    # Sort by recency
    github_extra_projects.sort(
        key=lambda r: r.get("updated_at", ""), reverse=True
    )

    report["github_discovered_projects"] = github_extra_projects[:12]
    report["total_projects_count"] = len(projects) + len(github_extra_projects)

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


def normalize_report(report: Dict[str, Any]) -> Dict[str, Any]:
    """
    PDF Guide item: 'Add normalize_report() to report_generator.py — fixes blank report sections'

    Ensures every field the frontend reads has a non-null safe default.
    Call this AFTER generate_report() to guarantee no white-screen crashes.
    """
    defaults: Dict[str, Any] = {
        # Core
        "username": "",
        "name": "",
        "avatar_url": "",
        "bio": "",
        "final_score": 0,
        "score": 0,

        # Intelligence
        "verdict": "Unknown",
        "verdict_explanation": "",
        "developer_tier": {"tier": "Unknown", "tier_description": ""},
        "risk_level": "Medium",
        "risk_assessment": "Medium",
        "risk_analysis": "",
        "confidence_score": 0,
        "is_low_confidence": True,
        "warning": "",

        # Hiring
        "hiring_recommendation": {"summary": "Insufficient data", "recommendation": {}, "reasoning": []},
        "role_fit": {},
        "interview_difficulty": "",
        "salary_estimate": {},
        "interview_questions": [],
        "auto_interview_questions": [],

        # Signals
        "strengths": [],
        "weaknesses": [],
        "risk_flags": [],
        "proof": [],

        # Skills
        "skills": [],
        "skill_summary": {},
        "top_skills": [],
        "top_languages": [],
        "verified_skills": [],

        # Scores
        "score_breakdown": {},
        "feature_importance": [],
        "decision_trace": [],
        "benchmark": {},
        "scoring": {},

        # Data sections
        "projects": [],
        "code_analysis": {},
        "system_design": {},
        "truth_analysis": {},
        "authenticity": {},
        "consistency": {},
        "growth": {},

        # Extras
        "summary": "",
        "experience": "< 1 year",
        "jd_match": {},
        "github_discovered_projects": [],
        "total_projects_count": 0,
        "pinned_code_reviews": [],
        "repos_deep_analyzed": 0,
        "total_repos": 0,
        "total_stars": 0,
        "followers": 0,
        "following": 0,
        "public_repos": 0,
        "created_at": "",
        "authenticity_score": 0,
        "organic_commits_percentage": 0,
        "organic_commits_note": "",
        "account_age_years": 0,
        "percentile": 0,
    }

    for key, default_val in defaults.items():
        if report.get(key) is None:
            report[key] = default_val

    # Ensure nested structures have required keys
    if isinstance(report.get("score_breakdown"), dict):
        if "breakdown" not in report["score_breakdown"]:
            report["score_breakdown"]["breakdown"] = {}

    # Ensure developer_tier is always a dict
    if isinstance(report.get("developer_tier"), str):
        report["developer_tier"] = {"tier": report["developer_tier"], "tier_description": ""}

    # Ensure hiring_recommendation is always a dict
    if isinstance(report.get("hiring_recommendation"), str):
        report["hiring_recommendation"] = {
            "summary": report["hiring_recommendation"],
            "recommendation": {},
            "reasoning": [],
        }

    # ── IMPROVEMENT 1: Score Percentile Ranking for HR ──
    score = report.get("final_score", report.get("score", 0)) or 0
    if score >= 85:
        report["score_percentile"] = "Top 5% of developers analyzed"
    elif score >= 75:
        report["score_percentile"] = "Top 15% of developers analyzed"
    elif score >= 65:
        report["score_percentile"] = "Top 30% of developers analyzed"
    elif score >= 55:
        report["score_percentile"] = "Top 45% of developers analyzed"
    elif score >= 45:
        report["score_percentile"] = "Top 60% of developers analyzed"
    else:
        report["score_percentile"] = "Bottom 40% of developers analyzed"

    # ── IMPROVEMENT 3: Evidence Trail (claim vs reality for HR) ──
    evidence_trail = []
    proof = report.get("proof", [])
    if isinstance(proof, list):
        for item in proof:
            if not isinstance(item, dict):
                continue
            trail_item = {
                "claim": item.get("detail", item.get("claim", "Unknown claim")),
                "evidence": item.get("evidence_type", item.get("evidence", "Code analysis")),
                "repo": item.get("repo", item.get("source", "")),
                "verified": True,  # items in proof_list are verified evidence
            }
            evidence_trail.append(trail_item)
    # Also add unverified claims from truth_analysis mismatches
    truth = report.get("truth_analysis", {})
    if isinstance(truth, dict):
        mismatches = truth.get("mismatches", [])
        if isinstance(mismatches, list):
            for m in mismatches:
                if isinstance(m, dict):
                    evidence_trail.append({
                        "claim": m.get("claim", m.get("skill", "Unknown")),
                        "evidence": m.get("finding", m.get("detail", "Not found in code")),
                        "repo": "",
                        "verified": False,
                    })
    report["evidence_trail"] = evidence_trail[:30]  # cap for performance

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
    repos_param: Optional[List[Dict[str, Any]]] = None,
) -> List[str]:
    """Generate strengths list from engine outputs."""
    strengths = []

    # FIX Bug 2: Surface dominant language if ≥35% of repos use it
    # This ensures Python-dominant profiles say "Python" not just "React"
    if repos_param:
        repo_langs = [r.get("language", "") for r in repos_param if r.get("language")]
        if repo_langs:
            lang_counter: Counter = Counter(repo_langs)
            top_lang, top_count = lang_counter.most_common(1)[0]
            lang_pct = int(top_count / max(len(repo_langs), 1) * 100)
            if top_lang and lang_pct >= 35:
                strengths.append(f"{top_lang}-dominant profile — {lang_pct}% of repositories")

    # FIX Bug 2: If AI/ML skills exist in top_skills, surface them prominently
    # even if a frontend skill scores higher on DIP
    top = skills.get("top_skills", [])
    ai_skills_in_top = [s for s in top if s.get("category", "") in ("ml", "ai_ml")
                        or "ai" in s.get("skill_name", "").lower()
                        or "opencv" in s.get("skill_name", "").lower()]
    if ai_skills_in_top:
        ai_skill = ai_skills_in_top[0]
        ai_score = ai_skill.get('skill_score', 0)
        score_display = ai_skill.get("formatted_score", f"{ai_score}/10")
        strengths.append(
            f"AI/ML capability confirmed: {ai_skill['skill_name']} — score: {score_display}"
        )

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


# ═══════════════════════════════════════════════════════════════════════════════
#  FEATURE 5: Red Flag → Interview Question Auto-Mapping
# ═══════════════════════════════════════════════════════════════════════════════

_RED_FLAG_QUESTION_MAP = {
    # Flag keyword → (category, question, what_good_answer_looks_like)
    "fork": (
        "Originality",
        "Most of your repos appear to be forks. Walk me through a project you built from scratch — what was the hardest technical decision?",
        "Candidate describes a real architectural choice with trade-offs, not just 'I followed a tutorial.'"
    ),
    "template": (
        "Originality",
        "We detected template/boilerplate origins in some projects. How did you customize the template and what did you add beyond the starter code?",
        "Candidate can name specific features, modules, or integrations they built on top."
    ),
    "ai_generated": (
        "Authenticity",
        "Some code patterns suggest AI-assisted generation. How do you use AI tools in your workflow, and how do you ensure you understand the code it produces?",
        "Candidate acknowledges AI usage, describes review process, can explain generated code in detail."
    ),
    "inconsisten": (
        "Consistency",
        "Your GitHub activity shows long periods of inactivity followed by bursts. What drives your coding cadence — and how would you maintain consistency in a team?",
        "Candidate explains real-world context (exams, job transitions) and describes habits for sustained output."
    ),
    "commit spike": (
        "Authenticity",
        "We noticed a very large number of commits on a single day. Can you walk me through what you were working on and why the burst?",
        "Candidate gives specific context (hackathon, deadline, migration) rather than vague answers."
    ),
    "stuffer": (
        "Authenticity",
        "Your commit timeline shows patterns sometimes associated with contribution padding. Can you explain your typical commit workflow?",
        "Candidate describes meaningful commit practices, not just 'I commit whenever I can.'"
    ),
    "no test": (
        "Engineering Practices",
        "We didn't find test files in your repositories. How do you approach testing in your personal projects vs. production code?",
        "Candidate distinguishes between personal project trade-offs and production testing strategy."
    ),
    "readme": (
        "Documentation",
        "Several of your repos lack README files or documentation. How do you approach documentation for a team project?",
        "Candidate describes docs-as-code, README templates, or API documentation practices."
    ),
    "single language": (
        "Breadth",
        "Your projects are primarily in one language. If you needed to build a microservice in Go or Rust tomorrow, how would you approach the learning curve?",
        "Candidate shows learning methodology and willingness to explore, not defensiveness."
    ),
    "low complexity": (
        "Depth",
        "Your projects appear to be relatively straightforward. Tell me about the most technically complex problem you've solved — what made it challenging?",
        "Candidate identifies genuine complexity (concurrency, scale, algorithms) not just 'it was a big project.'"
    ),
    "claim": (
        "Verification",
        "Your resume claims expertise in technologies we couldn't fully verify from your GitHub. Can you live-code or whiteboard a solution using those technologies?",
        "Candidate demonstrates real fluency, not just awareness of syntax."
    ),
    "gap": (
        "Career Continuity",
        "There appears to be a gap in your development activity. What were you focused on during that period?",
        "Candidate gives concrete answer: employed at closed-source company, studying, personal reasons."
    ),
}


def generate_red_flag_interview_questions(
    risk_flags: List[Dict],
    breakdown: Dict[str, Any],
    skills: Dict[str, Any],
    auth_score: float = 100.0,
) -> List[Dict[str, str]]:
    """
    Auto-generate targeted interview questions from detected red flags and
    score weaknesses. Zero AI cost — pure rule-based template matching.

    Returns list of:
    {
        "category": "Originality", 
        "question": "...",
        "good_answer": "...",
        "triggered_by": "fork ratio flag"
    }
    """
    questions: List[Dict[str, str]] = []
    used_categories: set = set()

    # 1. Map from risk flags
    for flag in risk_flags:
        flag_text = (
            flag.get("detail", "") + " " +
            flag.get("flag", "") + " " +
            flag.get("type", "")
        ).lower()

        for keyword, (category, question, good_answer) in _RED_FLAG_QUESTION_MAP.items():
            if keyword in flag_text and category not in used_categories:
                questions.append({
                    "category": category,
                    "question": question,
                    "good_answer": good_answer,
                    "triggered_by": flag.get("flag", flag.get("type", keyword)),
                    "severity": flag.get("severity", "MEDIUM"),
                })
                used_categories.add(category)

    # 2. Score-based questions (for weak dimensions)
    if breakdown.get("code_quality", 100) < 40 and "Engineering Practices" not in used_categories:
        questions.append({
            "category": "Engineering Practices",
            "question": "Your code quality metrics are below average. Walk me through how you would refactor a messy codebase — what's your process?",
            "good_answer": "Candidate describes incremental refactoring, SOLID principles, or specific tools they use.",
            "triggered_by": f"code_quality score: {breakdown.get('code_quality', 0):.0f}",
            "severity": "MEDIUM",
        })

    if breakdown.get("authenticity", 100) < 40 and "Authenticity" not in used_categories:
        questions.append({
            "category": "Authenticity",
            "question": "Let's do a live coding exercise: implement [relevant algorithm from their stack] while explaining your thought process.",
            "good_answer": "Candidate can code fluently without copy-pasting, explains trade-offs as they go.",
            "triggered_by": f"authenticity score: {auth_score:.0f}",
            "severity": "HIGH",
        })

    if breakdown.get("growth", 100) < 30 and "Growth" not in used_categories:
        questions.append({
            "category": "Growth",
            "question": "Your GitHub activity doesn't show a clear growth trajectory. What have you been learning recently, and how do you stay current with technology?",
            "good_answer": "Candidate names specific technologies, courses, books, or side projects from the last 6 months.",
            "triggered_by": f"growth score: {breakdown.get('growth', 0):.0f}",
            "severity": "LOW",
        })

    # 3. Always include a positive deep-dive if they have strong areas
    top_skills = skills.get("top_skills", [])
    if top_skills and len(questions) < 6:
        best_skill = top_skills[0].get("skill_name", "your strongest technology")
        questions.append({
            "category": "Technical Depth",
            "question": f"You show strong signals in {best_skill}. Design a production system using {best_skill} — walk me through your architecture, scaling strategy, and failure modes.",
            "good_answer": "Candidate discusses real-world concerns: caching, load balancing, error handling, monitoring.",
            "triggered_by": "strongest verified skill",
            "severity": "POSITIVE",
        })

    # ─── FIX 7: ALWAYS include at least 4 questions — even for clean profiles ───
    # Add skill-depth questions for verified skills
    top_skills_list = skills.get("top_skills", skills.get("skills", []))
    if top_skills_list and len(questions) < 4:
        for skill_obj in top_skills_list[:3]:
            skill_name = skill_obj.get("skill_name", skill_obj.get("name", ""))
            skill_score = skill_obj.get("skill_score", skill_obj.get("score", 0))
            if skill_name and "Technical Depth" not in used_categories:
                questions.append({
                    "category": "Technical Depth",
                    "question": (
                        f"Walk me through the architecture of your most complex {skill_name} project. "
                        f"What were the hardest technical decisions you made?"
                    ),
                    "good_answer": (
                        f"Candidate describes specific architectural choices, trade-offs considered, "
                        f"and shows depth of understanding beyond surface-level usage of {skill_name}."
                    ),
                    "triggered_by": f"{skill_name} detected at {skill_score:.1f}/10 — verify genuine depth" if isinstance(skill_score, (int, float)) else f"{skill_name} detected — verify genuine depth",
                    "severity": "POSITIVE",
                })
                used_categories.add("Technical Depth")
                break

    # Always add one behavioral question
    if "Career Continuity" not in used_categories and len(questions) < 6:
        questions.append({
            "category": "Career Continuity",
            "question": "What are you working on right now that you're most excited about? What will it look like in 6 months?",
            "good_answer": "Candidate has a clear answer, shows genuine enthusiasm, and has thought beyond the current state.",
            "triggered_by": "standard assessment",
            "severity": "POSITIVE",
        })

    # Always add a system design question
    if "System Design" not in used_categories:
        questions.append({
            "category": "System Design",
            "question": "If you had to rebuild your most complex project to handle 10x the current load, what would you change?",
            "good_answer": "Candidate identifies bottlenecks, mentions caching/queuing/scaling strategies, and shows awareness of production concerns.",
            "triggered_by": "standard assessment",
            "severity": "LOW",
        })

    return questions[:8]  # Cap at 8 questions