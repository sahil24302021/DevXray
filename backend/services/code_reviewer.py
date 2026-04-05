"""
Deep Code Review Service.
Fetches actual source code from GitHub repos and uses Gemini AI to perform
forensic-level code analysis: quality, patterns, tutorial detection,
AI-generated code signals, and architecture assessment.
"""
import json
import asyncio
from typing import Dict, Any, List, Optional

from ingestion.github_fetcher import (
    fetch_repo_tree,
    fetch_file_raw,
    fetch_repo_commits,
)
from services.gemini_client import generate_json


# Files to prioritize for code review (order matters)
PRIORITY_FILES = [
    "README.md", "readme.md", "README.rst",
    "package.json", "requirements.txt", "Pipfile", "pyproject.toml",
    "Cargo.toml", "go.mod", "pom.xml", "build.gradle",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    ".github/workflows", "Makefile",
]

# Extensions to review (source code)
CODE_EXTENSIONS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go", ".rs",
    ".cpp", ".c", ".cs", ".rb", ".php", ".swift", ".kt",
    ".vue", ".svelte", ".html", ".css", ".scss",
}

# Extensions/dirs to skip
SKIP_PATTERNS = {
    "node_modules", "vendor", "dist", "build", ".next", "__pycache__",
    "venv", ".git", "package-lock.json", "yarn.lock", ".env",
    ".min.js", ".min.css", ".map",
}

MAX_FILES_PER_REPO = 30
MAX_FILE_SIZE = 80_000  # 80KB per file
MAX_TOTAL_CONTENT = 600_000  # Push boundaries for deep traversal


def _should_skip(path: str) -> bool:
    """Check if a file path should be skipped."""
    lower = path.lower()
    for skip in SKIP_PATTERNS:
        if skip in lower:
            return True
    return False


def _is_code_file(path: str) -> bool:
    """Check if a file has a reviewable extension."""
    for ext in CODE_EXTENSIONS:
        if path.endswith(ext):
            return True
    return False


def _is_priority_file(path: str) -> bool:
    """Check if a file is a high-priority config/doc file."""
    basename = path.rsplit("/", 1)[-1] if "/" in path else path
    return basename in PRIORITY_FILES or any(p in path for p in PRIORITY_FILES)


def _select_files_to_review(tree_paths: List[str]) -> List[str]:
    """
    Intelligently select the most important files to review.
    Strategy: priority files first, then main source files, capped at MAX_FILES_PER_REPO.
    """
    priority = []
    source_files = []

    for path in tree_paths:
        if _should_skip(path):
            continue
        if _is_priority_file(path):
            priority.append(path)
        elif _is_code_file(path):
            source_files.append(path)

    # Sort source files: prefer shallow paths (main app files), shorter names
    source_files.sort(key=lambda p: (p.count("/"), len(p)))

    # Entry point detection: look for main/index/app files
    entry_points = []
    other_source = []
    for f in source_files:
        basename = f.rsplit("/", 1)[-1].lower() if "/" in f else f.lower()
        if any(name in basename for name in ["main", "index", "app", "server", "routes", "api"]):
            entry_points.append(f)
        else:
            other_source.append(f)

    selected = priority[:5] + entry_points[:10] + other_source[:20]
    return selected[:MAX_FILES_PER_REPO]


