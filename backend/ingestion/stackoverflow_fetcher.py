"""
Stack Overflow Integration — Fetches user profile and top tags
for skill verification and credibility scoring.

Uses the Stack Exchange API v2.3 (no auth required, 300 req/day).
Set SO_API_KEY env var for 10,000 req/day.
"""
import os
import math
import httpx
from typing import Dict, List, Any, Optional

from cache.github_cache import repo_cache

SO_API_BASE = "https://api.stackexchange.com/2.3"
SO_API_KEY = os.environ.get("SO_API_KEY")


def _get_cached(key: str) -> Optional[Any]:
    return repo_cache.get(key)


def _set_cache(key: str, data: Any):
    repo_cache.set(key, data)


async def fetch_stackoverflow_profile(username: str) -> Dict[str, Any]:
    """Search Stack Overflow for a user by GitHub username or name."""
    cache_key = f"so_profile:{username}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    try:
        params = {
            "inname": username,
            "site": "stackoverflow",
            "pagesize": 5,
            "order": "desc",
            "sort": "reputation",
        }
        if SO_API_KEY:
            params["key"] = SO_API_KEY

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{SO_API_BASE}/users", params=params)
            if resp.status_code != 200:
                return {"found": False, "error": f"API returned {resp.status_code}"}

            data = resp.json()
            items = data.get("items", [])
            if not items:
                return {"found": False}

            user = items[0]  # Take highest reputation match
            user_id = user["user_id"]

            # Fetch top tags for this user
            tag_params = {"site": "stackoverflow", "pagesize": 10}
            if SO_API_KEY:
                tag_params["key"] = SO_API_KEY

            tags_resp = await client.get(
                f"{SO_API_BASE}/users/{user_id}/top-tags",
                params=tag_params,
                timeout=10.0,
            )
            top_tags = []
            if tags_resp.status_code == 200:
                top_tags = [
                    t["tag_name"] for t in tags_resp.json().get("items", [])
                ]

            result = {
                "found": True,
                "user_id": user_id,
                "display_name": user.get("display_name", ""),
                "reputation": user.get("reputation", 0),
                "answer_count": user.get("answer_count", 0),
                "question_count": user.get("question_count", 0),
                "top_tags": top_tags,
                "badges": user.get("badge_counts", {}),
                "profile_url": user.get("link", ""),
            }
            _set_cache(cache_key, result)
            return result

    except Exception as e:
        return {"found": False, "error": str(e)[:120]}


def score_stackoverflow(so_data: Dict[str, Any], resume_skills: List[str]) -> Dict[str, Any]:
    """Score a Stack Overflow profile and cross-reference with resume skills."""
    if not so_data.get("found"):
        return {"so_score": 0, "not_found": True}

    reputation = so_data.get("reputation", 0)
    rep_score = min(20, math.log10(max(reputation, 1)) * 5)

    # Skills verified via SO top tags
    verified_via_so = [
        tag
        for tag in so_data.get("top_tags", [])
        if any(
            tag.lower() in skill.lower() or skill.lower() in tag.lower()
            for skill in resume_skills
        )
    ]

    credibility = (
        "STRONG" if reputation > 1000
        else "MODERATE" if reputation > 100
        else "WEAK"
    )

    return {
        "so_score": round(rep_score, 1),
        "reputation": reputation,
        "verified_skills": verified_via_so,
        "credibility_signal": credibility,
        "answer_count": so_data.get("answer_count", 0),
    }
