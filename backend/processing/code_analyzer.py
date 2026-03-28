"""
Tree-sitter Parser Engine for deep skill discovery.
Extracts dependencies, imports, and function calls from source code.
"""
from typing import List, Dict, Set, Tuple
import json

try:
    from tree_sitter import Language, Parser
    import tree_sitter_python
    import tree_sitter_javascript
    import tree_sitter_typescript
    
    PY_LANG = Language(tree_sitter_python.language())
    JS_LANG = Language(tree_sitter_javascript.language())
    TS_LANG = Language(tree_sitter_typescript.language_tsx())
    
    py_parser = Parser(PY_LANG)
    js_parser = Parser(JS_LANG)
    ts_parser = Parser(TS_LANG)
    
    HAS_TREE_SITTER = True
except Exception as e:
    HAS_TREE_SITTER = False

def extract_dependencies(file_contents: List[Dict[str, str]]) -> Set[str]:
    """Parse package.json, requirements.txt, go.mod for dependencies."""
    deps = set()
    for fc in file_contents:
        path = fc.get("path", "").lower()
        content = fc.get("content", "")
        if not content: continue
        
        if "package.json" in path:
            try:
                data = json.loads(content)
                deps.update(data.get("dependencies", {}).keys())
                deps.update(data.get("devDependencies", {}).keys())
            except Exception: pass
        elif "requirements.txt" in path:
            for line in content.split("\n"):
                line = line.strip()
                if line and not line.startswith("#"):
                    pkg = line.split("==")[0].split(">=")[0].strip()
                    if pkg: deps.add(pkg.lower())
        elif "go.mod" in path:
            for line in content.split("\n"):
                line = line.strip()
                if line.startswith("require"):
                    parts = line.split()
                    if len(parts) >= 2 and "(" not in parts[1]:
                        deps.add(parts[1])
                elif not line.startswith("//") and len(line.split()) >= 2:
                    deps.add(line.split()[0].lower())
    return deps

def extract_ast_signals(file_contents: List[Dict[str, str]]) -> Tuple[Set[str], Set[str], Set[str]]:
    """
    Returns (imports, calls, JSX_tags) extracted via Tree-sitter.
    """
    imports = set()
    calls = set()
    jsx_tags = set()
    
    if not HAS_TREE_SITTER:
        return imports, calls, jsx_tags
        
    for fc in file_contents:
        path = fc.get("path", "")
        content = fc.get("content", "")
        if not content: continue
        
        parser = None
        if path.endswith(".py"):
            parser = py_parser
        elif path.endswith((".js", ".jsx")):
            parser = js_parser
        elif path.endswith((".ts", ".tsx")):
            parser = ts_parser
            
        if not parser:
            continue
            
        try:
            tree = parser.parse(bytes(content, "utf8"))
            
            # Use cursor to traverse without hitting recursion limits
            cursor = tree.walk()
            
            reached_root = False
            while not reached_root:
                node = cursor.node
                node_type = node.type
                
                if node_type in ("import_statement", "import_from_statement", "import_declaration"):
                    src = content[node.start_byte:min(node.start_byte + 200, node.end_byte)]
                    imports.add(src)
                elif node_type == "call_expression":
                    src = content[node.start_byte:min(node.start_byte + 100, node.end_byte)]
                    calls.add(src)
                elif node_type in ("jsx_element", "jsx_self_closing_element"):
                    src = content[node.start_byte:min(node.start_byte + 100, node.end_byte)]
                    jsx_tags.add(src)
                
                if cursor.goto_first_child():
                    continue
                if cursor.goto_next_sibling():
                    continue
                
                retracing = True
                while retracing:
                    if not cursor.goto_parent():
                        retracing = False
                        reached_root = True
                    elif cursor.goto_next_sibling():
                        retracing = False
                        
        except Exception:
            pass
            
    return imports, calls, jsx_tags

import ast
import re
from typing import Any, Optional

# ═══════════════════════════════════════════════════════
#  PYTHON AST FUNCTION CALL GRAPH
# ═══════════════════════════════════════════════════════

