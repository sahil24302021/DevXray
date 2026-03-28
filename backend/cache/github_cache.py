import os
import json
import time
import hashlib
from typing import Any, Optional, Dict

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", ".cache")
CACHE_TTL = 3600 * 24  # 24 hours for aggressive performance limit protection

class GitHubCache:
    """Persistent, robust local cache for GitHub API requests to prevent rate limit death."""
    def __init__(self):
        os.makedirs(CACHE_DIR, exist_ok=True)
    
    def _get_path(self, key: str) -> str:
        safe_key = hashlib.md5(key.encode()).hexdigest()
        return os.path.join(CACHE_DIR, f"{safe_key}.json")

    def get(self, key: str) -> Optional[Any]:
        path = self._get_path(key)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                entry = json.load(f)
            if time.time() - entry.get("_ts", 0) < CACHE_TTL:
                return entry.get("data")
            return None
        except Exception:
            return None
            
    def set(self, key: str, data: Any) -> None:
        path = self._get_path(key)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"data": data, "_ts": time.time()}, f)
        except Exception:
            pass

repo_cache = GitHubCache()
