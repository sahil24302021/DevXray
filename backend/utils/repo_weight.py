"""
Repository Quality Weighting System.

Assigns a deterministic quality weight to each repository
based on stars, forks, size, and complexity signals.

Formula:
  weight = (
    log(stars + 1) * 0.4 +
    log(forks + 1) * 0.2 +
    size_score * 0.2 +
    complexity_score * 0.2
  )

Used by:
  - code_intelligence (weight analyses toward high-quality repos)
  - skill_verification (weight skill scores by repo quality)
  - scoring_engine (prioritize meaningful projects)
"""
import math
from typing import Any, Dict, List

from utils.logging_config import get_logger

log = get_logger("repo_weight")


def _compute_size_score(size_kb: int) -> float:
    """
    Score repo size on 0-1 scale.
    Prefers medium-to-large repos (real projects), penalizes extremes.
    """
    if size_kb <= 0:
        return 0.0
    if size_kb < 10:
        return 0.05  # Nearly empty
    if size_kb < 50:
        return 0.1
    if size_kb < 200:
        return 0.2
    if size_kb < 1000:
        return 0.4
    if size_kb < 5000:
        return 0.6
    if size_kb < 20000:
        return 0.8
    if size_kb < 100000:
        return 1.0
    # Extremely large repos (>100MB) may be data dumps
    return 0.7


def _compute_complexity_score(repo: Dict[str, Any]) -> float:
    """
    Heuristic complexity score based on metadata signals.
    """
    score = 0.0

    # Has description (min 10 chars)
    desc = repo.get("description", "") or ""
    if len(desc) > 10:
        score += 0.15

    # Has topics/tags
    topics = repo.get("topics", [])
    if len(topics) >= 1:
        score += 0.1
    if len(topics) >= 3:
        score += 0.1

    # Has open issues (indicates active project)
    if repo.get("open_issues", repo.get("open_issues_count", 0)) > 0:
        score += 0.1

    # Has wiki
    if repo.get("has_wiki", False):
        score += 0.05

    # Has pages (deployed project)
    if repo.get("has_pages", False):
        score += 0.1

    # Multiple watchers
    watchers = repo.get("watchers", repo.get("watchers_count", 0))
    if watchers > 5:
        score += 0.15
    elif watchers > 0:
        score += 0.05

    # Size indicates real project
    size = repo.get("size", 0)
    if size > 1000:  # >1MB
        score += 0.15
    elif size > 200:
        score += 0.1

    # Has a primary language
    if repo.get("language"):
        score += 0.1

    return min(score, 1.0)


def compute_repo_weight(repo: Dict[str, Any]) -> float:
    """
    Compute quality weight for a single repository.

    Returns float (0-10 scale).
    Higher = more meaningful project.
    """
    stars = repo.get("stars", repo.get("stargazers_count", 0))
    forks = repo.get("forks", repo.get("forks_count", 0))
    size = repo.get("size", 0)
    is_fork = repo.get("is_fork", repo.get("fork", False))

    # Core formula
    star_component = math.log10(stars + 1) * 0.4
    fork_component = math.log10(forks + 1) * 0.2
    size_component = _compute_size_score(size) * 0.2
    complexity_component = _compute_complexity_score(repo) * 0.2

    weight = star_component + fork_component + size_component + complexity_component

    # Scale to 0-10
    weight = weight * 5 + 1.0  # base of 1.0

    # Fork penalty: forks are worth 30% of originals
    if is_fork:
        weight *= 0.3

    return round(max(0.1, min(10.0, weight)), 2)


def weight_repos(repos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Apply quality weights to all repos and sort by weight descending.

    Adds to each repo:
      _quality_weight: float (0-10)
      _tier: "production" | "project" | "toy"
      _weight_normalized: float (0-1, relative to max weight in set)
    """
    if not repos:
        return []

    weighted: List[Dict[str, Any]] = []
    for r in repos:
        w = compute_repo_weight(r)
        weighted.append({
            **r,
            "_quality_weight": w,
        })

    # Sort by weight descending
    weighted.sort(key=lambda r: r["_quality_weight"], reverse=True)

    # Compute normalized weights (relative to max)
    max_weight = weighted[0]["_quality_weight"] if weighted else 1.0
    if max_weight <= 0:
        max_weight = 1.0

    for r in weighted:
        r["_weight_normalized"] = round(r["_quality_weight"] / max_weight, 3)
        w = r["_quality_weight"]
        if w >= 5.0:
            r["_tier"] = "production"
        elif w >= 2.5:
            r["_tier"] = "project"
        else:
            r["_tier"] = "toy"

    return weighted


def get_repo_weight_map(repos: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Get a name → normalized_weight mapping for quick lookup.
    Used by engines to weight per-repo results.
    """
    weighted = weight_repos(repos)
    return {
        r.get("name", ""): r.get("_weight_normalized", 0.5)
        for r in weighted
        if r.get("name")
    }
