from datetime import datetime, timezone
import logging
from contracts.github_schema import GitHubData
from contracts.analysis_schema import ValidationResult

logger = logging.getLogger(__name__)

class DataValidator:
    @staticmethod
    def validate_github_data(data: GitHubData) -> ValidationResult:
        warnings = []
        penalty = 0.0
        is_valid = True

        # 1. Check account date
        created_at = data.profile.get("created_at")
        if created_at:
            try:
                # Normalizing ISO timestamps to check for future dates
                dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                if dt.timestamp() > datetime.now(timezone.utc).timestamp():
                    warnings.append("Account creation date is in the future")
                    penalty += 0.5
                    is_valid = False
            except ValueError:
                warnings.append("Account creation date is invalid format")
                penalty += 0.1

        # 2. Check repo count
        if not data.repos:
            warnings.append("No repositories found")
            penalty += 0.8
        elif len(data.repos) < 2:
            warnings.append("Low repository count (< 2)")
            penalty += 0.15

        # 3. Check API completeness (detect missing fields)
        missing_fields = []
        for field in ["followers", "public_repos", "id"]:
            if field not in data.profile:
                missing_fields.append(field)
        
        if missing_fields:
            warnings.append(f"Missing critical API fields: {', '.join(missing_fields)}")
            penalty += 0.1
            if "public_repos" in missing_fields:
                is_valid = False

        # 4. Check commit count availability
        # Sum length of commits array from all repos to verify deep extraction worked
        total_extracted_commits = sum(len(repo.commits) for repo in data.repos)
        if total_extracted_commits == 0 and len(data.repos) > 0:
            warnings.append("Repositories exist but no commits successfully extracted")
            penalty += 0.3
            # is_valid = False  # Relaxed: allow best-effort assessment

        final_penalty = min(penalty, 1.0)
        
        return ValidationResult(
            is_valid=is_valid,
            confidence_penalty=final_penalty,
            warnings=warnings
        )