def build_function_call_graph(source: str, file_path: str) -> Dict[str, Any]:
    """Build function call graph from Python AST.

    Extracts:
      - Function → function call relationships
      - Call depth and fan-out per function
      - Dead code detection (uncalled private functions)
    """
    try:
        tree = ast.parse(source, filename=file_path)
    except SyntaxError:
        return {"functions": {}, "dead_code": [], "max_call_depth": 0, "avg_fan_out": 0}

    # Collect all function definitions
    func_defs: Dict[str, List[str]] = {}  # name -> [callees]
    current_func: Optional[str] = None

    class CallGraphVisitor(ast.NodeVisitor):
        def visit_FunctionDef(self, node: ast.FunctionDef):
            nonlocal current_func
            old = current_func
            current_func = node.name
            func_defs.setdefault(node.name, [])
            self.generic_visit(node)
            current_func = old

        visit_AsyncFunctionDef = visit_FunctionDef

        def visit_Call(self, node: ast.Call):
            if current_func is not None:
                callee = None
                if isinstance(node.func, ast.Name):
                    callee = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    callee = node.func.attr
                if callee:
                    func_defs.setdefault(current_func, []).append(callee)
            self.generic_visit(node)

    CallGraphVisitor().visit(tree)

    # Find all called functions
    all_called = set()
    for callees in func_defs.values():
        all_called.update(callees)

    # Dead code: private functions (start with _) that are never called
    dead_code = [
        name for name in func_defs
        if name.startswith("_") and not name.startswith("__")
        and name not in all_called
    ]

    # Fan-out per function
    fan_outs = {name: len(set(callees)) for name, callees in func_defs.items()}
    avg_fan_out = sum(fan_outs.values()) / max(len(fan_outs), 1)

    # Approximate call depth via BFS
    def _call_depth(start: str, visited: Optional[set] = None) -> int:
        if visited is None:
            visited = set()
        if start in visited or start not in func_defs:
            return 0
        visited.add(start)
        callees = [c for c in set(func_defs.get(start, [])) if c in func_defs]
        if not callees:
            return 1
        return 1 + max(_call_depth(c, visited) for c in callees)

    depths = [_call_depth(f) for f in func_defs]
    max_depth = max(depths) if depths else 0

    return {
        "functions": {name: list(set(callees)) for name, callees in func_defs.items()},
        "dead_code": dead_code,
        "max_call_depth": max_depth,
        "avg_fan_out": round(avg_fan_out, 1),
        "total_functions": len(func_defs),
    }


# ═══════════════════════════════════════════════════════
#  DEPENDENCY GRAPH BUILDER
# ═══════════════════════════════════════════════════════

def build_dependency_graph(
    file_contents: List[Dict[str, str]],
) -> Dict[str, Any]:
    """Map import relationships between modules.

    Detects:
      - Circular dependencies (A → B → A)
      - Internal vs external dependency ratio
      - Module coupling metrics
    """
    # Extract module names from file paths
    modules: Dict[str, List[str]] = {}  # module -> [imports]

    for fc in file_contents:
        path = fc.get("path", "")
        content = fc.get("content", "")
        if not content:
            continue

        # Derive module name from path
        module_name = path.replace("/", ".").rsplit(".", 1)[0] if "." in path else path
        imports: List[str] = []

        ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""

        if ext == "py":
            try:
                tree = ast.parse(content, filename=path)
                for node in ast.walk(tree):
                    if isinstance(node, ast.Import):
                        for alias in node.names:
                            imports.append(alias.name.split(".")[0])
                    elif isinstance(node, ast.ImportFrom) and node.module:
                        imports.append(node.module.split(".")[0])
            except SyntaxError:
                pass
        elif ext in ("js", "ts", "jsx", "tsx"):
            import_matches = re.findall(r"(?:import|require)\s*\(?['\"]([^\"']+)['\"]\)?", content)
            for imp in import_matches:
                if imp.startswith("."):
                    imports.append(imp)
                else:
                    imports.append(imp.split("/")[0])

        modules[module_name] = list(set(imports))

    # Detect circular dependencies
    internal_modules = set(modules.keys())
    internal_module_roots = {m.split(".")[0] for m in internal_modules}
    circular_deps: List[List[str]] = []

    for mod_a, imports_a in modules.items():
        root_a = mod_a.split(".")[0]
        for imp in imports_a:
            imp_root = imp.split(".")[0]
            if imp_root in internal_module_roots:
                # Check reverse dependency
                for mod_b, imports_b in modules.items():
                    if mod_b.split(".")[0] == imp_root:
                        if root_a in [i.split(".")[0] for i in imports_b]:
                            pair = sorted([root_a, imp_root])
                            if pair not in circular_deps:
                                circular_deps.append(pair)

    # Internal vs external ratio
    all_imports = [imp for imps in modules.values() for imp in imps]
    internal_count = sum(1 for imp in all_imports if imp.split(".")[0] in internal_module_roots or imp.startswith("."))
    external_count = len(all_imports) - internal_count

    return {
        "total_modules": len(modules),
        "circular_dependencies": circular_deps[:10],
        "has_circular_deps": len(circular_deps) > 0,
        "internal_imports": internal_count,
        "external_imports": external_count,
        "internal_ratio": round(internal_count / max(len(all_imports), 1), 3),
    }



