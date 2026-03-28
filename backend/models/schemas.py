"""
Pydantic Models for the Developer Intelligence Platform.
Type-safe request/response schemas for all API endpoints.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ─── Proof ───
class ProofItem(BaseModel):
    repo_name: str = ""
    file_path: str = ""
    evidence_type: str = "code_analysis"
    detail: str = ""
    commit_refs: List[str] = Field(default_factory=list)


# ─── Skill ───
class SkillEvidence(BaseModel):
    repo: str = ""
    file: str = ""
    sample: str = ""


class SkillSubIndicator(BaseModel):
    name: str
    detected: bool = False
    detail: str = ""


class VerifiedSkill(BaseModel):
    skill_name: str
    skill_score: float = 0.0  # 0-10
    category: str = ""        # frontend, backend, devops, ml, etc.
    evidence: List[SkillEvidence] = Field(default_factory=list)
    sub_indicators: List[SkillSubIndicator] = Field(default_factory=list)


# ─── Code Analysis ───
class CodeAnalysis(BaseModel):
    code_quality_score: float = 0.0
    maintainability_score: float = 0.0
    test_coverage_indicator: str = "None"  # None/Low/Moderate/High
    architecture_type: str = "Unknown"
    api_design_quality: float = 0.0
    folder_maturity: str = "Basic"
    total_files_analyzed: int = 0
    total_repos_analyzed: int = 0
    metrics: Dict[str, Any] = Field(default_factory=dict)


# ─── Truth Analysis ───
class ClaimVerification(BaseModel):
    claim: str
    status: str  # Verified/Partially Verified/Unverifiable/Discrepancy/Exaggeration
    evidence: str = ""


class TruthAnalysis(BaseModel):
    truth_score: float = 0.0
    verified_claims: List[ClaimVerification] = Field(default_factory=list)
    mismatches: List[str] = Field(default_factory=list)
    missing_projects: List[str] = Field(default_factory=list)
    skill_overlap_percentage: float = 0.0


# ─── Authenticity ───
class RiskFlag(BaseModel):
    flag: str
    severity: str = "medium"  # low/medium/high/critical
    evidence: str = ""


class AuthenticityAnalysis(BaseModel):
    authenticity_score: float = 0.0
    risk_flags: List[RiskFlag] = Field(default_factory=list)
    commit_entropy: float = 0.0
    burst_ratio: float = 0.0
    pr_ratio: float = 0.0
    template_detection: Dict[str, Any] = Field(default_factory=dict)


# ─── Growth ───
class GrowthAnalysis(BaseModel):
    growth_score: float = 0.0
    learning_curve: str = "Flat"  # Accelerating/Steady/Flat/Decelerating
    tech_evolution: List[str] = Field(default_factory=list)
    complexity_progression: str = ""
    quarterly_activity: List[Dict[str, Any]] = Field(default_factory=list)


# ─── Consistency ───
class ConsistencyAnalysis(BaseModel):
    consistency_score: float = 0.0
    commit_regularity: float = 0.0
    gap_count: int = 0
    longest_gap_days: int = 0
    repo_completion_rate: float = 0.0
    active_months_ratio: float = 0.0


# ─── System Design ───
class SystemDesignAnalysis(BaseModel):
    system_design_score: float = 0.0
    architecture_type: str = "Unknown"
    api_design_quality: float = 0.0
    scalability_score: float = 0.0
    folder_maturity: str = "Basic"
    database_design_score: float = 0.0


# ─── Scoring ───
class ScoreBreakdown(BaseModel):
    code_quality: float = 0.0
    skill_depth: float = 0.0
    authenticity: float = 0.0
    consistency: float = 0.0
    growth: float = 0.0
    truth_score: float = 0.0


class RoleFit(BaseModel):
    primary_role: str = "Unknown"
    scores: Dict[str, float] = Field(default_factory=dict)  # role -> score


class BenchmarkComparison(BaseModel):
    percentile: float = 0.0
    tier: str = "Unknown"  # Beginner/Mid-Tier/Senior/Elite
    comparable_to: str = ""


# ─── Final Report ───
class DeveloperReport(BaseModel):
    """The complete Developer Intelligence Report."""
    final_score: float = 0.0
    score_breakdown: ScoreBreakdown = Field(default_factory=ScoreBreakdown)
    skills: List[VerifiedSkill] = Field(default_factory=list)
    code_analysis: CodeAnalysis = Field(default_factory=CodeAnalysis)
    truth_analysis: TruthAnalysis = Field(default_factory=TruthAnalysis)
    authenticity: AuthenticityAnalysis = Field(default_factory=AuthenticityAnalysis)
    consistency: ConsistencyAnalysis = Field(default_factory=ConsistencyAnalysis)
    growth: GrowthAnalysis = Field(default_factory=GrowthAnalysis)
    system_design: SystemDesignAnalysis = Field(default_factory=SystemDesignAnalysis)
    risk_flags: List[RiskFlag] = Field(default_factory=list)
    proof: List[ProofItem] = Field(default_factory=list)
    hiring_recommendation: str = ""
    role_fit: RoleFit = Field(default_factory=RoleFit)
    benchmark: BenchmarkComparison = Field(default_factory=BenchmarkComparison)
    interview_difficulty: str = "Medium"
    salary_estimate: Dict[str, Any] = Field(default_factory=dict)
    developer_tier: str = "Unknown"
