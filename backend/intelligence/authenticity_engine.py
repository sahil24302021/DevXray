
import math
import re
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from utils.logging_config import get_logger
from utils.proof import ProofCollector

log = get_logger("authenticity")


# ═══════════════════════════════════════════════════════
#  COMMIT FREQUENCY ANALYSIS
# ═══════════════════════════════════════════════════════

def analyze_commit_frequency(
    commits: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """Analyze commit timing for organic vs suspicious patterns."""
    if not commits:
        return {"burst_ratio": 0, "organic_ratio": 1.0, "pattern": "no_data", "flags": []}

    dates: List[datetime] = []
    for c in commits:
        date_str = c.get("date", "")
        if date_str:
            try:
                dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                dates.append(dt)
            except Exception:
                pass

    if len(dates) < 3:
        return {"burst_ratio": 0, "organic_ratio": 1.0, "pattern": "insufficient_data", "flags": []}

    dates.sort()
    flags: List[str] = []

    # Inter-commit intervals (seconds)
    intervals = [(dates[i] - dates[i - 1]).total_seconds() for i in range(1, len(dates))]

    # Burst detection: commits within 30 seconds of each other
    burst_count = sum(1 for gap in intervals if gap < 30)
    burst_ratio = burst_count / len(intervals) if intervals else 0

    # Organic commits: reasonable gaps (> 60s) between commits
    organic = sum(1 for gap in intervals if gap > 60)
    organic_ratio = organic / len(intervals) if intervals else 1.0

    # Standard deviation analysis (low CV = suspicious uniformity)
    if len(intervals) >= 5:
        mean_interval = sum(intervals) / len(intervals)
        variance = sum((x - mean_interval) ** 2 for x in intervals) / len(intervals)
        std_dev = math.sqrt(variance)
        coeff_var = std_dev / mean_interval if mean_interval > 0 else 0

        if coeff_var < 0.1 and mean_interval < 300:
            flags.append("Suspiciously uniform commit intervals — possible automation")
            proof.add(
                evidence_type="authenticity_flag",
                detail=f"Commit interval CV={coeff_var:.3f}, mean={mean_interval:.0f}s — unusually uniform",
            )

    if burst_ratio > 0.4:
        flags.append(f"High burst ratio ({burst_ratio:.0%}) — many commits within seconds")
        proof.add(
            evidence_type="authenticity_flag",
            detail=f"Burst ratio: {burst_ratio:.0%} of commits within 30s of each other",
        )

    # Time-of-day analysis
    hours = [d.hour for d in dates]
    hour_counts = Counter(hours)
    peak_hour_pct = max(hour_counts.values()) / len(hours) if hours else 0

    if peak_hour_pct > 0.5:
        peak_hour = hour_counts.most_common(1)[0][0]
        flags.append(f"Over {peak_hour_pct:.0%} of commits at hour {peak_hour} — unusual concentration")

    # Time-distribution: Active Days Check
    # NOTE: We only have a sample of commits (typically 30 per repo), so
    # low active_days on a small sample is expected — only flag very extreme cases.
    active_days = len(set(d.date() for d in dates))
    total_sampled = len(dates)

    # Require larger sample AND very extreme concentration to flag
    if total_sampled >= 50 and active_days <= 2:
        flags.append(
            f"Suspicious: {total_sampled} commits concentrated in only {active_days} days"
        )
        proof.add(
            evidence_type="authenticity_flag",
            detail=f"Extreme burst: {total_sampled} commits in {active_days} days"
        )
    # For small samples (< 30), do not flag — sample bias is too high

    pattern = "organic"
    if burst_ratio > 0.8:
        pattern = "automated"
    elif burst_ratio > 0.5:
        pattern = "suspicious"
    elif organic_ratio > 0.5:
        pattern = "organic"

    # STUDENT DEVELOPER CORRECTION (Bug 4 fix):
    # If most "bulk" commits cluster on same dates (initial project uploads),
    # this is normal student behavior, not malicious bulk dumps.
    if burst_ratio > 0.3 and len(dates) >= 3:
        date_only = [d.date() for d in dates]
        date_counts = Counter(date_only)
        most_common_date_count = date_counts.most_common(1)[0][1]
        # If more than 60% of commits happen on same days (project uploads),
        # don't penalize organic ratio
        if most_common_date_count / len(dates) > 0.6:
            # These are batch project uploads, not malicious bulk dumps
            organic_ratio = max(organic_ratio, 0.65)  # Floor: assume 65% organic
            pattern = "batch_project_upload"  # New pattern type
            flags = [f for f in flags if "burst" not in f.lower()]  # Remove burst flags
            print(f"[Authenticity] Batch project upload detected — organic ratio floored to {organic_ratio}")

    return {
        "burst_ratio": round(burst_ratio, 3),
        "organic_ratio": round(organic_ratio, 3),
        "pattern": pattern,
        "flags": flags,
        "total_intervals": len(intervals),
        "active_days": active_days,
    }


# ═══════════════════════════════════════════════════════
#  COMMIT MESSAGE ENTROPY
# ═══════════════════════════════════════════════════════

def calculate_message_entropy(
    commits: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """
    Shannon entropy of commit messages.
    Low entropy = repetitive/bot-like.
    High entropy = diverse/human messages.
    """
    messages = [c.get("message", "").split("\n")[0].strip().lower() for c in commits if c.get("message")]

    if not messages:
        return {"entropy": 0, "normalized_entropy": 0, "unique_ratio": 0, "flags": []}

    all_words: List[str] = []
    for msg in messages:
        all_words.extend(msg.split())

    word_counts = Counter(all_words)
    total_words = len(all_words)
    flags: List[str] = []

    if total_words == 0:
        return {"entropy": 0, "normalized_entropy": 0, "unique_ratio": 0, "flags": []}

    entropy = -sum(
        (count / total_words) * math.log2(count / total_words)
        for count in word_counts.values()
        if count > 0
    )

    max_entropy = math.log2(total_words) if total_words > 0 else 1
    normalized_entropy = entropy / max_entropy if max_entropy > 0 else 0

    unique_messages = len(set(messages))
    unique_ratio = unique_messages / len(messages) if messages else 0

    if normalized_entropy < 0.3 and len(messages) > 10:
        flags.append("Very low commit message entropy — repetitive/automated patterns")
        proof.add(
            evidence_type="authenticity_flag",
            detail=f"Commit message entropy: {normalized_entropy:.3f} — {unique_messages}/{len(messages)} unique",
        )

    if unique_ratio < 0.3 and len(messages) > 10:
        flags.append(f"Only {unique_ratio:.0%} of commit messages are unique")

    single_word = sum(1 for m in messages if len(m.split()) <= 1)
    single_word_ratio = single_word / len(messages) if messages else 0

    if single_word_ratio > 0.5 and len(messages) > 5:
        flags.append(f"{single_word_ratio:.0%} of commits have single-word messages")

    return {
        "entropy": round(entropy, 3),
        "normalized_entropy": round(normalized_entropy, 3),
        "unique_ratio": round(unique_ratio, 3),
        "single_word_ratio": round(single_word_ratio, 3),
        "flags": flags,
    }


# ═══════════════════════════════════════════════════════
#  PR vs DIRECT COMMIT ANALYSIS
# ═══════════════════════════════════════════════════════

def analyze_pr_ratio(
    events: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """
    Analyze PR vs direct push ratio.

    FIX: Solo developers ALWAYS push directly — this is normal behavior.
    We no longer flag direct-push-only as a risk signal for individual accounts.
    Only flag if the developer explicitly CLAIMS to have led a team or done code reviews.
    """
    push_events = sum(1 for e in events if e.get("type") == "PushEvent")
    pr_events = sum(1 for e in events if e.get("type") == "PullRequestEvent")
    review_events = sum(1 for e in events if e.get("type") in (
        "PullRequestReviewEvent", "PullRequestReviewCommentEvent"
    ))

    total = push_events + pr_events
    pr_ratio = pr_events / max(total, 1)

    # NOTE: We intentionally do NOT flag direct-push-only patterns.
    # Solo developers always push directly. This is expected behavior.
    # PR workflow is a bonus signal, not a requirement.
    flags: List[str] = []

    return {
        "push_events": push_events,
        "pr_events": pr_events,
        "review_events": review_events,
        "pr_ratio": round(pr_ratio, 3),
        "uses_pr_workflow": pr_ratio > 0.1,
        "flags": flags,  # No flags for direct-push-only
    }


# ═══════════════════════════════════════════════════════
#  REPO OWNERSHIP ANALYSIS
# ═══════════════════════════════════════════════════════

def analyze_ownership(
    repos: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """Analyze ratio of owned vs contributed/forked repos."""
    total = len(repos)
    if total == 0:
        return {"owned": 0, "forked": 0, "ownership_ratio": 0, "flags": []}

    forked = sum(1 for r in repos if r.get("is_fork", r.get("fork", False)))
    owned = total - forked

    substantive_owned = sum(
        1 for r in repos
        if not r.get("is_fork", False) and r.get("size", 0) > 100
    )

    starred_owned = sum(
        1 for r in repos
        if not r.get("is_fork", False) and r.get("stars", 0) > 0
    )

    ownership_ratio = owned / total
    flags: List[str] = []

    if ownership_ratio < 0.3:
        flags.append(f"Only {ownership_ratio:.0%} of repos are original — mostly forks")
        proof.add(
            evidence_type="authenticity_flag",
            detail=f"Ownership ratio: {owned}/{total} repos original ({ownership_ratio:.0%})",
        )

    if substantive_owned < 3 and total > 10:
        flags.append(f"Only {substantive_owned} substantive original repos despite {total} total repos")

    # Clone farm detection
    sizes = [r.get("size", 0) for r in repos if not r.get("is_fork", False)]
    if len(sizes) > 5:
        unique_sizes = len(set(sizes))
        if unique_sizes < len(sizes) * 0.4:
            flags.append("Many repos with identical sizes — possible automated creation")
            proof.add(
                evidence_type="anti_cheat",
                detail=f"Clone farm signal: {unique_sizes}/{len(sizes)} unique sizes",
            )

    return {
        "owned": owned,
        "forked": forked,
        "substantive_owned": substantive_owned,
        "starred_owned": starred_owned,
        "ownership_ratio": round(ownership_ratio, 3),
        "flags": flags,
    }


# ═══════════════════════════════════════════════════════
#  CODE SIMILARITY DETECTION (HASH-BASED)
# ═══════════════════════════════════════════════════════

def _compute_file_fingerprint(content: str) -> int:
    import hashlib
    lines = content.split("\n")
    normalized = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith(("#", "//", "*", "/*", "<!--")):
            continue
        normalized.append(stripped.lower())

    text = "\n".join(normalized)
    return int(hashlib.md5(text.encode("utf-8", errors="ignore")).hexdigest()[:16], 16)


def detect_cross_repo_similarity(
    file_contents: List[Dict[str, str]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """Detect suspiciously similar code across repos using hash-based fingerprinting."""
    from collections import defaultdict
    from difflib import SequenceMatcher

    if len(file_contents) < 2:
        return {"similarity_score": 0, "duplicate_files": [], "duplicate_count": 0, "risk": "NONE"}

    by_name: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    fingerprints: Dict[int, List[str]] = defaultdict(list)

    for fc in file_contents:
        path = fc.get("path", "")
        content = fc.get("content", "")
        if not content or len(content) < 50:
            continue

        basename = path.rsplit("/", 1)[-1] if "/" in path else path
        fp = _compute_file_fingerprint(content)
        parts = path.split("/")
        repo_hint = parts[0] if len(parts) > 1 else "unknown"

        entry = {
            "path": path,
            "repo_hint": repo_hint,
            "fingerprint": fp,
            "content_preview": content[:500],
        }

        by_name[basename].append(entry)
        fingerprints[fp].append(path)

    duplicate_files: List[Dict[str, Any]] = []
    exact_dupe_counts: List[int] = []

    for fp, paths in fingerprints.items():
        if len(paths) >= 2:
            repos = set()
            for p in paths:
                parts = p.split("/")
                repos.add(parts[0] if len(parts) > 1 else p)
            if len(repos) >= 2:
                exact_dupe_counts.append(len(paths) - 1)
                duplicate_files.append({
                    "type": "exact_duplicate",
                    "files": paths[:5],
                    "severity": "HIGH",
                })

    fuzzy_similarities: List[float] = []
    for basename, entries in by_name.items():
        if len(entries) < 2:
            continue
        for i in range(len(entries)):
            for j in range(i + 1, min(len(entries), i + 5)):
                if entries[i]["repo_hint"] == entries[j]["repo_hint"]:
                    continue
                sim = SequenceMatcher(
                    None,
                    entries[i]["content_preview"],
                    entries[j]["content_preview"],
                ).ratio()
                fuzzy_similarities.append(sim)
                if sim > 0.85:
                    duplicate_files.append({
                        "type": "high_similarity",
                        "file": basename,
                        "similarity": round(float(sim), 2),
                        "paths": [entries[i]["path"], entries[j]["path"]],
                        "severity": "HIGH" if sim > 0.95 else "MEDIUM",
                    })

    avg_similarity = sum(fuzzy_similarities) / len(fuzzy_similarities) if fuzzy_similarities else 0
    total_dupes = sum(exact_dupe_counts) + sum(1 for s in fuzzy_similarities if s > 0.85)

    if total_dupes >= 5 or avg_similarity > 0.8:
        risk = "HIGH"
    elif total_dupes >= 2 or avg_similarity > 0.6:
        risk = "MEDIUM"
    elif total_dupes >= 1:
        risk = "LOW"
    else:
        risk = "NONE"

    if risk in ("HIGH", "MEDIUM"):
        proof.add(
            evidence_type="anti_cheat",
            detail=f"Cross-repo similarity: {avg_similarity:.0%} avg, {total_dupes} duplicates — risk: {risk}",
        )

    return {
        "similarity_score": round(float(avg_similarity), 3),
        "duplicate_files": duplicate_files[:10],
        "duplicate_count": int(total_dupes),
        "risk": risk,
    }


# ═══════════════════════════════════════════════════════
#  COMMIT MESSAGE QUALITY ANALYSIS
# ═══════════════════════════════════════════════════════

def analyze_commit_quality(
    commits: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """Analyze commit message quality using regex patterns."""
    if not commits:
        return {
            "quality_score": 100, 
            "ai_commit_suspicion": False, 
            "flags": [],
            "lazy_ratio": 0.0,
            "conventional_ratio": 0.0
        }

    messages = [c.get("message", "").split("\n")[0].strip() for c in commits if c.get("message")]
    flags: List[Dict[str, str]] = []

    if not messages:
        return {
            "quality_score": 100, 
            "ai_commit_suspicion": False, 
            "flags": [],
            "lazy_ratio": 0.0,
            "conventional_ratio": 0.0
        }

    conventional_regex = re.compile(r"^(feat|fix|chore|docs|style|refactor|test|build|ci|perf)(\(.+\))?:", re.IGNORECASE)
    lazy_regex = re.compile(r"^(update|fix|test|wip|done|stuff|changes|\.|\-)$", re.IGNORECASE)

    conventional_count = sum(1 for m in messages if conventional_regex.match(m))
    lazy_count = sum(1 for m in messages if lazy_regex.match(m))

    total = len(messages)
    lazy_ratio = lazy_count / total
    
    quality_score = 100
    ai_commit_suspicion = False
    penalties = 0

    if lazy_ratio > 0.8 and total > 50:
        penalties = 20
        ai_commit_suspicion = True
    elif lazy_ratio > 0.3:
        penalties = 10

    quality_score -= penalties
    quality_score = max(0, min(100, quality_score))
    
    if penalties > 0:
        flags.append({
            "type": "lazy_commit_messages",
            "severity": "HIGH" if ai_commit_suspicion else "MEDIUM",
            "detail": f"{lazy_ratio:.0%} of commits use lazy/vague messages (-{penalties} pts)",
        })

    return {
        "quality_score": quality_score,
        "lazy_ratio": round(lazy_ratio, 3),
        "conventional_ratio": round(conventional_count / total, 3),
        "ai_commit_suspicion": ai_commit_suspicion,
        "flags": flags,
    }



# ═══════════════════════════════════════════════════════
#  AI-GENERATED CODE DETECTION (12 STRUCTURAL HEURISTICS)
# ═══════════════════════════════════════════════════════

import statistics as _stats

def detect_ai_generated_code(
    file_contents: List[Dict[str, str]],
    proof: ProofCollector,
    commit_quality_score: float = 100.0,
    code_quality_score: float = 50.0,
    readme_quality_score: float = 5.0,
) -> Dict[str, Any]:
    """
    Detect AI-generated code using 12 structural heuristic patterns.

    Each triggered pattern adds suspicion points. Total is capped at 100.
    Scores > 60 = HIGH_AI_SUSPICION, > 40 = MODERATE, < 20 = LIKELY_AUTHENTIC.
    """
    if not file_contents:
        return {"ai_code_score": 0, "signals": [], "likely_ai": False,
                "authenticity_label": "LIKELY_AUTHENTIC", "pattern_details": {}}

    suspicion = 0
    signals: List[str] = []
    pattern_details: Dict[str, Any] = {}

    all_contents = [fc.get("content", "") for fc in file_contents if fc.get("content")]
    all_content_joined = "\n".join(all_contents)
    total_files = len(all_contents)

    if total_files == 0:
        return {"ai_code_score": 0, "signals": [], "likely_ai": False,
                "authenticity_label": "LIKELY_AUTHENTIC", "pattern_details": {}}

    # ─── Pattern 1: Universal docstrings ───
    total_functions = 0
    functions_with_docstrings = 0
    for content in all_contents:
        # Count Python def/class
        func_matches = re.findall(r'^\s*(?:def |class )\w+', content, re.MULTILINE)
        total_functions += len(func_matches)
        # Count docstrings after def/class
        doc_matches = re.findall(r'(?:def |class )\w+[^:]*:\s*\n\s+(?:"""|\'\'\')' , content, re.MULTILINE)
        functions_with_docstrings += len(doc_matches)

    if total_functions > 5:
        docstring_coverage = functions_with_docstrings / total_functions
        pattern_details["docstring_coverage"] = round(docstring_coverage, 2)
        if docstring_coverage > 0.90:
            suspicion += 10
            signals.append(f"P1: {docstring_coverage:.0%} functions have docstrings — unusually thorough")

    # ─── Pattern 3: Zero breadcrumb comments (TODO/FIXME/HACK/XXX) ───
    has_todos = any(
        marker in content for content in all_contents
        for marker in ["TODO", "FIXME", "HACK", "XXX", "TEMP", "WORKAROUND"]
    )
    pattern_details["has_todos"] = has_todos
    if not has_todos and total_files > 5:
        suspicion += 7
        signals.append("P3: Zero TODO/FIXME/HACK comments across all files — humans always leave breadcrumbs")

    # ─── Pattern 4: Zero debug artifacts ───
    debug_patterns = [
        r'print\(["\'](?:here|test|debug|check)',
        r'console\.log\(["\']test',
        r'print\(f?["\']---',
        r'debugger;',
        r'breakpoint\(\)',
        r'import pdb',
        r'pdb\.set_trace',
    ]
    has_debug = any(
        re.search(p, content, re.IGNORECASE)
        for content in all_contents
        for p in debug_patterns
    )
    pattern_details["has_debug_artifacts"] = has_debug
    if not has_debug and total_files > 3:
        suspicion += 6
        signals.append("P4: Zero debug artifacts (print debug, breakpoints) — suspicious cleanliness")

    # ─── Pattern 5: Perfect type hints (Python only) ───
    py_files = [c for fc, c in zip(file_contents, all_contents) if fc.get("path", "").endswith(".py")]
    if py_files:
        typed_funcs = sum(len(re.findall(r'def \w+\([^)]*:.*?\)\s*->', c)) for c in py_files)
        total_py_funcs = sum(len(re.findall(r'def \w+\(', c)) for c in py_files)
        if total_py_funcs > 5:
            type_coverage = typed_funcs / total_py_funcs
            pattern_details["type_hint_coverage"] = round(type_coverage, 2)
            if type_coverage > 0.95:
                suspicion += 8
                signals.append(f"P5: {type_coverage:.0%} type hint coverage — unusually perfect for all devs")

    # ─── Pattern 6: Identical boilerplate across files ───
    if total_files >= 3:
        first_lines = []
        for content in all_contents:
            lines = [l.strip() for l in content.split("\n")[:5] if l.strip()]
            first_lines.append("\n".join(lines[:3]))
        if first_lines:
            from collections import Counter as _Counter
            line_counts = _Counter(first_lines)
            most_common_count = line_counts.most_common(1)[0][1] if line_counts else 0
            if most_common_count >= 3:
                suspicion += 9
                signals.append(f"P6: {most_common_count} files share identical opening structure")

    # ─── Pattern 7: Perfect error handling consistency ───
    try_count = all_content_joined.count("try:")
    except_count = len(re.findall(r'except\s+\w+', all_content_joined))
    bare_except = all_content_joined.count("except:")
    if try_count > 5 and bare_except == 0 and total_functions > 5:
        try_ratio = try_count / max(total_functions, 1)
        if try_ratio > 0.5:
            suspicion += 7
            signals.append(f"P7: Every function has try/except with zero bare excepts — unusually consistent")

    # ─── Pattern 8: README quality vs code quality mismatch ───
    pattern_details["readme_quality"] = readme_quality_score
    pattern_details["code_quality"] = code_quality_score
    if readme_quality_score > 8.5 and code_quality_score < 40:
        suspicion += 10
        signals.append("P8: Perfect README but poor code quality — ChatGPT README pattern")

    # ─── Pattern 9: No single-character variable names ───
    total_lines = sum(len(c.split("\n")) for c in all_contents)
    has_single_vars = any(re.search(r'\b[a-z]\s*=\s*', c) for c in all_contents)
    pattern_details["has_single_char_vars"] = has_single_vars
    if not has_single_vars and total_lines > 200:
        suspicion += 5
        signals.append("P9: Zero single-character variables in 200+ lines — AI uses descriptive names")

    # ─── Pattern 10: Import organization too perfect ───
    perfect_imports = 0
    for content in all_contents:
        lines = content.split("\n")
        import_section = []
        for line in lines:
            stripped = line.strip()
            if stripped.startswith(("import ", "from ")):
                import_section.append(stripped)
            elif import_section and stripped and not stripped.startswith("#"):
                break
        if len(import_section) >= 3:
            # Check if imports are alphabetically sorted
            if import_section == sorted(import_section):
                perfect_imports += 1

    if total_files >= 3 and perfect_imports >= 3:
        suspicion += 4
        signals.append(f"P10: {perfect_imports} files have perfectly sorted imports")

    # ─── Pattern 11: Commit message vs code quality mismatch ───
    pattern_details["commit_quality"] = commit_quality_score
    if commit_quality_score > 80 and code_quality_score < 30:
        suspicion += 12
        signals.append("P11: Perfect commit messages but terrible code quality — huge red flag")

    # ─── Pattern 12: Tutorial structure detection ───
    all_paths = [fc.get("path", "").lower() for fc in file_contents]
    tutorial_patterns = [
        {"files": ["app.py", "requirements.txt", "readme.md", "templates/"], "name": "Flask tutorial"},
        {"files": ["index.js", "package.json", "public/", "src/app."], "name": "React CRA"},
        {"files": ["manage.py", "settings.py", "urls.py", "views.py"], "name": "Django tutorial"},
    ]
    for tp in tutorial_patterns:
        matches = sum(1 for f in tp["files"] if any(f in p for p in all_paths))
        if matches >= len(tp["files"]) - 1 and total_files <= len(tp["files"]) + 3:
            suspicion += 15
            signals.append(f"P12: File structure matches '{tp['name']}' tutorial template exactly")
            break

    # ─── Also check for literal AI text signatures (keep from before) ───
    literal_ai_patterns = [
        (r"As an AI", 15), (r"As a language model", 15),
        (r"Happy coding!", 10), (r"Let me know if", 8),
    ]
    for pattern, weight in literal_ai_patterns:
        count = len(re.findall(pattern, all_content_joined, re.IGNORECASE))
        if count > 0:
            suspicion += min(count * weight, 30)
            signals.append(f"AI text signature: '{pattern}' ({count}x)")

    # ─── Final score ───
    ai_score = min(suspicion, 100)

    # FIX 9: Lower threshold: 25+ is suspicious, 40+ is likely AI
    likely_ai = ai_score >= 25
    suspicion_level = (
        "HIGH" if ai_score >= 40
        else "MODERATE" if ai_score >= 25
        else "LOW" if ai_score >= 12
        else "NONE"
    )

    # Recalculate label with new thresholds
    if ai_score >= 60:
        authenticity_label = "AI-Generated"
    elif ai_score >= 40:
        authenticity_label = "Likely AI-Assisted"
    elif ai_score >= 25:
        authenticity_label = "Possibly AI-Assisted"
    else:
        authenticity_label = "Likely Human"

    if ai_score >= 20:
        proof.add(
            evidence_type="ai_detection",
            detail=f"AI code suspicion: {ai_score}/100 ({authenticity_label}) — {', '.join(signals[:3])}",
        )

    return {
        "ai_code_score": ai_score,
        "signals": signals[:8],
        "likely_ai": likely_ai,
        "ai_suspicion_level": suspicion_level,
        "authenticity_label": authenticity_label,
        "pattern_details": pattern_details,
    }


# ═══════════════════════════════════════════════════════
#  COMMIT SIZE DISTRIBUTION ANALYSIS
# ═══════════════════════════════════════════════════════

def analyze_commit_size_distribution(
    commits: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """Analyze commit sizes. Flag accounts where >50% of commits add 500+ lines."""
    if not commits:
        return {"oversized_ratio": 0, "avg_changes": 0, "flags": [], "total_commits": 0}

    flags: List[str] = []
    sizes: List[int] = []
    oversized_list: List[int] = []

    for c in commits:
        stats = c.get("stats", {})
        if isinstance(stats, dict):
            additions = stats.get("additions", 0)
            deletions = stats.get("deletions", 0)
            total_changes = additions + deletions
        else:
            total_changes = 0

        sizes.append(total_changes)
        if total_changes >= 500:
            oversized_list.append(1)

    total = len(sizes)
    oversized = sum(oversized_list)
    oversized_ratio = oversized / max(total, 1)
    avg_changes = sum(sizes) / max(total, 1)

    if oversized_ratio > 0.5:
        flags.append(f"{oversized_ratio:.0%} of commits are oversized (500+ line changes)")
        proof.add(
            evidence_type="commit_pattern",
            detail=f"High oversized commit ratio: {oversized_ratio:.0%}",
        )
    elif oversized_ratio > 0.3:
        flags.append(f"{oversized_ratio:.0%} of commits have 500+ line changes")

    total_additions = sum(
        c.get("stats", {}).get("additions", 0)
        for c in commits if isinstance(c.get("stats"), dict)
    )
    if len(commits) > 20 and total_additions < 100 and sum(sizes) > 0:
        flags.append(
            "Very low actual code contribution despite many commits — possibly just trivial changes"
        )

    return {
        "oversized_ratio": round(float(oversized_ratio), 4),
        "avg_changes": round(float(avg_changes), 1),
        "oversized_count": int(oversized),
        "total_commits": total,
        "total_user_additions": total_additions,
        "flags": flags,
    }


# ═══════════════════════════════════════════════════════
#  EXTERNAL PR ANALYSIS
# ═══════════════════════════════════════════════════════

def analyze_external_prs(
    events: List[Dict[str, Any]],
    username: str,
    proof: ProofCollector,
) -> Dict[str, Any]:
    """Score PullRequestEvents on external repositories."""
    external_prs = [
        e for e in events
        if e.get("type") == "PullRequestEvent"
        and e.get("repo_name") and not e["repo_name"].startswith(username + "/")
        and e.get("action") == "opened"
    ]
    
    pr_points = 0
    external_contributions = []
    
    for pr in external_prs:
        stars = pr.get("stars", 0)
        repo_name = pr.get("repo_name", "")
        if stars >= 1000:
            points = 15
        elif stars >= 100:
            points = 8
        elif stars >= 1:
            points = 3
        else:
            points = 0
            
        pr_points += points
        external_contributions.append({
            "repo_name": repo_name,
            "stars": stars,
            "points": points,
            "date": pr.get("created_at")
        })
        
    if external_contributions:
        proof.add(
            evidence_type="external_contributions",
            detail=f"Found {len(external_contributions)} external PRs, earning {min(pr_points, 30)} points."
        )

    return {
        "external_contributions": external_contributions,
        "pr_points": min(pr_points, 30)
    }


# ═══════════════════════════════════════════════════════
#  COMMIT BURST DETECTION (AI-WRITTEN CODE FLAG)
# ═══════════════════════════════════════════════════════

def detect_commit_burst(commits: list) -> dict:
    """
    Detect suspiciously large commit bursts — a key fraud signal.
    Organic developers commit steadily.
    Resume padding = 50 commits pushed in one night.
    """
    if not commits:
        return {"burst_detected": False, "burst_score": 0, "details": ""}

    from collections import defaultdict

    # Group commits by date
    daily_counts = defaultdict(int)
    for c in commits:
        date_str = str(c.get("date", ""))[:10]  # YYYY-MM-DD
        if date_str and date_str != "None":
            daily_counts[date_str] += 1

    if not daily_counts:
        return {"burst_detected": False, "burst_score": 0, "details": ""}

    max_day = max(daily_counts, key=daily_counts.get)
    max_count = daily_counts[max_day]
    total_commits = sum(daily_counts.values())
    active_days = len(daily_counts)

    avg_per_day = total_commits / max(active_days, 1)

    burst_ratio = max_count / max(avg_per_day, 1)
    burst_detected = max_count >= 20 and burst_ratio >= 5.0

    burst_score = 0
    if max_count >= 50:
        burst_score = 10
    elif max_count >= 30:
        burst_score = 7
    elif max_count >= 20:
        burst_score = 5
    elif max_count >= 10 and burst_ratio >= 4:
        burst_score = 3

    details = ""
    if burst_detected:
        details = f"{max_count} commits on {max_day} (avg: {avg_per_day:.1f}/day)"

    return {
        "burst_detected": burst_detected,
        "burst_score": burst_score,
        "max_single_day": max_count,
        "max_day_date": max_day,
        "avg_commits_per_day": round(avg_per_day, 2),
        "burst_ratio": round(burst_ratio, 2),
        "details": details,
    }


# ═══════════════════════════════════════════════════════
#  MASTER AUTHENTICITY SCORE
# ═══════════════════════════════════════════════════════

def _compute_evidence_floor(repos: List[Dict[str, Any]], commits: List[Dict[str, Any]]) -> float:
    """
    Compute an evidence-aware minimum authenticity floor.

    A real developer with substantive activity cannot have near-zero authenticity.
    If the formula produces a score below this floor, it indicates a calibration
    issue in the engine — not evidence of fraud.

    Returns a floor value in 0-100 scale.
    """
    non_fork = [r for r in repos if not r.get("is_fork", r.get("fork", False))]
    repo_count = len(non_fork)
    commit_count = len(commits)
    total_repos = len(repos)

    if repo_count >= 15 and commit_count >= 100:
        return 35.0
    if repo_count >= 10 and commit_count >= 50:
        return 28.0
    if repo_count >= 5 and commit_count >= 20:
        return 20.0
    if repo_count >= 3 or total_repos >= 5:
        return 12.0
    return 0.0


def run_authenticity_engine(
    username: str,
    commits: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    repos: List[Dict[str, Any]],
    file_contents: Optional[List[Dict[str, str]]] = None,
    proof: Optional[ProofCollector] = None,
    account_age_years: float = 0.0,
) -> Dict[str, Any]:
    """
    Master function: compute authenticity score from commit patterns.

    Authenticity Score formula:
      Base: 60
      + Organic commit ratio (up to +15)
      + PR workflow usage (+5/+3) [bonus only, no penalty for solo devs]
      + Ownership ratio (+10)
      - Burst ratio penalty (up to -20)
      - Low entropy penalty (up to -15)
      - Repetition/similarity penalty (up to -15)
      - Single word messages penalty (up to -8)
      - Commit quality penalty (up to -5)
      - AI-generated code penalty (up to -10, now requires stronger signals)
      - Oversized commit penalty (up to -8)
      + Evidence floor applied at end to prevent calibration bugs

    Output: 0.0-1.0 (intentional — scoring_engine normalizes to 0-100)
    """
    if proof is None:
        proof = ProofCollector()

    frequency = analyze_commit_frequency(commits, proof)
    entropy = calculate_message_entropy(commits, proof)
    pr_data = analyze_pr_ratio(events, proof)
    ownership = analyze_ownership(repos, proof)
    commit_quality = analyze_commit_quality(commits, proof)

    similarity = {"similarity_score": 0, "duplicate_files": [], "duplicate_count": 0, "risk": "NONE"}
    if file_contents:
        similarity = detect_cross_repo_similarity(file_contents, proof)

    ai_detection = {"ai_code_score": 0, "signals": [], "likely_ai": False}
    if file_contents:
        ai_detection = detect_ai_generated_code(file_contents, proof)

    commit_size_dist = analyze_commit_size_distribution(commits, proof)
    ext_prs = analyze_external_prs(events, username, proof)
    commit_burst = detect_commit_burst(commits)

    # ─── Authenticity Score (0-100 before floor) ───
    score = 60.0

    # Organic commit bonus
    score += min(frequency["organic_ratio"] * 15, 15)

    # Burst penalty
    score -= min(frequency["burst_ratio"] * 20, 20)

    # PR workflow bonus (bonus only, no penalty — solo devs never use PRs)
    if pr_data["uses_pr_workflow"]:
        score += 5
    if pr_data["review_events"] > 3:
        score += 3

    # Ownership bonus
    score += min(ownership["ownership_ratio"] * 10, 10)

    # External PR contributions bonus
    score += ext_prs["pr_points"]

    # Entropy penalty
    if entropy.get("normalized_entropy", 1) < 0.3:
        score -= 15
    elif entropy.get("normalized_entropy", 1) < 0.5:
        score -= 8

    # Similarity penalty
    if similarity["risk"] == "HIGH":
        score -= 15
    elif similarity["risk"] == "MEDIUM":
        score -= 8
    elif similarity["risk"] == "LOW":
        score -= 3

    # Single word messages penalty
    single_ratio = entropy.get("single_word_ratio", 0)
    if single_ratio > 0.5:
        score -= 8
    elif single_ratio > 0.3:
        score -= 4

    # Commit quality penalty
    cq = commit_quality.get("quality_score", 100)
    if cq < 40:
        score -= 5
    elif cq < 60:
        score -= 2

    # AI-generated code penalty (FIX 9: tiered penalties)
    ai_score_val = float(ai_detection.get("ai_code_score", 0))
    if ai_score_val >= 60:
        score -= 25
    elif ai_score_val >= 40:
        score -= 15
    elif ai_score_val >= 25:
        score -= 8   # FIX 9: was missing, causing no penalty at 25-39
        
    # Oversized commit penalty
    if commit_size_dist["oversized_ratio"] > 0.5:
        score -= 8
    elif commit_size_dist["oversized_ratio"] > 0.3:
        score -= 4

    # Commit burst penalty (FIX 3: detect suspicious single-day spikes)
    if commit_burst["burst_detected"]:
        score -= min(commit_burst["burst_score"], 10)

    score = max(0, min(100, round(score)))

    # ─── Evidence-based floor ───
    floor = _compute_evidence_floor(repos, commits)
    if score < floor:
        log.warning(
            f"[Authenticity] Computed score {score} is below evidence floor {floor:.0f} "
            f"(repos={len(repos)}, commits={len(commits)}). Applying floor."
        )
        score = floor

    # ─── Account age context (Bug 4b fix) ───
    # New developers with real repos deserve higher floors
    account_age_months = account_age_years * 12
    if account_age_months < 18:
        non_fork = [r for r in repos if not r.get("is_fork", r.get("fork", False))]
        repo_count = len(non_fork)
        if repo_count >= 5:
            score = max(score, 55.0)  # 55% if 5+ repos for new devs
            log.info(f"[Authenticity] New dev ({account_age_months:.0f}mo) with {repo_count} repos — floor raised to 55")
        elif repo_count >= 3:
            score = max(score, 45.0)  # 45% if 3+ repos for new devs
            log.info(f"[Authenticity] New dev ({account_age_months:.0f}mo) with {repo_count} repos — floor raised to 45")

    score = round(score)

    # ─── Aggregate risk flags ───
    all_flags: List[Dict[str, str]] = []

    for flag in frequency["flags"]:
        all_flags.append({"flag": flag, "type": "commit_pattern", "severity": "HIGH"})
    for flag in entropy["flags"]:
        all_flags.append({"flag": flag, "type": "message_entropy", "severity": "MEDIUM"})
    for flag in pr_data["flags"]:
        # PR flags are now INFO level only
        all_flags.append({"flag": flag, "type": "workflow", "severity": "LOW"})
    for flag in ownership["flags"]:
        all_flags.append({"flag": flag, "type": "ownership", "severity": "HIGH"})
    for flag_obj in commit_quality.get("flags", []):
        all_flags.append({
            "flag": flag_obj["detail"],
            "type": flag_obj["type"],
            "severity": flag_obj["severity"],
        })

    if ai_detection["likely_ai"]:
        all_flags.append({
            "flag": f"AI-generated code patterns detected (score: {ai_detection['ai_code_score']})",
            "type": "ai_detection",
            "severity": "HIGH",
        })

    for flag in commit_size_dist.get("flags", []):
        all_flags.append({
            "flag": flag,
            "type": "commit_size",
            "severity": "MEDIUM",
        })

    if similarity["risk"] in ("HIGH", "MEDIUM"):
        all_flags.append({
            "flag": f"Cross-repo code similarity detected ({similarity['duplicate_count']} duplicates)",
            "type": "code_similarity",
            "severity": similarity["risk"],
        })

    # Commit burst flag (FIX 3)
    if commit_burst["burst_detected"]:
        all_flags.append({
            "flag": f"Commit burst detected: {commit_burst['details']}",
            "type": "commit_burst",
            "severity": "HIGH" if commit_burst["burst_score"] >= 7 else "MEDIUM",
        })

    # Only add CRITICAL flag if score is genuinely very low AND we have enough data
    if score < 25 and len(commits) >= 10:
        all_flags.append({
            "flag": "Profile shows strong signals of manipulation or fabrication",
            "type": "overall_authenticity",
            "severity": "CRITICAL",
        })

    risk = "LOW"
    if score < 40 and any(f["severity"] == "CRITICAL" for f in all_flags):
        risk = "HIGH"
    elif score < 60 or any(f["severity"] == "HIGH" for f in all_flags):
        risk = "MEDIUM"

    ai_score = ai_detection.get("ai_code_score", 0)
    if ai_score >= 80:
        authenticity_label = "AI-Generated"
    elif ai_score >= 40:
        authenticity_label = "AI-Assisted"
    else:
        authenticity_label = "Human"

    proof.add_metric("authenticity_score", score)

    log.info(
        f"[Authenticity] score={score} | organic={frequency['organic_ratio']:.2f} "
        f"burst={frequency['burst_ratio']:.2f} | repos={len(repos)} commits={len(commits)} "
        f"floor={floor} label={authenticity_label}"
    )

    return {
        "authenticity_score": score / 100.0,  # 0.0-1.0 format for scoring_engine
        "authenticity_score_pct": score,       # 0-100 format for display
        "authenticity_label": authenticity_label,
        "external_contributions": ext_prs["external_contributions"],
        "risk": risk,
        "signals": all_flags,
        "risk_flags": all_flags,
        "commit_frequency": frequency,
        "message_entropy": entropy,
        "pr_analysis": pr_data,
        "ownership_analysis": ownership,
        "code_similarity": similarity,
        "commit_quality": commit_quality,
        "ai_code_detection": ai_detection,
        "commit_size_distribution": commit_size_dist,
        "commit_burst": commit_burst,
        "evidence_floor_applied": score == floor and floor > 0,
        "code_repetition": {
            "repetition_detected": similarity["risk"] in ("HIGH", "MEDIUM"),
            "similarity_score": similarity["similarity_score"],
            "flags": [f["flag"] for f in all_flags if f["type"] == "code_similarity"],
        },
    }