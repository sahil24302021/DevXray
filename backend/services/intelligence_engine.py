from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from collections import Counter
import re
import math


# ═══════════════════════════════════════════════════════
# SCORING DIMENSIONS
# ═══════════════════════════════════════════════════════

def calculate_contribution_depth(repos: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(repos)
    if total == 0:
        return {"score": 0, "insight": "No data"}

    active = [r for r in repos if r.get("size", 0) > 100]
    substantial = [r for r in repos if r.get("size", 0) > 1000]
    heavy = [r for r in repos if r.get("size", 0) > 10000]
    massive = [r for r in repos if r.get("size", 0) > 50000]

    # Logarithmic sizing — a 100MB repo is impressive but not 100x more than a 1MB repo
    log_sizes = [math.log10(max(r.get("size", 1), 1)) for r in repos]
    avg_log_size = sum(log_sizes) / len(log_sizes)

    ratio = len(active) / total
    depth_ratio = len(substantial) / total
    heavy_ratio = len(heavy) / total if total > 0 else 0
    massive_ratio = len(massive) / total if total > 0 else 0

    # Factor in watchers and forks received (quality signals)
    total_watchers = sum(r.get("watchers", 0) for r in repos)
    total_forks = sum(r.get("forks", 0) for r in repos)
    community_signal = min(math.log10(max(total_watchers + total_forks, 1)) * 2, 5)

    score = min(int(
        (ratio * 10)
        + (depth_ratio * 8)
        + (heavy_ratio * 5)
        + (massive_ratio * 3)
        + (avg_log_size * 1.5)
        + community_signal
    ), 30)

    if score >= 25:
        insight = "Elite contributor with massive, production-grade codebases and strong community traction"
    elif score >= 18:
        insight = "Deep, production-grade contributor with substantial codebases"
    elif score >= 12:
        insight = "Substantial contributor — meaningful code depth across projects"
    elif score >= 6:
        insight = "Moderate depth — mix of substantial and lightweight projects"
    else:
        insight = "Surface-level contributor — mostly small or empty repos"

    return {"score": score, "insight": insight}


def calculate_ownership_score(repos: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not repos:
        return {"score": 0, "insight": "No repos", "original_count": 0, "fork_count": 0}

    total = len(repos)
    forks = sum(1 for r in repos if r.get("is_fork", r.get("fork", False)))
    originals = total - forks

    # Check for repos with actual star activity (quality originals)
    starred_originals = sum(
        1 for r in repos
        if not r.get("is_fork", r.get("fork", False)) and r.get("stars", 0) > 0
    )

    ownership_ratio = 1.0 - (forks / total)

    score = int(20 * ownership_ratio)

    # Bonus for starred originals
    if starred_originals >= 5:
        score = min(score + 3, 20)
    elif starred_originals >= 2:
        score = min(score + 1, 20)

    if ownership_ratio < 0.3:
        score = max(score - 5, 0)

    # Detect "clone farm" — many repos with identical sizes
    sizes = [r.get("size", 0) for r in repos if not r.get("is_fork", False)]
    if len(sizes) > 5:
        unique_sizes = len(set(sizes))
        if unique_sizes < len(sizes) * 0.5:
            score = max(score - 3, 0)

    if ownership_ratio >= 0.8:
        insight = "Strong original creator — builds from scratch"
    elif ownership_ratio >= 0.5:
        insight = "Mixed ownership — some original work, some forks"
    else:
        insight = "Primarily fork-based — limited original projects"

    return {"score": score, "insight": insight, "original_count": originals, "fork_count": forks}


def calculate_activity_consistency(repos: List[Dict[str, Any]], events: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not repos:
        return {"score": 0, "insight": "No activity", "monthly_activity": []}

    now = datetime.now(timezone.utc)
    recent_6m = 0
    recent_1y = 0

    # Monthly activity aggregation (last 12 months)
    monthly_counts = {}
    for i in range(12):
        month = now.month - i
        year = now.year
        if month <= 0:
            month += 12
            year -= 1
        key = f"{year}-{month:02d}"
        monthly_counts[key] = 0

    for r in repos:
        updated = r.get("pushed_at") or r.get("updated_at")
        if updated:
            try:
                dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                days = (now - dt).days
                if days < 180:
                    recent_6m += 1
                if days < 365:
                    recent_1y += 1
                key = f"{dt.year}-{dt.month:02d}"
                if key in monthly_counts:
                    monthly_counts[key] += 1
            except Exception:
                pass

    # Also count events
    for e in events:
        created = e.get("created_at")
        if created:
            try:
                dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                key = f"{dt.year}-{dt.month:02d}"
                if key in monthly_counts:
                    monthly_counts[key] += 1
            except Exception:
                pass

    total = len(repos)
    ratio_6m = recent_6m / total if total > 0 else 0
    ratio_1y = recent_1y / total if total > 0 else 0

    # Event diversity bonus
    event_types = set(e.get("type") for e in events)
    diversity_bonus = min(len(event_types), 5)

    # Active months bonus (consistent != bursts)
    active_months = sum(1 for v in monthly_counts.values() if v > 0)
    consistency_bonus = min(active_months, 6)

    score = max(0, min(int(ratio_6m * 10 + ratio_1y * 3 + diversity_bonus + consistency_bonus), 20))

    # Generate sorted monthly activity list
    monthly_activity = [
        {"month": k, "count": v}
        for k, v in sorted(monthly_counts.items())
    ]

    if ratio_6m > 0.4 and active_months >= 8:
        insight = "Highly active — consistent recent engagement across repos"
    elif ratio_6m > 0.3:
        insight = "Active developer with regular contributions"
    elif ratio_1y > 0.4:
        insight = "Moderately active within the past year"
    else:
        insight = "Low recent activity — may be inactive or private-focused"

    return {"score": score, "insight": insight, "monthly_activity": monthly_activity}


def calculate_project_complexity(repos: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not repos:
        return {"score": 0, "level": "Basic", "insight": "No projects"}

    sizes = [r.get("size", 0) for r in repos]
    avg_size = sum(sizes) / len(sizes)
    max_size = max(sizes)

    has_issues = any(r.get("open_issues", 0) > 5 for r in repos)
    has_topics = any(len(r.get("topics", [])) >= 3 for r in repos)
    has_wiki = any(r.get("has_wiki", False) for r in repos)
    has_pages = any(r.get("has_pages", False) for r in repos)

    # Multi-language repos suggest complexity
    multi_lang_repos = sum(1 for r in repos if r.get("language") and r.get("size", 0) > 5000)

    score = 5
    if avg_size > 15000:
        score = 14
    elif avg_size > 5000:
        score = 10
    elif avg_size > 2000:
        score = 7

    if has_issues:
        score = min(score + 2, 15)
    if has_topics:
        score = min(score + 1, 15)
    if max_size > 50000:
        score = min(score + 2, 15)
    if has_pages:
        score = min(score + 1, 15)
    if multi_lang_repos > 3:
        score = min(score + 1, 15)

    if score >= 13:
        level, insight = "Advanced", "Builds production-grade complex systems"
    elif score >= 9:
        level, insight = "Intermediate", "Works on moderate complexity projects"
    else:
        level, insight = "Basic", "Mostly simple or tutorial-level repos"

    return {"score": score, "level": level, "insight": insight}


def calculate_language_diversity(repos: List[Dict[str, Any]], language_bytes: Dict[str, int]) -> Dict[str, Any]:
    """Use actual LOC-based language data when available."""
    if language_bytes:
        total_bytes = sum(language_bytes.values())
        # Sort by bytes desc
        sorted_langs = sorted(language_bytes.items(), key=lambda x: x[1], reverse=True)
        languages = [lang for lang, _ in sorted_langs]
        language_breakdown = [
            {
                "language": lang,
                "bytes": bytes_count,
                "percentage": round((bytes_count / total_bytes) * 100, 1) if total_bytes > 0 else 0,
            }
            for lang, bytes_count in sorted_langs[:15]
        ]
        count = len(languages)
    else:
        langs = {r.get("language") for r in repos if r.get("language")}
        languages = sorted(langs)
        count = len(langs)
        language_breakdown = [
            {"language": lang, "bytes": 0, "percentage": round(100 / count, 1) if count > 0 else 0}
            for lang in languages[:15]
        ]

    score = min(count * 2 + (1 if count >= 3 else 0) + (2 if count >= 6 else 0), 15)

    if count >= 7:
        insight = "Polyglot developer — extensive tech stack mastery"
    elif count >= 4:
        insight = "Versatile — comfortable across multiple languages"
    elif count >= 2:
        insight = "Decent range — focused on a few technologies"
    else:
        insight = "Narrow specialization — single-language focus"

    return {
        "score": score,
        "languages": languages[:10],
        "count": count,
        "insight": insight,
        "language_breakdown": language_breakdown,
    }


# ═══════════════════════════════════════════════════════
# COMMIT INTELLIGENCE
# ═══════════════════════════════════════════════════════

def analyze_commit_patterns(commits: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Deep analysis of commit messages and patterns."""
    if not commits:
        return {
            "total_analyzed": 0,
            "quality_score": 0,
            "avg_message_length": 0,
            "conventional_ratio": 0,
            "lazy_commit_ratio": 0,
            "patterns": [],
            "insight": "No commits available for analysis",
            "avg_words_per_commit": 0,
            "peak_hours": {},
            "day_distribution": {},
        }

    messages = [c.get("message", "") for c in commits]
    total = len(messages)

    # Message length analysis
    lengths = [len(m.split("\n")[0]) for m in messages]  # First line only
    avg_length = sum(lengths) / total if total > 0 else 0

    # Conventional commits detection (feat:, fix:, chore:, etc.)
    conventional_pattern = re.compile(r'^(feat|fix|chore|docs|style|refactor|test|build|ci|perf|revert)(\(.+\))?:', re.IGNORECASE)
    conventional_count = sum(1 for m in messages if conventional_pattern.match(m))
    conventional_ratio = conventional_count / total if total > 0 else 0

    # Lazy commit detection ("fix", "update", "asdf", single word, etc.)
    lazy_patterns = re.compile(r'^(fix|update|test|wip|done|stuff|changes|commit|initial|first|\.|\-|asdf|temp|tmp|abc|xxx)$', re.IGNORECASE)
    lazy_count = sum(1 for m in messages if lazy_patterns.match(m.split("\n")[0].strip()))
    short_count = sum(1 for m in messages if len(m.split("\n")[0].strip()) < 5)
    lazy_total = lazy_count + short_count
    lazy_ratio = lazy_total / total if total > 0 else 0

    # Commit message word count analysis
    word_counts = [len(m.split()) for m in messages]
    avg_words = sum(word_counts) / total if total > 0 else 0

    # Detect repetitive messages (same message used multiple times)
    message_counter = Counter(m.split("\n")[0].strip().lower() for m in messages)
    repeated = sum(count for msg, count in message_counter.items() if count > 2 and len(msg) < 30)
    repetitive_ratio = repeated / total if total > 0 else 0

    # Quality score (0-10)
    quality = 5.0
    if avg_length > 30:
        quality += 1.5
    elif avg_length < 10:
        quality -= 2
    if conventional_ratio > 0.3:
        quality += 2
    if lazy_ratio > 0.3:
        quality -= 2
    if avg_words > 5:
        quality += 1
    if repetitive_ratio > 0.3:
        quality -= 1
    quality = max(0, min(10, int(quality)))

    # Generate human-readable patterns
    patterns = []
    if conventional_ratio > 0.3:
        patterns.append("Uses conventional commit format")
    if lazy_ratio > 0.3:
        patterns.append("Many low-effort commit messages")
    if avg_length > 40:
        patterns.append("Writes detailed commit descriptions")
    if avg_length < 15:
        patterns.append("Commit messages are very brief")
    if repetitive_ratio > 0.3:
        patterns.append("Frequently reuses the same commit message")

    if quality >= 8:
        insight = "Exceptional commit discipline — clear, descriptive, and well-structured"
    elif quality >= 6:
        insight = "Professional commit discipline — clear, descriptive messages"
    elif quality >= 4:
        insight = "Average commit quality — room for improvement in message clarity"
    else:
        insight = "Poor commit hygiene — many lazy or generic commit messages"

    # Time pattern analysis
    commit_hours = []
    commit_days = []
    for c in commits:
        date_str = c.get("date", "")
        if date_str:
            try:
                dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                commit_hours.append(dt.hour)
                commit_days.append(dt.strftime("%A"))
            except Exception:
                pass

    hour_distribution = dict(Counter(commit_hours).most_common(5))
    day_distribution = dict(Counter(commit_days))

    return {
        "total_analyzed": total,
        "quality_score": quality,
        "avg_message_length": round(avg_length, 1),
        "avg_words_per_commit": round(avg_words, 1),
        "conventional_ratio": round(conventional_ratio * 100, 1),
        "lazy_commit_ratio": round(lazy_ratio * 100, 1),
        "patterns": patterns,
        "insight": insight,
        "peak_hours": hour_distribution,
        "day_distribution": day_distribution,
    }


# ═══════════════════════════════════════════════════════
# NEW: CONTRIBUTION STREAKS
# ═══════════════════════════════════════════════════════

def calculate_contribution_streaks(
    repos: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    commits: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Calculate contribution streaks from commits and events."""
    activity_dates = set()

    # Collect all activity dates
    for e in events:
        created = e.get("created_at")
        if created:
            try:
                dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                activity_dates.add(dt.date())
            except Exception:
                pass

    for c in commits:
        date_str = c.get("date", "")
        if date_str:
            try:
                dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                activity_dates.add(dt.date())
            except Exception:
                pass

    if not activity_dates:
        return {
            "current_streak_weeks": 0,
            "longest_streak_weeks": 0,
            "total_active_days": 0,
            "best_day": "N/A",
            "is_active_today": False,
        }

    sorted_dates = sorted(activity_dates)
    today = datetime.now(timezone.utc).date()

    # Calculate weekly streaks
    active_weeks = set()
    for d in sorted_dates:
        # ISO week: (year, week_number)
        active_weeks.add(d.isocalendar()[:2])

    sorted_weeks = sorted(active_weeks)

    # Find longest streak of consecutive weeks
    longest_streak = 1
    current_streak = 1

    for i in range(1, len(sorted_weeks)):
        prev_year, prev_week = sorted_weeks[i - 1]
        curr_year, curr_week = sorted_weeks[i]

        # Check if weeks are consecutive
        prev_date = datetime.strptime(f"{prev_year}-W{prev_week:02d}-1", "%G-W%V-%u").date()
        curr_date = datetime.strptime(f"{curr_year}-W{curr_week:02d}-1", "%G-W%V-%u").date()

        if (curr_date - prev_date).days <= 7:
            current_streak += 1
            longest_streak = max(longest_streak, current_streak)
        else:
            current_streak = 1

    # Current streak (from latest week backwards)
    this_week = today.isocalendar()[:2]
    last_week = (today - timedelta(days=7)).isocalendar()[:2]

    is_active_this_week = this_week in active_weeks or last_week in active_weeks
    current_active_streak = 0

    if is_active_this_week:
        current_active_streak = 1
        check_date = today
        while True:
            check_date -= timedelta(days=7)
            week_key = check_date.isocalendar()[:2]
            if week_key in active_weeks:
                current_active_streak += 1
            else:
                break

    # Best day of week
    day_counter = Counter()
    for d in sorted_dates:
        day_counter[d.strftime("%A")] += 1
    best_day = day_counter.most_common(1)[0][0] if day_counter else "N/A"

    return {
        "current_streak_weeks": current_active_streak,
        "longest_streak_weeks": longest_streak,
        "total_active_days": len(activity_dates),
        "best_day": best_day,
        "is_active_today": today in activity_dates,
    }


# ═══════════════════════════════════════════════════════
# NEW: COMMUNITY ENGAGEMENT
# ═══════════════════════════════════════════════════════

def calculate_community_engagement(events: List[Dict[str, Any]], repos: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze PR, issue, review, and collaboration activity."""
    prs_opened = 0
    issues_opened = 0
    review_events = 0
    comments = 0
    create_events = 0
    fork_events = 0
    watch_events = 0

    for e in events:
        etype = e.get("type", "")
        if etype == "PullRequestEvent":
            if e.get("action") in ("opened", ""):
                prs_opened += 1
        elif etype == "IssuesEvent":
            if e.get("action") in ("opened", ""):
                issues_opened += 1
        elif etype == "PullRequestReviewEvent":
            review_events += 1
        elif etype == "IssueCommentEvent":
            comments += 1
        elif etype == "PullRequestReviewCommentEvent":
            comments += 1
            review_events += 1
        elif etype == "CreateEvent":
            create_events += 1
        elif etype == "ForkEvent":
            fork_events += 1
        elif etype == "WatchEvent":
            watch_events += 1

    total_community_actions = prs_opened + issues_opened + review_events + comments

    # Collaboration ratio — repos with forks (others contributing)
    repos_with_forks = sum(1 for r in repos if r.get("forks", 0) > 0 and not r.get("is_fork", False))
    originals = sum(1 for r in repos if not r.get("is_fork", False))
    collaboration_ratio = round(repos_with_forks / max(originals, 1) * 100, 1)

    # Engagement score (0-15)
    engagement_score = 0
    if prs_opened > 5:
        engagement_score += 4
    elif prs_opened > 0:
        engagement_score += 2
    if issues_opened > 3:
        engagement_score += 3
    elif issues_opened > 0:
        engagement_score += 1
    if review_events > 3:
        engagement_score += 4
    elif review_events > 0:
        engagement_score += 2
    if total_community_actions > 20:
        engagement_score += 4
    elif total_community_actions > 5:
        engagement_score += 2
    engagement_score = min(engagement_score, 15)

    return {
        "prs_opened": prs_opened,
        "issues_opened": issues_opened,
        "review_events": review_events,
        "comments": comments,
        "collaboration_ratio": collaboration_ratio,
        "engagement_score": engagement_score,
        "total_community_actions": total_community_actions,
    }


# ═══════════════════════════════════════════════════════
# NEW: CODING PATTERNS (hour/day heatmap)
# ═══════════════════════════════════════════════════════

def analyze_coding_patterns(commits: List[Dict[str, Any]], events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze when the developer codes — hour of day, day of week patterns."""
    hours = []
    days = []
    day_hour_grid: Dict[str, Dict[int, int]] = {}

    all_dates = []

    for c in commits:
        date_str = c.get("date", "")
        if date_str:
            try:
                dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                hours.append(dt.hour)
                day_name = dt.strftime("%A")
                days.append(day_name)
                all_dates.append(dt)

                if day_name not in day_hour_grid:
                    day_hour_grid[day_name] = {}
                day_hour_grid[day_name][dt.hour] = day_hour_grid[day_name].get(dt.hour, 0) + 1
            except Exception:
                pass

    for e in events:
        created = e.get("created_at")
        if created:
            try:
                dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                hours.append(dt.hour)
                day_name = dt.strftime("%A")
                days.append(day_name)
                all_dates.append(dt)
            except Exception:
                pass

    if not hours:
        return {
            "peak_hours": [],
            "most_active_day": "N/A",
            "weekend_ratio": 0,
            "avg_commits_per_active_day": 0,
            "day_hour_heatmap": [],
            "coding_session": "Unknown",
        }

    hour_counter = Counter(hours)
    day_counter = Counter(days)

    # Peak coding hours (top 3)
    peak_hours = [{"hour": h, "count": c} for h, c in hour_counter.most_common(3)]

    most_active_day = day_counter.most_common(1)[0][0] if day_counter else "N/A"

    weekend_count = day_counter.get("Saturday", 0) + day_counter.get("Sunday", 0)
    weekend_ratio = round(weekend_count / len(days) * 100, 1) if days else 0

    # Active days count
    unique_dates = set(dt.date() for dt in all_dates)
    avg_per_day = round(len(all_dates) / max(len(unique_dates), 1), 1)

    # Build 7x24 heatmap data
    day_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    heatmap = []
    for day in day_order:
        day_data = day_hour_grid.get(day, {})
        row = {"day": day, "hours": {str(h): day_data.get(h, 0) for h in range(24)}}
        heatmap.append(row)

    # Determine coding session type
    morning = sum(hour_counter.get(h, 0) for h in range(6, 12))
    afternoon = sum(hour_counter.get(h, 0) for h in range(12, 18))
    evening = sum(hour_counter.get(h, 0) for h in range(18, 24))
    night = sum(hour_counter.get(h, 0) for h in range(0, 6))

    segments = {"Morning Dev": morning, "Afternoon Coder": afternoon, "Night Owl": evening, "Midnight Hacker": night}
    coding_session = max(segments, key=segments.get)

    return {
        "peak_hours": peak_hours,
        "most_active_day": most_active_day,
        "weekend_ratio": weekend_ratio,
        "avg_commits_per_active_day": avg_per_day,
        "day_hour_heatmap": heatmap,
        "coding_session": coding_session,
    }


# ═══════════════════════════════════════════════════════
# RED FLAGS & FORENSIC ANALYSIS
# ═══════════════════════════════════════════════════════

def detect_red_flags(repos: List[Dict[str, Any]], commits: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    flags = []
    if not repos:
        return [{"flag": "No repositories found", "severity": "critical"}]

    total = len(repos)
    forks = sum(1 for r in repos if r.get("is_fork", r.get("fork", False)))
    empty = sum(1 for r in repos if r.get("size", 0) == 0)
    no_desc = sum(1 for r in repos if not r.get("description"))

    if total > 0 and (forks / total) > 0.6:
        flags.append({"flag": f"Over {int(forks/total*100)}% of repos are forks — low original work", "severity": "high"})

    if total > 0 and (empty / total) > 0.3:
        flags.append({"flag": f"{empty} empty repositories — possible placeholder accounts", "severity": "medium"})

    if total > 0 and (no_desc / total) > 0.5:
        flags.append({"flag": "Most repos lack descriptions — poor documentation habits", "severity": "low"})

    # Activity staleness
    try:
        now = datetime.now(timezone.utc)
        updates = [
            datetime.fromisoformat(r["pushed_at"].replace("Z", "+00:00"))
            for r in repos if r.get("pushed_at")
        ]
        if not updates:
            updates = [
                datetime.fromisoformat(r["updated_at"].replace("Z", "+00:00"))
                for r in repos if r.get("updated_at")
            ]
        if updates:
            latest = max(updates)
            days_since = (now - latest).days
            if days_since > 365:
                flags.append({"flag": f"No code pushed in {days_since} days — inactive developer", "severity": "critical"})
            elif days_since > 180:
                flags.append({"flag": f"No code pushed in {days_since} days", "severity": "high"})
    except Exception:
        pass

    if total < 5:
        flags.append({"flag": "Very few public repos — limited verifiable work", "severity": "medium"})

    # Commit-based flags
    if commits:
        messages = [c.get("message", "") for c in commits]

        # Detect potential AI bulk dumps
        single_word = sum(1 for m in messages if len(m.split()) <= 2)
        if len(messages) > 5 and (single_word / len(messages)) > 0.6:
            flags.append({"flag": "Commit messages suggest bulk uploads — possible AI-generated code", "severity": "high"})

        # Detect burst commits (many commits in very short time)
        commit_dates = []
        for c in commits:
            d = c.get("date", "")
            if d:
                try:
                    commit_dates.append(datetime.fromisoformat(d.replace("Z", "+00:00")))
                except Exception:
                    pass

        if len(commit_dates) > 10:
            commit_dates.sort()
            burst_count = 0
            for i in range(1, len(commit_dates)):
                if (commit_dates[i] - commit_dates[i-1]).total_seconds() < 30:
                    burst_count += 1
            if burst_count > len(commit_dates) * 0.4:
                flags.append({"flag": "Rapid-fire commits detected — possible automated or AI-assisted coding", "severity": "medium"})

    return flags


def calculate_forensic_data(events: List[Dict[str, Any]], repos: List[Dict[str, Any]], commits: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Enhanced forensic analysis with commit-level data."""
    push_events = [e for e in events if e.get("type") == "PushEvent"]
    total_pushes = len(push_events)
    total_event_commits = sum(len(e.get("commits", [])) for e in push_events)

    # Base authenticity score
    score = 65.0

    # Rewards for consistent event history
    if total_pushes > 50:
        score += 15
    elif total_pushes > 20:
        score += 10
    elif total_pushes > 5:
        score += 5

    # Event diversity (not just pushes)
    event_types = set(e.get("type") for e in events)
    if len(event_types) >= 5:
        score += 12
    elif len(event_types) >= 4:
        score += 10

    # Penalties for AI Dumps
    avg_commits_per_push = total_event_commits / total_pushes if total_pushes else 0
    if avg_commits_per_push > 15:
        score -= (avg_commits_per_push - 15) * 2
    elif avg_commits_per_push > 10:
        score -= (avg_commits_per_push - 10)

    # Commit quality bonus
    if commits:
        messages = [c.get("message", "") for c in commits]
        avg_msg_len = sum(len(m) for m in messages) / len(messages) if messages else 0
        if avg_msg_len > 30:
            score += 5
        elif avg_msg_len > 15:
            score += 2

        # Detect identical commit messages
        unique_msgs = len(set(m.split("\n")[0].lower().strip() for m in messages))
        if len(messages) > 10 and unique_msgs < len(messages) * 0.4:
            score -= 10

    score = max(0, min(100, int(score)))

    # Organic percentage metric
    small_pushes = sum(1 for e in push_events if len(e.get("commits", [])) <= 3)
    organic_percentage = int((small_pushes / total_pushes) * 100) if total_pushes > 0 else 50

    # Verified skills extraction from topics + languages
    topics_set = set()
    for r in repos:
        for t in r.get("topics", []):
            topics_set.add(t)
    verified_skills = sorted(list(topics_set))[:10]
    if not verified_skills:
        langs = set(r.get("language") for r in repos if r.get("language"))
        verified_skills = sorted(list(langs))[:10]

    return {
        "authenticity_score": score,
        "organic_commits_percentage": organic_percentage,
        "verified_skills": verified_skills,
        "total_events_analyzed": len(events),
        "event_types": list(event_types),
    }


# ═══════════════════════════════════════════════════════
# AI CODE DETECTION INTEGRATION
# ═══════════════════════════════════════════════════════

def run_code_ai_detection_from_commits(
    commits: List[Dict[str, Any]],
    repos: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Run the AI detection engine using commit data and repo stats as proxy signals.
    Called from the intelligence pipeline when actual file content isn't available.
    We use commit message patterns + repo stats as a lightweight proxy.
    """
    try:
        from engines.ai_detection_engine import analyze_commit_ai_signals
        result = analyze_commit_ai_signals(commits)
        # Build a minimal ai_detection response from the commit analysis
        prob = result.get("score", 0.0)
        verdict = "AI" if prob >= 0.7 else "LIKELY_AI" if prob >= 0.5 else "UNCERTAIN" if prob >= 0.3 else "LIKELY_HUMAN"
        return {
            "ai_probability": round(prob, 3),
            "confidence": result.get("confidence", "LOW"),
            "verdict": verdict,
            "pattern_hits": [{"pattern": s} for s in result.get("signals", [])],
            "commit_analysis": result,
        }
    except ImportError:
        return {"ai_probability": 0.0, "confidence": "LOW", "verdict": "INSUFFICIENT_DATA"}


# ═══════════════════════════════════════════════════════
# TOP REPOS EXTRACTION
# ═══════════════════════════════════════════════════════

def extract_top_repos(repos: List[Dict[str, Any]], limit: int = 5) -> List[Dict[str, Any]]:
    """Extract top repos by stars (non-fork), with deep insights."""
    originals = [r for r in repos if not r.get("is_fork", r.get("fork", False))]
    if not originals:
        originals = repos

    sorted_repos = sorted(originals, key=lambda r: r.get("stars", 0), reverse=True)[:limit]

    result = []
    for repo in sorted_repos:
        size = repo.get("size", 0)
        stars = repo.get("stars", 0)

        if size > 10000:
            contribution_level = "Heavy"
        elif size > 2000:
            contribution_level = "Moderate"
        else:
            contribution_level = "Light"

        has_topics = len(repo.get("topics", [])) >= 2
        has_issues = repo.get("open_issues", 0) > 3
        if size > 10000 and (has_topics or has_issues):
            complexity_insight = "Production-grade complexity"
        elif size > 3000:
            complexity_insight = "Moderate complexity"
        else:
            complexity_insight = "Simple project"

        lang = repo.get("language") or "Unknown"
        desc = repo.get("description") or "No description"
        explanation = f"{lang} project with {stars} stars. {desc[:80]}{'...' if len(desc) > 80 else ''}"

        result.append({
            "name": repo.get("name", ""),
            "description": desc,
            "stars": stars,
            "language": lang,
            "html_url": repo.get("html_url", ""),
            "contribution_level": contribution_level,
            "complexity_insight": complexity_insight,
            "explanation": explanation,
            "size_kb": size,
            "forks": repo.get("forks", 0),
            "topics": repo.get("topics", [])[:5],
        })

    return result


# ═══════════════════════════════════════════════════════
# VERDICT, RISK, RECOMMENDATIONS
# ═══════════════════════════════════════════════════════

def generate_verdict(score: int, flags: List[Dict]) -> str:
    critical_flags = [f for f in flags if f.get("severity") == "critical"]
    if score > 80 and len(critical_flags) == 0:
        return "Strong Developer"
    elif score > 70:
        return "Solid Developer"
    elif score > 60:
        return "Moderate Developer"
    elif score > 40:
        return "Developing Talent"
    else:
        return "Risky Hire"


def generate_risk_level(score: int, flags: List[Dict]) -> str:
    critical = sum(1 for f in flags if f.get("severity") in ("critical", "high"))
    if score > 80 and critical == 0:
        return "Low"
    elif score > 60 and critical <= 1:
        return "Medium"
    else:
        return "High"


def generate_confidence_score(repos: List[Dict], commits: List[Dict], events: List[Dict], score: int) -> int:
    total = len(repos)
    if total == 0:
        return 10

    base = 40
    if total >= 30:
        base += 20
    elif total >= 15:
        base += 15
    elif total >= 5:
        base += 10

    originals = sum(1 for r in repos if not r.get("is_fork", False))
    if originals >= 10:
        base += 15
    elif originals >= 5:
        base += 10

    has_stars = any(r.get("stars", 0) > 0 for r in repos)
    if has_stars:
        base += 5

    # Commit data availability bonus
    if len(commits) > 20:
        base += 10
    elif len(commits) > 5:
        base += 5

    # Event availability bonus
    if len(events) > 50:
        base += 5

    return min(base, 100)


def generate_hiring_recommendation(score: int, risk_level: str, flags: List[Dict]) -> str:
    if score >= 80 and risk_level == "Low":
        return "Strong Hire — This developer demonstrates consistent, high-quality output with strong ownership signals."
    elif score >= 70 and risk_level in ("Low", "Medium"):
        return "Likely Hire — Good fundamentals with room for growth. Recommend a focused technical interview."
    elif score >= 60:
        return "Conditional Hire — Moderate signals detected. Recommend a thorough technical assessment before proceeding."
    elif score >= 40:
        return "Proceed with Caution — Significant gaps identified. Deep evaluation required."
    else:
        return "Not Recommended — Insufficient evidence of meaningful development activity."


def generate_verdict_explanation(score: int, breakdown: Dict, flags: List[Dict]) -> str:
    parts = []
    depth = breakdown.get("depth_score", 0)
    ownership = breakdown.get("ownership_score", 0)
    activity = breakdown.get("activity_score", 0)
    commit_q = breakdown.get("commit_quality_score", 5)

    if depth >= 20:
        parts.append("demonstrates deep, substantial code contributions")
    elif depth < 10:
        parts.append("contributions appear mostly surface-level")

    if ownership >= 15:
        parts.append("shows strong original project ownership")
    elif ownership < 8:
        parts.append("relies heavily on forked repositories")

    if activity >= 15:
        parts.append("maintains consistent development activity")
    elif activity < 8:
        parts.append("shows limited recent activity")

    if commit_q >= 7:
        parts.append("writes professional, descriptive commit messages")
    elif commit_q < 4:
        parts.append("commit messages suggest casual or bulk coding patterns")

    if not parts:
        parts.append("shows a mixed development profile")

    base = f"This developer {', '.join(parts)}."

    if flags:
        flag_texts = [f["flag"] for f in flags[:2]]
        base += f" Notable concerns: {'; '.join(flag_texts)}."

    return base


def generate_risk_analysis(score: int, flags: List[Dict], breakdown: Dict) -> str:
    if score >= 80 and len(flags) == 0:
        return "Low risk profile. Strong signals across all dimensions. This developer shows genuine, verified technical capability."
    elif score >= 60:
        weak_areas = []
        if breakdown.get("depth_score", 0) < 15:
            weak_areas.append("contribution depth")
        if breakdown.get("activity_score", 0) < 10:
            weak_areas.append("recent activity")
        if breakdown.get("ownership_score", 0) < 10:
            weak_areas.append("project ownership")
        if breakdown.get("commit_quality_score", 5) < 4:
            weak_areas.append("commit discipline")
        areas = ", ".join(weak_areas) if weak_areas else "some areas"
        return f"Moderate risk. While fundamentals exist, {areas} could be stronger. Recommend verifying claims in technical interview."
    else:
        return "High risk profile. Multiple red flags suggest limited genuine development capability. Thorough vetting recommended before proceeding."


def generate_improvements(score: int, breakdown: Dict) -> List[Dict[str, str]]:
    improvements = []
    depth = breakdown.get("depth_score", 0)
    ownership = breakdown.get("ownership_score", 0)
    activity = breakdown.get("activity_score", 0)
    complexity = breakdown.get("complexity_score", 0)
    language = breakdown.get("language_score", 0)
    commit_q = breakdown.get("commit_quality_score", 5)

    if depth < 20:
        target = min(score + (20 - depth), 100)
        improvements.append({
            "action": "Build 2-3 substantial projects (>5000 lines each) from scratch",
            "impact": f"Could raise score from {score} → {target}",
            "priority": "High",
        })

    if commit_q < 6:
        improvements.append({
            "action": "Adopt conventional commit format — write descriptive messages explaining WHY not just WHAT",
            "impact": "Improves authenticity signals and professional appearance",
            "priority": "High",
        })

    if ownership < 15:
        target = min(score + (15 - ownership), 100)
        improvements.append({
            "action": "Create more original repositories instead of forking",
            "impact": f"Could raise score from {score} → {target}",
            "priority": "High",
        })

    if activity < 15:
        target = min(score + (15 - activity), 100)
        improvements.append({
            "action": "Commit consistently — aim for weekly contributions across projects",
            "impact": f"Could raise score from {score} → {target}",
            "priority": "Medium",
        })

    if complexity < 10:
        target = min(score + (10 - complexity), 100)
        improvements.append({
            "action": "Work on larger, more complex projects with proper issue tracking",
            "impact": f"Could raise score from {score} → {target}",
            "priority": "Medium",
        })

    if language < 9:
        target = min(score + (9 - language), 100)
        improvements.append({
            "action": "Expand tech stack — contribute to projects in different languages",
            "impact": f"Could raise score from {score} → {target}",
            "priority": "Low",
        })

    if not improvements:
        improvements.append({
            "action": "Maintain current momentum and explore open-source leadership roles",
            "impact": "Sustain top-tier score",
            "priority": "Low",
        })

    return improvements


# ═══════════════════════════════════════════════════════
# NEW: DEVELOPER TIER CLASSIFICATION
# ═══════════════════════════════════════════════════════

def classify_developer_tier(
    score: int,
    account_age_years: float,
    repos: List[Dict[str, Any]],
    community_data: Dict[str, Any],
    streak_data: Dict[str, Any],
    commit_quality: int,
) -> Dict[str, Any]:
    """Classify developer into Junior/Mid/Senior/Staff/Principal based on signals."""
    signals = 0
    evidence = []

    # Account age signals experience
    if account_age_years >= 10:
        signals += 3
        evidence.append(f"{account_age_years}yr account — long track record")
    elif account_age_years >= 5:
        signals += 2
        evidence.append(f"{account_age_years}yr account")
    elif account_age_years >= 2:
        signals += 1

    # Repo quality signals
    originals = [r for r in repos if not r.get("is_fork", False)]
    starred_repos = [r for r in originals if r.get("stars", 0) > 10]
    popular_repos = [r for r in originals if r.get("stars", 0) > 100]
    massive_repos = [r for r in originals if r.get("size", 0) > 20000]

    if len(popular_repos) >= 3:
        signals += 3
        evidence.append(f"{len(popular_repos)} repos with 100+ stars")
    elif len(starred_repos) >= 5:
        signals += 2
        evidence.append(f"{len(starred_repos)} repos with community traction")
    elif len(starred_repos) >= 1:
        signals += 1

    if len(massive_repos) >= 3:
        signals += 2
        evidence.append(f"{len(massive_repos)} large-scale codebases")
    elif len(massive_repos) >= 1:
        signals += 1

    # Community leadership signals
    if community_data.get("engagement_score", 0) >= 10:
        signals += 2
        evidence.append("Active in code reviews and PRs")
    elif community_data.get("engagement_score", 0) >= 5:
        signals += 1

    # Consistency signals
    if streak_data.get("longest_streak_weeks", 0) >= 12:
        signals += 2
        evidence.append("12+ week contribution streak")
    elif streak_data.get("longest_streak_weeks", 0) >= 4:
        signals += 1

    # Commit discipline
    if commit_quality >= 7:
        signals += 1
        evidence.append("Professional commit practices")

    # Language breadth
    languages = set(r.get("language") for r in repos if r.get("language"))
    if len(languages) >= 6:
        signals += 1
        evidence.append(f"Polyglot — {len(languages)} languages")

    # Total followers as influence signal
    total_forks_received = sum(r.get("forks", 0) for r in originals)
    if total_forks_received > 100:
        signals += 2
        evidence.append(f"{total_forks_received} forks across projects — community influence")
    elif total_forks_received > 20:
        signals += 1

    # Classify
    if signals >= 14:
        tier = "Principal Engineer"
        tier_description = "Exceptional technical leader with industry-wide impact and deep specialization"
        tier_level = 5
    elif signals >= 10:
        tier = "Staff Engineer"
        tier_description = "Senior technical leader driving architecture and cross-team impact"
        tier_level = 4
    elif signals >= 7:
        tier = "Senior Developer"
        tier_description = "Experienced engineer with strong ownership and community presence"
        tier_level = 3
    elif signals >= 4:
        tier = "Mid-Level Developer"
        tier_description = "Competent developer building meaningful projects with room to grow"
        tier_level = 2
    else:
        tier = "Junior Developer"
        tier_description = "Early-career developer establishing their engineering foundation"
        tier_level = 1

    return {
        "tier": tier,
        "tier_level": tier_level,
        "tier_description": tier_description,
        "evidence": evidence[:5],
        "signal_strength": min(signals, 16),
    }


# ═══════════════════════════════════════════════════════
# NEW: DOCUMENTATION QUALITY
# ═══════════════════════════════════════════════════════

def assess_documentation_quality(repos: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Assess documentation habits — a hiring manager's key signal for team readiness."""
    if not repos:
        return {"score": 0, "grade": "F", "insight": "No repos to assess"}

    originals = [r for r in repos if not r.get("is_fork", False)]
    if not originals:
        originals = repos

    total = len(originals)
    has_description = sum(1 for r in originals if r.get("description") and len(r.get("description", "")) > 10)
    has_topics = sum(1 for r in originals if len(r.get("topics", [])) >= 1)
    has_wiki = sum(1 for r in originals if r.get("has_wiki", False))
    has_pages = sum(1 for r in originals if r.get("has_pages", False))

    desc_ratio = has_description / total if total > 0 else 0
    topics_ratio = has_topics / total if total > 0 else 0

    # Score out of 10
    score = 0
    if desc_ratio >= 0.8:
        score += 4
    elif desc_ratio >= 0.5:
        score += 2
    elif desc_ratio >= 0.2:
        score += 1

    if topics_ratio >= 0.3:
        score += 2
    elif topics_ratio >= 0.1:
        score += 1

    if has_pages >= 2:
        score += 2
    elif has_pages >= 1:
        score += 1

    if has_wiki >= 1:
        score += 1

    # Detailed descriptions bonus
    long_descs = sum(1 for r in originals if r.get("description") and len(r.get("description", "")) > 50)
    if long_descs >= 5:
        score += 1

    score = min(score, 10)

    if score >= 8:
        grade, insight = "A", "Excellent documentation habits — descriptive, tagged, with project pages"
    elif score >= 6:
        grade, insight = "B", "Good documentation — most projects have meaningful descriptions"
    elif score >= 4:
        grade, insight = "C", "Adequate — some repos documented, but gaps exist"
    elif score >= 2:
        grade, insight = "D", "Poor documentation — most repos lack descriptions or structure"
    else:
        grade, insight = "F", "Minimal documentation — suggests unwillingness to communicate through code"

    return {
        "score": score,
        "grade": grade,
        "insight": insight,
        "repos_with_descriptions": has_description,
        "repos_with_topics": has_topics,
        "repos_with_pages": has_pages,
        "total_assessed": total,
    }


# ═══════════════════════════════════════════════════════
# NEW: TECHNICAL INTERVIEW QUESTIONS
# ═══════════════════════════════════════════════════════

def generate_interview_questions(
    languages: List[str],
    weaknesses: List[str],
    red_flags: List[Dict[str, str]],
    top_repos: List[Dict[str, Any]],
    community_data: Dict[str, Any],
    commit_quality: int,
) -> List[Dict[str, str]]:
    """Generate targeted interview questions based on profile analysis."""
    questions = []

    # 1. Questions about their top language/stack
    if languages:
        primary = languages[0] if languages else "their stack"
        questions.append({
            "category": "Technical Depth",
            "question": f"Walk me through the architecture of your most complex {primary} project. What were the key technical decisions you made and why?",
            "why": f"Their top language is {primary} — verify genuine depth beyond surface-level usage",
        })

    # 2. Questions about their biggest repo
    if top_repos:
        best = top_repos[0]
        questions.append({
            "category": "Project Ownership",
            "question": f"Tell me about '{best.get('name', 'your top project')}'. What problem does it solve, what would you do differently if starting over, and how do you handle contributions?",
            "why": f"Their most-starred project ({best.get('stars', 0)} ★) — verify they actually built it",
        })

    # 3. Weakness-based probing questions
    if any("fork" in w.lower() for w in weaknesses):
        questions.append({
            "category": "Originality Check",
            "question": "Many of your repos are forks. Can you describe a project you built entirely from scratch — from idea to deployment?",
            "why": "High fork ratio detected — need to verify original coding ability",
        })
    elif any("depth" in w.lower() or "small" in w.lower() for w in weaknesses):
        questions.append({
            "category": "Complexity",
            "question": "What's the most technically challenging problem you've solved in code? Walk me through your debugging process.",
            "why": "Mostly small projects detected — verify ability to handle complex systems",
        })

    # 4. Commit discipline question
    if commit_quality < 5:
        questions.append({
            "category": "Engineering Practices",
            "question": "How do you approach version control in your workflow? What does your typical branching and commit strategy look like?",
            "why": "Low commit quality detected — assess awareness of engineering best practices",
        })
    else:
        questions.append({
            "category": "Engineering Practices",
            "question": "How do you approach code review? What do you look for when reviewing a teammate's PR?",
            "why": "Good commit quality — probe deeper into collaboration and review skills",
        })

    # 5. Collaboration question
    if community_data.get("engagement_score", 0) < 5:
        questions.append({
            "category": "Team Fit",
            "question": "Describe a time you collaborated with other developers on a codebase. How did you handle disagreements about architecture or code style?",
            "why": "Low community engagement — verify ability to work in team environments",
        })
    else:
        questions.append({
            "category": "Leadership",
            "question": "You're active in code reviews and PRs. How do you mentor junior developers or help onboard new team members?",
            "why": "Strong community engagement — explore leadership potential",
        })

    # 6. System design question based on their stack
    if len(languages) >= 3:
        questions.append({
            "category": "System Design",
            "question": f"You've worked with {', '.join(languages[:3])}. If you had to design a system that uses multiple languages, how would you decide which language to use for which component?",
            "why": "Multi-language profile — verify strategic thinking about technology choices",
        })

    return questions[:6]


# ═══════════════════════════════════════════════════════
# MASTER SCORING ENGINE
# ═══════════════════════════════════════════════════════

def calculate_final_score(
    repos: List[Dict[str, Any]],
    events: Optional[List[Dict[str, Any]]] = None,
    language_bytes: Optional[Dict[str, int]] = None,
    all_commits: Optional[List[Dict[str, Any]]] = None,
    profile_created_at: Optional[str] = None,
) -> Dict[str, Any]:
    events = events or []
    language_bytes = language_bytes or {}
    all_commits = all_commits or []

    # Deep analysis modules
    forensic_data = calculate_forensic_data(events, repos, all_commits)
    commit_analysis = analyze_commit_patterns(all_commits)

    depth_data = calculate_contribution_depth(repos)
    ownership_data = calculate_ownership_score(repos)
    activity_data = calculate_activity_consistency(repos, events)
    complexity_data = calculate_project_complexity(repos)
    language_data = calculate_language_diversity(repos, language_bytes)

    # NEW: Advanced analysis
    streak_data = calculate_contribution_streaks(repos, events, all_commits)
    community_data = calculate_community_engagement(events, repos)
    coding_patterns = analyze_coding_patterns(all_commits, events)

    red_flags = detect_red_flags(repos, all_commits)
    red_flag_penalty = sum(
        {"critical": 15, "high": 10, "medium": 5, "low": 2}.get(f.get("severity", "low"), 2)
        for f in red_flags
    )

    raw_score = (
        depth_data["score"]
        + ownership_data["score"]
        + activity_data["score"]
        + complexity_data["score"]
        + language_data["score"]
    )

    # Bonus for community engagement (up to 5 points)
    community_bonus = min(community_data["engagement_score"] // 3, 5)
    raw_score += community_bonus

    # Bonus for long streaks (up to 3 points)
    if streak_data["longest_streak_weeks"] >= 8:
        raw_score += 3
    elif streak_data["longest_streak_weeks"] >= 4:
        raw_score += 1

    # ── AI CODE DETECTION (commit-based proxy) ──
    # Run pattern-based AI detection on commits as a lightweight signal.
    # When the full code reviewer runs on repos, its result will override/supplement this.
    ai_detection_result = run_code_ai_detection_from_commits(all_commits, repos)

    # Apply AI detection penalty to authenticity score (from forensic_data)
    ai_authenticity_penalty = 0
    ai_verdict = ai_detection_result.get("verdict", "INSUFFICIENT_DATA")
    ai_confidence = ai_detection_result.get("confidence", "LOW")
    if ai_confidence != "LOW":  # Only penalize when we have sufficient data
        if ai_verdict == "AI":
            ai_authenticity_penalty = 20
        elif ai_verdict == "LIKELY_AI":
            ai_authenticity_penalty = 10
        elif ai_verdict == "UNCERTAIN":
            ai_authenticity_penalty = 3

    # Apply the AI penalty to forensic authenticity score
    orig_authenticity = forensic_data.get("authenticity_score", 65)
    adjusted_authenticity = max(0, orig_authenticity - ai_authenticity_penalty)
    forensic_data["authenticity_score"] = adjusted_authenticity
    forensic_data["ai_detection"] = ai_detection_result

    # Also lower base score when AI detection is high confidence
    if ai_authenticity_penalty > 0:
        raw_score = max(0, raw_score - (ai_authenticity_penalty // 4))

    final_score = max(0, min(raw_score - red_flag_penalty, 100))

    breakdown = {
        "depth_score": depth_data["score"],
        "depth_insight": depth_data["insight"],
        "ownership_score": ownership_data["score"],
        "ownership_insight": ownership_data["insight"],
        "activity_score": activity_data["score"],
        "activity_insight": activity_data["insight"],
        "complexity_score": complexity_data["score"],
        "complexity_level": complexity_data["level"],
        "complexity_insight": complexity_data["insight"],
        "language_score": language_data["score"],
        "language_insight": language_data["insight"],
        "languages": language_data["languages"],
        "commit_quality_score": commit_analysis["quality_score"],
        "commit_quality_insight": commit_analysis["insight"],
    }

    verdict = generate_verdict(final_score, red_flags)
    risk_level = generate_risk_level(final_score, red_flags)
    confidence = generate_confidence_score(repos, all_commits, events, final_score)
    verdict_explanation = generate_verdict_explanation(final_score, breakdown, red_flags)
    risk_analysis = generate_risk_analysis(final_score, red_flags, breakdown)
    hiring_rec = generate_hiring_recommendation(final_score, risk_level, red_flags)
    improvements = generate_improvements(final_score, breakdown)
    top_repos = extract_top_repos(repos, limit=5)

    # Strengths
    strengths = []
    if depth_data["score"] >= 20:
        strengths.append("Deep, substantial code contributor")
    if complexity_data["level"] == "Advanced":
        strengths.append("Builds production-grade complex systems")
    if activity_data["score"] >= 15:
        strengths.append("Highly consistent development activity")
    if language_data["count"] >= 4:
        strengths.append("Diverse tech stack capability")
    if ownership_data["score"] >= 15:
        strengths.append("Strong original project ownership")
    if commit_analysis["quality_score"] >= 7:
        strengths.append("Professional commit discipline")
    if community_data["engagement_score"] >= 8:
        strengths.append("Active community contributor (PRs, reviews, issues)")
    if streak_data["longest_streak_weeks"] >= 8:
        strengths.append("Strong contribution streak — consistent over months")

    # Weaknesses
    weaknesses = []
    if depth_data["score"] < 15:
        weaknesses.append("Contributions lack depth — mostly small projects")
    if ownership_data["score"] < 10:
        weaknesses.append("Primarily dependent on forks and templates")
    if activity_data["score"] < 10:
        weaknesses.append("Sporadic or inactive commit history")
    if complexity_data["score"] < 8:
        weaknesses.append("Limited experience with complex project architectures")
    if commit_analysis["quality_score"] < 4:
        weaknesses.append("Poor commit message quality — suggests casual coding habits")
    if community_data["engagement_score"] < 3:
        weaknesses.append("Minimal community engagement — no PRs, reviews, or issue activity")

    # Account age calculation — prefer profile created_at
    account_age_years = 0
    try:
        if profile_created_at:
            dt = datetime.fromisoformat(profile_created_at.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            account_age_years = round((now - dt).days / 365.25, 1)
        else:
            for r in repos:
                created = r.get("created_at")
                if created:
                    dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                    now = datetime.now(timezone.utc)
                    age = (now - dt).days / 365.25
                    account_age_years = max(account_age_years, round(age, 1))
    except Exception:
        pass

    # Score dimensions for radar chart
    score_dimensions = [
        {"key": "depth", "label": "Depth", "value": depth_data["score"], "max": 30, "color": "#60a5fa"},
        {"key": "ownership", "label": "Ownership", "value": ownership_data["score"], "max": 20, "color": "#a78bfa"},
        {"key": "activity", "label": "Activity", "value": activity_data["score"], "max": 20, "color": "#34d399"},
        {"key": "complexity", "label": "Complexity", "value": complexity_data["score"], "max": 15, "color": "#fbbf24"},
        {"key": "language", "label": "Languages", "value": language_data["score"], "max": 15, "color": "#f472b6"},
        {"key": "commit", "label": "Commit Quality", "value": commit_analysis["quality_score"], "max": 10, "color": "#cdff00"},
    ]

    # NEW: Hiring Manager Intelligence
    dev_tier = classify_developer_tier(
        score=int(final_score),
        account_age_years=account_age_years,
        repos=repos,
        community_data=community_data,
        streak_data=streak_data,
        commit_quality=commit_analysis["quality_score"]
    )
    doc_quality = assess_documentation_quality(repos)
    interview_questions = generate_interview_questions(
        languages=language_data["languages"],
        weaknesses=weaknesses,
        red_flags=red_flags,
        top_repos=top_repos,
        community_data=community_data,
        commit_quality=commit_analysis["quality_score"]
    )

    return {
        "score": int(final_score),
        "verdict": verdict,
        "verdict_explanation": verdict_explanation,
        "confidence_score": confidence,
        "risk_level": risk_level,
        "risk_analysis": risk_analysis,
        "hiring_recommendation": hiring_rec,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "red_flags": [f["flag"] for f in red_flags],
        "improvements": improvements,
        "top_repos": top_repos,
        "breakdown": breakdown,
        "forensic": forensic_data,
        "commit_analysis": commit_analysis,
        "activity_heatmap": activity_data["monthly_activity"],
        "language_breakdown": language_data["language_breakdown"],
        "ownership_stats": {
            "original_count": ownership_data.get("original_count", 0),
            "fork_count": ownership_data.get("fork_count", 0),
        },
        "account_age_years": account_age_years,
        # Advanced data
        "contribution_streak": streak_data,
        "community_stats": community_data,
        "coding_patterns": coding_patterns,
        "score_dimensions": score_dimensions,
        # Hiring Manager Intelligence
        "developer_tier": dev_tier,
        "documentation_quality": doc_quality,
        "interview_questions": interview_questions,
    }