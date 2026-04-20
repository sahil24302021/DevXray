"""
Data Richness Detector — determines how much each signal source contributes to DIP.

The key insight: we should never produce a confident score from thin data.
A developer with 2 public repos should have GitHub weighted at ~20%,
not 90% like a developer with 50+ active repos.

This module also detects "GitHub-sparse" profiles and triggers the appropriate
UI messaging so HR teams understand what the score is based on.
"""

import re
from typing import Dict, Any, List, Optional
from utils.logging_config import get_logger

log = get_logger("data_richness")


def compute_github_richness(profile: Dict, repos: List[Dict], commits: List[Dict]) -> Dict[str, Any]:
    """
    Measure how much real signal exists in the GitHub data.

    Returns a richness score (0-100) and a weight (0.0-0.70) for GitHub's
    contribution to the final DIP score.
    """
    non_fork_repos = [r for r in repos if not r.get("is_fork", r.get("fork", False))]
    original_repo_count = len(non_fork_repos)
    commit_count = len(commits)
    followers = profile.get("followers", 0)
    total_stars = sum(r.get("stars", r.get("stargazers_count", 0)) for r in non_fork_repos)
    account_age_months = profile.get("_account_age_months", 0)

    # Score each dimension (0-100)

    # Repo count signal
    if original_repo_count >= 20:
        repo_signal = 100
    elif original_repo_count >= 10:
        repo_signal = 75
    elif original_repo_count >= 5:
        repo_signal = 50
    elif original_repo_count >= 2:
        repo_signal = 25
    else:
        repo_signal = 5

    # Activity signal (commits)
    if commit_count >= 200:
        activity_signal = 100
    elif commit_count >= 100:
        activity_signal = 80
    elif commit_count >= 50:
        activity_signal = 60
    elif commit_count >= 20:
        activity_signal = 40
    elif commit_count >= 5:
        activity_signal = 20
    else:
        activity_signal = 5

    # Social proof signal (followers + stars)
    if followers >= 1000 or total_stars >= 500:
        social_signal = 100
    elif followers >= 100 or total_stars >= 50:
        social_signal = 70
    elif followers >= 10 or total_stars >= 10:
        social_signal = 40
    else:
        social_signal = 10

    # Account maturity signal
    if account_age_months >= 48:
        maturity_signal = 100
    elif account_age_months >= 24:
        maturity_signal = 70
    elif account_age_months >= 12:
        maturity_signal = 40
    else:
        maturity_signal = 20

    # Composite richness score
    richness = (
        repo_signal * 0.35 +
        activity_signal * 0.35 +
        social_signal * 0.15 +
        maturity_signal * 0.15
    )

    # Convert richness to weight (0.20 minimum so GitHub always contributes something,
    # 0.70 maximum so other signals always have room)
    weight = 0.20 + (richness / 100) * 0.50  # Range: 0.20 - 0.70
    weight = round(weight, 2)

    # Determine data tier for UI messaging
    if richness >= 75:
        tier = "rich"
        description = "Extensive GitHub activity — high confidence analysis"
    elif richness >= 45:
        tier = "moderate"
        description = "Moderate GitHub data — supplementary signals recommended"
    elif richness >= 20:
        tier = "sparse"
        description = "Limited public GitHub — score weighted toward resume analysis"
    else:
        tier = "minimal"
        description = "Minimal GitHub data — score is primarily resume and context-based"

    log.info(
        f"[DataRichness] GitHub: richness={richness:.1f}, weight={weight}, tier={tier}, "
        f"repos={original_repo_count}, commits={commit_count}, followers={followers}, stars={total_stars}"
    )

    return {
        "richness_score": round(richness, 1),
        "weight": weight,
        "tier": tier,
        "description": description,
        "repo_count": original_repo_count,
        "commit_count": commit_count,
        "is_sparse": richness < 35,
        "is_minimal": richness < 15,
    }