async def review_repo_code(
    username: str,
    repo_name: str,
    repo_description: str = "",
    repo_language: str = "",
) -> Dict[str, Any]:
    """
    Full deep code review of a single repository.
    Fetches file tree → selects key files → fetches content → AI analysis.
    """
    result = {
        "repo": repo_name,
        "reviewed": False,
        "files_analyzed": 0,
        "error": None,
    }

    # Step 1: Get file tree
    try:
        tree = await fetch_repo_tree(username, repo_name)
    except Exception as e:
        result["error"] = f"Could not access repo tree: {str(e)[:100]}"
        return result

    if not tree:
        result["error"] = "Repository has no accessible file tree (may be empty)."
        return result

    # Extract file paths from tree
    file_paths = [item["path"] for item in tree if item.get("type") == "blob"]

    if not file_paths:
        result["error"] = "No files found in repository."
        return result

    # Step 2: Select the most important files
    selected_files = _select_files_to_review(file_paths)
    if not selected_files:
        result["error"] = "No reviewable source files found."
        return result

    # Step 3: Fetch file contents in parallel
    async def _fetch_one(path: str) -> Optional[Dict[str, str]]:
        try:
            content = await fetch_file_raw(username, repo_name, path)
            if content and len(content) <= MAX_FILE_SIZE:
                return {"path": path, "content": content}
        except Exception:
            pass
        return None

    fetch_tasks = [_fetch_one(path) for path in selected_files]
    fetched = await asyncio.gather(*fetch_tasks, return_exceptions=True)

    # Collect successful fetches, respecting total size limit
    files_content = []
    total_size = 0
    for item in fetched:
        if isinstance(item, dict) and item is not None:
            content_len = len(item["content"])
            if total_size + content_len <= MAX_TOTAL_CONTENT:
                files_content.append(item)
                total_size += content_len

    if not files_content:
        result["error"] = "Could not fetch any file contents from this repo."
        return result

    # Step 4: Build code context for AI
    code_context = ""
    for fc in files_content:
        code_context += f"\n\n=== FILE: {fc['path']} ===\n{fc['content'][:15000]}\n"

    # Also get file tree summary
    tree_summary = "\n".join(file_paths[:100])

    # Step 5: AI Deep Code Review
    prompt = f"""You are a FORENSIC SOFTWARE ENGINEER at a top FAANG company performing expert-level code review for hiring intelligence. Your goal is 99% accurate assessments. You are reviewing REAL SOURCE CODE — not making assumptions.

Repository: {username}/{repo_name}
Description: {repo_description or 'No description provided'}
Primary Language: {repo_language or 'Unknown'}

=== STRUCTURED FILE TREE ===
{tree_summary}

=== ACTUAL SOURCE CODE ===
{code_context[:120000]}

CRITICAL INSTRUCTIONS FOR ACCURACY:
1. Base your analysis ONLY on the actual code shown. Do not speculate.
2. For AI-generated code detection: look for specific structural markers (uniform function lengths, robotic docstrings, absence of personal quirks, uniform naming, no TODO/FIXME, perfect error handling everywhere). A single AI indicator is NOT enough — you need multiple converging signals.
3. For tutorial detection: real tutorial code has exact variable names from courses (e.g., "myList", "myVar", "example_function"), follows textbook patterns with no customization, and often has step-by-step numbered comments.
4. Score calibration: a score of 0-100 must match typical human code at that level — 50 is AVERAGE, not failing. Senior engineers with production code score 70-90. FAANG-level is 90+.
5. If you cannot see enough code to judge something, say "Insufficient data" rather than guessing.

Analyze and return ONLY a valid JSON object (no markdown, no preamble):
{{
    "code_quality_score": <0-100, 50=average dev, 70=good, 85=senior, 95=FAANG-elite>,
    "architecture_score": <0-100>,
    "originality_score": <0-100, 50=some customization, 80=clearly original work>,
    "overall_assessment": "<2-3 factual sentences summarizing what this code reveals — cite specific files/functions>",
    "skill_level_demonstrated": "<Junior|Mid-Level|Senior|Staff>",
    "patterns_found": ["<specific design patterns with file evidence, e.g. 'Repository pattern in services/user_repo.py'>"],
    "solid_violations": ["<specific violations with file:line reference if possible>"],
    "is_tutorial_code": {{
        "likely": <true|false>,
        "confidence": "<High|Medium|Low>",
        "evidence": "<specific file/function names that indicate tutorial origin, or strong evidence against>"
    }},
    "ai_generated_signals": {{
        "likely": <true|false>,
        "confidence": "<High|Medium|Low>",
        "evidence": "<specific structural patterns observed, NOT general statements. Must cite actual code elements>",
        "signals_count": <number of distinct AI signals found>
    }},
    "architecture_assessment": "<Specific description with file structure observations>",
    "test_presence": {{
        "has_tests": <true|false>,
        "test_types": ["<unit|integration|e2e>"],
        "coverage_estimate": "<None|Low|Moderate|High>",
        "test_quality": "<Assessment of test quality if tests exist>"
    }},
    "key_strengths": ["<Specific, evidence-backed strengths — cite files or patterns>"],
    "key_concerns": ["<Specific, evidence-backed concerns — cite files or patterns>"],
    "technologies_verified": ["<Technologies this code DEMONSTRATES knowledge of — not just imports>"],
    "ci_cd_present": <true|false>,
    "security_practices": "<Description of security patterns or lack thereof>",
    "documentation_quality": "<None|Minimal|Adequate|Good|Excellent>",
    "production_readiness": "<Prototype|Development|Production-Ready>",
    "recommendation": "<Specific hiring-relevant insight: what this repo proves about the developer's real capabilities>"
}}"""

    try:
        ai_review = await generate_json(prompt, temperature=0)
        result.update(ai_review)
        result["reviewed"] = True
        result["files_analyzed"] = len(files_content)
        result["file_tree_size"] = len(file_paths)
    except Exception as e:
        result["error"] = f"AI review failed: {str(e)[:200]}"

    return result


