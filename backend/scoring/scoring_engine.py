"""
Scoring Engine — Deterministic, Weighted Final Scoring.

Implements the formulas:
  Final Score =
    0.30 × Code Quality +
    0.20 × Skill Depth +
    0.15 × Authenticity +
    0.15 × Consistency +
    0.10 × Growth +
    0.10 × Truth Score

Also includes:
  - Project quality weighting
  - Benchmarking against tier profiles
  - Role fit detection
  - Hire/Reject recommendation (rule-based)
  - Interview difficulty prediction
  - Salary band estimation

ZERO AI INVOLVEMENT.
"""
import math
from typing import Any, Dict, List, Optional, Tuple, TypedDict

from utils.logging_config import get_logger
from utils.proof import ProofCollector

log = get_logger("scoring")


# ═══════════════════════════════════════════════════════
#  AUTHENTICITY NORMALIZATION FIX
# ═══════════════════════════════════════════════════════

def normalize_authenticity(raw_authenticity: float, repos: List[Dict] = None, commits: List[Dict] = None,
                          account_age_months: float = 0, bio: str = "") -> float:
    """
    Normalize the authenticity score to a 0-100 range.

    FIX: The authenticity engine sometimes outputs values like 0.0084 (meaning 0.84%)
    when it should output 84 (out of 100). This function detects and corrects that.

    Also applies a data-aware floor: a developer with real repos and commits cannot
    have an authenticity score of near-zero — that indicates a formula bug, not fraud.

    v2 FIX: Added organic commit ratio check — if commits show organic patterns
    (varied times, different repos), the floor is raised significantly.
    """
    if repos is None:
        repos = []
    if commits is None:
        commits = []

    non_fork_repos = [r for r in repos if not r.get("is_fork", r.get("fork", False))]
    repo_count = len(non_fork_repos)
    commit_count = len(commits)

    # Step 1: Determine the scale
    if raw_authenticity > 1.0:
        # Already on 0-100 scale
        normalized = min(raw_authenticity, 100.0)
    else:
        # On 0-1 scale — multiply by 100
        normalized = min(raw_authenticity * 100.0, 100.0)

    # Step 2: Organic activity detection
    # Check if commits are from multiple repos and different dates (organic pattern)
    organic_signal = 0
    if commits:
        unique_repos = len(set(c.get("repo", c.get("repo_name", "")) for c in commits if isinstance(c, dict)))
        unique_dates = len(set(str(c.get("date", ""))[:10] for c in commits if isinstance(c, dict) and c.get("date")))
        if unique_repos >= 3:
            organic_signal += 1
        if unique_dates >= 5:
            organic_signal += 1
        if unique_dates >= 15:
            organic_signal += 1

    # Step 3: Evidence-aware floor with organic boost
    # v2: More aggressive floors for developers with organic activity
    floor = 0.0
    if repo_count >= 20 and commit_count >= 100:
        floor = 55.0 if organic_signal >= 2 else 40.0
    elif repo_count >= 10 and commit_count >= 50:
        floor = 45.0 if organic_signal >= 2 else 30.0
    elif repo_count >= 5 and commit_count >= 20:
        floor = 35.0 if organic_signal >= 1 else 20.0
    elif repo_count >= 2 and commit_count >= 5:
        floor = 20.0 if organic_signal >= 1 else 10.0
    elif repo_count >= 1 and commit_count >= 1:
        floor = 10.0

    # Step 3b: Student/early-career boost
    # Students with real repos should get a higher baseline
    is_student = any(kw in bio.lower() for kw in ["student", "b.tech", "btech", "undergrad",
                      "university", "college", "freshman", "sophomore", "learning", "learner"]) if bio else False
    if is_student and account_age_months > 0 and account_age_months < 24 and repo_count >= 3:
        floor = max(floor, 30.0)
        log.info(f"[Authenticity] Student profile detected — floor raised to {floor}")

    if normalized < floor:
        log.warning(
            f"[Authenticity] Score {normalized:.1f} is below evidence-based floor {floor:.0f} "
            f"(repos={repo_count}, commits={commit_count}, organic={organic_signal}). "
            f"Applying floor — this indicates a formula calibration issue in the authenticity engine."
        )
        normalized = floor

    return round(float(normalized), 1)


# ═══════════════════════════════════════════════════════
#  PROJECT QUALITY WEIGHTING
# ═══════════════════════════════════════════════════════

