"""
Code Intelligence Engine — Deep, deterministic code analysis.

Uses Python's ast module for Python files and regex-based structural analysis
for JS/TS/Go/Rust. Analyzes:
  - Cyclomatic complexity
  - Dependency graph (imports, module relationships)
  - Architecture pattern detection (MVC, layered, modular, etc.)
  - File/module coupling and cohesion
  - Error handling maturity
  - Test presence and coverage estimation
  - API design quality (REST routes, endpoint structure)
  - Folder structure maturity

NO AI INVOLVEMENT — Pure deterministic computation.
"""
import ast
import math
import re
from collections import Counter, defaultdict
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional, Tuple

from utils.logging_config import get_logger
from utils.proof import ProofCollector

from processing.code_analyzer import build_function_call_graph, build_dependency_graph, analyze_modularity
log = get_logger("code_intelligence")


# ═══════════════════════════════════════════════════════
#  PYTHON AST ANALYSIS
# ═══════════════════════════════════════════════════════

def _analyze_python_ast(source: str, file_path: str) -> Dict[str, Any]:
    """Deep AST analysis for Python source files."""
    result: Dict[str, Any] = {
        "functions": 0,
        "classes": 0,
        "async_functions": 0,
        "decorators": 0,
        "comprehensions": 0,
        "try_except_blocks": 0,
        "assertions": 0,
        "type_hints": 0,
        "cyclomatic_complexity": 1,
        "max_nesting_depth": 0,
        "imports": [],
        "stdlib_imports": [],
        "third_party_imports": [],
        "docstrings": 0,
        "lines": 0,
        "blank_lines": 0,
        "comment_lines": 0,
        "has_main_guard": False,
        "has_logging": False,
        "has_dataclasses": False,
        "has_type_checking": False,
        "error_handling_quality": 0,
    }

    lines = source.split("\n")
    try:
        from radon.raw import analyze
        raw = analyze(source)
        result["lines"] = raw.loc
        result["blank_lines"] = raw.blank
        result["comment_lines"] = raw.comments
    except Exception:
        result["lines"] = len(lines)
        result["blank_lines"] = sum(1 for l in lines if not l.strip())
        result["comment_lines"] = sum(1 for l in lines if l.strip().startswith("#"))

    try:
        tree = ast.parse(source, filename=file_path)
    except SyntaxError:
        return result

    # Walk the entire AST
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            result["functions"] += 1
            if node.decorator_list:
                result["decorators"] += len(node.decorator_list)
            if node.returns:
                result["type_hints"] += 1
            result["type_hints"] += sum(1 for a in node.args.args if a.annotation)
            # Check for docstring
            if (node.body and isinstance(node.body[0], ast.Expr)
                    and isinstance(node.body[0].value, ast.Constant)):
                result["docstrings"] += 1

        elif isinstance(node, ast.AsyncFunctionDef):
            result["async_functions"] += 1
            result["functions"] += 1
            if node.decorator_list:
                result["decorators"] += len(node.decorator_list)
            if node.returns:
                result["type_hints"] += 1
            result["type_hints"] += sum(1 for a in node.args.args if a.annotation)
            if (node.body and isinstance(node.body[0], ast.Expr)
                    and isinstance(node.body[0].value, ast.Constant)):
                result["docstrings"] += 1

        elif isinstance(node, ast.ClassDef):
            result["classes"] += 1
            if node.decorator_list:
                result["decorators"] += len(node.decorator_list)
            if (node.body and isinstance(node.body[0], ast.Expr)
                    and isinstance(node.body[0].value, ast.Constant)):
                result["docstrings"] += 1

        elif isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
            result["comprehensions"] += 1

        elif isinstance(node, ast.Try):
            result["try_except_blocks"] += 1

        elif isinstance(node, ast.Assert):
            result["assertions"] += 1

        elif isinstance(node, ast.Import):
            for alias in node.names:
                result["imports"].append(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                mod = node.module.split(".")[0]
                result["imports"].append(mod)

        # AST-based Cyclomatic complexity fallback: count branching nodes
        elif isinstance(node, (ast.If, ast.While, ast.For, ast.ExceptHandler,
                                ast.With, ast.BoolOp)):
            result["cyclomatic_complexity"] += 1
        elif isinstance(node, ast.BoolOp):
            # Each `and` / `or` adds a branch
            result["cyclomatic_complexity"] += len(node.values) - 1

    try:
        import radon.complexity as cc
        blocks = cc.cc_visit(source)
        if blocks:
            result["cyclomatic_complexity"] = sum(b.complexity for b in blocks) / len(blocks)
    except Exception:
        pass

    # Nesting depth via line indentation
    indent_levels = []
    for line in lines:
        stripped = line.lstrip()
        if stripped and not stripped.startswith("#"):
            indent = len(line) - len(stripped)
            indent_levels.append(indent)
    if indent_levels:
        result["max_nesting_depth"] = max(indent_levels) // 4  # 4-space indent

    # Detect patterns
    result["has_main_guard"] = "if __name__" in source
    result["has_logging"] = "import logging" in source or "getLogger" in source
    result["has_dataclasses"] = "@dataclass" in source
    result["has_type_checking"] = "TYPE_CHECKING" in source

    # Error handling quality (0-10)
    eh_score = 0
    if result["try_except_blocks"] > 0:
        eh_score += 3
    if "raise" in source:
        eh_score += 2
    if "except Exception" not in source and result["try_except_blocks"] > 0:
        eh_score += 2  # Specific exception handling
    if result["has_logging"]:
        eh_score += 2
    if result["assertions"] > 0:
        eh_score += 1
    result["error_handling_quality"] = min(eh_score, 10)

    # Classify imports
    STDLIB = {
        "os", "sys", "json", "re", "math", "datetime", "time", "io",
        "collections", "itertools", "functools", "typing", "pathlib",
        "logging", "unittest", "hashlib", "copy", "abc", "dataclasses",
        "asyncio", "concurrent", "threading", "multiprocessing", "enum",
        "contextlib", "textwrap", "inspect", "warnings", "argparse",
        "subprocess", "shutil", "tempfile", "glob", "struct", "csv",
    }
    unique_imports = set(result["imports"])
    result["stdlib_imports"] = sorted(unique_imports & STDLIB)
    result["third_party_imports"] = sorted(unique_imports - STDLIB)

    return result


# ═══════════════════════════════════════════════════════
#  JS/TS STRUCTURAL ANALYSIS
# ═══════════════════════════════════════════════════════

def _analyze_js_ts(source: str, file_path: str) -> Dict[str, Any]:
    """Regex-based structural analysis for JavaScript/TypeScript files."""
    result: Dict[str, Any] = {
        "functions": 0,
        "classes": 0,
        "async_functions": 0,
        "arrow_functions": 0,
        "imports": [],
        "exports": 0,
        "try_catch_blocks": 0,
        "jsx_components": 0,
        "hooks_usage": 0,
        "type_annotations": 0,
        "lines": len(source.split("\n")),
        "error_handling_quality": 0,
        "has_tests": False,
        "has_typescript": file_path.endswith((".ts", ".tsx")),
    }

    # Functions
    result["functions"] = len(re.findall(r'\bfunction\s+\w+', source))
    result["arrow_functions"] = len(re.findall(r'=>', source))
    result["async_functions"] = len(re.findall(r'\basync\s+(function|\w+\s*=)', source))

    # Classes
    result["classes"] = len(re.findall(r'\bclass\s+\w+', source))

    # Imports
    import_matches = re.findall(r'(?:import|require)\s*\(?[\'"]([^"\']+)["\']', source)
    result["imports"] = import_matches

    # Exports
    result["exports"] = len(re.findall(r'\bexport\s+(default\s+)?(function|class|const|let|var|interface|type)', source))

    # Error handling
    result["try_catch_blocks"] = len(re.findall(r'\btry\s*\{', source))

    # JSX / React
    result["jsx_components"] = len(re.findall(r'(?:function|const)\s+[A-Z]\w+.*(?:=>|{)', source))
    result["hooks_usage"] = len(re.findall(r'\buse[A-Z]\w+\(', source))

    # TypeScript types
    if result["has_typescript"]:
        result["type_annotations"] = len(re.findall(r':\s*[A-Z]\w+', source))
        result["type_annotations"] += len(re.findall(r'\binterface\s+\w+', source))
        result["type_annotations"] += len(re.findall(r'\btype\s+\w+\s*=', source))

    # Test detection
    result["has_tests"] = bool(re.search(
        r'\b(describe|it|test|expect|jest|mocha|chai|assert)\s*\(', source
    ))

    # Error handling quality
    eh = 0
    if result["try_catch_blocks"] > 0:
        eh += 3
    if "throw new" in source:
        eh += 2
    if "console.error" in source or "logger" in source.lower():
        eh += 2
    if ".catch(" in source:
        eh += 2
    if "finally" in source:
        eh += 1
    result["error_handling_quality"] = min(eh, 10)

    return result


# ═══════════════════════════════════════════════════════
#  GENERAL LANGUAGE ANALYSIS (Go, Rust, Java, etc.)
# ═══════════════════════════════════════════════════════

def _analyze_generic(source: str, file_path: str) -> Dict[str, Any]:
    """Basic structural analysis for any language."""
    lines = source.split("\n")
    result: Dict[str, Any] = {
        "lines": len(lines),
        "blank_lines": sum(1 for l in lines if not l.strip()),
        "comment_lines": 0,
        "functions": 0,
        "classes": 0,
        "imports": 0,
        "error_handling_quality": 0,
    }

    ext = PurePosixPath(file_path).suffix

    if ext in (".go",):
        result["functions"] = len(re.findall(r'\bfunc\s+', source))
        result["imports"] = len(re.findall(r'"[^"]+/[^"]+"', source))
        result["comment_lines"] = sum(1 for l in lines if l.strip().startswith("//"))
        result["error_handling_quality"] = min(
            len(re.findall(r'if\s+err\s*!=\s*nil', source)) * 2, 10
        )
    elif ext in (".rs",):
        result["functions"] = len(re.findall(r'\bfn\s+\w+', source))
        result["classes"] = len(re.findall(r'\b(struct|enum|impl)\s+\w+', source))
        result["comment_lines"] = sum(1 for l in lines if l.strip().startswith("//"))
        result["error_handling_quality"] = min(
            len(re.findall(r'Result<|Option<|\?;', source)) * 2, 10
        )
    elif ext in (".java", ".kt"):
        result["functions"] = len(re.findall(r'(public|private|protected)\s+\w+\s+\w+\s*\(', source))
        result["classes"] = len(re.findall(r'\bclass\s+\w+', source))
        result["imports"] = len(re.findall(r'\bimport\s+', source))
        result["comment_lines"] = sum(1 for l in lines if l.strip().startswith("//") or l.strip().startswith("*"))
        result["error_handling_quality"] = min(
            len(re.findall(r'\btry\s*\{', source)) * 2, 10
        )
    else:
        result["comment_lines"] = sum(1 for l in lines if l.strip().startswith(("//", "#", "--")))

    return result


# ═══════════════════════════════════════════════════════
#  ENHANCED JS/TS STRUCTURAL PATTERNS
# ═══════════════════════════════════════════════════════

def analyze_js_ts_deep(source: str, file_path: str) -> Dict[str, Any]:
    """Enhanced JS/TS analysis: Promise chains, React hierarchy, module graph."""
    result: Dict[str, Any] = {
        "promise_chains": 0,
        "max_promise_depth": 0,
        "react_components": [],
        "react_hierarchy_depth": 0,
        "module_exports": 0,
        "module_imports": 0,
        "named_exports": 0,
        "default_exports": 0,
    }

    # Promise chain detection
    then_chains = re.findall(r'(\.then\s*\([^)]*\)(?:\s*\.then\s*\([^)]*\))*)', source, re.DOTALL)
    result["promise_chains"] = len(then_chains)
    if then_chains:
        depths = [chain.count(".then") for chain in then_chains]
        result["max_promise_depth"] = max(depths) if depths else 0

    # React component hierarchy
    component_names = re.findall(
        r'(?:function|const)\s+([A-Z][A-Za-z0-9]+)\s*(?:=|\()', source
    )
    result["react_components"] = list(set(component_names))

    # Count JSX nesting depth (approximate via indentation of JSX tags)
    jsx_opens = re.findall(r'<[A-Z][A-Za-z0-9]*[\s/>]', source)
    result["react_hierarchy_depth"] = min(len(jsx_opens), 20)

    # Module export/import graph
    result["module_imports"] = len(re.findall(r'\bimport\s+', source))
    result["named_exports"] = len(re.findall(r'export\s+(?:const|function|class|let|var|interface|type)\s+', source))
    result["default_exports"] = len(re.findall(r'export\s+default\s+', source))
    result["module_exports"] = result["named_exports"] + result["default_exports"]

    return result


# ═══════════════════════════════════════════════════════
#  PROJECT STRUCTURE ANALYSIS
# ═══════════════════════════════════════════════════════

def analyze_project_structure(
    file_paths: List[str],
    repo_name: str,
) -> Dict[str, Any]:
    """Analyze the file tree for architecture patterns, maturity, and design quality."""

    total_files = len(file_paths)
    if total_files == 0:
        return {
            "architecture_type": "Unknown",
            "folder_maturity": "Empty",
            "api_design_quality": 0,
            "test_ratio": 0,
            "has_ci_cd": False,
            "has_docker": False,
            "has_docs": False,
            "has_config": False,
            "directory_depth": 0,
            "coupling_estimate": "Unknown",
        }

    # Categorize files
    source_files: List[str] = []
    test_files: List[str] = []
    config_files: List[str] = []
    doc_files: List[str] = []
    ci_files: List[str] = []
    docker_files: List[str] = []
    api_files: List[str] = []

    dirs = set()

    for fp in file_paths:
        lower = fp.lower()
        parts = PurePosixPath(fp).parts
        dirs.update(PurePosixPath(fp).parents)

        ext = PurePosixPath(fp).suffix.lower()

        # Test files
        if any(t in lower for t in ("test", "spec", "__test__", "_test.", ".test.")):
            test_files.append(fp)
        # CI/CD
        elif ".github/workflows" in lower or "jenkinsfile" in lower or ".gitlab-ci" in lower or ".circleci" in lower:
            ci_files.append(fp)
        # Docker
        elif "dockerfile" in lower or "docker-compose" in lower:
            docker_files.append(fp)
        # Docs
        elif lower.endswith((".md", ".rst", ".txt")) or "docs/" in lower or "doc/" in lower:
            doc_files.append(fp)
        # Config
        elif ext in (".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".env"):
            config_files.append(fp)
        # API routes
        elif any(k in lower for k in ("route", "endpoint", "controller", "api/", "views")):
            api_files.append(fp)
        # Source code
        elif ext in (".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java", ".kt",
                      ".rb", ".php", ".swift", ".cpp", ".c", ".cs"):
            source_files.append(fp)

    # Architecture detection
    architecture_type = _detect_architecture(file_paths)

    # Directory depth
    depths = [len(PurePosixPath(fp).parts) for fp in file_paths]
    max_depth = max(depths) if depths else 0

    # Folder maturity
    maturity_signals = 0
    if test_files:
        maturity_signals += 2
    if ci_files:
        maturity_signals += 2
    if docker_files:
        maturity_signals += 1
    if doc_files:
        maturity_signals += 1
    if config_files:
        maturity_signals += 1
    if max_depth >= 3:
        maturity_signals += 1
    if len(source_files) >= 10:
        maturity_signals += 1
    if any("readme" in f.lower() for f in file_paths):
        maturity_signals += 1

    if maturity_signals >= 8:
        folder_maturity = "Production-Grade"
    elif maturity_signals >= 5:
        folder_maturity = "Professional"
    elif maturity_signals >= 3:
        folder_maturity = "Intermediate"
    else:
        folder_maturity = "Basic"

    # Test ratio
    test_ratio = len(test_files) / max(len(source_files), 1)

    # API design quality (0-10)
    api_quality = 0
    if api_files:
        api_quality += min(len(api_files), 3)
        if any("/v1/" in f or "/v2/" in f or "/api/" in f for f in api_files):
            api_quality += 2  # Versioned API
        if any("middleware" in f.lower() for f in file_paths):
            api_quality += 2
        if any("auth" in f.lower() for f in file_paths):
            api_quality += 1
        if any("schema" in f.lower() or "model" in f.lower() for f in file_paths):
            api_quality += 2
    api_quality = min(api_quality, 10)

    return {
        "architecture_type": architecture_type,
        "folder_maturity": folder_maturity,
        "api_design_quality": api_quality,
        "test_ratio": round(test_ratio, 3),
        "has_ci_cd": bool(ci_files),
        "has_docker": bool(docker_files),
        "has_docs": bool(doc_files),
        "has_config": bool(config_files),
        "directory_depth": max_depth,
        "source_file_count": len(source_files),
        "test_file_count": len(test_files),
        "total_files": total_files,
        "coupling_estimate": _estimate_coupling(source_files),
    }


def _detect_architecture(file_paths: List[str]) -> str:
    """Detect the architecture pattern from directory structure."""
    lower_paths = [f.lower() for f in file_paths]
    path_str = " ".join(lower_paths)

    # Microservices signals
    if sum(1 for f in lower_paths if "docker-compose" in f) >= 1:
        service_dirs = set()
        for f in lower_paths:
            parts = PurePosixPath(f).parts
            if len(parts) >= 2 and any(
                k in parts[0] for k in ("service", "srv", "app", "api", "worker")
            ):
                service_dirs.add(parts[0])
        if len(service_dirs) >= 3:
            return "Microservices"

    # MVC
    has_models = any("model" in f for f in lower_paths)
    has_views = any("view" in f or "template" in f for f in lower_paths)
    has_controllers = any("controller" in f or "handler" in f for f in lower_paths)
    if sum([has_models, has_views, has_controllers]) >= 2:
        return "MVC"

    # Clean/Layered architecture
    has_domain = any("domain" in f or "entity" in f for f in lower_paths)
    has_usecase = any("usecase" in f or "service" in f for f in lower_paths)
    has_repo = any("repository" in f or "repo" in f for f in lower_paths)
    if sum([has_domain, has_usecase, has_repo]) >= 2:
        return "Clean Architecture"

    # Modular
    top_dirs = set()
    for f in file_paths:
        parts = PurePosixPath(f).parts
        if len(parts) >= 2:
            top_dirs.add(parts[0])

    if len(top_dirs) >= 4:
        return "Modular"

    # Flask/Express flat
    if any("app.py" in f or "server.js" in f or "index.js" in f for f in lower_paths):
        if len(top_dirs) <= 2:
            return "Monolith (flat)"

    return "Monolith"


def _estimate_coupling(source_files: List[str]) -> str:
    """Rough estimation of module coupling from file distribution."""
    if not source_files:
        return "Unknown"
    dirs = set()
    for f in source_files:
        parts = PurePosixPath(f).parts
        if len(parts) >= 2:
            dirs.add(parts[0])
    if len(dirs) >= 5:
        return "Low (well-separated modules)"
    elif len(dirs) >= 2:
        return "Moderate"
    else:
        return "High (flat structure)"


# ═══════════════════════════════════════════════════════
#  COMBINED FILE ANALYSIS DISPATCHER
# ═══════════════════════════════════════════════════════

def analyze_file_content(source: str, file_path: str) -> Dict[str, Any]:
    """Route a file to the appropriate language analyzer."""
    ext = PurePosixPath(file_path).suffix.lower()

    if ext == ".py":
        return _analyze_python_ast(source, file_path)
    elif ext in (".js", ".jsx", ".ts", ".tsx"):
        return _analyze_js_ts(source, file_path)
    elif ext in (".go", ".rs", ".java", ".kt", ".cpp", ".c", ".cs", ".rb", ".php", ".swift"):
        return _analyze_generic(source, file_path)
    else:
        return {"lines": len(source.split("\n")), "functions": 0, "classes": 0}


# ═══════════════════════════════════════════════════════
#  AGGREGATE ANALYSIS ACROSS REPO FILES
# ═══════════════════════════════════════════════════════

def compute_repo_code_metrics(
    file_analyses: List[Dict[str, Any]],
    project_structure: Dict[str, Any],
    repo_name: str,
    proof: ProofCollector,
) -> Dict[str, Any]:
    """
    Aggregate individual file analyses into repo-level code quality metrics.
    Returns deterministic scores: code_quality (0-100), maintainability (0-100),
    test_coverage_indicator.
    """
    if not file_analyses:
        return {
            "code_quality_score": 0,
            "maintainability_score": 0,
            "test_coverage_indicator": "None",
            "metrics": {},
        }

    # Aggregate file-level metrics
    total_functions = sum(f.get("functions", 0) for f in file_analyses)
    total_classes = sum(f.get("classes", 0) for f in file_analyses)
    total_lines = sum(f.get("lines", 0) for f in file_analyses)
    total_async = sum(f.get("async_functions", 0) for f in file_analyses)
    total_try = sum(f.get("try_except_blocks", 0) + f.get("try_catch_blocks", 0) for f in file_analyses)
    total_type_hints = sum(f.get("type_hints", 0) + f.get("type_annotations", 0) for f in file_analyses)
    total_docstrings = sum(f.get("docstrings", 0) for f in file_analyses)
    avg_complexity = sum(f.get("cyclomatic_complexity", 1) for f in file_analyses) / len(file_analyses)
    max_nesting = max((f.get("max_nesting_depth", 0) for f in file_analyses), default=0)
    avg_error_handling = sum(f.get("error_handling_quality", 0) for f in file_analyses) / len(file_analyses)
    total_comprehensions = sum(f.get("comprehensions", 0) for f in file_analyses)

    # ─── CODE QUALITY SCORING (0-100) ───
    cq = 30  # base

    # Functions & classes present → structured code
    if total_functions >= 10:
        cq += 8
    elif total_functions >= 5:
        cq += 4
    elif total_functions >= 1:
        cq += 2

    if total_classes >= 3:
        cq += 5
    elif total_classes >= 1:
        cq += 2

    # Error handling
    cq += min(int(avg_error_handling * 1.5), 10)

    # Type hints / annotations
    hint_ratio = total_type_hints / max(total_functions, 1)
    if hint_ratio >= 0.5:
        cq += 8
    elif hint_ratio >= 0.2:
        cq += 4

    # Moderate complexity is ideal (not too simple, not over-complex)
    if 3 <= avg_complexity <= 10:
        cq += 6
    elif avg_complexity > 15:
        cq -= 5  # Over-complex

    # Docstrings
    doc_ratio = total_docstrings / max(total_functions + total_classes, 1)
    if doc_ratio >= 0.3:
        cq += 5
    elif doc_ratio >= 0.1:
        cq += 2

    # Project structure bonuses
    arch = project_structure.get("architecture_type", "Monolith")
    if arch in ("Clean Architecture", "Microservices"):
        cq += 10
    elif arch in ("MVC", "Modular"):
        cq += 6
    elif arch == "Monolith (flat)":
        cq -= 3

    # CI/CD, Docker, Docs bonuses
    if project_structure.get("has_ci_cd"):
        cq += 4
    if project_structure.get("has_docker"):
        cq += 3
    if project_structure.get("has_docs"):
        cq += 2

    # Nesting penalty
    if max_nesting > 6:
        cq -= 5
    elif max_nesting > 4:
        cq -= 2

    code_quality_score = max(0, min(100, cq))

    # ─── MAINTAINABILITY SCORING (0-100) ───
    mt = 30  # base

    # Code organization
    maturity = project_structure.get("folder_maturity", "Basic")
    if maturity == "Production-Grade":
        mt += 20
    elif maturity == "Professional":
        mt += 12
    elif maturity == "Intermediate":
        mt += 6

    # Test coverage indicator
    test_ratio = project_structure.get("test_ratio", 0)
    if test_ratio >= 0.5:
        mt += 15
        test_indicator = "High"
    elif test_ratio >= 0.2:
        mt += 8
        test_indicator = "Moderate"
    elif test_ratio > 0:
        mt += 3
        test_indicator = "Low"
    else:
        test_indicator = "None"

    # Type safety
    if total_type_hints > 20:
        mt += 8
    elif total_type_hints > 5:
        mt += 4

    # Documentation
    if total_docstrings >= 10:
        mt += 8
    elif total_docstrings >= 3:
        mt += 4

    # Low coupling
    coupling = project_structure.get("coupling_estimate", "Unknown")
    if "Low" in coupling:
        mt += 8
    elif "Moderate" in coupling:
        mt += 4

    # API design
    api_q = project_structure.get("api_design_quality", 0)
    mt += min(api_q, 8)

    maintainability_score = max(0, min(100, mt))

    # Record proof
    proof.add_metric("code_quality_score", code_quality_score, repo_name=repo_name)
    proof.add_metric("maintainability_score", maintainability_score, repo_name=repo_name)
    proof.add_metric("total_functions", total_functions, repo_name=repo_name)
    proof.add_metric("total_classes", total_classes, repo_name=repo_name)
    proof.add_metric("architecture", arch, repo_name=repo_name)
    proof.add_metric("test_ratio", test_ratio, repo_name=repo_name)
    proof.add_metric("avg_cyclomatic_complexity", round(avg_complexity, 2), repo_name=repo_name)

    metrics = {
        "total_functions": total_functions,
        "total_classes": total_classes,
        "total_lines": total_lines,
        "total_async_functions": total_async,
        "total_error_handlers": total_try,
        "total_type_hints": total_type_hints,
        "total_docstrings": total_docstrings,
        "avg_cyclomatic_complexity": round(avg_complexity, 2),
        "max_nesting_depth": max_nesting,
        "avg_error_handling_quality": round(avg_error_handling, 1),
        "architecture_type": arch,
        "folder_maturity": maturity,
        "coupling_estimate": coupling,
        "total_comprehensions": total_comprehensions,
    }

    return {
        "code_quality_score": code_quality_score,
        "maintainability_score": maintainability_score,
        "test_coverage_indicator": test_indicator,
        "metrics": metrics,
    }


# ═══════════════════════════════════════════════════════
#  ANTI-CHEAT: TEMPLATE & AI-GENERATED DETECTION
# ═══════════════════════════════════════════════════════

KNOWN_TEMPLATE_PATTERNS: List[str] = [
    r"create-react-app",
    r"create-next-app",
    r"Generated by create-expo-app",
    r"This project was bootstrapped with",
    r"// Learn more:",
    r"Getting Started with Create React App",
    r"npx create-",
    r"# Welcome to your Expo app",
]

TUTORIAL_PATTERNS: List[str] = [
    r"todo[-_]?(app|list|mvc)",
    r"weather[-_]?app",
    r"calculator",
    r"counter[-_]?app",
    r"hello[-_]?world",
    r"my[-_]?first",
    r"sample[-_]?project",
    r"demo[-_]?app",
    r"tutorial",
    r"course[-_]?project",
    r"assignment",
    r"homework",
]


def detect_template_repo(
    file_paths: List[str],
    readme_content: str = "",
    repo_name: str = "",
) -> Dict[str, Any]:
    """Detect if a repo is a template/boilerplate or tutorial clone."""
    signals: List[str] = []
    score = 0  # Higher = more likely template

    # Check README for template markers
    readme_lower = readme_content.lower()
    for pattern in KNOWN_TEMPLATE_PATTERNS:
        if re.search(pattern, readme_content, re.IGNORECASE):
            signals.append(f"README contains template marker: {pattern}")
            score += 15

    # Check repo name for tutorial patterns
    name_lower = repo_name.lower()
    for pattern in TUTORIAL_PATTERNS:
        if re.search(pattern, name_lower):
            signals.append(f"Repo name matches tutorial pattern: {pattern}")
            score += 20
            break

    # Check file tree for boilerplate
    has_custom_routes = any(
        "route" in f.lower() or "api/" in f.lower()
        for f in file_paths if f.lower().endswith((".py", ".js", ".ts"))
    )
    has_custom_models = any(
        "model" in f.lower() or "schema" in f.lower()
        for f in file_paths if f.lower().endswith((".py", ".js", ".ts"))
    )

    # If there's no customization beyond boilerplate
    source_count = sum(
        1 for f in file_paths
        if PurePosixPath(f).suffix.lower() in (".py", ".js", ".ts", ".tsx", ".jsx")
        and "node_modules" not in f and "venv" not in f
    )

    if source_count < 5:
        signals.append("Very few source files — likely tutorial or template")
        score += 10

    if not has_custom_routes and not has_custom_models and source_count < 10:
        score += 5

    is_template = score >= 25

    return {
        "is_template": is_template,
        "template_confidence": min(score, 100),
        "signals": signals[:5],
    }


def detect_ai_generated_patterns(
    file_analyses: List[Dict[str, Any]],
    sources: List[Tuple[str, str]],
) -> Dict[str, Any]:
    """
    Detect AI-generated code patterns:
    - Overly uniform style (identical function lengths)
    - Generic variable naming
    - Unrealistically consistent formatting
    - Repetitive documentation patterns
    """
    signals: List[str] = []
    score = 0

    if not sources:
        return {"likely_ai_generated": False, "confidence": 0, "signals": []}

    # Check for overly uniform function lengths (AI tends to make functions same size)
    all_func_lengths: List[int] = []
    for source, _ in sources:
        lines = source.split("\n")
        func_starts = [
            i for i, l in enumerate(lines)
            if re.match(r'\s*(def |async def |function |const \w+ = |class )', l)
        ]
        for i in range(len(func_starts) - 1):
            all_func_lengths.append(func_starts[i + 1] - func_starts[i])

    if len(all_func_lengths) >= 5:
        mean = sum(all_func_lengths) / len(all_func_lengths)
        std_dev = math.sqrt(
            sum((x - mean) ** 2 for x in all_func_lengths) / len(all_func_lengths)
        )
        coefficient_of_variation = std_dev / mean if mean > 0 else 0
        if coefficient_of_variation < 0.15:
            signals.append("Unusually uniform function lengths (low variance)")
            score += 20

    # Check for generic variable names (AI defaults)
    generic_names = ["data", "result", "response", "item", "value", "temp", "output", "input"]
    generic_count = 0
    total_assignments = 0
    for source, _ in sources:
        for name in generic_names:
            generic_count += len(re.findall(rf'\b{name}\s*=', source))
        total_assignments += len(re.findall(r'\w+\s*=', source))

    if total_assignments > 20:
        generic_ratio = generic_count / total_assignments
        if generic_ratio > 0.3:
            signals.append("High ratio of generic variable names")
            score += 15

    # Check for repetitive docstring/comment patterns
    docstring_lines: List[str] = []
    for source, _ in sources:
        docstring_matches = re.findall(r'"""(.+?)"""', source, re.DOTALL)
        docstring_lines.extend(docstring_matches)

    if len(docstring_lines) >= 5:
        starters = [d.strip().split()[0] if d.strip() else "" for d in docstring_lines]
        starter_counts = Counter(starters)
        most_common = starter_counts.most_common(1)
        if most_common and most_common[0][1] / len(starters) > 0.7:
            signals.append("Docstrings follow repetitive pattern")
            score += 10

    # Comment-to-code ratio anomalies (too-perfect documentation)
    total_code_lines = 0
    total_comment_lines = 0
    for source, _ in sources:
        for line in source.split("\n"):
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith(("#", "//", "*", "/*")):
                total_comment_lines += 1
            else:
                total_code_lines += 1

    if total_code_lines > 50:
        doc_ratio = total_comment_lines / total_code_lines
        if 0.4 <= doc_ratio <= 0.7:
            signals.append(f"Suspiciously ideal comment-to-code ratio ({doc_ratio:.0%})")
            score += 10

    # Known AI code signatures in comments
    AI_SIGNATURES = [
        r"Here is", r"As an AI", r"As requested", r"I'll ",
        r"Let me", r"This function", r"This code", r"Here's",
        r"Step \d+:", r"First,? we", r"Next,? we",
    ]
    ai_sig_count = 0
    for source, _ in sources:
        for pattern in AI_SIGNATURES:
            ai_sig_count += len(re.findall(pattern, source, re.IGNORECASE))

    if ai_sig_count >= 3:
        signals.append(f"AI-typical phrases detected in code/comments ({ai_sig_count} instances)")
        score += min(ai_sig_count * 3, 15)

    # Unnaturally thorough error handling for trivial code
    total_error_handlers = sum(f.get("try_except_blocks", 0) + f.get("try_catch_blocks", 0) for f in file_analyses)
    total_functions = sum(f.get("functions", 0) for f in file_analyses)
    if total_functions > 0 and total_functions < 20:
        error_ratio = total_error_handlers / total_functions
        if error_ratio > 0.8:
            signals.append(f"Unusually high error handling ratio ({error_ratio:.0%}) for small codebase")
            score += 10

    likely_ai = score >= 30

    return {
        "likely_ai_generated": likely_ai,
        "confidence": min(score, 100),
        "signals": signals[:8],
    }


# ═══════════════════════════════════════════════════════
#  MASTER ENTRY POINT
# ═══════════════════════════════════════════════════════

def run_code_intelligence(
    file_contents: List[Dict[str, str]],
    file_paths: List[str],
    repo_name: str,
    readme_content: str = "",
    proof: Optional[ProofCollector] = None,
) -> Dict[str, Any]:
    """
    Master function: runs full code intelligence analysis on a single repo.

    Args:
        file_contents: List of {"path": ..., "content": ...} for fetched files.
        file_paths: Full file tree paths (all files in repo).
        repo_name: Name of the repository.
        readme_content: Content of README file if fetched.
        proof: ProofCollector to accumulate evidence.

    Returns:
        Complete code analysis result dict.
    """
    if proof is None:
        proof = ProofCollector()

    # Analyse project structure from full tree
    project_structure = analyze_project_structure(file_paths, repo_name)

    # Analyze individual file contents
    file_analyses: List[Dict[str, Any]] = []
    sources: List[Tuple[str, str]] = []
    for fc in file_contents:
        path = fc.get("path", "")
        content = fc.get("content", "")
        if content:
            analysis = analyze_file_content(content, path)
            file_analyses.append(analysis)
            sources.append((content, path))

    # Compute aggregate metrics
    code_metrics = compute_repo_code_metrics(
        file_analyses, project_structure, repo_name, proof
    )

    # Anti-cheat: template detection
    template_info = detect_template_repo(file_paths, readme_content, repo_name)

    # Anti-cheat: AI-generated detection
    ai_generated_info = detect_ai_generated_patterns(file_analyses, sources)

    # Apply anti-cheat penalties
    code_quality = code_metrics["code_quality_score"]
    if template_info["is_template"]:
        code_quality = int(code_quality * 0.5)
        proof.add(
            repo_name=repo_name,
            evidence_type="anti_cheat",
            detail=f"Template/tutorial repo detected (confidence: {template_info['template_confidence']}%)",
        )
    if ai_generated_info["likely_ai_generated"]:
        code_quality = int(code_quality * 0.7)
        proof.add(
            repo_name=repo_name,
            evidence_type="anti_cheat",
            detail=f"AI-generated code patterns detected (confidence: {ai_generated_info['confidence']}%)",
        )
    code_metrics["code_quality_score"] = code_quality

    # Build call graph and dependency graph for Python files
    call_graph_results: List[Dict[str, Any]] = []
    for fc in file_contents:
        path = fc.get("path", "")
        content = fc.get("content", "")
        if path.endswith(".py") and content:
            cg = build_function_call_graph(content, path)
            call_graph_results.append(cg)

    dep_graph = build_dependency_graph(file_contents)

    # Enhanced JS/TS analysis
    js_ts_deep: List[Dict[str, Any]] = []
    for fc in file_contents:
        path = fc.get("path", "")
        content = fc.get("content", "")
        if path.endswith((".js", ".jsx", ".ts", ".tsx")) and content:
            js_ts_deep.append(analyze_js_ts_deep(content, path))

    # Aggregate call graph stats
    total_dead_code = sum(len(cg.get("dead_code", [])) for cg in call_graph_results)
    max_call_depth = max((cg.get("max_call_depth", 0) for cg in call_graph_results), default=0)
    avg_fan_out = (
        sum(cg.get("avg_fan_out", 0) for cg in call_graph_results) / max(len(call_graph_results), 1)
    )

    return {
        **code_metrics,
        "project_structure": project_structure,
        "template_detection": template_info,
        "ai_generation_detection": ai_generated_info,
        "files_analyzed": len(file_analyses),
        "_repo_name": repo_name,
        "call_graph": {
            "max_call_depth": max_call_depth,
            "avg_fan_out": round(avg_fan_out, 1),
            "dead_code_count": total_dead_code,
        },
        "dependency_graph": dep_graph,
        "modularity_analysis": analyze_modularity(file_contents),
        "js_ts_deep_analysis": {
            "total_promise_chains": sum(d.get("promise_chains", 0) for d in js_ts_deep),
            "total_react_components": len(set(c for d in js_ts_deep for c in d.get("react_components", []))),
            "total_module_exports": sum(d.get("module_exports", 0) for d in js_ts_deep),
        } if js_ts_deep else {},
    }
