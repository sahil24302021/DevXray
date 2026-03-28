from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class ResumeData(BaseModel):
    raw_text: str = ""
    name: str = ""
    email: str = ""
    phone: str = ""
    skills: List[str] = Field(default_factory=list)
    experience: List[Dict[str, Any]] = Field(default_factory=list)
    projects: List[Dict[str, Any]] = Field(default_factory=list)
    education: List[Dict[str, Any]] = Field(default_factory=list)
    links: Dict[str, str] = Field(default_factory=dict)
