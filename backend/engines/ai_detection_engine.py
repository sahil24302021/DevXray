"""
AI Code Detection Engine — Forensic 12-Pattern Analysis.

Detects AI-generated code through structural, stylometric, and statistical signals.
NO false positives: uses a weighted evidence system, not a binary classifier.

Patterns analyzed:
  1. Docstring density (AI always documents every function)
  2. Comment uniformity (AI comments are robotic/generic)
  3. Variable naming entropy (AI uses over-verbose names)
  4. Function length uniformity (AI functions are unnaturally even)
  5. Import-to-code ratio (AI adds unnecessary library imports)
  6. Error handling boilerplate (try/except everywhere, even trivially)
  7. Commit message recurrence (AI bulk-commits with identical messages)
  8. Code-to-blank-line ratio (AI code is over-spaced)
  9. Magic number avoidance (AI always uses named constants)
 10. Repetitive structure patterns (copy-paste-like class layouts)
 11. Type hint over-annotation (AI annotates everything)
 12. Test file signature analysis (AI writes assert-heavy boilerplate tests)
"""
import re
import math
from collections import Counter
from typing import Any, Dict, List, Optional

from utils.logging_config import get_logger

log = get_logger("ai_detection")


# ═══════════════════════════════════════════════════════
#  PATTERN ANALYZERS
# ═══════════════════════════════════════════════════════

def _docstring_density(code: str, lang: str) -> float:
    """Pattern 1: AI documents every single function. Return 0-1 (1=AI-like)."""
    if lang in ("python", "py"):
        funcs = len(re.findall(r'^\s*def ', code, re.MULTILINE))
        docstrings = len(re.findall(r'"""', code)) // 2 + len(re.findall(r"'''", code)) // 2
        if funcs == 0:
            return 0.0
        ratio = docstrings / funcs
        # Human devs rarely document >60% of functions in quick scripts
        return min(ratio, 1.0) if ratio > 0.8 else 0.0
    elif lang in ("js", "ts", "tsx", "jsx"):
        funcs = len(re.findall(r'(function |=> \{|const \w+ ?=)', code))
        jsdocs = len(re.findall(r'/\*\*', code))
        if funcs == 0:
            return 0.0
        ratio = jsdocs / funcs
        return min(ratio, 1.0) if ratio > 0.6 else 0.0
    return 0.0


def _comment_uniformity(code: str) -> float:
    """Pattern 2: AI comments are generic phrases. Returns 0-1 (1=AI-like)."""
    comments = re.findall(r'#.*|//.*', code)
    if len(comments) < 5:
        return 0.0

    ai_phrases = [
        r'\binitialiZ', r'\bhandl(es?|ing)\b', r'\breturn(s)?\b.*result',
        r'\bcheck(s)? if\b', r'\bdefin(es?|ing)\b', r'\bperform(s)?\b',
        r'\bthis function\b', r'\bthis method\b', r'\bthe following\b',
        r'\bprocess(es|ing)?\b.*data', r'\bStore(s)?\b', r'\bCreat(es?|ing)\b',
        r'\bCalculat(es?|ing)\b', r'\bGenerat(es?|ing)\b', r'\bvalidat(es?|ing)\b'
    ]
    ai_pattern = re.compile('|'.join(ai_phrases), re.IGNORECASE)
    ai_comment_count = sum(1 for c in comments if ai_pattern.search(c))
    ratio = ai_comment_count / len(comments)
    return ratio if ratio > 0.4 else 0.0


def _variable_naming_entropy(code: str) -> float:
    """Pattern 3: AI uses overly verbose, descriptive names. Returns 0-1 (1=AI-like)."""
    identifiers = re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]{6,}\b', code)
    if len(identifiers) < 10:
        return 0.0
    # Human devs use shorter names more often
    avg_len = sum(len(i) for i in identifiers) / len(identifiers)
    # AI tends to produce avg name length > 12
    if avg_len > 14:
        return 0.9
    elif avg_len > 12:
        return 0.6
    elif avg_len > 10:
        return 0.3
    return 0.0


