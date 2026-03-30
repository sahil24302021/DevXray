
import httpx
from typing import Dict, Any, Optional

from cache.github_cache import repo_cache


def _get_cached(key: str) -> Optional[Any]:
    return repo_cache.get(key)


def _set_cache(key: str, data: Any):
    repo_cache.set(key, data)


LEETCODE_GRAPHQL_URL = "https://leetcode.com/graphql"

PROFILE_QUERY = """
query getUserProfile($username: String!) {
    matchedUser(username: $username) {
        username
        submitStats {
            acSubmissionNum {
                difficulty
                count
                submissions
            }
        }
        profile {
            ranking
            reputation
        }
        badges { name }
    }
}
"""


async def fetch_leetcode_profile(username: str) -> Dict[str, Any]:
    """Fetch LeetCode stats via GraphQL API."""
    cache_key = f"leetcode:{username}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                LEETCODE_GRAPHQL_URL,
                json={"query": PROFILE_QUERY, "variables": {"username": username}},
                headers={
                    "Content-Type": "application/json",
                    "Referer": "https://leetcode.com",
                },
            )
            if resp.status_code != 200:
                return {"found": False}

            data = resp.json()
            user = data.get("data", {}).get("matchedUser")
            if not user:
                return {"found": False}

            stats = user.get("submitStats", {}).get("acSubmissionNum", [])
            solved = {s["difficulty"]: s["count"] for s in stats}

            result = {
                "found": True,
                "username": user.get("username", username),
                "solved_easy": solved.get("Easy", 0),
                "solved_medium": solved.get("Medium", 0),
                "solved_hard": solved.get("Hard", 0),
                "total_solved": sum(solved.values()),
                "ranking": user.get("profile", {}).get("ranking", 0),
                "reputation": user.get("profile", {}).get("reputation", 0),
                "badges": [b.get("name", "") for b in user.get("badges", [])],
            }
            _set_cache(cache_key, result)
            return result

    except Exception as e:
        return {"found": False, "error": str(e)[:120]}


def score_leetcode(lc_data: Dict[str, Any]) -> Dict[str, Any]:
    """Score LeetCode profile for problem-solving ability."""
    if not lc_data.get("found"):
        return {"lc_score": 0, "not_found": True}

    total = lc_data.get("total_solved", 0)
    medium = lc_data.get("solved_medium", 0)
    hard = lc_data.get("solved_hard", 0)

    # Weighted score: hard problems worth more
    raw = total + medium * 0.5 + hard * 1.5

    if raw >= 500:
        score = 20
    elif raw >= 200:
        score = 15
    elif raw >= 100:
        score = 10
    elif raw >= 30:
        score = 5
    else:
        score = min(3, total)

    credibility = (
        "STRONG" if total >= 300
        else "MODERATE" if total >= 50
        else "WEAK" if total > 0
        else "NONE"
    )

    return {
        "lc_score": score,
        "total_solved": total,
        "credibility_signal": credibility,
    }
