import pytest
from engines.truth_engine import run_truth_engine

def test_run_truth_engine_perfect_match():
    """Test when resume closely matches GitHub."""
    resume_data = {
        "projects": [
            {"name": "devsignal", "description": "The DIP backend api", "technologies": ["Python"]}
        ],
        "technical_skills": {"Backend": ["Python"], "DevOps": ["Docker", "React"]},
        "years_of_experience": 3,
    }
    github_repos = [
        {"name": "devsignal", "description": "The DIP backend api", "language": "python"},
        {"name": "repo2"},
        {"name": "repo3"}
    ]
    detected_skills = [
        {"skill_name": "Python"}, {"skill_name": "Docker"}, {"skill_name": "React"}
    ]
    
    result = run_truth_engine(
        resume_data=resume_data,
        github_repos=github_repos,
        detected_skills=detected_skills,
        account_age_years=3.5,
    )
    
    # 40% project (100) + 40% skills (100) + 20% timeline (100)
    assert result["truth_score"] >= 95.0
    assert len(result["mismatches"]) == 0

def test_run_truth_engine_partial_match():
    """Test when resume partially matches GitHub."""
    resume_data = {
        "projects": [
            {"name": "devsignal", "description": "api"},
            {"name": "Secret Startup", "description": "stealth"}
        ],
        "technical_skills": {"Languages": ["Python", "Rust", "Go"]},
        "years_of_experience": 2,
    }
    github_repos = [
        {"name": "devsignal"}, {"name": "repo2"}, {"name": "repo3"}
    ]
    detected_skills = [
        {"skill_name": "Python"}
    ]
    
    result = run_truth_engine(
        resume_data=resume_data,
        github_repos=github_repos,
        detected_skills=detected_skills,
        account_age_years=2.0,
    )
    
    # Projects: 1/2 match = 50%
    # Skills: 1/3 match = 33.3%
    # Timeline: Plausible = 100%
    # Score = 0.4 * 50 + 0.4 * 33.3 + 0.2 * 100 = 20 + 13.3 + 20 = 53.3
    assert 53.0 <= result["truth_score"] <= 54.0
    assert len(result["mismatches"]) > 0
    assert "Secret Startup" in str(result["mismatches"])

def test_run_truth_engine_unlikely_timeline():
    """Test when claimed experience exceeds account age by far."""
    resume_data = {
        "projects": [],
        "technical_skills": {"Languages": ["Java"]},
        "years_of_experience": 10,
    }
    github_repos = []
    detected_skills = [{"skill_name": "Java"}]
    
    result = run_truth_engine(
        resume_data=resume_data,
        github_repos=github_repos,
        detected_skills=detected_skills,
        account_age_years=1.0,  # Only 1 year old github but claims 10 years experience
    )
    
    # Timeline should be questionable or unlikely.
    # Score = 0.4 * 0 (no projects to match but let's say 100 for empty)
    # Actually if empty resume projects, match_rate = 1.0 (100%)
    # Skills 1/1 = 100%
    # Timeline = 20 (Unlikely) since 10 vs 1
    assert result["truth_score"] <= 60.0
    assert any("but GitHub account is only" in m for m in result["mismatches"])

def test_run_truth_engine_no_resume_projects():
    """Test when resume doesn't list projects."""
    resume_data = {
        "technical_skills": {"Languages": ["Python"]}
    }
    result = run_truth_engine(
        resume_data=resume_data,
        github_repos=[{"name": "test"}],
        detected_skills=[{"skill_name": "Python"}],
        account_age_years=1.0,
    )
    assert result["truth_score"] == 60.0  # project=0, skill=100, timeline=100 -> 60.0
