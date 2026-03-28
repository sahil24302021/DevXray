from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, field_validator


class Commit(BaseModel):
    sha: str = ""
    message: str = ""
    date: str = ""
    additions: int = 0
    deletions: int = 0
    author_name: str = ""


class RepoFile(BaseModel):
    path: str = ""
    content: str = ""
    size: int = 0


class Repo(BaseModel):
    name: str = ""
    description: Optional[str] = ""
    stars: int = 0
    forks: int = 0
    # FIX: GitHub API returns null for repos with no detected language.
    # Accept Optional[str] and coerce None → "" so Pydantic never raises a
    # validation error for repos like "nivanth" or config-only repos.
    language: Optional[str] = ""
    created_at: str = ""
    updated_at: str = ""
    size: int = 0
    default_branch: str = "main"
    commits: List[Commit] = Field(default_factory=list)
    languages: Dict[str, int] = Field(default_factory=dict)
    topics: List[str] = Field(default_factory=list)
    has_readme: bool = False
    readme_content: str = ""
    files: List[RepoFile] = Field(default_factory=list)
    is_fork: bool = False

    @field_validator("language", mode="before")
    @classmethod
    def coerce_none_language(cls, v):
        """Convert None language to empty string to avoid Pydantic type errors."""
        return v if v is not None else ""

    @field_validator("description", mode="before")
    @classmethod
    def coerce_none_description(cls, v):
        """Convert None description to empty string."""
        return v if v is not None else ""


class GitHubData(BaseModel):
    username: str
    profile: Dict[str, Any] = Field(default_factory=dict)
    repos: List[Repo] = Field(default_factory=list)
    commits: List[Commit] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)