def compute_resume_richness(resume_data: Optional[Dict]) -> Dict[str, Any]:
    """
    Measure signal quality in the resume data.

    A resume with "Led team of 8 engineers, reduced API latency by 40%,
    architected microservices handling 10M requests/day" is strong evidence
    even with zero GitHub. Score it accordingly.
    """
    if not resume_data:
        return {"richness_score": 0, "weight": 0.0, "tier": "none", "has_resume": False}

    richness = 0
    signals_found = []

    # Years of experience
    years = resume_data.get("years_of_experience", 0) or 0
    if years >= 8:
        richness += 30
        signals_found.append(f"{years} years experience")
    elif years >= 4:
        richness += 20
        signals_found.append(f"{years} years experience")
    elif years >= 1:
        richness += 10
        signals_found.append(f"{years} years experience")

    # Named companies
    companies = resume_data.get("companies", []) or []
    known_companies = [c for c in companies if c and len(str(c)) > 2]
    if len(known_companies) >= 3:
        richness += 20
        signals_found.append(f"{len(known_companies)} companies listed")
    elif len(known_companies) >= 1:
        richness += 12
        signals_found.append(f"{len(known_companies)} companies listed")

    # Measurable achievements (numbers in descriptions)
    raw_text = str(resume_data.get("raw_text", "") or "")
    achievement_patterns = [
        r'\d+[%x×]',
        r'\d+[kKmMbB]\+?',
        r'team of \d+',
        r'\d+ engineers?',
        r'\$\d+',
    ]
    achievement_count = sum(
        1 for pattern in achievement_patterns
        if re.search(pattern, raw_text, re.IGNORECASE)
    )
    if achievement_count >= 3:
        richness += 25
        signals_found.append(f"{achievement_count} measurable achievements")
    elif achievement_count >= 1:
        richness += 12
        signals_found.append(f"{achievement_count} measurable achievements")

    # Seniority indicators
    seniority_terms = ["led", "architected", "designed", "managed", "principal",
                       "senior", "staff", "director", "vp", "head of", "founded"]
    seniority_hits = sum(1 for term in seniority_terms if term in raw_text.lower())
    if seniority_hits >= 3:
        richness += 15
        signals_found.append("strong seniority indicators")
    elif seniority_hits >= 1:
        richness += 8
        signals_found.append("seniority indicators present")

    # Skills list quality
    skills = resume_data.get("skills", []) or []
    if len(skills) >= 10:
        richness += 10
        signals_found.append(f"{len(skills)} skills listed")
    elif len(skills) >= 5:
        richness += 5

    richness = min(100, richness)

    # Weight: resume contributes 0.10-0.40 depending on richness
    weight = 0.10 + (richness / 100) * 0.30  # Range: 0.10 - 0.40
    weight = round(weight, 2)

    if richness >= 70:
        tier = "strong"
    elif richness >= 40:
        tier = "moderate"
    elif richness >= 15:
        tier = "weak"
    else:
        tier = "minimal"

    log.info(
        f"[DataRichness] Resume: richness={richness:.1f}, weight={weight}, "
        f"tier={tier}, signals={signals_found}"
    )

    return {
        "richness_score": round(richness, 1),
        "weight": weight,
        "tier": tier,
        "has_resume": True,
        "signals_found": signals_found,
        "years_experience": years,
    }


