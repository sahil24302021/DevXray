from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class ValidationResult(BaseModel):
    is_valid: bool
    confidence_penalty: float = 0.0
    warnings: List[str] = Field(default_factory=list)

class AnalysisContext(BaseModel):
    """
    Global error and confidence propagation system passed entirely through the 7 layers.
    """
    username: str
    version: str = "v2.1"
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    confidence: float = 1.0
    validation: Optional[ValidationResult] = None
    step_timings: Dict[str, float] = Field(default_factory=dict)

    def add_error(self, error: str):
        self.errors.append(error)
        self.confidence -= 0.2
        self.confidence = max(0.0, self.confidence)

    def add_warning(self, warning: str, penalty: float = 0.05):
        self.warnings.append(warning)
        self.confidence -= penalty
        self.confidence = max(0.0, self.confidence)
