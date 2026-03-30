
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from utils.logging_config import get_logger
from utils.proof import ProofCollector

log = get_logger("growth")


def _parse_datetime(date_str: str) -> Optional[datetime]:
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        return None


def analyze_activity_timeline(
    commits: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    repos: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """
    Analyze activity density by quarter over the account's lifetime.
    Detect acceleration or deceleration.
    """
    # Collect all dates from commits, events, and repos
    dates: List[datetime] = []

    for c in commits:
        dt = _parse_datetime(c.get("date", ""))
        if dt:
            dates.append(dt)

    for e in events:
        dt = _parse_datetime(e.get("created_at", ""))
        if dt:
            dates.append(dt)

    for r in repos:
        dt = _parse_datetime(r.get("created_at", ""))
        if dt:
            dates.append(dt)

    if not dates:
        return {
            "quarterly_activity": [],
            "trend": "unknown",
            "acceleration": 0,
        }

    dates.sort()

    # Group by quarter
    quarterly: Dict[str, int] = defaultdict(int)
    for dt in dates:
        q = (dt.month - 1) // 3 + 1
        key = f"{dt.year}-Q{q}"
        quarterly[key] += 1

    sorted_quarters = sorted(quarterly.keys())
    quarterly_list = [
        {"quarter": q, "count": quarterly[q]}
        for q in sorted_quarters
    ]

    # Trend analysis: compare first half vs second half
    if len(quarterly_list) >= 4:
        mid = len(quarterly_list) // 2
        first_half_avg = sum(q["count"] for q in quarterly_list[:mid]) / mid
        second_half_avg = sum(q["count"] for q in quarterly_list[mid:]) / (len(quarterly_list) - mid)

        if second_half_avg > first_half_avg * 1.5:
            trend = "accelerating"
        elif second_half_avg > first_half_avg * 1.1:
            trend = "steady_growth"
        elif second_half_avg > first_half_avg * 0.8:
            trend = "steady"
        elif second_half_avg > first_half_avg * 0.5:
            trend = "decelerating"
        else:
            trend = "declining"

        acceleration = round((second_half_avg - first_half_avg) / max(first_half_avg, 1), 2)
    else:
        trend = "insufficient_data"
        acceleration = 0

    proof.add_metric("activity_trend", trend)

    return {
        "quarterly_activity": quarterly_list[-12:],  # Last 12 quarters
        "trend": trend,
        "acceleration": acceleration,
    }


def analyze_complexity_progression(
    repos: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """
    Check if the developer's projects are getting more complex over time.
    Compare early repos (by creation date) to recent ones.
    """
    dated_repos: List[Dict[str, Any]] = []
    for r in repos:
        if r.get("is_fork", False):
            continue
        dt = _parse_datetime(r.get("created_at", ""))
        if dt:
            dated_repos.append({
                "name": r.get("name", ""),
                "created": dt,
                "size": r.get("size", 0),
                "stars": r.get("stars", 0),
                "topics": len(r.get("topics", [])),
                "has_issues": r.get("open_issues", 0) > 0,
                "language": r.get("language", ""),
            })

    if len(dated_repos) < 4:
        return {"progression": "insufficient_data", "early_avg_size": 0, "recent_avg_size": 0}

    dated_repos.sort(key=lambda r: r["created"])

    mid = len(dated_repos) // 2
    early_repos = dated_repos[:mid]
    recent_repos = dated_repos[mid:]

    # Size comparison
    early_avg_size = sum(r["size"] for r in early_repos) / len(early_repos)
    recent_avg_size = sum(r["size"] for r in recent_repos) / len(recent_repos)

    # Complexity signals
    early_complexity = sum(
        (1 if r["size"] > 1000 else 0) +
        (1 if r["topics"] > 0 else 0) +
        (1 if r["has_issues"] else 0)
        for r in early_repos
    ) / len(early_repos)

    recent_complexity = sum(
        (1 if r["size"] > 1000 else 0) +
        (1 if r["topics"] > 0 else 0) +
        (1 if r["has_issues"] else 0)
        for r in recent_repos
    ) / len(recent_repos)

    if recent_complexity > early_complexity * 1.5:
        progression = "significant_growth"
    elif recent_complexity > early_complexity * 1.1:
        progression = "moderate_growth"
    elif recent_complexity >= early_complexity * 0.8:
        progression = "stable"
    else:
        progression = "declining"

    proof.add_metric("complexity_progression", progression)

    return {
        "progression": progression,
        "early_avg_size": round(early_avg_size),
        "recent_avg_size": round(recent_avg_size),
        "early_avg_complexity": round(early_complexity, 2),
        "recent_avg_complexity": round(recent_complexity, 2),
    }


def analyze_tech_evolution(
    repos: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """
    Track when new languages/frameworks were adopted.
    More recent adoption = actively learning.
    """
    now = datetime.now(timezone.utc)

    # Language first-seen timeline
    lang_first_seen: Dict[str, datetime] = {}

    for r in repos:
        lang = r.get("language", "")
        if not lang:
            continue
        dt = _parse_datetime(r.get("created_at", ""))
        if dt:
            if lang not in lang_first_seen or dt < lang_first_seen[lang]:
                lang_first_seen[lang] = dt

    if not lang_first_seen:
        return {"tech_timeline": [], "recent_adoptions": [], "evolution_score": 0}

    # Sort by first seen
    timeline = sorted(
        [
            {
                "language": lang,
                "first_used": dt.isoformat(),
                "years_ago": round((now - dt).days / 365.25, 1),
            }
            for lang, dt in lang_first_seen.items()
        ],
        key=lambda x: x["years_ago"],
        reverse=True,
    )

    # Recent adoptions (within last 2 years)
    recent_adoptions = [
        t["language"] for t in timeline if t["years_ago"] <= 2
    ]

    # Evolution score: bonus for learning new things recently
    evolution_score = 0
    if len(recent_adoptions) >= 3:
        evolution_score = 30
    elif len(recent_adoptions) >= 2:
        evolution_score = 20
    elif len(recent_adoptions) >= 1:
        evolution_score = 10

    # Total diversity bonus
    if len(lang_first_seen) >= 7:
        evolution_score += 20
    elif len(lang_first_seen) >= 4:
        evolution_score += 10

    if recent_adoptions:
        proof.add(
            evidence_type="growth",
            detail=f"Recently adopted technologies: {', '.join(recent_adoptions[:5])}",
        )

    return {
        "tech_timeline": timeline[:15],
        "recent_adoptions": recent_adoptions,
        "total_languages": len(lang_first_seen),
        "evolution_score": min(evolution_score, 50),
    }


# ═══════════════════════════════════════════════════════
#  CONTRIBUTION STREAKS (migrated from intelligence_engine.py)
# ═══════════════════════════════════════════════════════

def calculate_streaks(
    commits: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Calculate contribution streaks from commits and events."""
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
    current_streak = 1

    for i in range(1, len(sorted_weeks)):
        prev_year, prev_week = sorted_weeks[i - 1]
        curr_year, curr_week = sorted_weeks[i]

        try:
            prev_date = datetime.strptime(f"{prev_year}-W{prev_week:02d}-1", "%G-W%V-%u").date()
            curr_date = datetime.strptime(f"{curr_year}-W{curr_week:02d}-1", "%G-W%V-%u").date()

            if (curr_date - prev_date).days <= 7:
                current_streak += 1
                longest_streak = max(longest_streak, current_streak)
            else:
                current_streak = 1
        except Exception:
            current_streak = 1

    # Current streak
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
#  MASTER GROWTH SCORE
# ═══════════════════════════════════════════════════════

def run_growth_engine(
    repos: List[Dict[str, Any]],
    commits: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    proof: Optional[ProofCollector] = None,
) -> Dict[str, Any]:
    """
    Master function: compute growth score.

    Growth Score formula:
      30% activity trend (accelerating = high)
      25% complexity progression
      25% tech evolution
      20% streak bonus
    """
    if proof is None:
        proof = ProofCollector()

    timeline = analyze_activity_timeline(commits, events, repos, proof)
    complexity = analyze_complexity_progression(repos, proof)
    tech = analyze_tech_evolution(repos, proof)
    streaks = calculate_streaks(commits, events)

    # Activity trend score (0-100)
    trend_scores = {
        "accelerating": 100,
        "steady_growth": 75,
        "steady": 50,
        "decelerating": 30,
        "declining": 10,
        "insufficient_data": 40,
        "unknown": 30,
    }
    trend_score = trend_scores.get(timeline["trend"], 30)

    # Complexity progression score (0-100)
    progression_scores = {
        "significant_growth": 100,
        "moderate_growth": 70,
        "stable": 50,
        "declining": 20,
        "insufficient_data": 40,
    }
    progression_score = progression_scores.get(complexity["progression"], 40)

    # Tech evolution score (0-100)
    tech_score = min(tech["evolution_score"] * 2, 100)

    # Streak score (0-100)
    streak_score = 0
    if streaks["longest_streak_weeks"] >= 12:
        streak_score = 100
    elif streaks["longest_streak_weeks"] >= 8:
        streak_score = 75
    elif streaks["longest_streak_weeks"] >= 4:
        streak_score = 50
    elif streaks["longest_streak_weeks"] >= 2:
        streak_score = 25

    growth_score = round(
        0.30 * trend_score +
        0.25 * progression_score +
        0.25 * tech_score +
        0.20 * streak_score,
        1,
    )

    growth_score = max(0, min(100, growth_score))

    # Learning curve classification
    if growth_score >= 75:
        learning_curve = "Accelerating"
    elif growth_score >= 50:
        learning_curve = "Steady"
    elif growth_score >= 30:
        learning_curve = "Flat"
    else:
        learning_curve = "Decelerating"

    proof.add_metric("growth_score", growth_score)

    return {
        "growth_score": growth_score,
        "learning_curve": learning_curve,
        "activity_timeline": timeline,
        "complexity_progression": complexity,
        "tech_evolution": tech,
        "contribution_streaks": streaks,
    }