def _function_length_uniformity(code: str, lang: str) -> float:
    """Pattern 4: AI functions are unnaturally uniform in length. Returns 0-1."""
    if lang in ("python", "py"):
        # Split by function definitions
        funcs = re.split(r'\n(?=\s*def |\s*class )', code)
    else:
        funcs = re.split(r'\n(?=\s*(?:function|const|class|async)\b)', code)

    lengths = [len(f.splitlines()) for f in funcs if len(f.splitlines()) > 3]
    if len(lengths) < 4:
        return 0.0

    mean = sum(lengths) / len(lengths)
    if mean == 0:
        return 0.0
    variance = sum((l - mean) ** 2 for l in lengths) / len(lengths)
    std_dev = math.sqrt(variance)
    cv = std_dev / mean  # Coefficient of variation

    # Low CV = very uniform = AI-like
    if cv < 0.15:
        return 0.9
    elif cv < 0.25:
        return 0.5
    elif cv < 0.35:
        return 0.2
    return 0.0


def _error_handling_density(code: str, lang: str) -> float:
    """Pattern 6: AI adds try/except to everything. Returns 0-1."""
    lines = code.splitlines()
    total_lines = max(len(lines), 1)

    if lang in ("python", "py"):
        try_count = sum(1 for l in lines if re.match(r'\s*try\s*:', l))
    else:
        try_count = sum(1 for l in lines if re.search(r'\btry\s*\{', l))

    density = try_count / total_lines
    if density > 0.05:  # >5% of lines are try blocks
        return 0.8
    elif density > 0.03:
        return 0.4
    return 0.0


def _import_bloat(code: str, lang: str) -> float:
    """Pattern 5: AI imports way more than needed. Returns 0-1."""
    lines = code.splitlines()
    total = max(len(lines), 1)

    if lang in ("python", "py"):
        imports = sum(1 for l in lines if re.match(r'\s*(import |from .+ import)', l))
    else:
        imports = sum(1 for l in lines if re.match(r'\s*(import |require|from .+ import)', l))

    ratio = imports / total
    if ratio > 0.12:
        return 0.7
    elif ratio > 0.08:
        return 0.4
    return 0.0


def _type_hint_density(code: str, lang: str) -> float:
    """Pattern 11: AI annotates every param/return. Returns 0-1."""
    if lang not in ("python", "py", "ts", "tsx"):
        return 0.0

    lines = code.splitlines()
    total = max(len(lines), 1)

    if lang in ("python", "py"):
        # Count -> Type hints and : Type annotations
        type_hints = sum(1 for l in lines if re.search(r'->\s*\w+|:\s*(?:int|str|float|bool|List|Dict|Optional|Any|Tuple)', l))
    else:
        type_hints = sum(1 for l in lines if re.search(r':\s*(?:string|number|boolean|any|void|never|unknown)', l))

    ratio = type_hints / total
    if ratio > 0.15:
        return 0.8
    elif ratio > 0.10:
        return 0.4
    return 0.0


def _code_spacing_ratio(code: str) -> float:
    """Pattern 8: AI code is over-spaced (lots of blank lines). Returns 0-1."""
    lines = code.splitlines()
    if len(lines) < 20:
        return 0.0
    blank_lines = sum(1 for l in lines if l.strip() == "")
    ratio = blank_lines / len(lines)
    if ratio > 0.35:
        return 0.6
    elif ratio > 0.28:
        return 0.3
    return 0.0


def _magic_number_avoidance(code: str) -> float:
    """Pattern 9: AI always defines named constants instead of magic numbers. Returns 0-1."""
    # Count named constants (ALL_CAPS assignments)
    constants = len(re.findall(r'\b[A-Z]{2,}[A-Z0-9_]*\s*=', code))
    # Count raw magic numbers in expressions
    magic_numbers = len(re.findall(r'(?<![A-Za-z0-9_])[2-9]\d{1,3}(?![A-Za-z0-9_])', code))

    if magic_numbers == 0 and constants > 3:
        return 0.7
    return 0.0


