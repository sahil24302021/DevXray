import time
from typing import Any, Dict, List, Optional, Tuple

from utils.logging_config import get_logger
from utils.proof import ProofCollector
from utils.repo_weight import weight_repos as apply_repo_weights, get_repo_weight_map

from processing.project_weighting_engine import run_code_intelligence
from intelligence.skill_engine import run_skill_verification, aggregate_skills_across_repos
from engines.truth_engine import run_truth_engine
from intelligence.authenticity_engine import run_authenticity_engine
from intelligence.consistency_engine import (
    run_consistency_engine,
    analyze_cross_repo_patterns,
)
from engines.growth_engine import run_growth_engine
from scoring.scoring_engine import compute_final_score
from intelligence.system_design_detector import run_system_design_engine
from processing.repo_analyzer import detect_project, analyze_ci_practices, analyze_test_culture

from orchestrator.report_generator import generate_report

log = get_logger("orchestrator")


# ═══════════════════════════════════════════════════════
#  FAILURE DETECTION LAYER
# ═══════════════════════════════════════════════════════

def _check_data_sufficiency(
    repos: List[Dict[str, Any]],
    commits: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    deep_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Determine if there's enough data for a meaningful analysis.

    Returns:
      status: "SUFFICIENT" | "LIMITED" | "INSUFFICIENT_DATA"
      confidence_cap: max confidence score possible with this data
      warnings: list of data quality issues
    """
    warnings: List[str] = []
    non_fork_repos = [r for r in repos if not r.get("is_fork", r.get("fork", False))]

    repo_count = len(non_fork_repos)
    commit_count = len(commits)
    event_count = len(events)
    files_available = 0
    if deep_data:
        files_available = sum(len(r.get("files", [])) for r in deep_data.get("repo_data", {}).values())

    if repo_count < 2:
        warnings.append(f"Only {repo_count} non-fork repos — very limited analysis possible")
    if commit_count < 5:
        warnings.append(f"Only {commit_count} commits — commit pattern analysis unreliable")
    if event_count < 3:
        warnings.append(f"Only {event_count} events — activity analysis limited")

    # Determine status
    if repo_count < 2 or (commit_count < 2 and event_count < 2):
        status = "INSUFFICIENT_DATA"
        confidence_cap = 0.2
    elif repo_count < 3 or commit_count < 10:
        status = "LIMITED"
        confidence_cap = 0.45  # FIX 12: tightened from 0.5
    else:
        status = "SUFFICIENT"
        confidence_cap = 1.0

    return {
        "status": status,
        "confidence_cap": confidence_cap,
        "warnings": warnings,
        "data_summary": {
            "repos": repo_count,
            "commits": commit_count,
            "events": event_count,
            "files_available": files_available,
        },
    }


# ═══════════════════════════════════════════════════════
#  GLOBAL CONFIDENCE SCORE
# ═══════════════════════════════════════════════════════

def _compute_global_confidence(
    sufficiency: Dict[str, Any],
    code_analysis: Dict[str, Any],
    skills: Dict[str, Any],
    authenticity: Dict[str, Any],
    proof: ProofCollector,
) -> float:
    """
    Compute global confidence score (0-1).

    confidence_score = f(
      total_files_analyzed,
      repos_analyzed,
      proof_density,
      data_sufficiency
    )

    This tells HR: "Can I trust this report?"
    """
    confidence_cap = sufficiency.get("confidence_cap", 1.0)

    # Files analyzed factor (0-0.3)
    files = code_analysis.get("files_analyzed", 0)
    if files >= 30:
        file_factor = 0.30
    elif files >= 15:
        file_factor = 0.25
    elif files >= 5:
        file_factor = 0.15
    elif files >= 1:
        file_factor = 0.08
    else:
        file_factor = 0.02

    # Repos analyzed factor (0-0.25)
    repos_count = sufficiency.get("data_summary", {}).get("repos", 0)
    if repos_count >= 10:
        repo_factor = 0.25
    elif repos_count >= 5:
        repo_factor = 0.20
    elif repos_count >= 3:
        repo_factor = 0.12
    elif repos_count >= 1:
        repo_factor = 0.05
    else:
        repo_factor = 0.0

    # Skill detection factor (0-0.2)
    skill_count = skills.get("total_skills_detected", 0)
    if skill_count >= 5:
        skill_factor = 0.20
    elif skill_count >= 2:
        skill_factor = 0.10
    else:
        skill_factor = 0.03

    # Proof density factor (0-0.15)
    density = proof.proof_density
    if density >= 0.8:
        proof_factor = 0.15
    elif density >= 0.5:
        proof_factor = 0.10
    elif density >= 0.2:
        proof_factor = 0.05
    else:
        proof_factor = 0.02

    # Base confidence (0.1)
    base = 0.10

    raw_confidence = base + file_factor + repo_factor + skill_factor + proof_factor
    confidence = min(raw_confidence, confidence_cap)
    confidence = round(max(0.0, min(1.0, confidence)), 2)

    return confidence


# ═══════════════════════════════════════════════════════
#  CORE PIPELINE (STRICT EXECUTION ORDER)
# ═══════════════════════════════════════════════════════

def _run_core_pipeline(
    username: str,
    profile: Dict[str, Any],
    repos: List[Dict[str, Any]],
    commits: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    deep_data: Optional[Dict[str, Any]] = None,
    resume_data: Optional[Dict[str, Any]] = None,
    job_requirements: Optional[Dict[str, Any]] = None,
    account_age_years: float = 0.0,
    years_experience: int = 0,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Single unified pipeline for all analysis.

    Returns:
      (engine_results, pipeline_meta)
    """
    from contracts.analysis_schema import AnalysisContext
    from contracts.github_schema import GitHubData
    from validation.data_validator import DataValidator
    
    proof = ProofCollector()
    timing: Dict[str, float] = {}
    context = AnalysisContext(username=username)

    # ════════════════════════════════════════════════════
    #  STEP 0: DATA CONTRACT VALIDATION
    # ════════════════════════════════════════════════════
    t0 = time.time()
    
    try:
        github_data = GitHubData(
            username=username,
            profile=profile,
            repos=repos,
            commits=commits,
            metadata=deep_data or {}
        )
    except Exception as e:
        log.error(f"Failed to build explicit GitHubData contract: {e}")
        context.add_error("Data Contract Structure Constraint Failed")
        github_data = GitHubData(username=username)

    validation_result = DataValidator.validate_github_data(github_data)
    context.validation = validation_result
    
    for warning in validation_result.warnings:
        context.add_warning(warning, penalty=validation_result.confidence_penalty / max(1, len(validation_result.warnings)))

    timing["validation"] = round(time.time() - t0, 3)
    log.info(f"Data validation: is_valid={validation_result.is_valid} | repos={len(repos)}")

    if not validation_result.is_valid:
        log.warning("Validation blocked. Insufficient data for safe intelligence processing.")
        # Relaxed: Do NOT return empty_result! Let the pipeline attempt best-effort execution
        # instead of punishing the user with an instant 0/100 INSUFFICIENT DATA score.

    # Fix: Define sufficiency which is required by the rest of the pipeline
    sufficiency = _check_data_sufficiency(repos, commits, events, deep_data)

    # ════════════════════════════════════════════════════
    #  STEP 1: WEIGHT REPOSITORIES
    # ════════════════════════════════════════════════════
    t0 = time.time()
    weighted_repos = apply_repo_weights(repos)
    repo_weight_map = get_repo_weight_map(repos)
    timing["repo_weighting"] = round(time.time() - t0, 3)

    log.info(f"Repos weighted: {len(weighted_repos)} repos")

    # ════════════════════════════════════════════════════
    #  STEP 2: CODE INTELLIGENCE
    # ════════════════════════════════════════════════════
    t0 = time.time()
    all_file_contents: List[Dict[str, str]] = []
    all_file_paths: List[str] = []
    code_results: List[Dict[str, Any]] = []
    projects_detected: List[Dict[str, Any]] = []

    if deep_data:
        repo_data = deep_data.get("repo_data", {})
        for repo_name, rdata in repo_data.items():
            files = rdata.get("files", [])
            tree = rdata.get("tree", [])
            readme = rdata.get("readme", "")

            # Accumulate for cross-repo analysis
            for f in files:
                all_file_contents.append({
                    "path": f"{repo_name}/{f.get('path', '')}",
                    "content": f.get("content", ""),
                })

            file_paths_in_repo = [t.get("path", "") if isinstance(t, dict) else str(t) for t in tree]
            all_file_paths.extend([f"{repo_name}/{p}" for p in file_paths_in_repo])

            # Per-repo code intelligence
            result = run_code_intelligence(
                file_contents=files,
                file_paths=file_paths_in_repo,
                repo_name=repo_name,
                readme_content=readme,
                proof=proof,
            )
            code_results.append(result)
            
            # Project Detection
            proj = detect_project(repo_name, readme, file_paths_in_repo, files)
            ci_data = analyze_ci_practices(file_paths_in_repo)
            proj.update(ci_data)
            projects_detected.append(proj)
            proof.add(
                evidence_type="project_detection",
                detail=f"Detected project '{repo_name}' as {proj.get('type')} (confidence: {proj.get('confidence')})"
            )

    # Aggregate code metrics across repos (weighted)
    code_analysis = _aggregate_code_results(code_results, weighted_repos)
    timing["code_intelligence"] = round(time.time() - t0, 3)

    log.info(f"Code analysis done: {code_analysis.get('files_analyzed', 0)} files across {len(code_results)} repos")

    # ════════════════════════════════════════════════════
    #  STEP 2.3: TEST CULTURE ANALYSIS
    # ════════════════════════════════════════════════════
    t0 = time.time()
    test_culture = analyze_test_culture(all_file_paths, all_file_contents)
    timing["test_culture"] = round(time.time() - t0, 3)
    log.info(f"Test culture score: {test_culture.get('test_culture_score', 0)}")

    # ════════════════════════════════════════════════════
    #  STEP 2.5: SYSTEM DESIGN ENGINE
    # ════════════════════════════════════════════════════
    t0 = time.time()
    system_design = run_system_design_engine(
        file_contents=all_file_contents,
        file_paths=all_file_paths,
        proof=proof,
    )
    timing["system_design_engine"] = round(time.time() - t0, 3)

    log.info(f"System design score: {system_design.get('system_design_score', 0)}")

    # ════════════════════════════════════════════════════
    #  STEP 3: SKILL VERIFICATION
    # ════════════════════════════════════════════════════
    t0 = time.time()
    per_repo_skills: List[Dict[str, Any]] = []

    if deep_data:
        repo_data = deep_data.get("repo_data", {})
        for repo_name, rdata in repo_data.items():
            files = rdata.get("files", [])
            if files:
                file_paths = [f.get("path", "") for f in files]
                skill_result = run_skill_verification(
                    file_contents=files,
                    file_paths=file_paths,
                    repo_name=repo_name,
                    proof=proof,
                )
                per_repo_skills.append(skill_result)

    # Cross-repo aggregation with repo quality weights
    skills = aggregate_skills_across_repos(per_repo_skills, repo_weights=repo_weight_map)
    timing["skill_verification"] = round(time.time() - t0, 3)

    log.info(f"Skills detected: {skills.get('total_skills_detected', 0)}")

    # ════════════════════════════════════════════════════
    #  STEP 4: TRUTH ENGINE (only when resume provided)
    # ════════════════════════════════════════════════════
    t0 = time.time()
    truth = {"truth_score": 0, "mismatches": [], "verified_claims": []}
    if resume_data:
        from processing.code_analyzer import extract_dependencies, extract_ast_signals
        deps = extract_dependencies(all_file_contents)
        ast_imports, _, _ = extract_ast_signals(all_file_contents)
        all_packages = list(deps.union(ast_imports))

        detected_skills = skills.get("skills", [])
        truth = run_truth_engine(
            resume_data=resume_data,
            github_repos=repos,
            detected_skills=detected_skills,
            detected_packages=all_packages,
            account_age_years=account_age_years,
            proof=proof,
        )
    timing["truth_engine"] = round(time.time() - t0, 3)

    # ════════════════════════════════════════════════════
    #  STEP 5: AUTHENTICITY + ANTI-CHEAT
    # ════════════════════════════════════════════════════
    t0 = time.time()
    authenticity = run_authenticity_engine(
        username=username,
        commits=commits,
        events=events,
        repos=repos,
        file_contents=all_file_contents if all_file_contents else None,
        proof=proof,
    )
    timing["authenticity_engine"] = round(time.time() - t0, 3)

    log.info(f"Authenticity score: {authenticity.get('authenticity_score', 0)}")

    # ════════════════════════════════════════════════════
    #  STEP 6: CONSISTENCY ENGINE
    # ════════════════════════════════════════════════════
    t0 = time.time()
    # 7. Consistency Insight & Cross-Repo Insight
    consistency = run_consistency_engine(
        repos=repos,
        commits=commits,
        events=events,
        proof=proof,
    )
    cross_repo = analyze_cross_repo_patterns(code_results, proof)
    consistency["cross_repo_intelligence"] = cross_repo
    
    timing["consistency"] = round(time.time() - t0, 3)

    log.info(f"Consistency score: {consistency.get('consistency_score', 0)}")

    # ════════════════════════════════════════════════════
    #  STEP 7: GROWTH ENGINE
    # ════════════════════════════════════════════════════
    t0 = time.time()
    growth = run_growth_engine(
        repos=repos,
        commits=commits,
        events=events,
        proof=proof,
    )
    timing["growth_engine"] = round(time.time() - t0, 3)

    # ════════════════════════════════════════════════════
    #  STEP 8: SCORING ENGINE
    # ════════════════════════════════════════════════════
    t0 = time.time()

    # Collect ALL risk flags from all engines (with severity)
    all_risk_flags: List[Dict[str, str]] = []
    all_risk_flags.extend(authenticity.get("risk_flags", []))
    for flag in consistency.get("risk_flags", []):
        if isinstance(flag, dict):
            all_risk_flags.append(flag)
        else:
            all_risk_flags.append({"flag": str(flag), "severity": "MEDIUM", "type": "consistency"})

    total_ci_bonus = sum(p.get("ci_depth_bonus", 0) for p in projects_detected)

    # ── PRIVATE REPO CONTRIBUTION BOOST ──
    # GitHub profile shows total contributions vs visible public repos.
    # A developer with 5 public repos but 200+ total contributions has private work.
    total_public_repos = len([r for r in repos if not r.get("is_fork", r.get("fork", False))])
    total_contribs = profile.get("_total_contributions", 0)
    multi_source_bonus_from_private = 0.0

    if total_public_repos < 5 and total_contribs > 100:
        private_ratio = min((total_contribs - total_public_repos * 10) / max(total_contribs, 1), 0.7)
        multi_source_bonus_from_private = round(private_ratio * 5, 1)  # up to +5 points
        log.info(
            f"Private repo boost: {multi_source_bonus_from_private:.1f} pts "
            f"(public={total_public_repos}, total_contribs={total_contribs})"
        )

    scoring = compute_final_score(
        code_quality=code_analysis.get("code_quality_score", 0),
        skill_depth=skills.get("skill_depth_average", 0),
        authenticity=authenticity.get("authenticity_score", 0),
        consistency=consistency.get("consistency_score", 0),
        growth=growth.get("growth_score", 0),
        truth_score=truth.get("truth_score", 0),
        risk_flags=all_risk_flags,
        skill_summary=skills.get("skill_summary", {}),
        verified_skills=skills.get("skills", []),
        years_experience=years_experience,
        proof=proof,
        job_requirements=job_requirements,
        repos=repos,
        commits=commits,
        ci_depth_bonus=total_ci_bonus,
        test_culture_score=float(test_culture.get("test_culture_score", 0)),
        # BUG 6 FIX: truth engine only runs when resume_data is present.
        # Pass has_resume so truth weight is zeroed for GitHub-only scans,
        # preventing unfair score penalties for developers without resumes.
        has_resume=(resume_data is not None),
        multi_source_bonus=multi_source_bonus_from_private,
    )
    timing["scoring_engine"] = round(time.time() - t0, 3)

    log.info(f"Final score: {scoring.get('final_score', 0)}")

    # ════════════════════════════════════════════════════
    #  STEP 9: GLOBAL CONFIDENCE
    # ════════════════════════════════════════════════════
    confidence_score = _compute_global_confidence(
        sufficiency, code_analysis, skills, authenticity, proof
    )

    # ════════════════════════════════════════════════════
    #  ASSEMBLE RESULTS
    # ════════════════════════════════════════════════════
    engine_results = {
        "projects": projects_detected,
        "code_analysis": code_analysis,
        "system_design": system_design,
        "skills": skills,
        "truth": truth,
        "authenticity": authenticity,
        "consistency": consistency,
        "growth": growth,
        "scoring": scoring,
        "risk_flags": all_risk_flags,
        "proof_list": proof.to_list(),
    }

    pipeline_meta = {
        "analysis_version": "v3.0",
        "timing": timing,
        "timing_total": round(sum(timing.values()), 3),
        "sufficiency": sufficiency,
        "confidence_score": confidence_score,
        "is_low_confidence": confidence_score < 0.5,
        "proof_density": proof.get_density_report(),
        "repos_weighted": len(weighted_repos),
    }

    return engine_results, pipeline_meta


# ═══════════════════════════════════════════════════════
#  AGGREGATION HELPERS
# ═══════════════════════════════════════════════════════

def _aggregate_code_results(
    code_results: List[Dict[str, Any]],
    weighted_repos: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Aggregate code analysis results from multiple repos.
    Uses repo quality weights to compute weighted averages.
    """
    if not code_results:
        return {
            "code_quality_score": 0,
            "maintainability_score": 0,
            "files_analyzed": 0,
            "test_coverage_indicator": "None",
            "project_structure": {},
            "template_detection": {"is_template": False},
            "ai_generation_detection": {"likely_ai_generated": False, "confidence": 0},
            "metrics": {},
        }

    # Build weight map from weighted_repos
    weight_map: Dict[str, float] = {}
    for r in weighted_repos:
        weight_map[r.get("name", "")] = r.get("_quality_weight", 1.0)

    total_weight = 0.0
    weighted_quality = 0.0
    weighted_maintainability = 0.0
    total_files = 0
    best_structure = {}
    any_template = False
    any_ai = False
    ai_confidence = 0

    for cr in code_results:
        # Look up repo weight. code_results don't always have repo_name directly,
        # so use a fallback weight of 1.0
        repo_name = cr.get("_repo_name", "")
        w = weight_map.get(repo_name, 1.0)

        total_weight += w
        weighted_quality += cr.get("code_quality_score", 0) * w
        weighted_maintainability += cr.get("maintainability_score", 0) * w
        total_files += cr.get("files_analyzed", 0)

        # Keep the richest project structure
        ps = cr.get("project_structure", {})
        if len(str(ps)) > len(str(best_structure)):
            best_structure = ps

        # Template/AI detection: flag if any repo triggers
        if cr.get("template_detection", {}).get("is_template"):
            any_template = True
        ai_info = cr.get("ai_generation_detection", {})
        if ai_info.get("likely_ai_generated"):
            any_ai = True
            ai_confidence = max(ai_confidence, ai_info.get("confidence", 0))

    if total_weight > 0:
        avg_quality = weighted_quality / total_weight
        avg_maintainability = weighted_maintainability / total_weight
    else:
        avg_quality = 0
        avg_maintainability = 0

    # Test coverage indicator from best structure
    test_indicator = best_structure.get("test_coverage_indicator", "None")
    if not test_indicator:
        test_indicator = "None"

    return {
        "code_quality_score": round(avg_quality, 1),
        "maintainability_score": round(avg_maintainability, 1),
        "files_analyzed": total_files,
        "test_coverage_indicator": test_indicator,
        "project_structure": best_structure,
        "template_detection": {"is_template": any_template},
        "ai_generation_detection": {"likely_ai_generated": any_ai, "confidence": ai_confidence},
        "metrics": {},
    }


def _build_insufficient_result(
    sufficiency: Dict[str, Any],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """Build minimal result set when data is insufficient."""
    proof.add(
        evidence_type="data_quality",
        detail=f"INSUFFICIENT_DATA: {'; '.join(sufficiency.get('warnings', []))}",
    )

    return {
        "projects": [],
        "code_analysis": {
            "code_quality_score": 0,
            "maintainability_score": 0,
            "files_analyzed": 0,
            "test_coverage_indicator": "None",
            "project_structure": {},
            "template_detection": {"is_template": False},
            "ai_generation_detection": {"likely_ai_generated": False, "confidence": 0},
        },
        "skills": {
            "skills": [],
            "skill_summary": {},
            "top_skills": [],
            "total_skills_detected": 0,
            "skill_depth_average": 0,
        },
        "truth": {"truth_score": 0, "mismatches": [], "verified_claims": []},
        "authenticity": {"authenticity_score": 0, "risk_flags": []},
        "consistency": {"consistency_score": 0, "risk_flags": []},
        "growth": {"growth_score": 0, "learning_curve": "Unknown"},
        "scoring": {
            "final_score": 0,
            "score_breakdown": {},
            "benchmark": {"tier": "Beginner", "percentile": 0},
            "hiring_recommendation": "INSUFFICIENT DATA — Not enough public code to analyze",
            "developer_tier": "Beginner",
        },
        "risk_flags": [{
            "flag": "Insufficient data for reliable analysis",
            "severity": "CRITICAL",
            "type": "data_quality",
        }],
        "proof_list": proof.to_list(),
    }


# ═══════════════════════════════════════════════════════
#  PUBLIC API
# ═══════════════════════════════════════════════════════

def run_github_analysis(
    username: str,
    profile: Dict[str, Any],
    repos: List[Dict[str, Any]],
    commits: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    deep_data: Optional[Dict[str, Any]] = None,
    account_age_years: float = 0.0,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Run full GitHub analysis pipeline.

    Returns:
      (engine_results, pipeline_meta)
    """
    return _run_core_pipeline(
        username=username,
        profile=profile,
        repos=repos,
        commits=commits,
        events=events,
        deep_data=deep_data,
        account_age_years=account_age_years,
    )


def run_resume_analysis(
    username: str,
    profile: Dict[str, Any],
    repos: List[Dict[str, Any]],
    commits: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    resume_data: Dict[str, Any],
    deep_data: Optional[Dict[str, Any]] = None,
    job_requirements: Optional[Dict[str, Any]] = None,
    account_age_years: float = 0.0,
    years_experience: int = 0,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Run full analysis pipeline with resume truth engine.

    Returns:
      (engine_results, pipeline_meta)
    """
    return _run_core_pipeline(
        username=username,
        profile=profile,
        repos=repos,
        commits=commits,
        events=events,
        deep_data=deep_data,
        resume_data=resume_data,
        job_requirements=job_requirements,
        account_age_years=account_age_years,
        years_experience=years_experience,
    )