def weight_repos(repos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Assign quality weights to repos.

    Weight factors:
      - Stars (log scale)
      - Fork count (log scale)
      - Size (log scale)
      - Has topics/description
      - Non-fork (graduated penalty based on commit activity)
    """
    weighted: List[Dict[str, Any]] = []

    for r in repos:
        stars = r.get("stars", 0)
        forks = r.get("forks", 0)
        size = r.get("size", 0)
        is_fork = r.get("is_fork", r.get("fork", False))
        has_desc = bool(r.get("description") and len(r.get("description", "")) > 10)
        has_topics = len(r.get("topics", [])) >= 1
        fork_commits = r.get("_fork_commit_count", 0)

        weight = 1.0  # Base

        if stars > 0:
            weight += min(math.log10(stars + 1) * 1.5, 3.0)
        if forks > 0:
            weight += min(math.log10(forks + 1), 1.5)
        if size > 100:
            weight += min(math.log10(size / 100) * 0.5, 2.0)
        if has_desc:
            weight += 0.5
        if has_topics:
            weight += 0.5

        # ACCURACY FIX A2: Graduated fork penalty based on actual commit activity
        # A fork with significant original commits is valuable; a bare fork is not
        if is_fork:
            if fork_commits > 50:
                weight *= 0.8   # Heavily modified — minor penalty
            elif fork_commits > 20:
                weight *= 0.65  # Moderately modified
            elif fork_commits > 5:
                weight *= 0.45  # Some work done
            else:
                weight *= 0.2   # Bare fork — heavy penalty

        weight = min(round(float(weight), 2), 10.0)

        weighted.append({
            **r,
            "_quality_weight": weight,
            "_tier": "production" if weight >= 5 else "project" if weight >= 2 else "toy",
        })

    weighted.sort(key=lambda r: r["_quality_weight"], reverse=True)
    return weighted


# ═══════════════════════════════════════════════════════
#  BENCHMARKING SYSTEM
# ═══════════════════════════════════════════════════════

class BenchmarkProfile(TypedDict):
    final_score_range: Tuple[int, int]
    code_quality_min: int
    skill_depth_min: float
    authenticity_min: int
    consistency_min: int
    growth_min: int
    description: str


BENCHMARK_PROFILES: Dict[str, BenchmarkProfile] = {
    "Elite (FAANG-level)": {
        "final_score_range": (80, 100),
        "code_quality_min": 70,
        "skill_depth_min": 7.0,
        "authenticity_min": 85,
        "consistency_min": 70,
        "growth_min": 60,
        "description": "Top-tier engineers with deep expertise, production-grade code, strong community presence",
    },
    "Senior": {
        "final_score_range": (65, 80),
        "code_quality_min": 55,
        "skill_depth_min": 5.5,
        "authenticity_min": 70,
        "consistency_min": 55,
        "growth_min": 45,
        "description": "Experienced engineers with substantial projects and consistent output",
    },
    "Mid-Tier": {
        "final_score_range": (45, 65),
        "code_quality_min": 40,
        "skill_depth_min": 3.5,
        "authenticity_min": 55,
        "consistency_min": 35,
        "growth_min": 30,
        "description": "Solid developers with growing portfolios and decent fundamentals",
    },
    "Junior": {
        "final_score_range": (25, 45),
        "code_quality_min": 20,
        "skill_depth_min": 2.0,
        "authenticity_min": 40,
        "consistency_min": 15,
        "growth_min": 15,
        "description": "Early-career developers establishing their engineering foundation",
    },
    "Beginner": {
        "final_score_range": (0, 25),
        "code_quality_min": 0,
        "skill_depth_min": 0,
        "authenticity_min": 0,
        "consistency_min": 0,
        "growth_min": 0,
        "description": "Minimal GitHub presence, likely just starting or non-technical profile",
    },
}


def benchmark_developer(
    final_score: float,
    code_quality: float,
    skill_depth: float,
    authenticity: float,
    consistency: float,
    growth: float,
) -> Dict[str, Any]:
    """Compare developer metrics against benchmark tiers."""
    tier = "Beginner"
    tier_description = ""

    for tier_name, profile in BENCHMARK_PROFILES.items():
        lo, hi = profile["final_score_range"]
        if lo <= final_score <= hi:
            tier = tier_name
            tier_description = profile["description"]
            break

    if final_score >= 90:
        percentile = 95
    elif final_score >= 80:
        percentile = 85
    elif final_score >= 70:
        percentile = 70
    elif final_score >= 60:
        percentile = 55
    elif final_score >= 50:
        percentile = 40
    elif final_score >= 40:
        percentile = 25
    elif final_score >= 30:
        percentile = 15
    else:
        percentile = 5

    if tier == "Elite (FAANG-level)":
        comparable = "Comparable to senior engineers at top tech companies"
    elif tier == "Senior":
        comparable = "Comparable to mid-to-senior developers at strong tech companies"
    elif tier == "Mid-Tier":
        comparable = "Comparable to developers at startups and mid-size companies"
    elif tier == "Junior":
        comparable = "Comparable to recent graduates and early-career developers"
    else:
        comparable = "Below typical professional developer benchmarks"

    return {
        "tier": tier,
        "tier_description": tier_description,
        "percentile": percentile,
        "comparable_to": comparable,
    }


# ═══════════════════════════════════════════════════════
#  ROLE FIT DETECTION
# ═══════════════════════════════════════════════════════

def detect_role_fit(
    skill_summary: Dict[str, float],
    verified_skills: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Determine primary role fit based on verified skill categories."""
    role_mapping = {
        "Frontend Developer": ["frontend"],
        "Backend Developer": ["backend"],
        "Full-Stack Developer": ["frontend", "backend"],
        "ML/AI Engineer": ["ml"],
        "DevOps Engineer": ["devops"],
        "Mobile Developer": ["mobile"],
        "Data Engineer": ["database", "ml"],
    }

    role_scores: Dict[str, float] = {}

    for role, categories in role_mapping.items():
        cat_scores = [skill_summary.get(cat, 0) for cat in categories]
        if cat_scores:
            role_scores[role] = round(float(sum(cat_scores) / len(cat_scores)), 1)
        else:
            role_scores[role] = 0

    primary_role = "Unknown"
    if role_scores:
        primary_role = max(role_scores.keys(), key=lambda r: role_scores[r])

    frontend_score = skill_summary.get("frontend", 0)
    backend_score = skill_summary.get("backend", 0)
    if frontend_score >= 3.0 and backend_score >= 3.0:
        primary_role = "Full-Stack Developer"
        role_scores["Full-Stack Developer"] = round(
            float((frontend_score + backend_score) / 2), 1
        )

    return {
        "primary_role": primary_role,
        "role_scores": role_scores,
    }


# ═══════════════════════════════════════════════════════
#  HIRING RECOMMENDATION & ADVANCED METRICS
# ═══════════════════════════════════════════════════════

def generate_hiring_recommendation(
    final_score: float,
    authenticity_score: float,
    risk_flags: List[Dict[str, str]],
    truth_score: float,
    repos_count: int = 0,
    commits_count: int = 0,
) -> Dict[str, Any]:
    """
    Granular role-level hiring recommendations.

    FIX: The authenticity gate is now context-aware.
    Previously: if authenticity < 30 → immediate NO HIRE (too aggressive)
    Now: distinguish between "authenticity engine bug" vs "genuine fraud signal"

    A developer with 10+ repos and 50+ commits cannot have truly 0% authenticity —
    if the engine says so, it's a calibration bug, not evidence of fraud.
    """
    recommendation = {
        "intern": "NO",
        "junior": "NO",
        "mid": "NO",
        "senior": "NO"
    }
    reasoning: List[str] = []

    critical_flags = sum(1 for f in risk_flags if f.get("severity") == "CRITICAL")
    high_flags = sum(1 for f in risk_flags if f.get("severity") == "HIGH")

    # ── AUTHENTICITY GATE (context-aware) ──
    # Only hard-block if authenticity is low AND there's no evidence of real activity.
    # A low score combined with real repos/commits = likely engine calibration issue.
    has_real_activity = repos_count >= 5 or commits_count >= 20

    if authenticity_score < 15 and not has_real_activity:
        # Genuinely suspicious: very low authenticity AND no real activity
        reasoning.append(
            f"Profile authenticity is critically low ({authenticity_score:.0f}/100) "
            f"with minimal verifiable activity. Strong signal of fabrication."
        )
        return {
            "recommendation": recommendation,
            "reasoning": reasoning,
            "authenticity_gate_triggered": True,
        }
    elif authenticity_score < 30 and not has_real_activity:
        reasoning.append(
            f"Low authenticity score ({authenticity_score:.0f}/100). "
            f"Recommend manual review of contribution history."
        )
        # Don't hard-block — continue with lower recommendation ceiling

    # ── CRITICAL FLAGS CHECK ──
    if critical_flags >= 3:
        reasoning.append(f"Multiple ({critical_flags}) critical red flags — requires careful manual review.")
        # Still evaluate but cap at lower recommendations
        if final_score >= 30:
            recommendation["intern"] = "MAYBE"
            reasoning.append("Consider for intern roles only with extensive screening.")
        return {
            "recommendation": recommendation,
            "reasoning": reasoning,
        }

    # ── NORMAL EVALUATION ──

    # Senior
    if final_score >= 80 and authenticity_score >= 75 and truth_score >= 60:
        recommendation["senior"] = "YES"
        reasoning.append("Exceptional profile with verified skills matching senior requirements.")
    elif final_score >= 70:
        recommendation["senior"] = "MAYBE"
        reasoning.append("Strong profile, but requires deep technical screening for senior roles.")

    # Mid
    if final_score >= 65 and authenticity_score >= 50:
        recommendation["mid"] = "YES"
        if "MAYBE" not in recommendation.values():
            reasoning.append("Solid profile with good fundamentals for mid-level roles.")
    elif final_score >= 50:
        recommendation["mid"] = "MAYBE"
        reasoning.append("Decent signals for mid-level, but verify claims in interview.")

    # Junior
    if final_score >= 40:
        recommendation["junior"] = "YES"
        reasoning.append("Clear capability for junior development work.")
    elif final_score >= 30:
        recommendation["junior"] = "MAYBE"
        reasoning.append("Mixed signals for junior roles. Project-based interview recommended.")

    # Intern
    if final_score >= 25:
        recommendation["intern"] = "YES"
        reasoning.append("Meets baseline requirements for intern/entry-level positions.")
    else:
        reasoning.append("Insufficient evidence of meaningful development capability.")

    return {
        "recommendation": recommendation,
        "reasoning": reasoning,
    }


def predict_interview_difficulty(
    final_score: float,
    skill_depth: float,
    code_quality: float,
) -> str:
    """Predict appropriate interview difficulty level."""
    composite = (float(final_score) * 0.4 + float(code_quality) * 0.3 + float(skill_depth) * 3 * 0.3)

    if composite >= 75:
        return "Expert — Focus on system design, architecture decisions, trade-offs"
    elif composite >= 55:
        return "Advanced — DSA + system design + domain-specific challenges"
    elif composite >= 40:
        return "Intermediate — Standard coding problems + project discussion"
    else:
        return "Foundation — Basic coding + fundamentals assessment"


def estimate_salary_range(
    tier: str,
    primary_role: str,
    years_experience: int = 0,
) -> Dict[str, Any]:
    """
    Basic salary range estimation. Very rough heuristic.
    Values in USD (annual), based on US market data.
    """
    base_ranges = {
        "Elite (FAANG-level)": (180_000, 350_000),
        "Senior": (130_000, 220_000),
        "Mid-Tier": (85_000, 150_000),
        "Junior": (55_000, 95_000),
        "Beginner": (40_000, 65_000),
    }

    role_multipliers = {
        "ML/AI Engineer": 1.15,
        "Backend Developer": 1.05,
        "Full-Stack Developer": 1.05,
        "DevOps Engineer": 1.10,
        "Frontend Developer": 1.00,
        "Mobile Developer": 1.00,
        "Data Engineer": 1.10,
    }

    base_lo, base_hi = base_ranges.get(tier, (50_000, 90_000))
    multiplier = role_multipliers.get(primary_role, 1.0)

    return {
        "range_low_usd": int(base_lo * multiplier),
        "range_high_usd": int(base_hi * multiplier),
        "tier": tier,
        "note": "Rough estimate based on US market. Actual compensation varies significantly by location, company, and negotiation.",
    }


# ═══════════════════════════════════════════════════════
#  CAREER-STAGE CALIBRATION
# ═══════════════════════════════════════════════════════

def detect_career_stage(
    account_age_months: float,
    repos_count: int,
    years_experience: int = 0,
) -> str:
    """
    Detect the career stage from objective signals.

    Returns: "student" | "junior" | "mid" | "senior"
    """
    if years_experience > 5 or account_age_months > 60:
        return "senior"
    if years_experience > 2 or (account_age_months > 24 and repos_count > 15):
        return "mid"
    if account_age_months < 18 or repos_count < 8:
        return "student"
    return "junior"


def apply_career_calibration(
    weights: Dict[str, float],
    career_stage: str,
    bio: str = "",
) -> Dict[str, float]:
    """
    Adjust scoring weights based on career stage.

    Students/juniors:
      - Boost growth weight (learning signal matters more)
      - Reduce consistency expectation (they're still building habits)
      - Slightly reduce skill_depth expectation

    v2 FIX: Bio-aware calibration — if bio contains student keywords,
    apply even stronger calibration to avoid unfairly penalizing students.
    """
    # Detect student from bio text
    is_student_bio = any(kw in bio.lower() for kw in [
        "student", "b.tech", "btech", "undergrad", "university", "college",
        "freshman", "sophomore", "learning", "learner", "intern",
    ]) if bio else False

    if career_stage == "student" or (career_stage == "junior" and is_student_bio):
        # v2: More aggressive calibration for students
        weights["growth"] = round(weights.get("growth", 0.10) + 0.10, 3)
        weights["consistency"] = round(max(weights.get("consistency", 0.15) - 0.08, 0.02), 3)
        weights["skill_depth"] = round(max(weights.get("skill_depth", 0.20) - 0.04, 0.05), 3)
        # Reduce code quality penalty — students are learning, not shipping to prod
        weights["code_quality"] = round(max(weights.get("code_quality", 0.30) - 0.03, 0.10), 3)
        log.info(f"Student calibration applied (bio_detected={is_student_bio})")
    elif career_stage == "junior":
        weights["growth"] = round(weights.get("growth", 0.10) + 0.04, 3)
        weights["consistency"] = round(max(weights.get("consistency", 0.15) - 0.03, 0.05), 3)
        weights["skill_depth"] = round(max(weights.get("skill_depth", 0.20) - 0.01, 0.05), 3)
    # mid and senior: no adjustment needed

    # Re-normalize so weights sum to 1.0
    total = sum(weights.values())
    if total > 0:
        weights = {k: round(v / total, 3) for k, v in weights.items()}

    return weights


def compute_percentile_benchmark(
    final_score: float,
    account_age_months: float,
) -> Dict[str, Any]:
    """
    Compute peer-group percentile for HR context.

    Adjusts percentile expectations based on account age:
    a student with 45/100 is impressive; a 10-year veteran with 45/100 is not.
    """
    # Base percentile from score
    if final_score >= 90:
        base_pct = 97
    elif final_score >= 80:
        base_pct = 90
    elif final_score >= 70:
        base_pct = 78
    elif final_score >= 60:
        base_pct = 62
    elif final_score >= 50:
        base_pct = 45
    elif final_score >= 40:
        base_pct = 28
    elif final_score >= 30:
        base_pct = 15
    elif final_score >= 20:
        base_pct = 8
    else:
        base_pct = 3

    # Age-adjusted percentile (younger devs get a boost)
    if account_age_months < 12:
        peer_group = "New developers (< 1 year)"
        adjusted_pct = min(base_pct + 15, 99)
    elif account_age_months < 24:
        peer_group = "Early-career (1-2 years)"
        adjusted_pct = min(base_pct + 8, 99)
    elif account_age_months < 48:
        peer_group = "Mid-career (2-4 years)"
        adjusted_pct = base_pct
    else:
        peer_group = "Experienced (4+ years)"
        adjusted_pct = max(base_pct - 5, 1)

    return {
        "percentile": adjusted_pct,
        "peer_group": peer_group,
        "raw_percentile": base_pct,
        "note": f"Ranked in the {adjusted_pct}th percentile among {peer_group.lower()}.",
    }


# ═══════════════════════════════════════════════════════
#  DYNAMIC SCORING & MASTER ENGINE
# ═══════════════════════════════════════════════════════

def determine_dynamic_weights(
    years_experience: int,
    job_requirements: Optional[Dict[str, Any]] = None,
    has_resume: bool = False,
    account_age_months: float = 0.0,
    repos_count: int = 0,
) -> Dict[str, float]:
    """
    Adaptive weights logic.
    Junior devs: emphasize code quality and growth.
    Senior devs: emphasize skill depth and consistency.

    BUG 6 FIX: When has_resume=False (GitHub-only scan), the truth engine does not
    run so truth_score is always 0. We zero-out the truth weight and redistribute
    it to code_quality and skill_depth so GitHub-only devs are not penalized.
    """
    if years_experience > 5:
        weights = {
            "code_quality": 0.25,
            "skill_depth": 0.30,
            "authenticity": 0.10,
            "consistency": 0.20,
            "growth": 0.05,
            "truth": 0.10,
        }
    elif 0 < years_experience <= 2:
        weights = {
            "code_quality": 0.35,
            "skill_depth": 0.15,
            "authenticity": 0.15,
            "consistency": 0.10,
            "growth": 0.15,
            "truth": 0.10,
        }
    else:
        weights = {
            "code_quality": 0.30,
            "skill_depth": 0.20,
            "authenticity": 0.15,
            "consistency": 0.15,
            "growth": 0.10,
            "truth": 0.10,
        }

    # Role-based adjustments
    job_reqs = job_requirements or {}
    if job_reqs:
        job_type = str(job_reqs.get("job_type", "")).lower()
        if "frontend" in job_type:
            weights["skill_depth"] += 0.05
            weights["code_quality"] -= 0.05
        elif "backend" in job_type or "system" in job_type:
            weights["code_quality"] += 0.05
            weights["skill_depth"] -= 0.05

    # BUG 6 FIX: No resume → truth engine didn't run → redistribute truth weight
    # so the developer is not penalized for not providing a resume.
    if not has_resume:
        truth_weight = weights.pop("truth", 0.10)
        weights["code_quality"] = round(weights.get("code_quality", 0.30) + truth_weight * 0.6, 3)
        weights["skill_depth"] = round(weights.get("skill_depth", 0.20) + truth_weight * 0.4, 3)
        weights["truth"] = 0.0

    # ── CAREER-STAGE CALIBRATION ──
    if account_age_months > 0:
        career_stage = detect_career_stage(account_age_months, repos_count, years_experience)
        weights = apply_career_calibration(weights, career_stage)
        log.info(f"Career calibration applied: stage={career_stage}, age={account_age_months:.0f}mo")

    total = sum(weights.values())
    return {k: round(float(v / total), 3) for k, v in weights.items()}


# ═══════════════════════════════════════════════════════
#  FIX E: SOCIAL PROOF / IMPACT SCORING
# ═══════════════════════════════════════════════════════

def compute_impact_score(profile: dict, repos: list) -> float:
    """
    Impact score (0-100) based on social proof signals.

    This prevents cases where a developer with 8K followers scores as Junior.
    A developer with significant community validation cannot be entry-level.
    """
    followers = profile.get("followers", 0)

    # Follower score: 0-40 points (logarithmic)
    if followers >= 10000:
        follower_score = 40
    elif followers >= 1000:
        follower_score = 30
    elif followers >= 100:
        follower_score = 20
    elif followers >= 10:
        follower_score = 10
    elif followers > 0:
        follower_score = max(0, math.log10(followers + 1) * 10)
    else:
        follower_score = 0

    # Stars score: 0-40 points across original repos
    non_fork = [r for r in repos if not r.get("is_fork", r.get("fork", False))]
    total_stars = sum(r.get("stars", r.get("stargazers_count", 0)) for r in non_fork)

    if total_stars >= 5000:
        stars_score = 40
    elif total_stars >= 1000:
        stars_score = 30
    elif total_stars >= 100:
        stars_score = 20
    elif total_stars >= 10:
        stars_score = 10
    elif total_stars > 0:
        stars_score = max(0, math.log10(total_stars + 1) * 10)
    else:
        stars_score = 0

    # Community adoption: 0-20 points (repos forked BY others)
    forks_received = sum(r.get("forks", 0) for r in non_fork)
    if forks_received >= 500:
        adoption_score = 20
    elif forks_received >= 50:
        adoption_score = 15
    elif forks_received >= 10:
        adoption_score = 10
    elif forks_received > 0:
        adoption_score = 5
    else:
        adoption_score = 0

    raw = follower_score + stars_score + adoption_score
    return min(100.0, float(raw))


def apply_impact_floor(final_score: float, profile: dict, repos: list) -> float:
    """
    Hard floor rule: developers with significant community validation cannot score below these floors.
    A developer with 1000+ followers or 500+ stars has REAL peer validation.
    """
    followers = profile.get("followers", 0)
    non_fork = [r for r in repos if not r.get("is_fork", r.get("fork", False))]
    total_stars = sum(r.get("stars", r.get("stargazers_count", 0)) for r in non_fork)

    if followers >= 5000 or total_stars >= 2000:
        floor = 70  # Top-tier social proof
    elif followers >= 1000 or total_stars >= 500:
        floor = 62  # Significant social proof
    elif followers >= 500 or total_stars >= 100:
        floor = 55  # Moderate social proof
    else:
        floor = 0  # No floor applied

    if final_score < floor:
        log.info(
            f"[Impact Floor] Score {final_score:.1f} raised to {floor} "
            f"(followers={followers}, stars={total_stars})"
        )
        return float(floor)
    return final_score

def compute_final_score(
    code_quality: float,
    skill_depth: float,
    authenticity: float,
    consistency: float,
    growth: float,
    truth_score: float,
    risk_flags: List[Dict[str, str]],
    skill_summary: Dict[str, float],
    verified_skills: List[Dict[str, Any]],
    years_experience: int = 0,
    proof: Optional[ProofCollector] = None,
    job_requirements: Optional[Dict[str, Any]] = None,
    repos: Optional[List[Dict[str, Any]]] = None,
    commits: Optional[List[Dict[str, Any]]] = None,
    ci_depth_bonus: int = 0,
    multi_source_bonus: float = 0.0,
    test_culture_score: float = 0.0,
    has_resume: bool = False,
    account_age_months: float = 0.0,
    profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Compute the final deterministic developer score with full explainability.

    KEY FIXES:
    1. authenticity is normalized via normalize_authenticity() which applies
       an evidence-aware floor so real developers don't get near-zero scores.
    2. generate_hiring_recommendation() now receives repos/commits counts
       so it distinguishes "engine calibration bug" from "genuine fraud."
    3. Penalty cap is now enforced at 35% (was 40%) of raw score.
    """
    from scoring.explainability_engine import generate_score_explanation

    if proof is None:
        proof = ProofCollector()
    if repos is None:
        repos = []
    if commits is None:
        commits = []

    skill_depth_normalized = min(skill_depth * 10 + ci_depth_bonus, 100)

    # ── BUG 1 FIX: AI/ML Category Boost for AI Application Developers ──
    # DIP measures ML *construction* depth (training loops, custom losses).
    # But AI App Developers build apps *using* AI APIs (groq, face_recognition, MobileNetV2).
    # Both are legitimate. When Python dominates and ai_ml is present, boost ai_ml.
    if repos and skill_summary.get("ai_ml"):
        repo_langs = [r.get("language", "") for r in repos if r.get("language")]
        python_count = sum(1 for lang in repo_langs if lang and lang.lower() == "python")
        if python_count >= 3 or (repo_langs and python_count / max(len(repo_langs), 1) >= 0.35):
            old_ai_ml = skill_summary["ai_ml"]
            skill_summary["ai_ml"] = min(10.0, skill_summary["ai_ml"] * 1.3)
            log.info(
                f"[Scoring] AI/ML boost applied: ai_ml {old_ai_ml:.1f} → {skill_summary['ai_ml']:.1f} "
                f"(Python repos: {python_count}/{len(repo_langs)})"
            )

    # ── AUTHENTICITY NORMALIZATION (the big fix) ──
    authenticity_normalized = normalize_authenticity(authenticity, repos, commits)

    # ── WEIGHTS (DYNAMIC) ──
    non_fork_repos_for_weights = [r for r in repos if not r.get("is_fork", r.get("fork", False))]
    weights = determine_dynamic_weights(
        years_experience, job_requirements, has_resume,
        account_age_months=account_age_months,
        repos_count=len(non_fork_repos_for_weights),
    )

    raw_scores = {
        "code_quality": code_quality,
        "skill_depth": skill_depth_normalized,
        "authenticity": authenticity_normalized,
        "consistency": consistency,
        "growth": growth,
        "truth": truth_score,
    }

    # ── RISK FLAG PENALTIES ──
    penalty_points_list: List[int] = []
    penalty_details: List[Dict[str, Any]] = []
    for flag in risk_flags:
        sev = flag.get("severity", "LOW").upper()
        if sev == "CRITICAL":
            p = 10
        elif sev == "HIGH":
            p = 5
        elif sev == "MEDIUM":
            p = 2
        else:
            p = 0
        if p > 0:
            penalty_points_list.append(p)
            penalty_details.append({
                "flag": flag.get("flag", flag.get("type", "")),
                "severity": sev,
                "penalty_points": p,
            })

    penalty = sum(penalty_points_list)

    # Cap penalty at 35% of raw score (was 40% — more developer-friendly)
    raw_final_estimate = sum(raw_scores[comp] * w for comp, w in weights.items())
    penalty = min(penalty, int(raw_final_estimate * 0.35))

    # ── EXPLAINABILITY ENGINE ──
    explanation = generate_score_explanation(raw_scores, weights, penalty, penalty_details)
    final = explanation["final_score"]
    score_breakdown = explanation

    # ── MULTI-SOURCE BONUS (capped at +15) ──
    ms_bonus = min(float(multi_source_bonus), 15.0)
    tc_bonus = min(float(test_culture_score), 10.0)
    external_bonus = min(ms_bonus + tc_bonus, 20.0)
    if external_bonus > 0:
        final = min(final + external_bonus, 100.0)
        log.info(f"Applied multi-source bonus: +{ms_bonus:.1f} (external) +{tc_bonus:.1f} (tests) = +{external_bonus:.1f}")

    # ── FIX E: IMPACT SCORING (social proof) ──
    _profile = profile or {}
    impact = compute_impact_score(_profile, repos)
    if impact > 0:
        # Add impact as a weighted bonus (up to +8 points)
        impact_bonus = min(impact * 0.08, 8.0)
        final = min(final + impact_bonus, 100.0)
        log.info(f"Applied impact bonus: +{impact_bonus:.1f} (impact_score={impact:.0f})")

    # Apply impact floor — ensure high-profile devs can't score unreasonably low
    final = apply_impact_floor(final, _profile, repos)

    weighted_contributions = explanation["breakdown"]

    # Benchmark
    benchmark = benchmark_developer(
        final, code_quality, skill_depth, authenticity_normalized, consistency, growth
    )

    # Role fit
    role_fit = detect_role_fit(skill_summary, verified_skills)

    if job_requirements:
        req_skills_str = job_requirements.get("required_skills", "").lower()
        req_skills = [s.strip() for s in req_skills_str.split(",") if s.strip()]
        if req_skills:
            matched = [s for s in req_skills if any(s in vs.get("name", "").lower() for vs in verified_skills)]
            alignment = len(matched) / (len(req_skills) * 1.0)
            role_fit["alignment_score"] = round(float(alignment * 100), 1)
            role_fit["job_requirements_match"] = (
                f"Matched {len(matched)} of {len(req_skills)} requested skills ({', '.join(matched)})."
            )
            final = min(final + (alignment * 5), 100)  # Max 5 point boost

    # Hiring recommendation — now with repo/commit context
    non_fork_repos = [r for r in repos if not r.get("is_fork", r.get("fork", False))]
    hiring_rec = generate_hiring_recommendation(
        final_score=final,
        authenticity_score=authenticity_normalized,
        risk_flags=risk_flags,
        truth_score=truth_score,
        repos_count=len(non_fork_repos),
        commits_count=len(commits),
    )

    # Interview difficulty
    interview_difficulty = predict_interview_difficulty(final, skill_depth, code_quality)

    # Salary estimate
    salary = estimate_salary_range(benchmark["tier"], role_fit["primary_role"], years_experience)

    # Record proof
    proof.add_metric("final_score", final)
    proof.add_metric("authenticity_raw", authenticity)
    proof.add_metric("authenticity_normalized", authenticity_normalized)
    proof.add(
        evidence_type="scoring",
        detail=(
            f"Final={final} | CQ={code_quality:.0f}×{weights['code_quality']}={weighted_contributions['code_quality']} + "
            f"SD={skill_depth_normalized:.0f}×{weights['skill_depth']}={weighted_contributions['skill_depth']} + "
            f"AU={authenticity_normalized:.0f}×{weights['authenticity']}={weighted_contributions['authenticity']} "
            f"[raw_auth={authenticity:.4f}] + "
            f"CO={consistency:.0f}×{weights['consistency']}={weighted_contributions['consistency']} + "
            f"GR={growth:.0f}×{weights['growth']}={weighted_contributions['growth']} + "
            f"TR={truth_score:.0f}×{weights['truth']}={weighted_contributions['truth']} "
            f"- penalty={penalty}"
        ),
    )

    log.info(
        f"Scoring | final={final} auth_raw={authenticity:.4f} "
        f"auth_norm={authenticity_normalized:.1f} penalty={penalty}"
    )

    return {
        "final_score": final,
        "score_breakdown": score_breakdown,
        "benchmark": benchmark,
        "role_fit": role_fit,
        "hiring_recommendation": hiring_rec,
        "interview_difficulty": interview_difficulty,
        "salary_estimate": salary,
        "developer_tier": benchmark["tier"],
        # Debug info — useful for diagnosing future calibration issues
        "_debug": {
            "authenticity_raw": authenticity,
            "authenticity_normalized": authenticity_normalized,
            "repos_count": len(repos),
            "commits_count": len(commits),
            "penalty": penalty,
        },
    }