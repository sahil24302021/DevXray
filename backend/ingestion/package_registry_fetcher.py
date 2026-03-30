
import httpx
from typing import Dict, List, Any, Optional

from cache.github_cache import repo_cache


def _get_cached(key: str) -> Optional[Any]:
    return repo_cache.get(key)


def _set_cache(key: str, data: Any):
    repo_cache.set(key, data)


async def fetch_npm_packages(username: str) -> Dict[str, Any]:
    """Search npm registry for packages maintained by this user."""
    cache_key = f"npm:{username}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://registry.npmjs.org/-/v1/search",
                params={"text": f"maintainer:{username}", "size": 20},
            )
            if resp.status_code != 200:
                return {"packages": [], "total_packages": 0, "total_downloads": 0, "credibility": "NONE"}

            items = resp.json().get("objects", [])
            packages = []
            for item in items:
                pkg = item.get("package", {})
                packages.append({
                    "name": pkg.get("name"),
                    "description": (pkg.get("description") or "")[:120],
                    "version": pkg.get("version"),
                })

            result = {
                "packages": packages,
                "total_packages": len(packages),
                "credibility": "HIGH" if len(packages) > 0 else "NONE",
            }
            _set_cache(cache_key, result)
            return result

    except Exception:
        return {"packages": [], "total_packages": 0, "credibility": "NONE"}


async def fetch_pypi_packages(username: str, repo_names: List[str] = None) -> Dict[str, Any]:
    """Check PyPI for packages matching the user's repo names."""
    cache_key = f"pypi:{username}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    if not repo_names:
        return {"packages": [], "total_packages": 0, "credibility": "NONE"}

    found_packages = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Check top 5 repo names against PyPI
            for name in repo_names[:5]:
                try:
                    resp = await client.get(
                        f"https://pypi.org/pypi/{name}/json",
                        timeout=5.0,
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        info = data.get("info", {})
                        # Verify author matches (loose match)
                        author = (info.get("author") or "").lower()
                        author_email = (info.get("author_email") or "").lower()
                        if username.lower() in author or username.lower() in author_email:
                            found_packages.append({
                                "name": info.get("name"),
                                "version": info.get("version"),
                                "description": (info.get("summary") or "")[:120],
                            })
                except Exception:
                    continue

    except Exception:
        pass

    result = {
        "packages": found_packages,
        "total_packages": len(found_packages),
        "credibility": "HIGH" if found_packages else "NONE",
    }
    _set_cache(cache_key, result)
    return result


def score_package_publications(npm_data: Dict, pypi_data: Dict) -> Dict[str, Any]:
    """Score package publications as a credibility signal."""
    npm_count = npm_data.get("total_packages", 0)
    pypi_count = pypi_data.get("total_packages", 0)
    total = npm_count + pypi_count

    if total == 0:
        return {"package_score": 0, "has_published": False}

    # Published packages = strong credibility signal
    score = min(15, total * 5)

    return {
        "package_score": score,
        "has_published": True,
        "npm_packages": npm_count,
        "pypi_packages": pypi_count,
        "credibility": "STRONG" if total >= 3 else "MODERATE" if total >= 1 else "NONE",
    }
