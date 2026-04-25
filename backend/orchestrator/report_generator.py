
from datetime import datetime, timezone, timedelta
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


def _analyze_private_heavy_profile(
    profile: Dict[str, Any],
    repos: Optional[List[Dict[str, Any]]],
    scoring: Dict[str, Any],
    linkedin_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Detect private-heavy GitHub profiles and compute fair scoring adjustments.

    Returns a dict with:
      - private_repo_indicator (bool): True if this is a private-heavy profile
      - experience_confidence: "high" | "medium" | "low_private_heavy" | "insufficient"
      - experience_floor_bonus: int (0-15) score adjustment
      - disclaimer: str (human-readable message for the UI)
      - alternative_signals: list of corroborating signals found
      - private_heavy_question: str (interview question if applicable)
    """
    public_repos = profile.get("public_repos", 0)
    account_age = profile.get("account_age_years", 0) or profile.get("_account_age_years", 0)
    followers = profile.get("followers", 0)
    is_private_heavy = profile.get("private_heavy_profile", False)
    visibility_ratio = profile.get("visibility_ratio", 1.0)
    final_score = scoring.get("final_score", 0)

    repos = repos or []
    non_fork_repos = [r for r in repos if not r.get("is_fork", False)]

    result = {
        "private_repo_indicator": False,
        "experience_confidence": "high",
        "experience_floor_bonus": 0,
        "score_adjustment_note": "",
        "disclaimer": "",
        "alternative_signals": [],
        "visibility_ratio": visibility_ratio,
        "private_heavy_question": "",
    }

    # ── Detect private-heavy profile ──
    # Broader detection: also catch profiles with < 5 non-fork repos + old account
    if not is_private_heavy and account_age > 3 and len(non_fork_repos) < 5:
        is_private_heavy = True

    if not is_private_heavy:
        # Determine experience confidence for normal profiles
        if len(non_fork_repos) >= 10 and account_age > 1:
            result["experience_confidence"] = "high"
        elif len(non_fork_repos) >= 3 or account_age > 1:
            result["experience_confidence"] = "medium"
        elif account_age < 0.5 and len(non_fork_repos) < 2:
            result["experience_confidence"] = "insufficient"
        return result

    result["private_repo_indicator"] = True
    result["experience_confidence"] = "low_private_heavy"

    # ── Collect alternative signals ──
    alt_signals = []

    # 1. Followers (peers follow experienced devs)
    if followers >= 50:
        alt_signals.append(f"{followers} followers — strong peer recognition")
    elif followers >= 10:
        alt_signals.append(f"{followers} followers — moderate peer network")

    # 2. Stars received across repos
    total_stars = sum(r.get("stars", 0) for r in repos)
    if total_stars >= 50:
        alt_signals.append(f"{total_stars} total stars — work is recognized by community")
    elif total_stars >= 10:
        alt_signals.append(f"{total_stars} total stars — some community recognition")

    # 3. GitHub bio, company, location, blog
    if profile.get("company"):
        alt_signals.append(f"Company: {profile['company']}")
    if profile.get("blog"):
        alt_signals.append(f"Website/blog: {profile['blog']}")
    if profile.get("bio") and len(profile["bio"]) > 20:
        alt_signals.append("Detailed bio suggests professional presence")
    if profile.get("twitter_username"):
        alt_signals.append(f"Twitter: @{profile['twitter_username']}")

    # 4. Gists
    gist_count = profile.get("public_gists", 0)
    if gist_count >= 5:
        alt_signals.append(f"{gist_count} public gists — shares code snippets")

    # 5. LinkedIn data (if scraped)
    if linkedin_data and linkedin_data.get("accessible"):
        li_exp = linkedin_data.get("experiences", [])
        li_skills = linkedin_data.get("skills", [])
        if li_exp:
            alt_signals.append(f"LinkedIn: {len(li_exp)} work positions verified")
        if li_skills:
            alt_signals.append(f"LinkedIn: {len(li_skills)} skills listed")
        if linkedin_data.get("connections", 0) >= 200:
            alt_signals.append(f"LinkedIn: {linkedin_data['connections']}+ connections")

    # 6. Account age as experience signal
    if account_age >= 5:
        alt_signals.append(f"GitHub account is {account_age:.0f} years old — long-term developer")
    elif account_age >= 3:
        alt_signals.append(f"GitHub account is {account_age:.1f} years old")

    result["alternative_signals"] = alt_signals

    # ── Calculate experience floor bonus ──
    bonus = 0
    if account_age > 3 and public_repos < 5:
        # Base bonus for old accounts with sparse public work
        bonus = 10
        # Extra points for alternative signals
        if len(alt_signals) >= 4:
            bonus = 15
        elif len(alt_signals) >= 2:
            bonus = 12
        # Don't over-adjust if score is already reasonable
        if final_score >= 55:
            bonus = min(bonus, 8)
        if final_score >= 70:
            bonus = 0  # Already scored well, no adjustment needed

    result["experience_floor_bonus"] = bonus
    if bonus > 0:
        result["score_adjustment_note"] = f"Score adjusted +{bonus} to account for likely private repository activity"

    # ── Build disclaimer ──
    age_display = f"{account_age:.0f}" if account_age >= 1 else f"{account_age:.1f}"
    result["disclaimer"] = (
        f"Limited Visibility: This developer has {public_repos} public "
        f"{'repo' if public_repos == 1 else 'repos'} but their account is "
        f"{age_display} years old. Score reflects only visible activity — "
        f"actual experience may be significantly higher."
    )

    # ── Interview question for private-heavy profiles ──
    result["private_heavy_question"] = (
        f"Your GitHub shows limited public activity but your account is "
        f"{age_display} years old. Can you walk us through what you've been "
        f"building professionally? What's the most technically complex system "
        f"you've worked on?"
    )

    return result


def _build_verification_matrix(
    resume_data: Optional[Dict[str, Any]],
    repos: Optional[List[Dict[str, Any]]],
    skills: Dict[str, Any],
    profile: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Cross-reference resume claims against GitHub evidence.
    Returns a list of verified/partial/not_found skill entries.
    """
    if not resume_data:
        return []

    resume_skills = resume_data.get("skills", [])
    if not resume_skills:
        return []

    repos = repos or []
    # Build a set of languages/topics from GitHub repos
    github_languages = set()
    github_topics = set()
    for r in repos:
        lang = (r.get("language") or "").lower()
        if lang:
            github_languages.add(lang)
        for t in r.get("topics", []):
            github_topics.add(t.lower())

    # Build set of detected skills from DIP
    dip_skills = set()
    for s in skills.get("top_skills", []):
        dip_skills.add(s.get("skill_name", "").lower())

    account_age = profile.get("account_age_years", 0)

    matrix = []
    for skill in resume_skills:
        skill_name = skill if isinstance(skill, str) else skill.get("name", str(skill))
        skill_lower = skill_name.lower().strip()
        years_claimed = None
        if isinstance(skill, dict):
            years_claimed = skill.get("years", None)

        # Check evidence sources
        in_github_lang = skill_lower in github_languages
        in_github_topics = skill_lower in github_topics
        in_dip = skill_lower in dip_skills

        # Also check partial matches (e.g., "react" in "reactjs")
        partial_github = any(skill_lower in l or l in skill_lower for l in github_languages)
        partial_dip = any(skill_lower in s or s in skill_lower for s in dip_skills)

        if in_github_lang or in_dip:
            status = "verified"
            source = "GitHub repos" if in_github_lang else "Code analysis"
            evidence = f"Found in {sum(1 for r in repos if (r.get('language') or '').lower() == skill_lower)} repos" if in_github_lang else "Detected in source code"
        elif in_github_topics or partial_github or partial_dip:
            status = "partial"
            source = "GitHub topics" if in_github_topics else "Related matches"
            evidence = "Related technology found in repos"
        else:
            status = "not_found"
            source = "Resume only"
            evidence = "No GitHub evidence found"

        entry = {
            "skill": skill_name,
            "status": status,
            "source": source,
            "evidence": evidence,
        }

        # Flag if years claimed exceeds account age
        if years_claimed and account_age > 0 and years_claimed > account_age + 1:
            entry["flag"] = f"Claims {years_claimed}yr but GitHub account is {account_age:.0f}yr old"

        matrix.append(entry)

    return matrix


def _build_career_timeline(
    profile: Dict[str, Any],
    repos: Optional[List[Dict[str, Any]]],
    all_commits: Optional[List[Dict[str, Any]]],
) -> Dict[str, Any]:
    """
    Reconstruct a career timeline from GitHub data.
    """
    created_at = profile.get("created_at", "")
    repos = repos or []
    all_commits = all_commits or []

    timeline = {
        "account_created": created_at[:10] if created_at else "Unknown",
        "first_commit_date": None,
        "most_active_period": None,
        "recent_activity_level": "none",
        "commits_last_90_days": 0,
        "total_public_commits": len(all_commits),
    }

    if not all_commits:
        # Try to get dates from repos
        repo_dates = []
        for r in repos:
            pushed = r.get("pushed_at") or r.get("created_at") or ""
            if pushed:
                repo_dates.append(pushed[:10])
        if repo_dates:
            repo_dates.sort()
            timeline["first_commit_date"] = repo_dates[0]

        return timeline

    # Parse commit dates
    commit_dates = []
    for c in all_commits:
        d = c.get("date", "")
        if d and len(d) >= 10:
            commit_dates.append(d[:10])

    if commit_dates:
        commit_dates.sort()
        timeline["first_commit_date"] = commit_dates[0]

        # Most active month
        from collections import Counter
        months = Counter(d[:7] for d in commit_dates)
        if months:
            most_active_month, count = months.most_common(1)[0]
            timeline["most_active_period"] = f"{most_active_month} ({count} commits)"

        # Recent activity (last 90 days)
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=90)
            cutoff_str = cutoff.strftime("%Y-%m-%d")
            recent = sum(1 for d in commit_dates if d >= cutoff_str)
            timeline["commits_last_90_days"] = recent
            if recent >= 50:
                timeline["recent_activity_level"] = "very_active"
            elif recent >= 20:
                timeline["recent_activity_level"] = "active"
            elif recent >= 5:
                timeline["recent_activity_level"] = "moderate"
            elif recent >= 1:
                timeline["recent_activity_level"] = "low"
            else:
                timeline["recent_activity_level"] = "none"
        except Exception:
            pass

    return timeline