def compute_overall_data_richness(
    github_richness: Dict,
    resume_richness: Dict,
    linkedin_available: bool = False,
    portfolio_available: bool = False,
    coding_test_taken: bool = False,
    self_reported_context: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    Combine all signal sources into a final data assessment.

    Determines:
    1. How to weight each signal in the final score
    2. What confidence level to show HR
    3. What messaging to show ("score based on GitHub + Resume" vs "GitHub data sparse")
    4. Whether to ask for more signals
    """
    github_weight = github_richness.get("weight", 0.0)
    resume_weight = resume_richness.get("weight", 0.0)

    # Self-reported context overrides
    context = self_reported_context or {}
    if context.get("sparse_mode_requested"):
        # Developer says their repos are private / they code at work
        github_weight = min(github_weight, 0.40)
        if resume_richness.get("has_resume"):
            resume_weight = max(resume_weight, 0.35)

    # Bonus weights for additional signals
    linkedin_weight = 0.10 if linkedin_available else 0.0
    portfolio_weight = 0.08 if portfolio_available else 0.0
    coding_weight = 0.20 if coding_test_taken else 0.0

    # Normalize weights to sum to 1.0
    total = github_weight + resume_weight + linkedin_weight + portfolio_weight + coding_weight
    if total > 0:
        github_weight = round(github_weight / total, 3)
        resume_weight = round(resume_weight / total, 3)
        linkedin_weight = round(linkedin_weight / total, 3)
        portfolio_weight = round(portfolio_weight / total, 3)
        coding_weight = round(coding_weight / total, 3)
    else:
        github_weight = 1.0

    # Overall confidence based on total data available
    github_rich = github_richness.get("richness_score", 0)
    resume_rich = resume_richness.get("richness_score", 0)

    signal_count = (
        (1 if github_rich > 10 else 0) +
        (1 if resume_rich > 10 else 0) +
        (1 if linkedin_available else 0) +
        (1 if portfolio_available else 0) +
        (1 if coding_test_taken else 0)
    )

    avg_richness = (
        github_rich * github_weight +
        resume_rich * resume_weight +
        (70 if linkedin_available else 0) * linkedin_weight +
        (60 if portfolio_available else 0) * portfolio_weight +
        (80 if coding_test_taken else 0) * coding_weight
    )

    # Confidence level for UI
    if avg_richness >= 70 and signal_count >= 2:
        confidence_level = "High"
        confidence_pct = min(95, int(avg_richness))
    elif avg_richness >= 45 or signal_count >= 2:
        confidence_level = "Medium"
        confidence_pct = min(75, int(avg_richness))
    elif avg_richness >= 20:
        confidence_level = "Low"
        confidence_pct = min(45, int(avg_richness))
    else:
        confidence_level = "Very Low"
        confidence_pct = 20

    # Determine primary data source for messaging
    if resume_weight > github_weight and resume_weight > 0.3:
        dominant_source = "Resume"
    elif github_weight > 0.5:
        dominant_source = "GitHub"
    else:
        dominant_source = "Mixed signals"

    # Generate HR-readable data basis string
    sources_used = []
    if github_weight > 0.1:
        sources_used.append(f"GitHub ({github_richness.get('tier', 'unknown')} data)")
    if resume_weight > 0.1:
        sources_used.append(f"Resume ({resume_richness.get('tier', 'none')} quality)")
    if linkedin_available:
        sources_used.append("LinkedIn")
    if portfolio_available:
        sources_used.append("Portfolio")
    if coding_test_taken:
        sources_used.append("Coding assessment")

    # Self-reported context note
    if context.get("sparse_mode_requested"):
        sources_used.append("Developer reports private repos")

    # Flag when we need more data
    needs_more_data = (
        github_richness.get("is_sparse", False) and
        resume_richness.get("richness_score", 0) < 30 and
        not linkedin_available and
        not coding_test_taken
    )

    # Determine what to ask for (in order of impact)
    request_signals = []
    if not resume_richness.get("has_resume"):
        request_signals.append({
            "type": "resume",
            "label": "Upload resume",
            "reason": "Resume analysis significantly improves score accuracy when GitHub data is limited",
            "impact": "high",
        })
    if not linkedin_available:
        request_signals.append({
            "type": "linkedin",
            "label": "Add LinkedIn URL",
            "reason": "LinkedIn profile confirms experience and role at companies not visible on GitHub",
            "impact": "medium",
        })
    if not coding_test_taken:
        request_signals.append({
            "type": "coding_test",
            "label": "Complete coding assessment",
            "reason": "20-minute technical test provides direct skill evidence independent of GitHub",
            "impact": "high",
        })

    log.info(
        f"[DataRichness] Overall: confidence={confidence_level} ({confidence_pct}%), "
        f"dominant={dominant_source}, signals={signal_count}, "
        f"weights={{gh={github_weight}, res={resume_weight}}}"
    )

    return {
        "weights": {
            "github": github_weight,
            "resume": resume_weight,
            "linkedin": linkedin_weight,
            "portfolio": portfolio_weight,
            "coding": coding_weight,
        },
        "confidence_level": confidence_level,
        "confidence_pct": confidence_pct,
        "dominant_source": dominant_source,
        "sources_used": sources_used,
        "signal_count": signal_count,
        "needs_more_data": needs_more_data,
        "request_signals": request_signals[:3],
        "data_basis": " + ".join(sources_used) if sources_used else "Insufficient data",
        "github_sparse_mode": github_richness.get("is_sparse", False),
        "github_minimal_mode": github_richness.get("is_minimal", False),
    }