async def review_multiple_repos(
    username: str,
    repos: List[Dict[str, Any]],
    max_repos: int = 5,
) -> List[Dict[str, Any]]:
    """
    Review multiple repositories in parallel (capped).
    `repos` should have: name, description, language
    """
    to_review = repos[:max_repos]

    tasks = [
        review_repo_code(
            username=username,
            repo_name=r.get("name", ""),
            repo_description=r.get("description", ""),
            repo_language=r.get("language", ""),
        )
        for r in to_review
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    reviews = []
    for r in results:
        if isinstance(r, dict):
            reviews.append(r)
        elif isinstance(r, Exception):
            reviews.append({"repo": "unknown", "reviewed": False, "error": str(r)[:200]})

    return reviews


async def match_resume_projects_to_repos(
    projects: List[Dict[str, Any]],
    repos: List[Dict[str, Any]],
    username: str,
    repo_deep_data: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Match resume project claims to GitHub repos using multiple signals.

    Bug 5a fix: Uses 4 signals instead of just name matching:
      1. Name similarity (word overlap)
      2. Technology overlap with repo languages/topics
      3. Description keyword overlap
      4. README content matching (if deep data available)
    """
    import re as _re

    matches = []

    for proj in projects:
        proj_name = (proj.get("name") or "").lower()
        proj_desc = (proj.get("description") or "").lower()
        proj_tech = [t.lower() for t in (proj.get("technologies") or [])]

        best_match = None
        best_score = 0

        for repo in repos:
            repo_name = (repo.get("name") or "").lower()
            repo_desc = (repo.get("description") or "").lower()
            score = 0

            # Signal 1: Name similarity
            name_words = set(proj_name.replace("-", " ").replace("_", " ").split())
            repo_words = set(repo_name.replace("-", " ").replace("_", " ").split())
            name_overlap = len(name_words & repo_words)
            score += name_overlap * 30

            # Direct name containment (e.g., "JARVIS" in "jarvis-ai")
            normalized_proj = proj_name.replace(" ", "-").replace("_", "-")
            normalized_repo = repo_name.replace("_", "-")
            if normalized_proj and normalized_repo:
                if normalized_proj == normalized_repo:
                    score += 50
                elif normalized_proj in normalized_repo or normalized_repo in normalized_proj:
                    score += 35

            # Signal 2: Technology overlap with repo languages/topics
            repo_topics = [t.lower() for t in (repo.get("topics") or [])]
            repo_lang = (repo.get("language") or "").lower()
            tech_matches = sum(1 for t in proj_tech if t in repo_topics or t == repo_lang or t in repo_name)
            score += tech_matches * 20

            # Signal 3: Description keyword overlap
            proj_keywords = set(_re.findall(r'\b\w{4,}\b', proj_desc))
            repo_keywords = set(_re.findall(r'\b\w{4,}\b', repo_desc))
            desc_overlap = len(proj_keywords & repo_keywords)
            score += min(desc_overlap * 5, 25)

            # Signal 4: Check README content if available
            if repo_deep_data:
                rd = repo_deep_data.get("repo_data", {}) if isinstance(repo_deep_data, dict) else {}
                readme = (rd.get(repo.get("name"), {}) or {}).get("readme", "").lower()
                if readme:
                    readme_keywords = set(_re.findall(r'\b\w{4,}\b', readme))
                    readme_overlap = len(proj_keywords & readme_keywords)
                    score += min(readme_overlap * 3, 20)

            if score > best_score:
                best_score = score
                best_match = repo

        if best_match and best_score >= 20:
            matches.append({
                "project_name": proj.get("name"),
                "confidence": min(best_score / 100, 1.0),
                "match_score": best_score,
                **best_match,
            })
        else:
            matches.append({
                "project_name": proj.get("name"),
                "confidence": 0,
                "match_score": 0,
                "repo": None,
            })

    return matches