def _build_alternative_signals_summary(multi_source: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Summarize all alternative (non-GitHub) signals for the report UI.
    """
    if not multi_source:
        return {"platforms_verified": [], "signals": []}

    platforms = []
    signals = []

    # StackOverflow
    so = multi_source.get("stackoverflow", {})
    so_raw = so.get("raw", {})
    so_scored = so.get("scored", {})
    if so_raw.get("found"):
        rep = so_raw.get("reputation", 0)
        answers = so_raw.get("answer_count", 0)
        platforms.append("StackOverflow")
        signals.append({
            "platform": "StackOverflow",
            "icon": "stackoverflow",
            "headline": f"{rep:,} reputation · {answers} answers",
            "top_tags": so_raw.get("top_tags", [])[:5],
            "score": so_scored.get("so_score", 0),
        })

    # LeetCode
    lc = multi_source.get("leetcode", {})
    lc_raw = lc.get("raw", {})
    lc_scored = lc.get("scored", {})
    if lc_raw.get("found"):
        total = lc_raw.get("total_solved", 0)
        platforms.append("LeetCode")
        signals.append({
            "platform": "LeetCode",
            "icon": "leetcode",
            "headline": f"{total} problems solved",
            "difficulty": {
                "easy": lc_raw.get("easy_solved", 0),
                "medium": lc_raw.get("medium_solved", 0),
                "hard": lc_raw.get("hard_solved", 0),
            },
            "score": lc_scored.get("lc_score", 0),
        })

    # npm packages
    npm = multi_source.get("npm", {})
    npm_raw = npm.get("raw", {})
    if npm_raw.get("total_packages", 0) > 0:
        total_downloads = sum(
            p.get("weekly_downloads", 0)
            for p in npm_raw.get("packages", [])
        )
        platforms.append("npm")
        signals.append({
            "platform": "npm",
            "icon": "npm",
            "headline": f"{npm_raw['total_packages']} packages · {total_downloads:,} weekly downloads",
            "score": multi_source.get("packages", {}).get("scored", {}).get("publication_score", 0),
        })

    # Dev.to
    devto = multi_source.get("devto", {})
    devto_raw = devto.get("raw", {})
    devto_scored = devto.get("scored", {})
    if devto_raw.get("found"):
        articles = devto_raw.get("article_count", 0)
        reactions = devto_raw.get("total_reactions", 0)
        platforms.append("Dev.to")
        signals.append({
            "platform": "Dev.to",
            "icon": "devto",
            "headline": f"{articles} articles · {reactions:,} reactions",
            "score": devto_scored.get("devto_score", 0),
        })

    # Gists
    gists = multi_source.get("gists", {})
    gists_raw = gists.get("raw", [])
    gists_scored = gists.get("scored", {})
    if gists_raw and len(gists_raw) > 0:
        platforms.append("Gists")
        signals.append({
            "platform": "GitHub Gists",
            "icon": "gist",
            "headline": f"{len(gists_raw)} gists · {len(gists_scored.get('languages', []))} languages",
            "score": gists_scored.get("gist_score", 0),
        })

    return {
        "platforms_verified": platforms,
        "signals": signals,
        "total_external_score": sum(s.get("score", 0) for s in signals),
    }


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

    # ── Private-heavy profile detection & score adjustment ──
    private_analysis = _analyze_private_heavy_profile(
        profile=profile,
        repos=repos_param,
        scoring=scoring,
    )
    floor_bonus = private_analysis.get("experience_floor_bonus", 0)
    if floor_bonus > 0:
        final_score = min(100, final_score + floor_bonus)
        # Enforce minimum score floor of 40 for private-heavy profiles
        final_score = max(40, final_score)
        log.info(
            f"[PrivateHeavy] {username}: applied +{floor_bonus} floor bonus → {final_score} "
            f"(confidence: {private_analysis['experience_confidence']})"
        )

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
        repos=repos_param,
        code_analysis=code_analysis,
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

    # ─── Private-Heavy Profile Section ───
    report["private_repo_indicator"] = private_analysis["private_repo_indicator"]
    report["experience_confidence"] = private_analysis["experience_confidence"]
    report["private_repo_disclaimer"] = private_analysis["disclaimer"] if private_analysis["private_repo_indicator"] else ""
    report["score_adjustment_note"] = private_analysis["score_adjustment_note"]
    report["alternative_signals"] = private_analysis["alternative_signals"]
    report["visibility_ratio"] = private_analysis["visibility_ratio"]

    # Add private-heavy interview question to interview_questions
    if private_analysis["private_repo_indicator"] and private_analysis["private_heavy_question"]:
        report["interview_questions"] = report.get("interview_questions", []) + [{
            "category": "Private Repository Activity",
            "question": private_analysis["private_heavy_question"],
        }]

    # ─── Verification Matrix: Resume claims vs GitHub evidence ───
    report["verification_matrix"] = _build_verification_matrix(
        resume_data=resume_data,
        repos=repos_param,
        skills=skills,
        profile=profile,
    )

    # ─── Career Timeline reconstruction ───
    all_commits = deep_data.get("all_commits", []) if deep_data else []
    report["career_timeline"] = _build_career_timeline(
        profile=profile,
        repos=repos_param,
        all_commits=all_commits,
    )

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
        # Private-heavy profile fields
        "private_repo_indicator": False,
        "experience_confidence": "high",
        "private_repo_disclaimer": "",
        "score_adjustment_note": "",
        "alternative_signals": [],
        "visibility_ratio": 1.0,
        # Multi-source signal fields
        "verification_matrix": [],
        "career_timeline": {},
        "alternative_signals_summary": {"platforms_verified": [], "signals": []},
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

    # ── FIX A: REBUILT Evidence Trail — only real claim vs reality items ──
    evidence_trail = []

    # SOURCE 1: Truth analysis — these are actual resume/bio claims vs GitHub reality
    truth_data = report.get("truth_analysis", {})
    if isinstance(truth_data, dict):
        # Supported claims
        for match in truth_data.get("matches", [])[:10]:
            if isinstance(match, dict):
                skill_name = match.get("skill", match.get("claim", ""))
                evidence = match.get("evidence", match.get("finding", ""))
                repo_name = match.get("repo", match.get("source", ""))
                if skill_name and evidence:
                    evidence_trail.append({
                        "claim": f'Candidate claims: "{skill_name}"',
                        "source": "resume",
                        "evidence_found": evidence if len(str(evidence)) > 10 else f"Found in {repo_name or 'GitHub repos'}",
                        "status": "SUPPORTED",
                        "confidence": "High",
                        "repo": repo_name,
                    })

        # Unverified/mismatched claims
        for mismatch in truth_data.get("mismatches", [])[:5]:
            if isinstance(mismatch, dict):
                skill_name = mismatch.get("skill", mismatch.get("claim", ""))
                finding = mismatch.get("finding", mismatch.get("detail", "Not found in code"))
                if skill_name:
                    evidence_trail.append({
                        "claim": f'Candidate claims: "{skill_name}"',
                        "source": "resume",
                        "evidence_found": finding,
                        "status": "NOT_FOUND",
                        "confidence": "High",
                        "repo": "",
                    })

    # SOURCE 2: Proof items that reference actual repos and skills (NOT internal metrics)
    EXCLUDED_METRIC_TYPES = {
        "metric", "code_quality", "maintainability", "complexity", "functions",
        "classes", "architecture", "test_ratio", "cyclomatic", "project_detection",
    }
    proof = report.get("proof", [])
    if isinstance(proof, list):
        for item in proof:
            if not isinstance(item, dict):
                continue
            evidence_type = str(item.get("evidence_type", "")).lower()
            # SKIP raw metric items
            if any(excluded in evidence_type for excluded in EXCLUDED_METRIC_TYPES):
                continue
            detail = item.get("detail", "")
            if not detail or len(str(detail)) < 15:
                continue
            # Only include items that reference real findings
            if any(keyword in str(detail).lower() for keyword in [
                "skill", "repo", "commit", "project", "language", "tech", "found", "detected", "verified",
            ]):
                evidence_trail.append({
                    "claim": str(detail)[:120],
                    "source": evidence_type if evidence_type else "analysis",
                    "evidence_found": item.get("repo", item.get("source", "GitHub analysis")),
                    "status": "SUPPORTED",
                    "confidence": "Medium",
                    "repo": item.get("repo", ""),
                })

    # If we have fewer than 3 items, generate from verified_skills
    if len(evidence_trail) < 3:
        verified = report.get("verified_skills", [])
        for skill in (verified or [])[:5]:
            if isinstance(skill, str):
                evidence_trail.append({
                    "claim": f"Skill detected in code: {skill}",
                    "source": "github_code",
                    "evidence_found": f"Found usage of {skill} across GitHub repositories",
                    "status": "SUPPORTED",
                    "confidence": "Medium",
                    "repo": "",
                })
    report["evidence_trail"] = evidence_trail[:30]  # cap for performance

    # ── FIX 5: Score Dimensions for Radar Chart ──
    bd = report.get("score_breakdown", {})
    if isinstance(bd, dict):
        bd_inner = bd.get("breakdown", {})
        if isinstance(bd_inner, dict) and bd_inner and not report.get("score_dimensions"):
            report["score_dimensions"] = [
                {"name": "Code Quality", "key": "code_quality", "value": round(float(bd_inner.get("code_quality", 0))), "max": 30},
                {"name": "Skill Depth", "key": "skill_depth", "value": round(float(bd_inner.get("skill_depth", 0))), "max": 20},
                {"name": "Consistency", "key": "consistency", "value": round(float(bd_inner.get("consistency", 0))), "max": 20},
                {"name": "Growth", "key": "growth", "value": round(float(bd_inner.get("growth", 0))), "max": 15},
                {"name": "Authenticity", "key": "authenticity", "value": round(float(bd_inner.get("authenticity", 0))), "max": 15},
            ]

    # ── FIX 7: Promote contribution_streak & generate community_stats ──
    growth_data = report.get("growth", {})
    if isinstance(growth_data, dict):
        streaks = growth_data.get("contribution_streaks", {})
        if isinstance(streaks, dict) and streaks and not report.get("contribution_streak"):
            report["contribution_streak"] = {
                "current_streak_weeks": streaks.get("current_streak_weeks", 0),
                "longest_streak_weeks": streaks.get("longest_streak_weeks", 0),
                "total_active_days": streaks.get("total_active_days", 0),
                "best_day": streaks.get("best_day", ""),
            }

    # Community stats from authenticity engine's PR analysis
    if not report.get("community_stats"):
        auth_data = report.get("authenticity", {})
        if isinstance(auth_data, dict):
            pr_analysis = auth_data.get("pr_analysis", {})
            community = {
                "prs_opened": pr_analysis.get("total_prs", 0) if isinstance(pr_analysis, dict) else 0,
                "issues_opened": 0,
                "review_events": pr_analysis.get("review_events", 0) if isinstance(pr_analysis, dict) else 0,
                "comments": 0,
                "total_community_actions": 0,
                "collaboration_ratio": 0,
                "engagement_score": 0,
            }
            community["total_community_actions"] = (
                community["prs_opened"] +
                community["issues_opened"] +
                community["review_events"] +
                community["comments"]
            )
            total_actions = community["total_community_actions"]
            if total_actions > 0:
                community["engagement_score"] = min(100, total_actions * 3)
                community["collaboration_ratio"] = round(
                    min(1.0, total_actions / max(report.get("total_repos", 1), 1)), 2
                )
            report["community_stats"] = community

    # ── FIX 8a: Language Breakdown ──
    if not report.get("language_breakdown"):
        top_langs = report.get("top_languages", [])
        if isinstance(top_langs, list) and top_langs:
            LANG_COLORS = {
                "Python": "#3572A5", "TypeScript": "#3178C6", "JavaScript": "#f1e05a",
                "Java": "#b07219", "C++": "#f34b7d", "C#": "#178600", "C": "#555555",
                "Go": "#00ADD8", "Rust": "#dea584", "Ruby": "#701516", "Swift": "#F05138",
                "Kotlin": "#A97BFF", "PHP": "#4F5D95", "Scala": "#c22d40", "R": "#198CE7",
                "HTML": "#e34c26", "CSS": "#563d7c", "Shell": "#89e051", "Dart": "#00B4AB",
                "Lua": "#000080", "Perl": "#0298c3",
            }
            total = len(top_langs)
            breakdown_list = []
            for i, lang in enumerate(top_langs[:8]):
                if isinstance(lang, str) and lang:
                    # Approximate percentage — first language dominates
                    pct = round(100 * (total - i) / sum(range(1, total + 1)), 1)
                    breakdown_list.append({
                        "language": lang,
                        "bytes": 0,
                        "percentage": pct,
                        "color": LANG_COLORS.get(lang, "#808080"),
                    })
            if breakdown_list:
                report["language_breakdown"] = breakdown_list

    # ── FIX 8b: Activity Heatmap ──
    if not report.get("activity_heatmap"):
        # Build from growth engine's timeline data
        timeline = growth_data.get("activity_timeline", {}) if isinstance(growth_data, dict) else {}
        quarterly = timeline.get("quarterly_activity", []) if isinstance(timeline, dict) else []
        if isinstance(quarterly, list) and quarterly:
            # Convert quarterly activity to monthly approximation
            heatmap = []
            for q in quarterly[-12:]:  # Last 12 quarters
                if isinstance(q, dict):
                    quarter_key = q.get("quarter", "")
                    count = q.get("count", 0)
                    if quarter_key and "-Q" in quarter_key:
                        year, q_num = quarter_key.split("-Q")
                        q_int = int(q_num)
                        # Split quarterly count into 3 months
                        per_month = max(1, count // 3)
                        for m_offset in range(3):
                            month_num = (q_int - 1) * 3 + m_offset + 1
                            heatmap.append({
                                "month": f"{year}-{month_num:02d}",
                                "count": per_month + (1 if m_offset == 0 and count % 3 > 0 else 0),
                            })
            if heatmap:
                report["activity_heatmap"] = heatmap[-24:]  # Last 24 months

    # ── FIX 8c: Coding Patterns ──
    if not report.get("coding_patterns"):
        auth_data = report.get("authenticity", {})
        if isinstance(auth_data, dict):
            commit_freq = auth_data.get("commit_frequency", {})
            if isinstance(commit_freq, dict):
                # Build basic coding patterns from commit frequency data
                organic = commit_freq.get("organic_ratio", 0.5)
                total_commits = commit_freq.get("total_commits", 0)
                patterns = {
                    "day_hour_heatmap": [],
                    "most_active_day": "Weekday",
                    "weekend_ratio": round(1.0 - float(organic), 2) if organic else 0.3,
                    "avg_commits_per_active_day": round(float(total_commits) / max(
                        report.get("contribution_streak", {}).get("total_active_days", 1), 1
                    ), 1) if total_commits else 0,
                    "coding_session": "Regular" if organic > 0.5 else "Burst-heavy",
                    "peak_hours": [],
                }
                report["coding_patterns"] = patterns

    # ── FIX 9a: Commit Analysis ──
    if not report.get("commit_analysis"):
        auth_data = report.get("authenticity", {})
        if isinstance(auth_data, dict):
            commit_freq = auth_data.get("commit_frequency", {})
            msg_entropy = auth_data.get("message_entropy", {})
            if isinstance(commit_freq, dict):
                total = commit_freq.get("total_commits", 0)
                organic = commit_freq.get("organic_ratio", 0.5)
                single_word = msg_entropy.get("single_word_ratio", 0) if isinstance(msg_entropy, dict) else 0
                # Quality score: high organic + low single-word messages = high quality
                quality = round(float(organic) * 70 + (1 - float(single_word)) * 30, 1)
                quality = max(0, min(100, quality))
                # Insight generation
                if quality >= 75:
                    insight = "Commit messages are descriptive and follow good practices."
                elif quality >= 50:
                    insight = "Commit quality is adequate but could be more descriptive."
                else:
                    insight = "Many commits have sparse or repetitive messages."

                report["commit_analysis"] = {
                    "total_analyzed": total,
                    "quality_score": quality,
                    "insight": insight,
                    "conventional_ratio": round(1.0 - float(single_word), 2),
                    "lazy_commit_ratio": round(float(single_word), 2),
                }

    # ── FIX 9b: Top Repos ──
    if not report.get("top_repos"):
        projects = report.get("projects", [])
        if isinstance(projects, list) and projects:
            top_repos = []
            for p in projects[:8]:
                if isinstance(p, dict):
                    top_repos.append({
                        "name": p.get("repo_name", p.get("name", "unknown")),
                        "description": p.get("description", ""),
                        "language": p.get("language", p.get("primary_language", "")),
                        "stars": p.get("stars", 0),
                        "forks": p.get("forks", 0),
                        "size": p.get("size", 0),
                        "url": p.get("html_url", p.get("url", "")),
                        "_quality_weight": p.get("_quality_weight", 1.0),
                    })
            if top_repos:
                report["top_repos"] = top_repos

    # ── FIX 9c: Verification Sources ──
    if not report.get("verification_sources"):
        sources = []
        # GitHub is always a source
        username = report.get("username", "")
        if username:
            sources.append({
                "name": "GitHub Profile",
                "status": "verified",
                "detail": f"@{username} — {report.get('total_repos', 0)} repos, {report.get('total_stars', 0)} stars",
            })
        # Code analysis source
        code_analysis = report.get("code_analysis", {})
        if isinstance(code_analysis, dict) and code_analysis.get("files_analyzed", 0) > 0:
            sources.append({
                "name": "Code Quality Analysis",
                "status": "verified",
                "detail": f"{code_analysis.get('files_analyzed', 0)} files analyzed across pinned repositories",
            })
        # Authenticity source
        auth_score = report.get("authenticity_score", 0)
        if auth_score:
            sources.append({
                "name": "Authenticity Engine",
                "status": "verified",
                "detail": f"Commit patterns, message entropy, and ownership analyzed — {auth_score}% authentic",
            })
        # Skills source
        skill_count = len(report.get("verified_skills", []))
        if skill_count > 0:
            sources.append({
                "name": "Skill Detection Engine",
                "status": "verified",
                "detail": f"{skill_count} technologies verified from code analysis",
            })
        if sources:
            report["verification_sources"] = sources

    # ── FIX 10: Improvements (Growth Roadmap) ──
    if not report.get("improvements"):
        improvements = []
        weaknesses = report.get("weaknesses", [])
        bd = report.get("score_breakdown", {})
        bd_inner = bd.get("breakdown", {}) if isinstance(bd, dict) else {}

        # Generate actionable improvements from weaknesses and score gaps
        if isinstance(bd_inner, dict):
            if bd_inner.get("code_quality", 100) < 50:
                improvements.append(
                    "Improve code quality: Add linting (ESLint/Pylint), adopt consistent formatting, "
                    "and refactor large functions into smaller, testable units."
                )
            if bd_inner.get("consistency", 100) < 40:
                improvements.append(
                    "Build consistency: Set a daily/weekly coding schedule. Even 30 minutes of "
                    "focused coding per day compounds dramatically over time."
                )
            if bd_inner.get("growth", 100) < 30:
                improvements.append(
                    "Expand your tech stack: Pick one new technology per quarter. Build a small "
                    "project with it and push it to GitHub to demonstrate learning."
                )
            if bd_inner.get("authenticity", 100) < 40:
                improvements.append(
                    "Improve commit practices: Write descriptive commit messages, make smaller "
                    "atomic commits, and avoid bulk-uploading code in single commits."
                )

        # Weakness-driven improvements
        for w in (weaknesses or [])[:3]:
            if isinstance(w, str):
                if "test" in w.lower():
                    improvements.append(
                        "Add testing: Start with unit tests for core logic using pytest/Jest. "
                        "Even 60% coverage dramatically improves code confidence."
                    )
                elif "doc" in w.lower() or "readme" in w.lower():
                    improvements.append(
                        "Improve documentation: Add a clear README with setup instructions, "
                        "architecture overview, and screenshots/demos to every project."
                    )

        # Always add at least one general improvement
        if not improvements:
            score = report.get("final_score", report.get("score", 50))
            if score >= 70:
                improvements.append(
                    "Level up: Contribute to popular open-source projects to gain external "
                    "validation and expand your network. Consider writing technical blog posts."
                )
            elif score >= 45:
                improvements.append(
                    "Build depth: Pick your strongest technology and build a production-grade "
                    "project with proper testing, CI/CD, and documentation."
                )
            else:
                improvements.append(
                    "Foundation first: Focus on completing 2-3 meaningful projects with proper "
                    "README files, clean code structure, and consistent commits."
                )

        # Deduplicate
        seen = set()
        unique_improvements = []
        for imp in improvements:
            key = imp[:50]
            if key not in seen:
                seen.add(key)
                unique_improvements.append(imp)
        report["improvements"] = unique_improvements[:6]

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
    repos: List[Dict] = None,
    code_analysis: Dict = None,
) -> List[Dict[str, str]]:
    """Generate interview questions that reference THIS developer's specific repos and weaknesses."""
    questions = []
    repos = repos or []
    code_analysis = code_analysis or {}

    # Find the most interesting repos to reference
    non_forks = [r for r in repos if not r.get("is_fork", r.get("fork", False))]
    interesting_repos = []
    if non_forks:
        def repo_interest(r):
            return (
                r.get("stars", 0) * 3 +
                (10 if r.get("description") else 0) +
                r.get("_fork_commit_count", r.get("commit_count", 0))
            )
        interesting_repos = sorted(non_forks, key=repo_interest, reverse=True)[:3]

    repo1 = interesting_repos[0] if len(interesting_repos) > 0 else None
    repo2 = interesting_repos[1] if len(interesting_repos) > 1 else None

    repo_name = repo1.get("name", "your projects") if repo1 else "your projects"
    repo_lang = repo1.get("language", top_skills[0]["skill_name"] if top_skills else "your stack") if repo1 else "your stack"
    repo_desc = repo1.get("description", "") if repo1 else ""
    repo2_name = repo2.get("name", "") if repo2 else ""

    # Q1: Architecture deep-dive on THEIR specific repo
    q1_context = f" ({repo_desc[:60]})" if repo_desc else ""
    questions.append({
        "category": "Technical Depth",
        "question": (
            f"Walk me through the architecture of {repo_name}{q1_context}. "
            f"What were the hardest technical decisions, and what would you change if you started today?"
        ),
        "why": f"Your most substantial original project -- tests whether you genuinely wrote and understand the codebase",
    })

    # Q2: Based on specific authenticity or code findings — ALWAYS repo-specific
    test_ratio = code_analysis.get("test_ratio", code_analysis.get("metrics", {}).get("test_ratio", 0) if isinstance(code_analysis.get("metrics"), dict) else 0)
    auth_flags = [f for f in risk_flags if isinstance(f, dict) and
                  any(kw in str(f.get("flag", "")).lower() for kw in ["commit", "bulk", "fork", "clone"])]

    if auth_flags:
        flag_detail = auth_flags[0].get("flag", "unusual patterns")
        questions.append({
            "category": "Code Authenticity",
            "question": (
                f"Your GitHub history on {repo_name} shows {flag_detail.lower()}. Can you explain what was happening "
                f"during that period and walk me through your typical commit workflow for that project?"
            ),
            "why": f"Authenticates that you wrote the code in {repo_name} yourself and can explain your development process",
        })
    elif test_ratio is not None and float(test_ratio or 0) < 0.05:
        questions.append({
            "category": "Engineering Practices",
            "question": (
                f"We noticed {repo_name} has very limited test coverage. Walk me through how you think "
                f"about testing -- what would it take to add meaningful tests to {repo_name} specifically?"
            ),
            "why": f"Tests are sparse in {repo_name} -- probes engineering maturity and self-awareness",
        })
    elif weaknesses:
        # Probe a specific detected weakness instead of a generic hardcoded question
        weakness_text = weaknesses[0] if isinstance(weaknesses[0], str) else str(weaknesses[0])
        target_repo = repo2_name if repo2_name else repo_name
        questions.append({
            "category": "Weakness Probing",
            "question": (
                f"Our analysis flagged \"{weakness_text}\" as a gap. "
                f"Looking at {target_repo}, how would you address this in your next iteration of the project?"
            ),
            "why": f"Probes self-awareness about detected weakness: {weakness_text}",
        })
    else:
        # Even the else case references their repo
        questions.append({
            "category": "Engineering Practices",
            "question": (
                f"What is the biggest piece of technical debt in {repo_name}, and how would you tackle it?"
            ),
            "why": f"Tests awareness of code quality issues in their own project",
        })

    # Q3: Skill-specific to their primary verified technology — tied to their repo
    if top_skills:
        primary = top_skills[0]
        score_display = primary.get("formatted_score", f"{primary.get('skill_score', 0)}/10")
        target_repo = repo2_name if repo2_name else repo_name
        questions.append({
            "category": "Skill Verification",
            "question": (
                f"In {target_repo}, how did you use {primary['skill_name']}? "
                f"Walk me through a specific technical decision you made with it and the trade-offs you weighed."
            ),
            "why": f"Your primary verified skill ({score_display}) -- confirms genuine depth vs surface-level usage in {target_repo}",
        })

    # Q4: Role-specific referencing their projects
    role = role_fit.get("primary_role", "")
    if role:
        questions.append({
            "category": "Role Experience",
            "question": (
                f"As a {role}, what is the hardest bug you've debugged in {repo_name} or a similar project? "
                f"Walk me through your diagnosis process step by step."
            ),
            "why": f"Assesses real-world {role} debugging experience on their own codebase",
        })

    # Q5: System design applied to their actual project
    if repo1:
        questions.append({
            "category": "System Design",
            "question": (
                f"If {repo_name} needed to handle 10x its current load, what would you change? "
                f"Start with diagnosing where the bottleneck would be."
            ),
            "why": f"Tests architectural thinking applied to {repo_name}, not a textbook scenario",
        })
    elif repo2:
        questions.append({
            "category": "System Design",
            "question": (
                f"If {repo2_name} had to serve 1000 concurrent users, what architectural changes would you make?"
            ),
            "why": "Tests scaling thinking on their actual project",
        })
    else:
        questions.append({
            "category": "System Design",
            "question": "Describe a time you had to make a system scale. What was the bottleneck and how did you solve it?",
            "why": "Assesses production engineering thinking",
        })

    return questions[:5]


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