# ═══════════════════════════════════════════════════════
#  MODULARITY SCORING
# ═══════════════════════════════════════════════════════
def analyze_modularity(file_contents: List[Dict[str, str]]) -> Dict[str, float]:
    """Computes modularity and coupling scores."""
    if not file_contents:
        return {"modularity_score": 0.0, "coupling_score": 0.0, "complexity_score": 0.0}

    total_files = len(file_contents)
    total_imports = 0
    total_lines = 0

    for fc in file_contents:
        content = fc.get("content", "")
        lines = content.split("\n")
        total_lines += len(lines)
        
        for line in lines:
            line_str = line.strip()
            if line_str.startswith("import ") or line_str.startswith("from ") or "require(" in line_str:
                total_imports += 1

    avg_file_len = total_lines / total_files if total_files > 0 else 0
    modularity_score = 100.0
    if avg_file_len > 300:
        modularity_score -= min(50, (avg_file_len - 300) / 10)
    
    avg_imports = total_imports / total_files if total_files > 0 else 0
    coupling_score = min(100.0, avg_imports * 5.0) 
    
    return {
        "modularity_score": max(0.0, round(modularity_score, 1)),
        "coupling_score": round(coupling_score, 1),
        "complexity_score": round(min(100.0, avg_file_len / 5.0), 1),
    }


# ═══════════════════════════════════════════════════════
#  PYTHON STATIC QUALITY ANALYSIS (radon-compatible)
# ═══════════════════════════════════════════════════════

def analyze_python_quality(file_contents: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Compute cyclomatic complexity metrics for Python files using AST.
    
    This is a lightweight radon-compatible implementation that doesn't
    require the radon package. It counts branches, loops, and exception
    handlers to estimate complexity.
    
    Returns:
        average_complexity: float (lower is better)
        complexity_grade: str (A-F)
        complex_functions: list of high-complexity functions
        total_functions: int
    """
    py_files = [fc for fc in file_contents if fc.get("path", "").endswith(".py")]
    
    if not py_files:
        return {
            "average_complexity": 0,
            "complexity_grade": "N/A",
            "complex_functions": [],
            "total_functions": 0,
            "quality_score_bonus": 0,
        }
    
    all_functions: List[Dict[str, Any]] = []
    
    for fc in py_files:
        content = fc.get("content", "")
        path = fc.get("path", "")
        if not content:
            continue
        
        try:
            tree = ast.parse(content, filename=path)
        except SyntaxError:
            continue
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                # Count complexity contributors
                cc = 1  # Base complexity
                for child in ast.walk(node):
                    if isinstance(child, (ast.If, ast.IfExp)):
                        cc += 1
                    elif isinstance(child, (ast.For, ast.While)):
                        cc += 1
                    elif isinstance(child, ast.ExceptHandler):
                        cc += 1
                    elif isinstance(child, ast.BoolOp):
                        # and/or add branches
                        cc += len(child.values) - 1
                    elif isinstance(child, ast.Assert):
                        cc += 1
                    elif isinstance(child, ast.comprehension):
                        cc += 1
                
                all_functions.append({
                    "name": node.name,
                    "file": path,
                    "complexity": cc,
                    "line": node.lineno,
                })
    
    if not all_functions:
        return {
            "average_complexity": 0,
            "complexity_grade": "N/A",
            "complex_functions": [],
            "total_functions": 0,
            "quality_score_bonus": 0,
        }
    
    avg_cc = sum(f["complexity"] for f in all_functions) / len(all_functions)
    
    # Grade based on average complexity (radon scale)
    if avg_cc <= 5:
        grade = "A"
        bonus = 8
    elif avg_cc <= 10:
        grade = "B"
        bonus = 5
    elif avg_cc <= 20:
        grade = "C"
        bonus = 2
    elif avg_cc <= 30:
        grade = "D"
        bonus = 0
    else:
        grade = "F"
        bonus = -5
    
    # High complexity functions (cc > 10)
    complex_fns = sorted(
        [f for f in all_functions if f["complexity"] > 10],
        key=lambda f: f["complexity"],
        reverse=True,
    )[:10]
    
    return {
        "average_complexity": round(avg_cc, 1),
        "complexity_grade": grade,
        "complex_functions": complex_fns,
        "total_functions": len(all_functions),
        "quality_score_bonus": bonus,
    }

