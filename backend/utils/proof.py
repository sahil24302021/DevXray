"""
Proof Object Builder — Every claim in the DIP must include evidence.
Provides a standardized way to create proof objects that link scores to evidence.
Also tracks proof density for confidence scoring.
"""
from typing import Any, Dict, List, Optional


class Proof:
    """Immutable proof object linking a metric to verifiable evidence."""

    __slots__ = ("repo_name", "file_path", "evidence_type", "detail", "commit_refs")

    def __init__(
        self,
        repo_name: str = "",
        file_path: str = "",
        evidence_type: str = "code_analysis",
        detail: str = "",
        commit_refs: Optional[List[str]] = None,
    ) -> None:
        object.__setattr__(self, "repo_name", repo_name)
        object.__setattr__(self, "file_path", file_path)
        object.__setattr__(self, "evidence_type", evidence_type)
        object.__setattr__(self, "detail", detail)
        object.__setattr__(self, "commit_refs", commit_refs or [])

    def to_dict(self) -> Dict[str, Any]:
        return {
            "repo_name": self.repo_name,
            "file_path": self.file_path,
            "evidence_type": self.evidence_type,
            "detail": self.detail,
            "commit_refs": self.commit_refs,
        }


class ProofCollector:
    """Accumulates proof objects during engine execution.

    Tracks:
      - Total proofs collected
      - Total claims made (assertions without evidence still count)
      - Proof density = total_proofs / total_claims (0-1)
    """

    def __init__(self) -> None:
        self._proofs: List[Proof] = []
        self._claim_count: int = 0

    def add(
        self,
        repo_name: str = "",
        file_path: str = "",
        evidence_type: str = "code_analysis",
        detail: str = "",
        commit_refs: Optional[List[str]] = None,
    ) -> None:
        self._proofs.append(
            Proof(
                repo_name=repo_name,
                file_path=file_path,
                evidence_type=evidence_type,
                detail=detail,
                commit_refs=commit_refs,
            )
        )
        self._claim_count += 1

    def add_skill(
        self,
        skill: str,
        repo_name: str,
        file_path: str,
        detail: str,
    ) -> None:
        self.add(
            repo_name=repo_name,
            file_path=file_path,
            evidence_type="skill_verification",
            detail=f"[{skill}] {detail}",
        )

    def add_metric(
        self,
        metric_name: str,
        value: Any,
        repo_name: str = "",
        file_path: str = "",
    ) -> None:
        self.add(
            repo_name=repo_name,
            file_path=file_path,
            evidence_type="metric",
            detail=f"{metric_name}={value}",
        )

    def add_claim(self, description: str = "") -> None:
        """Record a claim that may or may not have proof."""
        self._claim_count += 1

    def to_list(self) -> List[Dict[str, Any]]:
        return [p.to_dict() for p in self._proofs]

    @property
    def total_proofs(self) -> int:
        return len(self._proofs)

    @property
    def total_claims(self) -> int:
        return max(self._claim_count, 1)

    @property
    def proof_density(self) -> float:
        """Ratio of proofs to claims. 1.0 = every claim backed by evidence."""
        return round(self.total_proofs / self.total_claims, 3)

    def get_density_report(self) -> Dict[str, Any]:
        """Get proof density metrics for the confidence score."""
        by_type: Dict[str, int] = {}
        for p in self._proofs:
            by_type[p.evidence_type] = by_type.get(p.evidence_type, 0) + 1

        return {
            "total_proofs": self.total_proofs,
            "total_claims": self.total_claims,
            "proof_density": self.proof_density,
            "proofs_by_type": by_type,
        }

    def __len__(self) -> int:
        return len(self._proofs)
