"""
backend/ingestion/token_pool.py
GitHub Token Rotation Pool — A6

Manages a pool of GitHub Personal Access Tokens (PATs) to avoid hitting the
60 req/hr anonymous rate limit.

Usage:
    from ingestion.token_pool import get_github_token

    token = get_github_token()   # returns the least-recently-used token
    headers = {"Authorization": f"Bearer {token}"} if token else {}

Configuration:
    Set one or more tokens in .env:
        GITHUB_TOKEN=ghp_xxx
        GITHUB_TOKEN_2=ghp_yyy
        GITHUB_TOKEN_3=ghp_zzz

    Or a comma-separated list:
        GITHUB_TOKENS=ghp_xxx,ghp_yyy,ghp_zzz

    If no tokens are set, the fetcher falls back to unauthenticated (60 req/hr).
"""

import os
import time
import threading
from typing import Optional

from utils.logging_config import get_logger

log = get_logger("token_pool")


class _TokenPool:
    """Thread-safe round-robin token pool with last-used timestamps."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tokens: list[str] = []
        self._last_used: dict[str, float] = {}
        self._loaded = False

    def _load(self) -> None:
        """Load tokens from environment variables (lazy, once)."""
        tokens: list[str] = []

        # Support GITHUB_TOKENS (comma-separated)
        raw = os.getenv("GITHUB_TOKENS", "")
        if raw:
            tokens.extend([t.strip() for t in raw.split(",") if t.strip()])

        # Support GITHUB_TOKEN, GITHUB_TOKEN_2, GITHUB_TOKEN_3, ...
        for key in ["GITHUB_TOKEN", "GITHUB_TOKEN_2", "GITHUB_TOKEN_3",
                    "GITHUB_TOKEN_4", "GITHUB_TOKEN_5"]:
            val = os.getenv(key, "").strip()
            if val and val not in tokens:
                tokens.append(val)

        self._tokens = tokens
        for t in tokens:
            self._last_used[t] = 0.0

        if tokens:
            log.info(f"Token pool initialized with {len(tokens)} GitHub token(s).")
        else:
            log.warning(
                "No GitHub tokens found in environment. "
                "Falling back to unauthenticated (60 req/hr). "
                "Set GITHUB_TOKEN or GITHUB_TOKENS to increase limits."
            )

        self._loaded = True

    def get(self) -> Optional[str]:
        """Return the token that was least recently used, or None if no tokens."""
        with self._lock:
            if not self._loaded:
                self._load()

            if not self._tokens:
                return None

            # Pick the least recently used token
            token = min(self._tokens, key=lambda t: self._last_used.get(t, 0.0))
            self._last_used[token] = time.time()
            return token

    def mark_rate_limited(self, token: str, retry_after_seconds: int = 60) -> None:
        """Push a token's last_used far into the future so it's deprioritized."""
        with self._lock:
            if token in self._last_used:
                self._last_used[token] = time.time() + retry_after_seconds
                log.warning(f"Token ending ...{token[-4:]} is rate-limited. "
                            f"Will retry in {retry_after_seconds}s.")

    @property
    def count(self) -> int:
        with self._lock:
            if not self._loaded:
                self._load()
            return len(self._tokens)


# Module-level singleton
_pool = _TokenPool()


def get_github_token() -> Optional[str]:
    """
    Returns a GitHub PAT from the rotation pool.
    Returns None if no tokens are configured (falls back to anonymous).
    """
    return _pool.get()


def mark_token_rate_limited(token: str, retry_after: int = 60) -> None:
    """Call this when a 429/403 rate-limit response is received for a token."""
    _pool.mark_rate_limited(token, retry_after)


def token_pool_size() -> int:
    """Returns the number of configured tokens."""
    return _pool.count
