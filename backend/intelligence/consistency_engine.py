
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from utils.logging_config import get_logger
from utils.proof import ProofCollector

log = get_logger("consistency")


def _parse_datetime(date_str: str) -> Optional[datetime]:
    """Safely parse ISO datetime strings."""
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        return None


def _collect_activity_dates(
    commits: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    repos: Optional[List[Dict[str, Any]]] = None,
) -> List[datetime]:
    """Collect and sort all activity dates from commits, events, and repos."""
    dates: List[datetime] = []

    for c in commits:
        dt = _parse_datetime(c.get("date", ""))
        if dt:
            dates.append(dt)

    for e in events:
        dt = _parse_datetime(e.get("created_at", ""))
        if dt:
            dates.append(dt)

    if repos:
        for r in repos:
            for field in ("pushed_at", "updated_at"):
                dt = _parse_datetime(r.get(field, ""))
                if dt:
                    dates.append(dt)

    dates.sort()
    return dates


# ═══════════════════════════════════════════════════════
#  COMMIT INTERVAL VARIANCE ANALYSIS
# ═══════════════════════════════════════════════════════

def analyze_commit_interval_variance(
    commits: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """
    Statistical analysis of commit interval distribution.

    Measures:
      - Mean interval between commits (seconds)
      - Standard deviation of intervals
      - Coefficient of variation (CV) — key consistency metric
      - Median interval (robust to outliers)
      - Interquartile range (IQR)

    Low CV + reasonable mean = consistent developer.
    High CV = sporadic/bursty activity.
    """
    dates: List[datetime] = []
    for c in commits:
        dt = _parse_datetime(c.get("date", ""))
        if dt:
            dates.append(dt)

    if len(dates) < 5:
        return {
            "mean_interval_hours": 0,
            "std_dev_hours": 0,
            "coefficient_of_variation": 0,
            "median_interval_hours": 0,
            "iqr_hours": 0,
            "total_commits_analyzed": len(dates),
            "variance_rating": "insufficient_data",
        }

    dates.sort()
    intervals_sec = [(dates[i] - dates[i - 1]).total_seconds() for i in range(1, len(dates))]

    # Filter out outlier gaps > 90 days for core variance calculation
    # (we handle gaps separately)
    core_intervals = [x for x in intervals_sec if x < 90 * 86400]
    if not core_intervals:
        core_intervals = intervals_sec

    n = len(core_intervals)
    mean = sum(core_intervals) / n
    variance = sum((x - mean) ** 2 for x in core_intervals) / n
    std_dev = math.sqrt(variance)
    cv = std_dev / mean if mean > 0 else 0

    # Median
    sorted_intervals = sorted(core_intervals)
    median = sorted_intervals[n // 2]

    # IQR
    q1 = sorted_intervals[n // 4] if n >= 4 else sorted_intervals[0]
    q3 = sorted_intervals[3 * n // 4] if n >= 4 else sorted_intervals[-1]
    iqr = q3 - q1

    # Variance rating
    if cv < 0.5:
        variance_rating = "very_consistent"
    elif cv < 1.0:
        variance_rating = "consistent"
    elif cv < 1.5:
        variance_rating = "moderate"
    elif cv < 2.5:
        variance_rating = "sporadic"
    else:
        variance_rating = "highly_irregular"

    mean_hours = round(mean / 3600, 1)
    std_hours = round(std_dev / 3600, 1)
    median_hours = round(median / 3600, 1)
    iqr_hours = round(iqr / 3600, 1)

    proof.add_metric("commit_interval_cv", round(cv, 3))
    proof.add_metric("commit_interval_mean_hours", mean_hours)

    return {
        "mean_interval_hours": mean_hours,
        "std_dev_hours": std_hours,
        "coefficient_of_variation": round(cv, 3),
        "median_interval_hours": median_hours,
        "iqr_hours": iqr_hours,
        "total_commits_analyzed": len(dates),
        "variance_rating": variance_rating,
    }


# ═══════════════════════════════════════════════════════
#  ACTIVITY STABILITY ANALYSIS
# ═══════════════════════════════════════════════════════

def analyze_activity_stability(
    commits: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    repos: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """
    Compute activity stability as a smoothed density metric.

    Activity stability (0-1) = how uniform the developer's activity
    is over their active timespan. Measured by weekly activity counts
    normalized against the ideal (uniform) distribution.

    1.0 = perfectly uniform activity every week
    0.0 = all activity in a single burst
    """
    dates = _collect_activity_dates(commits, events, repos)

    if len(dates) < 4:
        return {
            "stability_score": 0.5,
            "active_weeks": 0,
            "total_weeks_span": 0,
            "active_weeks_ratio": 0,
            "weekly_activity_cv": 0,
        }

    min_date = dates[0]
    max_date = dates[-1]
    total_span_days = max((max_date - min_date).days, 1)
    total_weeks = max(total_span_days // 7, 1)

    # Count activities per week
    weekly_counts: Dict[int, int] = defaultdict(int)
    for dt in dates:
        week_num = (dt - min_date).days // 7
        weekly_counts[week_num] += 1

    active_weeks = len(weekly_counts)
    active_weeks_ratio = active_weeks / max(total_weeks, 1)

    # Build full weekly vector (including zero weeks)
    full_vector = [weekly_counts.get(w, 0) for w in range(total_weeks)]

    # CV of weekly activity
    if len(full_vector) >= 2:
        mean_weekly = sum(full_vector) / len(full_vector)
        if mean_weekly > 0:
            var = sum((v - mean_weekly) ** 2 for v in full_vector) / len(full_vector)
            weekly_cv = math.sqrt(var) / mean_weekly
        else:
            weekly_cv = 0
    else:
        weekly_cv = 0

    # Stability score: penalize high CV and low active ratio
    # stability = active_weeks_ratio * (1 / (1 + weekly_cv))
    # This normalizes between 0 and 1
    stability = active_weeks_ratio / (1 + weekly_cv * 0.5)
    stability = max(0.0, min(1.0, stability))

    proof.add_metric("activity_stability", round(stability, 3))
    proof.add_metric("active_weeks_ratio", round(active_weeks_ratio, 3))

    return {
        "stability_score": round(stability, 3),
        "active_weeks": active_weeks,
        "total_weeks_span": total_weeks,
        "active_weeks_ratio": round(active_weeks_ratio, 3),
        "weekly_activity_cv": round(weekly_cv, 3),
    }


# ═══════════════════════════════════════════════════════
#  INACTIVITY GAP DETECTION
# ═══════════════════════════════════════════════════════

def analyze_inactivity_gaps(
    commits: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    repos: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """
    Detect inactivity gaps — periods with zero contributions.

    Returns the largest gap in days, total gap count exceeding thresholds,
    and monthly activity map for the last 24 months.
    """
    now = datetime.now(timezone.utc)
    dates = _collect_activity_dates(commits, events, repos)

    if not dates:
        return {
            "largest_gap_days": 0,
            "gap_count_30d": 0,
            "gap_count_60d": 0,
            "gap_count_90d": 0,
            "active_months_24": 0,
            "total_months_24": 24,
            "active_months_ratio": 0,
        }

    # Direct gap analysis from sorted activity dates
    all_gaps_days: List[int] = []
    for i in range(1, len(dates)):
        gap = (dates[i] - dates[i - 1]).days
        if gap > 0:
            all_gaps_days.append(gap)

    largest_gap = max(all_gaps_days) if all_gaps_days else 0
    gap_count_30 = sum(1 for g in all_gaps_days if g >= 30)
    gap_count_60 = sum(1 for g in all_gaps_days if g >= 60)
    gap_count_90 = sum(1 for g in all_gaps_days if g >= 90)

    # Monthly activity check (last 24 months)
    monthly_active: Dict[str, bool] = {}
    for i in range(24):
        month = now.month - i
        year = now.year
        while month <= 0:
            month += 12
            year -= 1
        monthly_active[f"{year}-{month:02d}"] = False

    for dt in dates:
        key = f"{dt.year}-{dt.month:02d}"
        if key in monthly_active:
            monthly_active[key] = True

    active_months = sum(1 for v in monthly_active.values() if v)
    active_months_ratio = active_months / 24

    if largest_gap >= 180:
        proof.add(
            evidence_type="consistency_flag",
            detail=f"Largest inactivity gap: {largest_gap} days (~{largest_gap // 30} months)",
        )

    return {
        "largest_gap_days": largest_gap,
        "gap_count_30d": gap_count_30,
        "gap_count_60d": gap_count_60,
        "gap_count_90d": gap_count_90,
        "active_months_24": active_months,
        "total_months_24": 24,
        "active_months_ratio": round(active_months_ratio, 3),
    }


# ═══════════════════════════════════════════════════════
#  REPOSITORY COMPLETION RATIO
# ═══════════════════════════════════════════════════════

def analyze_repo_completion(
    repos: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """
    Compute repo completion ratio.

    A "complete" repo meets >=3 of:
      - Has description (>5 chars)
      - Has substantive size (>100 KB)
      - Has topics/tags
      - Updated within last 365 days
      - Has README (inferred from size + description)

    An "abandoned" repo meets <=1 signals AND no updates in 180+ days.
    """
    now = datetime.now(timezone.utc)
    originals = [r for r in repos if not r.get("is_fork", r.get("fork", False))]

    if not originals:
        return {
            "completion_ratio": 0,
            "completed": 0,
            "in_progress": 0,
            "abandoned": 0,
            "total_original": 0,
        }

    completed = 0
    in_progress = 0
    abandoned = 0

    for r in originals:
        has_desc = bool(r.get("description") and len(r.get("description", "")) > 5)
        has_size = r.get("size", 0) > 100
        has_topics = len(r.get("topics", [])) >= 1
        has_stars = r.get("stars", r.get("stargazers_count", 0)) > 0

        pushed = _parse_datetime(r.get("pushed_at", ""))
        days_since = (now - pushed).days if pushed else 999
        recently_updated = days_since < 365

        signals = sum([has_desc, has_size, has_topics, recently_updated, has_stars])

        if signals >= 3:
            completed += 1
        elif signals >= 2 and days_since < 180:
            in_progress += 1
        elif signals <= 1 and days_since > 180:
            abandoned += 1
        else:
            in_progress += 1

    total = len(originals)
    completion_ratio = completed / max(total, 1)

    if completion_ratio < 0.25 and total > 5:
        proof.add(
            evidence_type="consistency_flag",
            detail=f"Low repo completion: {completion_ratio:.0%} ({completed}/{total} originals complete)",
        )

    return {
        "completion_ratio": round(completion_ratio, 3),
        "completed": completed,
        "in_progress": in_progress,
        "abandoned": abandoned,
        "total_original": total,
    }


# ═══════════════════════════════════════════════════════
#  STREAK CONSISTENCY
# ═══════════════════════════════════════════════════════

def analyze_streak_consistency(
    commits: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Calculate contribution streaks from commits and events.

    Measures:
      - Current streak (consecutive weeks with activity)
      - Longest streak (all-time)
      - Total active days
    """
    activity_dates = set()

    for e in events:
        dt = _parse_datetime(e.get("created_at", ""))
        if dt:
            activity_dates.add(dt.date())

    for c in commits:
        dt = _parse_datetime(c.get("date", ""))
        if dt:
            activity_dates.add(dt.date())

    if not activity_dates:
        return {
            "current_streak_weeks": 0,
            "longest_streak_weeks": 0,
            "total_active_days": 0,
        }

    sorted_dates = sorted(activity_dates)
    today = datetime.now(timezone.utc).date()

    # Weekly streaks
    active_weeks = set()
    for d in sorted_dates:
        active_weeks.add(d.isocalendar()[:2])

    sorted_weeks = sorted(active_weeks)

    longest_streak = 1
    current_run = 1

    for i in range(1, len(sorted_weeks)):
        prev_year, prev_week = sorted_weeks[i - 1]
        curr_year, curr_week = sorted_weeks[i]

        try:
            prev_date = datetime.strptime(f"{prev_year}-W{prev_week:02d}-1", "%G-W%V-%u").date()
            curr_date = datetime.strptime(f"{curr_year}-W{curr_week:02d}-1", "%G-W%V-%u").date()

            if (curr_date - prev_date).days <= 7:
                current_run += 1
                longest_streak = max(longest_streak, current_run)
            else:
                current_run = 1
        except Exception:
            current_run = 1

    # Current streak (from today backward)
    this_week = today.isocalendar()[:2]
    last_week = (today - timedelta(days=7)).isocalendar()[:2]

    is_active = this_week in active_weeks or last_week in active_weeks
    current_active_streak = 0

    if is_active:
        current_active_streak = 1
        check_date = today
        while True:
            check_date -= timedelta(days=7)
            week_key = check_date.isocalendar()[:2]
            if week_key in active_weeks:
                current_active_streak += 1
            else:
                break

    return {
        "current_streak_weeks": current_active_streak,
        "longest_streak_weeks": longest_streak,
        "total_active_days": len(activity_dates),
    }


# ═══════════════════════════════════════════════════════
#  MASTER CONSISTENCY ENGINE
# ═══════════════════════════════════════════════════════

def run_consistency_engine(
    repos: List[Dict[str, Any]],
    commits: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    proof: Optional[ProofCollector] = None,
) -> Dict[str, Any]:
    """
    Master function: compute deep consistency score.

    Consistency Score formula:
      25% commit interval consistency (inverted CV)
      25% activity stability
      25% gap penalty (inverted gap severity)
      15% repo completion ratio
      10% streak bonus

    Output:
      {
        "consistency_score": float (0-100),
        "activity_stability": float (0-1),
        "largest_gap_days": int,
        "completion_ratio": float (0-1),
        "commit_interval_variance": float,
        "streak_weeks": int,
        "risk_flags": [{"type": str, "severity": str, "detail": str}]
      }
    """
    if proof is None:
        proof = ProofCollector()

    # ─── Run sub-analyses ───
    interval = analyze_commit_interval_variance(commits, proof)
    stability = analyze_activity_stability(commits, events, repos, proof)
    gaps = analyze_inactivity_gaps(commits, events, repos, proof)
    completion = analyze_repo_completion(repos, proof)
    streaks = analyze_streak_consistency(commits, events)

    # ─── Component Scores (0-100) ───

    # 1. Interval consistency: lower CV = better
    cv = interval["coefficient_of_variation"]
    if interval["variance_rating"] == "insufficient_data":
        interval_score = 40  # neutral
    else:
        # Map CV to score: CV=0 → 100, CV=1 → 50, CV=2 → 25, CV=3+ → 10
        interval_score = max(10, min(100, 100 / (1 + cv)))

    # 2. Activity stability (already 0-1, scale to 100)
    stability_score = stability["stability_score"] * 100

    # 3. Gap penalty: larger gaps = lower score
    largest_gap = gaps["largest_gap_days"]
    if largest_gap <= 14:
        gap_score = 100
    elif largest_gap <= 30:
        gap_score = 80
    elif largest_gap <= 60:
        gap_score = 60
    elif largest_gap <= 90:
        gap_score = 45
    elif largest_gap <= 180:
        gap_score = 25
    elif largest_gap <= 365:
        gap_score = 10
    else:
        gap_score = 5

    # Boost gap score if active months ratio is high despite gaps
    if gaps["active_months_ratio"] > 0.7:
        gap_score = min(100, gap_score + 15)

    # 4. Completion ratio (0-1, scale to 100)
    completion_score = completion["completion_ratio"] * 100

    # 5. Streak bonus (0-100)
    streak_weeks = streaks["longest_streak_weeks"]
    if streak_weeks >= 16:
        streak_score = 100
    elif streak_weeks >= 12:
        streak_score = 85
    elif streak_weeks >= 8:
        streak_score = 70
    elif streak_weeks >= 4:
        streak_score = 50
    elif streak_weeks >= 2:
        streak_score = 30
    else:
        streak_score = 10

    # ─── WEIGHTED FORMULA ───
    consistency_score = round(
        0.25 * interval_score +
        0.25 * stability_score +
        0.25 * gap_score +
        0.15 * completion_score +
        0.10 * streak_score,
        1,
    )
    consistency_score = max(0, min(100, consistency_score))

    # ─── Risk Flags ───
    risk_flags: List[Dict[str, str]] = []

    if largest_gap >= 180:
        risk_flags.append({
            "type": "extended_inactivity",
            "severity": "HIGH",
            "detail": f"Largest gap: {largest_gap} days (~{largest_gap // 30} months of inactivity)",
        })
    elif largest_gap >= 90:
        risk_flags.append({
            "type": "significant_gap",
            "severity": "MEDIUM",
            "detail": f"Largest gap: {largest_gap} days (~{largest_gap // 30} months)",
        })

    if completion["completion_ratio"] < 0.25 and completion["total_original"] > 5:
        risk_flags.append({
            "type": "low_completion",
            "severity": "MEDIUM",
            "detail": f"Only {completion['completion_ratio']:.0%} of repos appear complete ({completion['completed']}/{completion['total_original']})",
        })

    if interval["variance_rating"] in ("sporadic", "highly_irregular"):
        risk_flags.append({
            "type": "irregular_commits",
            "severity": "MEDIUM",
            "detail": f"Commit pattern is {interval['variance_rating']} (CV={cv:.2f})",
        })

    if stability["stability_score"] < 0.15:
        risk_flags.append({
            "type": "low_stability",
            "severity": "HIGH",
            "detail": f"Activity stability very low ({stability['stability_score']:.2f}) — near-zero sustained activity",
        })

    if completion["abandoned"] > 5:
        risk_flags.append({
            "type": "many_abandoned_repos",
            "severity": "MEDIUM",
            "detail": f"{completion['abandoned']} repos appear abandoned",
        })

    proof.add_metric("consistency_score", consistency_score)

    return {
        # Primary output
        "consistency_score": consistency_score,
        "activity_stability": stability["stability_score"],
        "largest_gap_days": largest_gap,
        "completion_ratio": completion["completion_ratio"],
        "commit_interval_variance": cv,
        "streak_weeks": streaks["longest_streak_weeks"],
        "risk_flags": risk_flags,

        # Detailed sub-analyses (for report/debugging)
        "commit_interval": interval,
        "stability_analysis": stability,
        "gap_analysis": gaps,
        "repo_completion": completion,
        "streak_analysis": streaks,

        # Legacy compat
        "commit_regularity": {
            "regularity_score": round(interval_score, 1),
            "weekly_variance": stability["weekly_activity_cv"],
            "active_weeks": stability["active_weeks"],
            "total_weeks_span": stability["total_weeks_span"],
            "active_weeks_ratio": stability["active_weeks_ratio"],
        },
        "activity_gaps": {
            "gap_count": gaps["gap_count_30d"],
            "longest_gap_days": largest_gap,
            "longest_gap_months": largest_gap // 30,
            "active_months": gaps["active_months_24"],
            "total_months": 24,
            "active_months_ratio": gaps["active_months_ratio"],
        },
        "risk_indicators": [f["detail"] for f in risk_flags],
    }


# ═══════════════════════════════════════════════════════
#  CROSS-REPO INTELLIGENCE
# ═══════════════════════════════════════════════════════

def analyze_cross_repo_patterns(
    code_results: List[Dict[str, Any]],
    proof: Optional[ProofCollector] = None
) -> Dict[str, Any]:
    """
    Global analysis for repeated patterns, tech consistency, and skill evolution 
    across the entire profile.
    """
    if not code_results:
        return {"pattern_diversity": 0.0, "cross_repo_flags": [], "architectural_distribution": {}}

    architectures = [
        cr.get("project_structure", {}).get("architecture_type", "Unknown")
        for cr in code_results
    ]
    architectures = [a for a in architectures if a and a != "Unknown"]

    unique_archs = len(set(architectures))
    total_archs = len(architectures)

    # Diversity score (0.0 to 1.0)
    diversity = 0.0
    if total_archs > 0:
        # e.g., if total=3, unique=3 -> diversity=1.0. If unique=1 -> 0.33
        diversity = round(min(1.0, unique_archs / min(total_archs, 3)), 2)

    flags = []
    if total_archs >= 3 and unique_archs == 1:
        flags.append({
            "type": "architectural_monoculture", 
            "severity": "LOW",
            "detail": f"Relies exclusively on a single architecture ({architectures[0]}) across {total_archs} non-trivial repositories."
        })

    if proof:
        proof.add_metric("cross_repo_diversity", diversity)
        for flag in flags:
            proof.add(evidence_type="cross_repo_flag", detail=flag.get("detail", ""))

    return {
        "pattern_diversity": diversity,
        "unique_architectures": unique_archs,
        "cross_repo_flags": flags,
        "architectural_distribution": dict(Counter(architectures))
    }

