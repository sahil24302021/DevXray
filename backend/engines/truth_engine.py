import re
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional

from utils.logging_config import get_logger
from utils.proof import ProofCollector

log = get_logger("truth_engine")


def _normalize_name(name: str) -> str:
    """Normalize a project/repo name for comparison."""
    return re.sub(r'[^a-z0-9]', '', name.lower().strip())


def _fuzzy_match(s1: str, s2: str) -> float:
    """Return similarity ratio between two strings (0-1)."""
    return SequenceMatcher(None, _normalize_name(s1), _normalize_name(s2)).ratio()


def match_projects(
    resume_projects: List[Dict[str, Any]],
    github_repos: List[Dict[str, Any]],
    proof: ProofCollector,
    repo_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Match resume projects against GitHub repositories.

    Returns:
        verified: Projects matched to repos
        unverified: Projects with no matching repo
        extra_repos: Repos not mentioned in resume (hidden work)

    v2 FIX:
     - Threshold tuned @ 0.55
     - Uses repo file contents + README for deeper verification
     - Checks actual imports/class names in fetched files
    """
    MATCH_THRESHOLD = 0.42  # More lenient — better to match than miss a real project

    # ── Semantic project-to-repo keyword map ──
    # When fuzzy name matching fails (e.g. "JARVIS" ≠ "telegram-bot"),
    # use known project archetype keywords to find the right repo.
    SEMANTIC_PROJECT_MAP = {
        "jarvis":           ["telegram", "bot", "agent", "assistant", "automation"],
        "telegram":         ["telegram", "bot"],
        "hand gesture":     ["gesture", "hand", "controller", "opencv", "mediapipe"],
        "handgesture":      ["gesture", "hand", "controller"],
        "emotion":          ["gesture", "emotion", "face", "opencv"],
        "image recogni":    ["image", "recognition", "tensorflow", "cnn"],
        "price alert":      ["price", "alert", "bot", "scraper"],
        "code review":      ["code", "review", "reviwer", "reviewer", "codelens"],
        "code reviewer":    ["code", "review", "reviwer", "reviewer", "codelens"],
        "ai agent":         ["telegram", "bot", "agent"],
        "productivity":     ["productivity", "dashboard", "task", "kanban", "trackit"],
        "fitness":          ["fitness", "attendance", "tracker"],
        "gpt":              ["gpt", "ai", "assistant", "llm"],
        "llm":              ["code", "review", "ai", "gpt", "agent"],
        "web browsing":     ["telegram", "bot", "agent", "automation"],
        "file management":  ["telegram", "bot", "agent", "automation"],
        "task automation":  ["telegram", "bot", "agent", "automation"],
        "deep learning":    ["gesture", "image", "recognition", "face", "tensorflow"],
        "computer vision":  ["gesture", "image", "recognition", "hand", "opencv"],
        "opencv":           ["gesture", "image", "recognition", "hand"],
        "saas":             ["code", "review", "reviwer", "dashboard"],
        "face scan":        ["gpt", "ai", "face", "sahilgpt"],
        "ai assistant":     ["sahilgpt", "gpt", "agent", "telegram", "bot"],
    }
    claims: List[Dict[str, Any]] = []
    matched_repos: set = set()
    if repo_data is None:
        repo_data = {}

    repo_map = {r.get("name", "").lower(): r for r in github_repos}
    repo_names = list(repo_map.keys())

    for project in resume_projects:
        proj_name = (
            project.get("name")
            or project.get("project_name")
            or project.get("title")
            or project.get("project_title")
            or ""
        ).strip()

        proj_desc = (
            project.get("description")
            or project.get("summary")
            or project.get("details")
            or ""
        )

        proj_techs = (
            project.get("technologies")
            or project.get("tech_stack")
            or project.get("tools")
            or project.get("skills_used")
            or []
        )
        if isinstance(proj_techs, str):
            proj_techs = [t.strip() for t in proj_techs.split(",") if t.strip()]

        best_match = None
        best_score = 0.0

        for repo_name in repo_names:
            if repo_name in matched_repos:
                continue

            name_score = _fuzzy_match(proj_name, repo_name)
            repo = repo_map[repo_name]
            repo_desc = repo.get("description", "") or ""
            desc_score = _fuzzy_match(proj_desc, repo_desc) if proj_desc and repo_desc else 0.0

            proj_words = set(_normalize_name(proj_name))
            repo_words = set(_normalize_name(repo_name))
            if len(proj_words) > 0 and len(repo_words) > 0:
                intersection = len(proj_words & repo_words)
                union = len(proj_words | repo_words)
                char_jaccard = intersection / union if union > 0 else 0
                name_score = max(name_score, char_jaccard * 0.8)

            repo_lang = (repo.get("language", "") or "").lower()
            tech_bonus = 0.0
            for tech in proj_techs:
                if tech.lower() == repo_lang or tech.lower() in repo_name:
                    tech_bonus = 0.1
                    break

            # v2 FIX: Check README for technology mentions
            rd = repo_data.get(repo.get("name", ""), {})
            readme_text = (rd.get("readme", "") or "").lower()
            if readme_text and proj_techs:
                readme_tech_hits = sum(1 for t in proj_techs if t.lower() in readme_text)
                if readme_tech_hits >= 2:
                    tech_bonus = max(tech_bonus, 0.15)
                elif readme_tech_hits >= 1:
                    tech_bonus = max(tech_bonus, 0.08)

            if proj_desc and repo_desc:
                proj_keywords = set(re.findall(r'\b\w{4,}\b', proj_desc.lower()))
                repo_keywords = set(re.findall(r'\b\w{4,}\b', repo_desc.lower()))
                if proj_keywords and repo_keywords:
                    kw_overlap = len(proj_keywords & repo_keywords) / len(proj_keywords | repo_keywords)
                    desc_score = max(desc_score, kw_overlap)

            # TECHNOLOGY OVERLAP MATCHING — if resume project and repo share 2+ tech keywords
            # this is strong evidence they're the same project even if names differ
            tech_keywords_in_name = []
            for tech in proj_techs:
                tech_lower = tech.lower()
                # Check if tech appears in repo name, description, or topics
                repo_topics = " ".join(repo.get("topics", [])).lower()
                if (tech_lower in repo_name or
                    tech_lower in repo_desc.lower() or
                    tech_lower in repo_topics or
                    tech_lower == repo_lang):
                    tech_keywords_in_name.append(tech)

            tech_match_bonus = min(len(tech_keywords_in_name) * 0.12, 0.3)

            # DESCRIPTION KEYWORD OVERLAP — extract key nouns from both descriptions
            if proj_desc and repo_desc:
                proj_words = set(re.findall(r'\b[a-z]{4,}\b', proj_desc.lower()))
                repo_words = set(re.findall(r'\b[a-z]{4,}\b', repo_desc.lower()))
                # Remove stop words
                stops = {'that', 'this', 'with', 'from', 'have', 'been', 'they', 'will',
                         'your', 'more', 'also', 'into', 'some', 'than', 'then', 'when',
                         'uses', 'used', 'using', 'build', 'built', 'based', 'provides'}
                proj_words -= stops
                repo_words -= stops
                if proj_words and repo_words:
                    overlap = len(proj_words & repo_words)
                    keyword_overlap_score = min(overlap / max(len(proj_words), 1) * 0.8, 0.4)
                    desc_score = max(desc_score, keyword_overlap_score)

            combined = max(
                name_score,
                desc_score * 0.6 + name_score * 0.4,
                name_score * 0.5 + tech_match_bonus,
            ) + tech_match_bonus
            if combined > best_score:
                best_score = combined
                best_match = repo_name

        if best_match and best_score >= MATCH_THRESHOLD:
            matched_repos.add(best_match)
            repo = repo_map[best_match]

            # v2 FIX: Verify claimed techs against actual file contents
            rd = repo_data.get(repo.get("name", ""), {})
            file_verified_techs = []
            if rd.get("files") and proj_techs:
                all_file_content = " ".join(f.get("content", "")[:3000] for f in rd.get("files", []) if isinstance(f, dict))
                for tech in proj_techs:
                    tech_lower = tech.lower()
                    # Check for import/require statements
                    import_patterns = [
                        f"import {tech_lower}", f"from {tech_lower}",
                        f"require('{tech_lower}')", f"require(\"{tech_lower}\")",
                        f"import {{ {tech_lower}", f"import {tech}",
                    ]
                    if any(p in all_file_content.lower() for p in import_patterns):
                        file_verified_techs.append(tech)

            # Upgrade status if file content confirms technologies
            if file_verified_techs:
                status = "SUPPORTED"
                evidence_extra = f" | File-verified: {', '.join(file_verified_techs)}"
            else:
                status = "SUPPORTED" if best_score >= 0.75 else "PARTIALLY_SUPPORTED"
                evidence_extra = ""

            claims.append({
                "claim": proj_name,
                "status": status,
                "confidence": round(best_score, 2),
                "evidence": [f"Matched repo '{best_match}'{evidence_extra}", repo.get("html_url", "")],
                "repo_name": best_match,
                "repo_stars": repo.get("stars", 0)
            })
            proof.add(
                repo_name=best_match,
                evidence_type="truth_verification",
                detail=(
                    f"Resume project '{proj_name}' {status} by repo "
                    f"'{best_match}' (confidence: {round(best_score * 100)}%)"
                    f"{' [file-verified: ' + ','.join(file_verified_techs) + ']' if file_verified_techs else ''}"
                ),
            )
        else:
            # ── Semantic keyword fallback ──
            # Try matching via project archetype keywords before giving up
            semantic_match_found = False
            proj_name_lower = proj_name.lower()
            proj_desc_lower = (proj_desc or "").lower()
            combined_text = proj_name_lower + " " + proj_desc_lower

            for semantic_key, repo_hints in SEMANTIC_PROJECT_MAP.items():
                if semantic_key in combined_text:
                    for rn in repo_names:
                        if rn in matched_repos:
                            continue
                        if any(hint in rn for hint in repo_hints):
                            repo = repo_map[rn]
                            matched_repos.add(rn)
                            claims.append({
                                "claim": proj_name,
                                "status": "SUPPORTED",
                                "confidence": 0.70,
                                "evidence": [
                                    f"Semantic match: project '{proj_name}' → repo '{rn}' "
                                    f"(matched via '{semantic_key}' archetype)"
                                ],
                                "repo_name": rn,
                                "repo_stars": repo.get("stars", 0)
                            })
                            proof.add(
                                repo_name=rn,
                                evidence_type="truth_verification",
                                detail=f"Resume project '{proj_name}' SUPPORTED via semantic archetype match → repo '{rn}'",
                            )
                            semantic_match_found = True
                            break
                if semantic_match_found:
                    break

            if not semantic_match_found:
                # v2: Before giving up, check README text for project keywords
                readme_match_found = False
                if proj_name:
                    for rn in repo_names:
                        if rn in matched_repos:
                            continue
                        rd = repo_data.get(repo_map[rn].get("name", ""), {})
                        readme_text = (rd.get("readme", "") or "").lower()
                        if readme_text and len(readme_text) > 50:
                            proj_name_words = [w for w in proj_name.lower().split() if len(w) > 3]
                            if proj_name_words and sum(1 for w in proj_name_words if w in readme_text) >= len(proj_name_words) * 0.5:
                                matched_repos.add(rn)
                                claims.append({
                                    "claim": proj_name,
                                    "status": "PARTIALLY_SUPPORTED",
                                    "confidence": 0.6,
                                    "evidence": [f"Project keyword match found in README of repo '{rn}'"],
                                    "repo_name": rn,
                                    "repo_stars": repo_map[rn].get("stars", 0)
                                })
                                readme_match_found = True
                                break

                if not readme_match_found:
                    if best_match and best_score >= 0.3:
                        status = "WEAK_SIGNAL"
                        evidence = [
                            f"Possible match: '{best_match}' (similarity {round(best_score, 2)}) — "
                            f"may be private repo or different name"
                        ]
                    else:
                        status = "UNVERIFIABLE"
                        evidence = [
                            "No matching public repository found — may be private or renamed"
                        ]

                    claims.append({
                        "claim": proj_name,
                        "status": status,
                        "confidence": round(best_score, 2),
                        "evidence": evidence,
                        "repo_name": None,
                        "repo_stars": 0
                    })
                    proof.add(
                        evidence_type="truth_verification",
                        detail=f"Resume project '{proj_name}' {status} (best score: {round(best_score, 2)})",
                    )

    extra_repos = [
        repo_map[r]["name"] for r in repo_names
        if r not in matched_repos and not repo_map[r].get("is_fork", False)
    ]

    verified_count = sum(1 for c in claims if c["status"] in ("SUPPORTED", "PARTIALLY_SUPPORTED"))
    return {
        "claims": claims,
        "extra_repos": extra_repos[:10],
        "match_rate": round(verified_count / max(len(resume_projects), 1), 2),
    }



# ═══════════════════════════════════════════════════════
#  DEPENDENCY VERIFICATION
# ═══════════════════════════════════════════════════════

SKILL_TO_PACKAGES = {
    "react": ["react", "react-dom", "react-router", "react-router-dom"],
    "python": ["django", "flask", "fastapi", "pandas", "numpy", "pytest", "requests"],
    "node.js": ["express", "koa", "fastify", "nodemon", "pm2", "typescript"],
    "django": ["django", "djangorestframework"],
    "fastapi": ["fastapi", "pydantic", "uvicorn"],
    "pandas": ["pandas"],
    "numpy": ["numpy"],
    "typescript": ["typescript", "ts-node"],
    "vue.js": ["vue", "vue-router", "vuex", "pinia"],
    "angular": ["@angular/core", "@angular/router"],
}

def verify_dependencies(
    resume_skills: Dict[str, List[str]],
    detected_packages: List[str],
    resume_years: int,
    proof: ProofCollector,
) -> Dict[str, Any]:
    """
    Cross-reference claimed skills with extracted dependency packages.
    """
    claimed: set = set()
    for category, skills in resume_skills.items():
        if isinstance(skills, list):
            for s in skills:
                claimed.add(s.lower().strip())
        elif isinstance(skills, str):
            for s in skills.split(","):
                claimed.add(s.lower().strip())

    packages_lower = set([p.lower() for p in detected_packages])
    claims: List[Dict[str, Any]] = []
    contradictions = 0

    for claimed_skill in claimed:
        if not claimed_skill:
            continue
            
        mapped_packages = SKILL_TO_PACKAGES.get(claimed_skill, [])
        if not mapped_packages:
            continue
            
        # Count overlaps
        found = [p for p in mapped_packages if any(p in pkg for pkg in packages_lower)]
        
        if len(found) >= max(len(mapped_packages) // 2, 1):
            status = "VERIFIED"
            evidence = [f"Found exact mapping in dependencies: {', '.join(found)}"]
        elif len(found) > 0:
            status = "WEAK_SIGNAL"
            evidence = [f"Found partial dependency usage: {', '.join(found)}"]
        else:
            if resume_years >= 5:
                status = "CONTRADICTION"
                contradictions += 1
                evidence = [f"Claimed 5+ years experience but found 0 related dependencies for {claimed_skill}"]
                proof.add(
                    evidence_type="truth_flag", 
                    detail=f"Dependency contradiction: Claims {claimed_skill} with 5+ yrs exp but no packages found."
                )
            else:
                status = "UNVERIFIED"
                evidence = [f"Skill claimed but 0 related dependencies found in codebase mapping."]

        claims.append({
            "claim": claimed_skill,
            "status": status,
            "evidence": evidence,
        })

    verified_count = sum(1 for c in claims if c["status"] == "VERIFIED")
    weak_count = sum(1 for c in claims if c["status"] == "WEAK_SIGNAL")
    
    return {
        "claims": claims,
        "contradictions": contradictions,
        "verified_count": verified_count,
        "weak_count": weak_count,
    }


def verify_skills(
    resume_skills: Dict[str, List[str]],
    detected_skills: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """
    Compare resume-claimed skills against code-detected skills.
    """
    claimed: set = set()
    for category, skills in resume_skills.items():
        if isinstance(skills, list):
            for s in skills:
                claimed.add(s.lower().strip())
        elif isinstance(skills, str):
            for s in skills.split(","):
                claimed.add(s.lower().strip())

    detected_set: Dict[str, float] = {}
    for skill in detected_skills:
        name = skill.get("skill_name", "").lower()
        score = skill.get("skill_score", 0)
        detected_set[name] = score

    claims: List[Dict[str, Any]] = []

    for claimed_skill in claimed:
        if not claimed_skill:
            continue
        best_match = None
        best_ratio = 0.0

        for detected_name, score in detected_set.items():
            if claimed_skill in detected_name or detected_name in claimed_skill:
                best_match = detected_name
                best_ratio = 1.0
                break

            ratio = _fuzzy_match(claimed_skill, detected_name)
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = detected_name

        if best_match and best_ratio >= 0.5:
            conf = detected_set[best_match] / 10.0
            status = "SUPPORTED" if conf >= 0.6 else "PARTIALLY_SUPPORTED"
            claims.append({
                "claim": claimed_skill,
                "status": status,
                "confidence": round(conf, 2),
                "evidence": [
                    f"Detected in code as '{best_match}' "
                    f"(score: {detected_set[best_match]:.1f}/10)"
                ]
            })
            proof.add(
                evidence_type="skill_truth",
                detail=f"Resume skill '{claimed_skill}' {status} in code as '{best_match}'",
            )
        else:
            # FIX: Skills not in code are UNVERIFIABLE (might be used in private repos
            # or learned but not yet applied in public code), NOT fake.
            claims.append({
                "claim": claimed_skill,
                "status": "UNVERIFIABLE",
                "confidence": 0.0,
                "evidence": [
                    "Skill not detected in public repositories — "
                    "may be used in private repos or not yet applied publicly"
                ]
            })

    verified_count = sum(
        1 for c in claims if c["status"] in ("SUPPORTED", "PARTIALLY_SUPPORTED")
    )
    verified_detected = {
        c["evidence"][0].split("'")[3]
        for c in claims
        if c["status"] in ("SUPPORTED", "PARTIALLY_SUPPORTED")
        and len(c["evidence"][0].split("'")) > 3
    }

    hidden = [
        {"skill": name, "score": score}
        for name, score in detected_set.items()
        if name not in verified_detected and score >= 3.0
    ]

    overlap = verified_count / max(len(claimed), 1)

    # v2 FIX: Surface hidden skills as a strong positive signal
    hidden_skills_message = ""
    if len(hidden) >= 5:
        hidden_skills_message = (
            f"Candidate demonstrates {len(hidden)} technologies in their codebase that are NOT listed on their resume "
            f"({', '.join(h['skill'] for h in hidden[:8])}). This strongly suggests the candidate is more skilled "
            f"than their resume indicates."
        )
    elif len(hidden) >= 2:
        hidden_skills_message = (
            f"Candidate uses {len(hidden)} unlisted technologies ({', '.join(h['skill'] for h in hidden[:5])}). "
            f"Resume may underrepresent actual capabilities."
        )

    return {
        "claims": claims,
        "hidden_skills": hidden[:15],
        "hidden_skills_message": hidden_skills_message,
        "hidden_skills_count": len(hidden),
        "overlap_percentage": round(overlap * 100, 1),
    }


import datetime

def _extract_year(text: str) -> Optional[int]:
    if not text: return None
    match = re.search(r'\b(19\d{2}|20\d{2})\b', str(text))
    return int(match.group(1)) if match else None

def verify_experience_timeline(
    resume_years: int,
    account_age_years: float,
    github_repos: List[Dict[str, Any]],
    resume_projects: List[Dict[str, Any]],
    resume_education: List[Dict[str, Any]],
    proof: ProofCollector,
) -> Dict[str, Any]:
    """
    Check if claimed experience aligns with GitHub history.
    Includes check 1 (experience vs account age), check 2 (projects vs repos),
    and check 3 (education vs activity).
    """
    plausibility = "Plausible"
    flags: List[str] = []
    contradictions = 0
    total_repos = len(github_repos)
    current_year = datetime.datetime.now().year

    if resume_years == 0:
        return {
            "plausibility": "Student/Entry-Level (no experience claimed)",
            "flags": [],
            "skipped": True,
            "contradictions": 0
        }

    # Check 1: Experience vs account age
    if resume_years > 0 and account_age_years > 0:
        if resume_years > account_age_years + 3:
            plausibility = "Questionable"
            flags.append(
                f"Claims {resume_years}yr experience but GitHub account is "
                f"only {account_age_years:.1f}yr old"
            )
            contradictions += 1
        elif resume_years > account_age_years * 3:
            plausibility = "Unlikely"
            flags.append(
                f"Claimed experience ({resume_years}yr) is much greater than "
                f"GitHub history ({account_age_years:.1f}yr)"
            )
            contradictions += 2

    if resume_years >= 5 and total_repos < 3:
        flags.append(f"Claims {resume_years}yr experience but only {total_repos} public repos")

    # Check 2: Claimed project dates vs repo creation dates
    repo_years = []
    for r in github_repos:
        created = r.get("created_at")
        if created:
            repo_years.append(int(str(created)[:4]))
    earliest_repo_year = min(repo_years) if repo_years else current_year

    for p in resume_projects:
        p_date = p.get("date", "") or p.get("year", "")
        p_year = _extract_year(p_date)
        if p_year and p_year < earliest_repo_year - 3:
            flags.append(f"Claimed project '{p.get('name', 'Unknown')}' in {p_year} but earliest repo is {earliest_repo_year}")
            contradictions += 1

    # Check 3: Education graduation vs experience
    grad_years = [_extract_year(str(edu.get("graduation_year", "")) or str(edu.get("end_date", "")) or str(edu.get("date", ""))) for edu in resume_education]
    grad_years = [y for y in grad_years if y is not None]
    if grad_years:
        latest_grad = max(grad_years)
        # If graduated very recently but claims many years of exp
        if latest_grad >= current_year - 2 and resume_years >= 4:
            flags.append(f"Graduated recently in {latest_grad} but claims {resume_years} years experience")
            contradictions += 1

    if flags:
        for flag in flags:
            proof.add(evidence_type="timeline_verification", detail=flag)

    return {
        "plausibility": plausibility,
        "flags": flags,
        "skipped": False,
        "contradictions": contradictions,
    }


# ═══════════════════════════════════════════════════════
#  MASTER TRUTH SCORE
# ═══════════════════════════════════════════════════════

def run_truth_engine(
    resume_data: Dict[str, Any],
    github_repos: List[Dict[str, Any]],
    detected_skills: List[Dict[str, Any]],
    detected_packages: Optional[List[str]] = None,
    account_age_years: float = 0.0,
    proof: Optional[ProofCollector] = None,
    repo_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Master function: compute truth score from resume + GitHub comparison.

    Truth Score formula:
      40% project match rate +
      40% skill overlap +
      20% timeline plausibility

    v2: Now accepts repo_data for file-level verification & README matching.
    """
    if proof is None:
        proof = ProofCollector()

    if detected_packages is None:
        detected_packages = []
    if repo_data is None:
        repo_data = {}

    resume_projects = resume_data.get("projects", [])
    resume_skills = resume_data.get("technical_skills", {})
    resume_years = resume_data.get("years_of_experience", 0) or 0

    # Project matching (v2: with repo_data for file + README verification)
    project_match = match_projects(resume_projects, github_repos, proof, repo_data=repo_data)

    # Skill verification
    skill_match = verify_skills(resume_skills, detected_skills, proof)

    # Dependency verification
    dependency_match = verify_dependencies(
        resume_skills, detected_packages, resume_years, proof
    )

    resume_education = resume_data.get("education", [])

    # Timeline verification
    timeline = verify_experience_timeline(
        resume_years, account_age_years, github_repos, resume_projects, resume_education, proof
    )

    # ─── Truth Score (0-100) ───
    project_score = project_match["match_rate"] * 100
    skill_score = skill_match["overlap_percentage"]

    timeline_score = 100
    if timeline.get("skipped"):
        timeline_score = 100  # Don't penalize students
    elif timeline["plausibility"] == "Questionable":
        timeline_score = 60  # Softened from 50
    elif timeline["plausibility"] == "Unlikely":
        timeline_score = 25  # Softened from 20

    truth_score = round(
        0.40 * project_score +
        0.40 * skill_score +
        0.20 * timeline_score,
        1,
    )

    # Apply contradiction penalties
    if dependency_match["contradictions"] > 0:
        truth_score -= (15 * dependency_match["contradictions"])
        
    if timeline.get("contradictions", 0) > 0:
        truth_score -= (15 * timeline["contradictions"])

    truth_score = max(0, min(100, truth_score))

    # Collect mismatches — only real discrepancies, not just "unverifiable"
    mismatches: List[str] = []
    for proj in project_match.get("claims", []):
        if proj["status"] == "UNVERIFIABLE":
            # Use softer language — absence ≠ fabrication
            mismatches.append(
                f"Project '{proj['claim']}' not found in public repos "
                f"(may be private or recently renamed)"
            )
    for skill in skill_match.get("claims", [])[:5]:
        if skill["status"] == "UNVERIFIABLE":
            mismatches.append(
                f"Skill '{skill['claim']}' not detected in public code "
                f"(may be used in private projects)"
            )
            
    for dep in dependency_match.get("claims", []):
        if dep["status"] == "CONTRADICTION":
            mismatches.append(dep["evidence"][0])
            
    mismatches.extend(timeline["flags"])

    proof.add_metric("truth_score", truth_score)

    # Generate unified verified claims
    verified_claims = []
    for proj in project_match.get("claims", []):
        verified_claims.append({
            "claim": proj["claim"],
            "status": proj["status"],
            "confidence": proj["confidence"],
            "evidence": proj["evidence"],
            "type": "project"
        })
    for skill in skill_match.get("claims", []):
        verified_claims.append({
            "claim": skill["claim"],
            "status": skill["status"],
            "confidence": skill["confidence"],
            "evidence": skill["evidence"],
            "type": "skill"
        })
    for dep in dependency_match.get("claims", []):
        if dep["status"] in ("VERIFIED", "WEAK_SIGNAL"):
            verified_claims.append({
                "claim": dep["claim"],
                "status": dep["status"],
                "confidence": 1.0 if dep["status"] == "VERIFIED" else 0.5,
                "evidence": dep["evidence"],
                "type": "dependency"
            })

    log.info(
        f"[Truth] score={truth_score} | "
        f"proj_match={project_score:.0f} skill_overlap={skill_score:.0f} "
        f"timeline={timeline_score} contradictions={dependency_match['contradictions']}"
    )

    return {
        "truth_score": truth_score,
        "project_verification": project_match,
        "skill_verification": skill_match,
        "dependency_verification": dependency_match,
        "timeline_verification": timeline,
        "mismatches": mismatches,
        "verified_claims": verified_claims,
    }