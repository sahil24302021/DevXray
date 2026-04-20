"""
Resume Quality Scorer — scores a resume as an independent hiring signal.

This is separate from claim-checking. Even if we can't verify claims on GitHub,
a resume that says "Architected microservices handling 10M requests/day at Goldman Sachs,
led a team of 12 engineers, reduced infrastructure cost by $2.4M" is strong evidence
of a senior developer — regardless of their GitHub presence.

This scorer reads the resume content and returns a quality score (0-100) that
feeds into the DIP formula when GitHub data is thin.
"""

import re
from typing import Dict, Any, List, Optional
from utils.logging_config import get_logger

log = get_logger("resume_quality")


# Senior-level companies (being able to get hired here is itself evidence)
TIER_1_COMPANIES = {
    "google", "meta", "apple", "amazon", "microsoft", "netflix", "airbnb",
    "stripe", "palantir", "openai", "anthropic", "nvidia", "tesla", "uber",
    "linkedin", "twitter", "x", "github", "gitlab", "atlassian", "salesforce",
    "goldman sachs", "morgan stanley", "jp morgan", "jpmorgan", "jane street",
    "two sigma", "citadel", "deshaw", "spotify", "slack", "zoom", "databricks",
    "snowflake", "confluent", "hashicorp", "docker", "elastic", "mongodb",
}

TIER_2_COMPANIES = {
    "ibm", "oracle", "sap", "accenture", "deloitte", "mckinsey", "bcg",
    "infosys", "wipro", "tcs", "capgemini", "thoughtworks", "cognizant",
    "servicenow", "workday", "zendesk", "hubspot", "shopify", "square",
}

SENIORITY_KEYWORDS = {
    "principal": 20,
    "staff engineer": 18,
    "senior staff": 18,
    "distinguished": 20,
    "fellow": 20,
    "vp of engineering": 15,
    "director of engineering": 15,
    "engineering manager": 12,
    "tech lead": 12,
    "lead engineer": 12,
    "senior engineer": 10,
    "senior developer": 10,
    "senior software": 10,
    "architected": 8,
    "architecture": 5,
    "led": 5,
    "managed": 5,
    "mentored": 4,
    "founded": 10,
    "co-founder": 10,
}

ACHIEVEMENT_PATTERNS = [
    (r'reduced?\s+(?:\w+\s+){0,3}by\s+\d+[%x]', 15, "Quantified improvement"),
    (r'increased?\s+(?:\w+\s+){0,3}by\s+\d+[%x]', 15, "Quantified improvement"),
    (r'improved?\s+(?:\w+\s+){0,3}by\s+\d+[%x]', 15, "Quantified improvement"),
    (r'\d+[kKmMbB]\+?\s+(?:users?|requests?|transactions?|customers?)', 15, "Scale claim"),
    (r'team of \d+', 10, "Team size"),
    (r'\d+\s+engineers?', 10, "Team size"),
    (r'\$\d+[kKmMbB]?\s+(?:revenue|savings?|cost|budget|funding)', 12, "Financial impact"),
    (r'(\d+)x\s+(?:faster|performance|throughput|growth|improvement)', 12, "Performance multiplier"),
    (r'patent(?:ed)?', 10, "Patent"),
    (r'published|authored|paper|research', 8, "Publication"),
    (r'open[\s-]source(?:d)?|contributed?\s+to', 6, "OSS contribution"),
]


