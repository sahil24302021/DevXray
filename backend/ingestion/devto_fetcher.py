
import httpx
from typing import Dict, List, Any, Optional

from cache.github_cache import repo_cache


def _get_cached(key: str) -> Optional[Any]:
    return repo_cache.get(key)


def _set_cache(key: str, data: Any):
    repo_cache.set(key, data)


async def fetch_devto_articles(username: str) -> Dict[str, Any]:
    """Fetch articles from Dev.to by username."""
    cache_key = f"devto:{username}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://dev.to/api/articles",
                params={"username": username, "per_page": 20},
                headers={"Accept": "application/vnd.forem.api-v1+json"},
            )
            if resp.status_code != 200:
                return {"found": False, "articles": []}

            articles = resp.json()
            if not articles:
                return {"found": False, "articles": []}

            total_reactions = sum(a.get("public_reactions_count", 0) for a in articles)
            total_comments = sum(a.get("comments_count", 0) for a in articles)
            topics = list(set(tag for a in articles for tag in a.get("tag_list", [])))

            top_article = max(articles, key=lambda a: a.get("public_reactions_count", 0))

            result = {
                "found": True,
                "article_count": len(articles),
                "total_reactions": total_reactions,
                "total_comments": total_comments,
                "topics": topics[:15],
                "top_article": {
                    "title": top_article.get("title", ""),
                    "reactions": top_article.get("public_reactions_count", 0),
                    "url": top_article.get("url", ""),
                },
            }
            _set_cache(cache_key, result)
            return result

    except Exception:
        return {"found": False, "articles": []}


def score_devto(devto_data: Dict[str, Any], resume_skills: List[str]) -> Dict[str, Any]:
    """Score Dev.to presence and cross-reference topics with skills."""
    if not devto_data.get("found"):
        return {"devto_score": 0, "not_found": True}

    article_count = devto_data.get("article_count", 0)
    total_reactions = devto_data.get("total_reactions", 0)
    topics = devto_data.get("topics", [])

    # Base score from articles
    score = min(10, article_count * 2)
    # Bonus for community engagement
    if total_reactions > 100:
        score += 5
    elif total_reactions > 20:
        score += 2

    # Cross-reference topics with resume skills
    verified_via_writing = [
        topic
        for topic in topics
        if any(
            topic.lower() in skill.lower() or skill.lower() in topic.lower()
            for skill in resume_skills
        )
    ]

    return {
        "devto_score": min(score, 15),
        "articles_found": article_count,
        "verified_skills_via_writing": verified_via_writing,
        "credibility_signal": "STRONG" if article_count >= 5 else "MODERATE" if article_count >= 1 else "NONE",
    }
