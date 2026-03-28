"""
Project Detection Engine — Deterministic project analysis.

Calculates project features, tech stack, and generates a summary from README.
Resolves to the {projects: [{name, type, confidence, evidence}]} format.
"""
import re
from typing import Any, Dict, List

def detect_project(
    repo_name: str,
    readme_content: str,
    file_paths: List[str],
    file_contents: List[Dict[str, str]]
) -> Dict[str, Any]:
    """Detect project properties deterministically."""
    
    # 1. Extract Summary
    summary = "No description available."
    if readme_content:
        # Get first non-heading paragraph
        paragraphs = [p.strip() for p in readme_content.split('\n\n') if p.strip() and not p.strip().startswith(('#', '<', '!', '['))]
        if paragraphs:
            summary = paragraphs[0][:200]
            if len(summary) == 200:
                summary += "..."
                
    # 2. Extract Tech Stack
    tech_stack = set()
    for fp in file_paths:
        lower_fp = fp.lower()
        if lower_fp.endswith(".py"): tech_stack.add("Python")
        elif lower_fp.endswith((".js", ".jsx")): tech_stack.add("JavaScript")
        elif lower_fp.endswith((".ts", ".tsx")): tech_stack.add("TypeScript")
        elif lower_fp.endswith(".go"): tech_stack.add("Go")
        elif lower_fp.endswith(".rs"): tech_stack.add("Rust")
        elif lower_fp.endswith(".java"): tech_stack.add("Java")
        elif lower_fp.endswith(".rb"): tech_stack.add("Ruby")
        elif lower_fp.endswith(".php"): tech_stack.add("PHP")
        elif "dockerfile" in lower_fp: tech_stack.add("Docker")
        elif "package.json" in lower_fp: tech_stack.add("Node.js")
        elif "requirements.txt" in lower_fp: tech_stack.add("Pip")
        elif "pom.xml" in lower_fp: tech_stack.add("Maven")
    
    # 3. Extract Features
    features = []
    lower_readme = readme_content.lower() if readme_content else ""
    
    if "auth" in lower_readme or any("auth" in p.lower() for p in file_paths):
        features.append("Authentication")
    if "api" in lower_readme or any("api" in p.lower() for p in file_paths):
        features.append("API")
    if "database" in lower_readme or "sql" in lower_readme or any("db" in p.lower() or "models/" in p.lower() for p in file_paths):
        features.append("Database Integration")
    if "test" in lower_readme or any("test" in p.lower() for p in file_paths):
        features.append("Testing Setup")
        
    # 4. Determine Project Type
    if "API" in features and "JavaScript" not in tech_stack:
        project_type = "Backend Service"
    elif "JavaScript" in tech_stack and ("Python" in tech_stack or "Go" in tech_stack or "Java" in tech_stack):
        project_type = "Fullstack Web App"
    elif "JavaScript" in tech_stack or "TypeScript" in tech_stack:
        if any("react" in p.lower() or "pages" in p.lower() for p in file_paths):
            project_type = "Frontend Web App"
        else:
            project_type = "Web Application"
    elif "Docker" in tech_stack:
        project_type = "Infrastructure/Backend"
    else:
        project_type = "Software Library/Tool"

    # 5. Compute Confidence
    evidence = features + list(tech_stack)[:3]
    confidence = 0.8 if len(evidence) >= 3 else (0.5 if len(evidence) > 0 else 0.2)
    
    return {
        "name": repo_name,
        "type": project_type,
        "confidence": confidence,
        "evidence": evidence,
        "summary": summary,
        "tech_stack": list(tech_stack)
    }

def analyze_ci_practices(tree_paths: List[str]) -> Dict[str, Any]:
    """Detect CI/CD and professional engineering practices from file paths."""
    ci_signals = {
        "has_github_actions": any(".github/workflows" in p.lower() for p in tree_paths),
        "has_dockerfile": any("dockerfile" in p.lower() for p in tree_paths),
        "has_docker_compose": any("docker-compose" in p.lower() for p in tree_paths),
        "has_makefile": any(p.split("/")[-1].lower() == "makefile" for p in tree_paths),
        "has_pre_commit": any(".pre-commit-config" in p.lower() for p in tree_paths),
        "has_env_example": any(".env.example" in p.lower() for p in tree_paths),
        "has_gitignore": any(".gitignore" in p.lower() for p in tree_paths),
    }
    
    depth_bonus = 0
    if ci_signals["has_github_actions"]: depth_bonus += 8
    if ci_signals["has_dockerfile"]: depth_bonus += 5
    if ci_signals["has_docker_compose"]: depth_bonus += 4
    if ci_signals["has_pre_commit"]: depth_bonus += 3
    if ci_signals["has_env_example"]: depth_bonus += 2

    return {
        "ci_signals": ci_signals,
        "ci_depth_bonus": depth_bonus,
    }


def analyze_test_culture(tree_paths: List[str], file_contents: List[Dict[str, str]]) -> Dict[str, Any]:
    """Deep test culture analysis beyond simple file detection."""

    # Detect test files
    test_files = [
        p for p in tree_paths if any(
            pattern in p.lower() for pattern in
            ["test_", "_test.", "/tests/", "/test/", ".spec.", ".test."]
        )
    ]

    # Detect test frameworks
    frameworks = []
    all_content = " ".join(f.get("content", "") for f in file_contents) if file_contents else ""
    if "import pytest" in all_content or "from pytest" in all_content:
        frameworks.append("pytest")
    if "import unittest" in all_content:
        frameworks.append("unittest")
    if "describe(" in all_content and "it(" in all_content:
        frameworks.append("jest/mocha")
    if "expect(" in all_content and "test(" in all_content:
        frameworks.append("jest")
    if "@Test" in all_content:
        frameworks.append("junit")

    # Detect test quality signals
    has_mocks = "mock" in all_content.lower() or "MagicMock" in all_content
    has_fixtures = "@pytest.fixture" in all_content or "beforeEach" in all_content
    has_assertions = "assert" in all_content or "expect(" in all_content

    # Coverage config
    has_coverage = any(
        any(c in p for c in [".coveragerc", "jest.config", ".nycrc", "coverage"])
        for p in tree_paths
    )

    # Source to test ratio
    source_files = [
        p for p in tree_paths
        if any(p.endswith(ext) for ext in [".py", ".js", ".ts", ".java"])
        and "test" not in p.lower()
    ]
    test_ratio = len(test_files) / max(len(source_files), 1)

    # Calculate test culture score
    score = 0
    if test_files:
        score += 3
    if len(frameworks) > 0:
        score += 2
    if has_mocks:
        score += 2
    if has_fixtures:
        score += 1
    if has_coverage:
        score += 1
    if test_ratio > 0.3:
        score += 1

    return {
        "has_tests": len(test_files) > 0,
        "test_file_count": len(test_files),
        "frameworks": frameworks,
        "has_mocks": has_mocks,
        "has_fixtures": has_fixtures,
        "has_coverage_config": has_coverage,
        "test_to_source_ratio": round(test_ratio, 2),
        "test_culture_score": min(score, 10),
    }

