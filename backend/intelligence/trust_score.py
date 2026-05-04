"""
Trust Score Engine — Fraud Detection for Hiring.

Builds a 0-100 Trust Score from 6 forensic dimensions:
1. Commit pattern analysis (stuffing, burst, automation)
2. Code similarity (cross-repo duplicates → copy-paste farms)
3. Skill claim verification (claimed experience vs account age)
4. Activity gap analysis (6+ month gaps in junior profiles)
5. Repo quality vs claimed experience mismatch
6. README / documentation quality

Each dimension produces:
- A sub-score (0-100)
- Plain English risk explanation
- Penalty points deducted from the trust score

The final Trust Score + all risk explanations are injected into the report.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from utils.logging_config import get_logger

log = get_logger("trust_score")


def compute_trust_score(
    authenticity: Dict[str, Any],
    repos: List[Dict[str, Any]],
    profile: Dict[str, Any],
    scoring: Dict[str, Any],
    documentation_quality: Dict[str, Any] = None,
) -> Dict[str, Any]:
    """
    Compute a holistic Trust Score (0-100) from multiple fraud signals.
    Returns the score, risk level, and plain-English fraud risk explanations.
    """
    trust = 100  # Start at 100 and deduct
    risks: List[Dict[str, Any]] = []
    dimensions: Dict[str, Dict[str, Any]] = {}

    non_fork = [r for r in repos if not r.get("is_fork", r.get("fork", False))]
    account_created = profile.get("created_at", "")
    account_age_years = 0.0
    if account_created:
        try:
            created_dt = datetime.fromisoformat(account_created.replace("Z", "+00:00"))
            account_age_years = (datetime.now(timezone.utc) - created_dt).days / 365.25
        except Exception:
            pass

    # ═══════════════════════════════════════════════════════
    #  DIMENSION 1: Commit Pattern Analysis
    # ═══════════════════════════════════════════════════════
    commit_freq = authenticity.get("commit_frequency", {})
    commit_burst = authenticity.get("commit_burst", {})
    timeline = authenticity.get("commit_timeline_forensics", {})

    dim1_penalty = 0
    dim1_sub = 100

    # Commit stuffing (most severe)
    if timeline.get("stuffer_detected"):
        ev = timeline.get("stuffer_evidence", {})
        penalty = 25
        dim1_penalty += penalty
        risks.append({
            "category": "Commit Stuffing",
            "severity": "CRITICAL",
            "penalty": penalty,
            "explanation": (
                f"RISK: {ev.get('commits', '?')} commits were pushed on {ev.get('date', 'a single day')} — "
                f"this is {ev.get('ratio_vs_avg', '?')}x their normal daily rate and suggests "
                f"commit padding to inflate their profile before a job application."
            ),
        })

    # Commit burst (less severe than stuffing)
    if commit_burst.get("burst_detected") and not timeline.get("stuffer_detected"):
        penalty = min(commit_burst.get("burst_score", 5), 15)
        dim1_penalty += penalty
        risks.append({
            "category": "Commit Burst",
            "severity": "HIGH",
            "penalty": penalty,
            "explanation": (
                f"RISK: An unusual spike of commits was detected — {commit_burst.get('details', 'concentrated activity')}. "
                f"This pattern is common when developers pad their GitHub profile right before applying for jobs."
            ),
        })

    # Automated/suspicious commit patterns
    pattern = commit_freq.get("pattern", "organic")
    if pattern == "automated":
        penalty = 15
        dim1_penalty += penalty
        risks.append({
            "category": "Automated Commits",
            "severity": "HIGH",
            "penalty": penalty,
            "explanation": (
                "RISK: Commit timing patterns suggest automation — commits arrive at suspiciously "
                "uniform intervals, like a bot rather than a human developer."
            ),
        })
    elif pattern == "suspicious":
        penalty = 8
        dim1_penalty += penalty
        risks.append({
            "category": "Suspicious Commit Pattern",
            "severity": "MEDIUM",
            "penalty": penalty,
            "explanation": (
                f"WARNING: {commit_freq.get('burst_ratio', 0):.0%} of commits happen within seconds of "
                f"each other. While not conclusive, this is unusual for organic development."
            ),
        })

    dim1_sub = max(0, 100 - dim1_penalty * 2)
    dimensions["commit_patterns"] = {"score": dim1_sub, "penalty": dim1_penalty}
    trust -= dim1_penalty

    # ═══════════════════════════════════════════════════════
    #  DIMENSION 2: Code Similarity (Copy-Paste Detection)
    # ═══════════════════════════════════════════════════════
    similarity = authenticity.get("code_similarity", {})
    dim2_penalty = 0

    dupe_count = similarity.get("duplicate_count", 0)
    sim_risk = similarity.get("risk", "NONE")

    if sim_risk == "HIGH":
        penalty = 20
        dim2_penalty += penalty
        risks.append({
            "category": "Code Duplication",
            "severity": "HIGH",
            "penalty": penalty,
            "explanation": (
                f"RISK: {dupe_count} duplicate or near-identical files found across different repositories. "
                f"This strongly suggests copy-pasting the same project multiple times to appear more productive."
            ),
        })
    elif sim_risk == "MEDIUM":
        penalty = 10
        dim2_penalty += penalty
        risks.append({
            "category": "Code Similarity",
            "severity": "MEDIUM",
            "penalty": penalty,
            "explanation": (
                f"WARNING: {dupe_count} similar files detected across repos. Some code reuse is normal, "
                f"but this level suggests possible project duplication."
            ),
        })

    dimensions["code_similarity"] = {"score": max(0, 100 - dim2_penalty * 2), "penalty": dim2_penalty}
    trust -= dim2_penalty

    # ═══════════════════════════════════════════════════════
    #  DIMENSION 3: Skill Claim vs Account Age Verification
    # ═══════════════════════════════════════════════════════
    dim3_penalty = 0
    tier = scoring.get("benchmark", {}).get("tier", "").lower()

    if account_age_years > 0:
        # Claims to be senior but account is very young
        if ("senior" in tier or "expert" in tier) and account_age_years < 2:
            penalty = 15
            dim3_penalty += penalty
            risks.append({
                "category": "Experience Mismatch",
                "severity": "HIGH",
                "penalty": penalty,
                "explanation": (
                    f"RISK: Candidate scores at a '{tier}' level but their GitHub account is only "
                    f"{account_age_years:.1f} years old. Senior developers typically have 4+ years of "
                    f"GitHub history. This could indicate a newly created profile."
                ),
            })
        elif ("mid" in tier or "advanced" in tier) and account_age_years < 1:
            penalty = 10
            dim3_penalty += penalty
            risks.append({
                "category": "Experience Mismatch",
                "severity": "MEDIUM",
                "penalty": penalty,
                "explanation": (
                    f"WARNING: Candidate shows mid-level skills but their GitHub account is only "
                    f"{account_age_years:.1f} years old. This may indicate skills gained outside GitHub, "
                    f"or a recently created account."
                ),
            })

    dimensions["skill_verification"] = {"score": max(0, 100 - dim3_penalty * 2), "penalty": dim3_penalty}
    trust -= dim3_penalty

    # ═══════════════════════════════════════════════════════
    #  DIMENSION 4: Activity Gap Analysis
    # ═══════════════════════════════════════════════════════
    dim4_penalty = 0
    forensics = timeline.get("forensics", {})
    gaps = forensics.get("dead_periods", [])

    if gaps and isinstance(gaps, list):
        long_gaps = [g for g in gaps if isinstance(g, dict) and g.get("days", 0) > 180]
        if long_gaps and ("junior" in tier or "emerging" in tier or "beginner" in tier):
            penalty = min(len(long_gaps) * 5, 10)
            dim4_penalty += penalty
            gap_months = max(g.get("days", 0) for g in long_gaps) // 30
            risks.append({
                "category": "Activity Gap",
                "severity": "MEDIUM",
                "penalty": penalty,
                "explanation": (
                    f"WARNING: A {gap_months}-month gap was detected in this junior developer's "
                    f"commit history. For junior developers, long gaps may indicate inconsistent "
                    f"learning habits or periods of inactivity."
                ),
            })

    dimensions["activity_gaps"] = {"score": max(0, 100 - dim4_penalty * 2), "penalty": dim4_penalty}
    trust -= dim4_penalty

    # ═══════════════════════════════════════════════════════
    #  DIMENSION 5: Repo Quality vs Experience Mismatch
    # ═══════════════════════════════════════════════════════
    dim5_penalty = 0
    ownership = authenticity.get("ownership_analysis", {})

    substantive = ownership.get("substantive_owned", 0)
    total_repos = len(non_fork)

    # "Senior" with only tutorial-level repos
    if ("senior" in tier or "expert" in tier) and substantive < 3 and total_repos > 5:
        penalty = 12
        dim5_penalty += penalty
        risks.append({
            "category": "Repo Quality Mismatch",
            "severity": "HIGH",
            "penalty": penalty,
            "explanation": (
                f"RISK: Despite {total_repos} repos, only {substantive} contain substantial code. "
                f"For a '{tier}' developer, this is a red flag — senior developers typically "
                f"have several significant projects, not just tutorial-level repositories."
            ),
        })

    # Mostly forks, very few originals
    if ownership.get("ownership_ratio", 1) < 0.3:
        penalty = 8
        dim5_penalty += penalty
        risks.append({
            "category": "Low Original Work",
            "severity": "MEDIUM",
            "penalty": penalty,
            "explanation": (
                f"WARNING: Only {ownership.get('ownership_ratio', 0):.0%} of repositories are original work — "
                f"the rest are forks. This suggests the developer may be inflating their repo count "
                f"by forking others' projects without contributing back."
            ),
        })

    dimensions["repo_quality"] = {"score": max(0, 100 - dim5_penalty * 2), "penalty": dim5_penalty}
    trust -= dim5_penalty

    # ═══════════════════════════════════════════════════════
    #  DIMENSION 6: README / Documentation Quality
    # ═══════════════════════════════════════════════════════
    dim6_penalty = 0
    doc = documentation_quality or {}

    doc_grade = doc.get("grade", "C")
    repos_with_desc = doc.get("repos_with_descriptions", 0)
    total_assessed = doc.get("total_assessed", total_repos)

    if total_assessed > 0:
        desc_ratio = repos_with_desc / max(total_assessed, 1)
    else:
        desc_ratio = 0

    if doc_grade in ("D", "F") or desc_ratio < 0.2:
        penalty = 5
        dim6_penalty += penalty
        risks.append({
            "category": "Poor Documentation",
            "severity": "LOW",
            "penalty": penalty,
            "explanation": (
                f"NOTE: Most repositories lack descriptions or README files. While not fraud, "
                f"poor documentation is often correlated with lower commitment to quality "
                f"and makes it harder to verify what each project actually does."
            ),
        })

    # AI detection flag
    ai_detection = authenticity.get("ai_code_detection", {})
    ai_score = ai_detection.get("ai_code_score", 0)
    if ai_score >= 40:
        penalty = 10
        dim6_penalty += penalty
        risks.append({
            "category": "AI-Generated Code",
            "severity": "HIGH" if ai_score >= 60 else "MEDIUM",
            "penalty": penalty,
            "explanation": (
                f"RISK: Code analysis detected significant AI-generation patterns (score: {ai_score}/100). "
                f"Multiple structural indicators suggest code was generated by ChatGPT or similar tools "
                f"rather than written by the developer."
            ),
        })
    elif ai_score >= 25:
        penalty = 5
        dim6_penalty += penalty
        risks.append({
            "category": "Possible AI Assistance",
            "severity": "LOW",
            "penalty": penalty,
            "explanation": (
                f"NOTE: Some patterns consistent with AI-assisted coding were detected (score: {ai_score}/100). "
                f"This is increasingly common and may indicate use of Copilot or ChatGPT for portions of code."
            ),
        })

    dimensions["documentation"] = {"score": max(0, 100 - dim6_penalty * 2), "penalty": dim6_penalty}
    trust -= dim6_penalty

    # ═══════════════════════════════════════════════════════
    #  FINAL TRUST SCORE
    # ═══════════════════════════════════════════════════════
    trust = max(0, min(100, trust))

    # Determine risk level
    if trust >= 80:
        risk_level = "LOW"
        trust_label = "HIGH TRUST"
    elif trust >= 60:
        risk_level = "MEDIUM"
        trust_label = "MODERATE TRUST"
    elif trust >= 40:
        risk_level = "ELEVATED"
        trust_label = "LOW TRUST"
    else:
        risk_level = "HIGH"
        trust_label = "FRAUD RISK"

    # Sort risks by severity
    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    risks.sort(key=lambda r: severity_order.get(r["severity"], 4))

    total_penalty = sum(r["penalty"] for r in risks)

    log.info(
        f"Trust Score: {trust}/100 ({trust_label}) | "
        f"{len(risks)} risks found, total penalty: {total_penalty}"
    )

    return {
        "trust_score": trust,
        "trust_label": trust_label,
        "risk_level": risk_level,
        "risks": risks,
        "dimensions": dimensions,
        "total_penalty": total_penalty,
        "risk_count": len(risks),
        "high_risk_count": sum(1 for r in risks if r["severity"] in ("CRITICAL", "HIGH")),
    }