def score_resume_quality(resume_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Score a resume on a 0-100 scale as a hiring signal.

    This is NOT about verifying claims against GitHub.
    This is about the quality and credibility of the resume itself.

    Returns:
        - quality_score: 0-100
        - seniority_tier: "entry" | "junior" | "mid" | "senior" | "principal"
        - signals_detected: list of what was found
        - implied_years: estimated YOE from signals
        - credibility_flags: red flags in the resume
    """
    if not resume_data:
        return {
            "quality_score": 0,
            "seniority_tier": "unknown",
            "signals_detected": [],
            "implied_years": 0,
            "credibility_flags": [],
            "tier1_company": False,
            "has_quantified_achievements": False,
        }

    raw_text = str(resume_data.get("raw_text", "") or "").lower()
    signals = []
    credibility_flags = []
    total_score = 0

    # ── 1. Years of Experience ──────────────────────────────────────
    stated_years = resume_data.get("years_of_experience", 0) or 0
    if stated_years >= 10:
        total_score += 25
        signals.append(f"{stated_years} years stated experience")
    elif stated_years >= 6:
        total_score += 20
        signals.append(f"{stated_years} years stated experience")
    elif stated_years >= 3:
        total_score += 12
        signals.append(f"{stated_years} years stated experience")
    elif stated_years >= 1:
        total_score += 6
        signals.append(f"{stated_years} years stated experience")

    # ── 2. Company Tier ──────────────────────────────────────────────
    company_names = [str(c).lower().strip() for c in (resume_data.get("companies", []) or [])]
    tier1_matches = [c for c in company_names if any(t1 in c for t1 in TIER_1_COMPANIES)]
    tier2_matches = [c for c in company_names if any(t2 in c for t2 in TIER_2_COMPANIES)]

    if tier1_matches:
        total_score += 20
        signals.append(f"Tier-1 company: {tier1_matches[0]}")
    elif tier2_matches:
        total_score += 10
        signals.append(f"Recognized company: {tier2_matches[0]}")
    elif len(company_names) >= 2:
        total_score += 5
        signals.append(f"{len(company_names)} companies listed")

    # ── 3. Seniority Signals ─────────────────────────────────────────
    seniority_score = 0
    found_seniority = []
    for keyword, points in SENIORITY_KEYWORDS.items():
        if keyword in raw_text and seniority_score < 25:
            seniority_score = min(25, seniority_score + points)
            found_seniority.append(keyword)

    if seniority_score > 0:
        total_score += seniority_score
        signals.append(f"Seniority indicators: {', '.join(found_seniority[:3])}")

    # ── 4. Measurable Achievements ───────────────────────────────────
    achievement_score = 0
    found_achievements = []
    for pattern, points, label in ACHIEVEMENT_PATTERNS:
        matches = re.findall(pattern, raw_text, re.IGNORECASE)
        if matches and achievement_score < 25:
            achievement_score = min(25, achievement_score + points)
            found_achievements.append(label)

    if achievement_score > 0:
        total_score += achievement_score
        signals.append(f"Quantified achievements: {', '.join(set(found_achievements[:3]))}")

    # ── 5. Skills Breadth ────────────────────────────────────────────
    skills = resume_data.get("skills", []) or []
    skill_count = len(skills)
    if skill_count >= 15:
        total_score += 5
        signals.append(f"{skill_count} skills listed")
    elif skill_count >= 8:
        total_score += 3

    # ── 6. Credibility Checks (Red Flags) ────────────────────────────
    if skill_count > 80:
        credibility_flags.append("Excessive skill count — possible padding")

    if stated_years >= 8 and not found_seniority and not tier1_matches:
        credibility_flags.append("Long tenure but no seniority indicators")

    if stated_years >= 5 and total_score < 20:
        credibility_flags.append("Years claimed but limited evidence of senior work")

    # ── 7. Determine Seniority Tier ──────────────────────────────────
    total_score = min(100, total_score)

    if total_score >= 75 or stated_years >= 10:
        seniority_tier = "principal"
    elif total_score >= 55 or stated_years >= 6:
        seniority_tier = "senior"
    elif total_score >= 35 or stated_years >= 3:
        seniority_tier = "mid"
    elif total_score >= 15 or stated_years >= 1:
        seniority_tier = "junior"
    else:
        seniority_tier = "entry"

    log.info(
        f"[ResumeQuality] score={total_score}, tier={seniority_tier}, "
        f"years={stated_years}, signals={len(signals)}, flags={len(credibility_flags)}"
    )

    return {
        "quality_score": total_score,
        "seniority_tier": seniority_tier,
        "signals_detected": signals,
        "implied_years": stated_years,
        "credibility_flags": credibility_flags,
        "tier1_company": bool(tier1_matches),
        "has_quantified_achievements": achievement_score > 0,
    }