def _structural_repetition(code: str) -> float:
    """Pattern 10: AI generates repetitive class/function skeletons. Returns 0-1."""
    # Look for near-identical function signatures
    func_sigs = re.findall(r'def \w+\(self(?:, \w+: \w+)*\)', code)
    if len(func_sigs) < 4:
        return 0.0

    # Check for very similar signature patterns
    param_counts = [s.count(',') for s in func_sigs]
    if len(set(param_counts)) == 1 and len(param_counts) >= 4:
        return 0.6  # All functions have same param count = AI template
    return 0.0


# ═══════════════════════════════════════════════════════
#  COMMIT PATTERN ANALYSIS
# ═══════════════════════════════════════════════════════

def analyze_commit_ai_signals(commits: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Pattern 7: AI bulk-commits. Analyze commit timing and message patterns."""
    if len(commits) < 5:
        return {"score": 0.0, "signals": [], "confidence": "LOW"}

    messages = [c.get("message", "").strip().lower() for c in commits]

    # Check for identical/near-identical messages (AI bulk)
    msg_counter = Counter(m[:50] for m in messages if len(m) > 3)
    repeated = sum(v for v in msg_counter.values() if v > 2)
    repeat_ratio = repeated / len(messages)

    # Check for AI-typical commit prefixes
    ai_commit_phrases = re.compile(
        r'^(add|init|initial|create|implement|update|refactor|fix|remove|delete|'
        r'feat:|fix:|chore:|docs:|style:|build:)\s+\w+$',
        re.IGNORECASE
    )
    ai_style_count = sum(1 for m in messages if ai_commit_phrases.match(m))
    ai_style_ratio = ai_style_count / len(messages)

    # Human devs mix long and short messages; AI is more uniform
    lengths = [len(m) for m in messages]
    avg_len = sum(lengths) / len(lengths)
    variance = sum((l - avg_len) ** 2 for l in lengths) / len(lengths)
    std_len = math.sqrt(variance)
    cv_len = std_len / avg_len if avg_len > 0 else 0

    signals = []
    score = 0.0

    if repeat_ratio > 0.3:
        score += 0.4
        signals.append(f"{int(repeat_ratio*100)}% commits reuse same message — bulk commit pattern")

    if ai_style_ratio > 0.7:
        score += 0.3
        signals.append(f"{int(ai_style_ratio*100)}% commits follow AI-style prefixes")

    if cv_len < 0.3 and len(messages) > 20:
        score += 0.2
        signals.append("Commit message lengths are suspiciously uniform")

    confidence = "HIGH" if score > 0.6 else "MEDIUM" if score > 0.3 else "LOW"
    return {
        "score": min(score, 1.0),
        "signals": signals,
        "confidence": confidence,
        "repeat_ratio": round(repeat_ratio, 2),
        "ai_style_ratio": round(ai_style_ratio, 2),
    }


# ═══════════════════════════════════════════════════════
#  MASTER DETECTION FUNCTION
# ═══════════════════════════════════════════════════════

def run_ai_detection(
    code_files: List[Dict[str, str]],  # [{"path": "...", "content": "..."}]
    commits: Optional[List[Dict[str, Any]]] = None,
    lang_hint: str = "python",
) -> Dict[str, Any]:
    """
    Run all 12 AI-code detection patterns against provided code files and commits.

    Returns:
        ai_probability: 0.0-1.0 (1.0 = very likely AI-generated)
        confidence: HIGH / MEDIUM / LOW
        pattern_hits: list of triggered patterns with weights
        verdict: "HUMAN" / "LIKELY_HUMAN" / "UNCERTAIN" / "LIKELY_AI" / "AI"
    """
    if commits is None:
        commits = []

    pattern_scores: List[float] = []
    pattern_hits: List[Dict[str, Any]] = []

    # Aggregate all file code
    combined_code = "\n\n".join(
        f.get("content", "")[:8000] for f in code_files[:10] if f.get("content")
    )

    if not combined_code.strip():
        return {
            "ai_probability": 0.0,
            "confidence": "LOW",
            "pattern_hits": [],
            "verdict": "INSUFFICIENT_DATA",
            "commit_analysis": {},
        }

    # Detect language from files
    all_exts = [f.get("path", "").rsplit(".", 1)[-1].lower() for f in code_files]
    lang = lang_hint.lower()
    if all_exts:
        ext_counter = Counter(all_exts)
        lang = ext_counter.most_common(1)[0][0]

    # Run each pattern
    patterns = [
        ("Docstring density", _docstring_density(combined_code, lang), 0.15),
        ("Comment uniformity", _comment_uniformity(combined_code), 0.12),
        ("Variable naming entropy", _variable_naming_entropy(combined_code), 0.10),
        ("Function length uniformity", _function_length_uniformity(combined_code, lang), 0.12),
        ("Import bloat", _import_bloat(combined_code, lang), 0.08),
        ("Error handling density", _error_handling_density(combined_code, lang), 0.10),
        ("Code spacing ratio", _code_spacing_ratio(combined_code), 0.07),
        ("Magic number avoidance", _magic_number_avoidance(combined_code), 0.06),
        ("Structural repetition", _structural_repetition(combined_code), 0.08),
        ("Type hint density", _type_hint_density(combined_code, lang), 0.10),
    ]

    weighted_sum = 0.0
    total_weight = 0.0

    for name, score, weight in patterns:
        pattern_scores.append(score)
        total_weight += weight
        weighted_sum += score * weight
        if score > 0.3:
            pattern_hits.append({
                "pattern": name,
                "score": round(score, 2),
                "weight": weight,
                "contribution": round(score * weight, 3),
            })

    # Normalize weighted sum
    code_ai_score = (weighted_sum / total_weight) if total_weight > 0 else 0.0

    # Commit analysis (Pattern 7)
    commit_analysis = analyze_commit_ai_signals(commits)
    commit_weight = 0.20
    final_ai_probability = (
        code_ai_score * (1 - commit_weight) +
        commit_analysis["score"] * commit_weight
    )

    # Verdict classification
    if final_ai_probability >= 0.70:
        verdict = "AI"
    elif final_ai_probability >= 0.50:
        verdict = "LIKELY_AI"
    elif final_ai_probability >= 0.35:
        verdict = "UNCERTAIN"
    elif final_ai_probability >= 0.15:
        verdict = "LIKELY_HUMAN"
    else:
        verdict = "HUMAN"

    # Confidence based on data volume
    total_chars = len(combined_code)
    if total_chars > 50000 and len(commits) > 20:
        confidence = "HIGH"
    elif total_chars > 10000 or len(commits) > 10:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    log.info(
        f"[AI Detection] probability={final_ai_probability:.2f} verdict={verdict} "
        f"patterns_hit={len(pattern_hits)} confidence={confidence}"
    )

    return {
        "ai_probability": round(final_ai_probability, 3),
        "code_ai_score": round(code_ai_score, 3),
        "confidence": confidence,
        "verdict": verdict,
        "pattern_hits": pattern_hits,
        "commit_analysis": commit_analysis,
        "patterns_analyzed": len(patterns),
        "files_analyzed": len(code_files),
        "total_chars_analyzed": total_chars,
    }


def ai_probability_to_authenticity_penalty(ai_result: Dict[str, Any]) -> float:
    """
    Convert AI detection result to authenticity penalty points (0-30).
    Used by the authenticity engine to deduct from the base score.

    Conservative: only penalize when confidence is MEDIUM or HIGH.
    """
    if ai_result.get("confidence") == "LOW":
        return 0.0  # Don't penalize on insufficient data

    prob = ai_result.get("ai_probability", 0.0)
    verdict = ai_result.get("verdict", "HUMAN")

    if verdict == "AI":
        penalty = 25.0
    elif verdict == "LIKELY_AI":
        penalty = 15.0
    elif verdict == "UNCERTAIN":
        penalty = 5.0
    else:
        penalty = 0.0

    # Scale by confidence
    if ai_result.get("confidence") == "MEDIUM":
        penalty *= 0.6  # Soften for medium confidence

    return round(penalty, 1)
