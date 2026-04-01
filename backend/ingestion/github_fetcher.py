import os
import httpx
import time
import asyncio
from fastapi import HTTPException
from typing import List, Dict, Any, Optional

from cache.github_cache import repo_cache

def _get_cached(key: str) -> Optional[Any]:
    return repo_cache.get(key)

def _set_cache(key: str, data: Any):
    repo_cache.set(key, data)



from ingestion.token_pool import get_github_token, mark_token_rate_limited

# Build headers using the token pool (rotates across multiple tokens)
_token = get_github_token()
GITHUB_HEADERS = {"Accept": "application/vnd.github.v3+json"}
if _token:
    GITHUB_HEADERS["Authorization"] = f"Bearer {_token}"


def _get_auth_headers() -> dict:
    """Returns fresh headers using the current least-used token."""
    token = get_github_token()
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers, token


async def fetch_user_profile(username: str) -> Optional[Dict[str, Any]]:
    cache_key = f"profile:{username}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.github.com/users/{username}",
            headers=GITHUB_HEADERS,
            timeout=15.0,
        )
        if response.status_code in (401, 403, 429):
            raise HTTPException(status_code=429, detail="GitHub API Error (401/403/429). Please ensure your GITHUB_TOKEN in Render is valid and has not expired.")
        if response.status_code != 200:
            return None

        user = response.json()
        
        # Normalize timestamp and check for future date
        created_at = user.get("created_at", "")
        data_error = False
        if created_at:
            try:
                from datetime import datetime, timezone
                dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                if dt > datetime.now(timezone.utc):
                    data_error = True
            except Exception:
                pass
                
        profile = {
            "username": user.get("login", username),
            "avatar_url": user.get("avatar_url", ""),
            "bio": user.get("bio", ""),
            "name": user.get("name", ""),
            "company": user.get("company", ""),
            "location": user.get("location", ""),
            "public_repos": user.get("public_repos", 0),
            "followers": user.get("followers", 0),
            "following": user.get("following", 0),
            "created_at": created_at,
            "data_error": data_error,
        }
        _set_cache(cache_key, profile)
        return profile


async def fetch_user_repos(username: str, expected_count: int = 0) -> List[Dict[str, Any]]:
    """Fetch up to 300 repos (3 pages) for comprehensive analysis."""
    cache_key = f"repos:{username}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        for attempt in range(2):
            all_repos = []
            for page in range(1, 4):  # Up to 300 repos
                response = await client.get(
                    f"https://api.github.com/users/{username}/repos",
                    params={"per_page": 100, "sort": "updated", "page": page},
                    headers=GITHUB_HEADERS,
                    timeout=15.0,
                )
                if response.status_code != 200:
                    break
                repos = response.json()
                if not repos:
                    break
                all_repos.extend(repos)
            
            if not all_repos and expected_count > 0:
                await asyncio.sleep(1)
                continue
            break

    result = [
        {
            "name": repo.get("name"),
            "full_name": repo.get("full_name", ""),
            "description": repo.get("description", ""),
            "stars": repo.get("stargazers_count", 0),
            "language": repo.get("language"),
            "forks": repo.get("forks_count", 0),
            "is_fork": repo.get("fork", False),
            "size": repo.get("size", 0),
            "open_issues": repo.get("open_issues_count", 0),
            "topics": repo.get("topics", []),
            "html_url": repo.get("html_url", ""),
            "created_at": repo.get("created_at"),
            "updated_at": repo.get("updated_at"),
            "pushed_at": repo.get("pushed_at"),
            "default_branch": repo.get("default_branch", "main"),
            "watchers": repo.get("watchers_count", 0),
            "has_wiki": repo.get("has_wiki", False),
            "has_pages": repo.get("has_pages", False),
        }
        for repo in all_repos
    ]

    _set_cache(cache_key, result)
    return result


async def fetch_user_events(username: str) -> List[Dict[str, Any]]:
    """Fetch recent public events (up to 300) for deep activity analysis."""
    cache_key = f"events:{username}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    all_events = []
    async with httpx.AsyncClient() as client:
        for page in range(1, 4):
            response = await client.get(
                f"https://api.github.com/users/{username}/events/public",
                params={"per_page": 100, "page": page},
                headers=GITHUB_HEADERS,
                timeout=15.0,
            )
            if response.status_code != 200:
                break
            events = response.json()
            if not events:
                break
            all_events.extend(events)

    # Categorize all events, not just push events
    result = []
    for event in all_events:
        evt = {
            "type": event.get("type", ""),
            "created_at": event.get("created_at"),
            "repo_name": event.get("repo", {}).get("name", ""),
        }
        if event.get("type") == "PushEvent":
            evt["commits"] = event.get("payload", {}).get("commits", [])
            evt["size"] = event.get("payload", {}).get("size", 0)
        elif event.get("type") == "PullRequestEvent":
            evt["action"] = event.get("payload", {}).get("action", "")
            evt["stars"] = event.get("payload", {}).get("pull_request", {}).get("base", {}).get("repo", {}).get("stargazers_count", 0)
        elif event.get("type") == "IssuesEvent":
            evt["action"] = event.get("payload", {}).get("action", "")
        elif event.get("type") == "CreateEvent":
            evt["ref_type"] = event.get("payload", {}).get("ref_type", "")
        result.append(evt)

    _set_cache(cache_key, result)
    return result


async def fetch_repo_languages(username: str, repo_name: str) -> Dict[str, int]:
    """Fetch byte-count language breakdown for a specific repo."""
    cache_key = f"lang:{username}/{repo_name}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.github.com/repos/{username}/{repo_name}/languages",
            headers=GITHUB_HEADERS,
            timeout=10.0,
        )
        if response.status_code != 200:
            return {}
        data = response.json()
        _set_cache(cache_key, data)
        return data


async def fetch_repo_commits(username: str, repo_name: str, limit: int = 30) -> List[Dict[str, Any]]:
    """Fetch recent commits from a specific repo for pattern analysis."""
    cache_key = f"commits:{username}/{repo_name}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.github.com/repos/{username}/{repo_name}/commits",
            params={"per_page": limit, "author": username},
            headers=GITHUB_HEADERS,
            timeout=10.0,
        )
        if response.status_code != 200:
            return []

        commits = response.json()
        result = [
            {
                "sha": c.get("sha", "")[:7],
                "message": c.get("commit", {}).get("message", ""),
                "date": c.get("commit", {}).get("author", {}).get("date", ""),
                "author": c.get("commit", {}).get("author", {}).get("name", ""),
                "repo_name": repo_name,  # ADD THIS — critical for organic detection
            }
            for c in commits
            if isinstance(c, dict)
        ]
        _set_cache(cache_key, result)
        return result


async def fetch_deep_repo_data(username: str, repos: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    For the top repos (by stars, non-fork), fetch per-repo languages, commits,
    file contents, file tree, and README.

    This is the critical data enabler — without file contents, all code
    intelligence and skill detection falls back to shallow metadata analysis.
    """
    SOURCE_EXTENSIONS = {".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java"}
    SKIP_DIRS = {"node_modules", "vendor", "venv", ".venv", "__pycache__", "dist", "build", ".git"}
    MAX_FILE_SIZE = 50_000  # 50KB
    MAX_FILES_PER_REPO = 15
    TOP_REPOS_FOR_FILES = 5
    TOP_REPOS_FOR_LANG = 10

    # Pick top non-fork repos by composite score (Rule 3)
    originals = [r for r in repos if not r.get("is_fork", False)]
    if not originals:
        originals = repos
        
    from datetime import datetime, timezone
    import math
    now_dt = datetime.now(timezone.utc)
    
    def _repo_score(r):
        stars = r.get("stars", 0)
        size = r.get("size", 0)
        pushed_at = r.get("pushed_at", "")
        recent_bonus = 0
        if pushed_at:
            try:
                dt = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
                days_ago = (now_dt - dt).days
                if days_ago < 30:
                    recent_bonus = 5
                elif days_ago < 365:
                    recent_bonus = 2
            except Exception:
                pass
        
        star_score = math.log10(stars + 1) * 10
        size_score = math.log10(size + 1) * 2
        return star_score + size_score + recent_bonus

    top_repos = sorted(originals, key=_repo_score, reverse=True)[:TOP_REPOS_FOR_LANG]
    top_repos_for_files = top_repos[:TOP_REPOS_FOR_FILES]

    # Fetch languages and commits concurrently for top 10
    language_tasks = [fetch_repo_languages(username, r["name"]) for r in top_repos]
    commit_tasks = [fetch_repo_commits(username, r["name"]) for r in top_repos]

    lang_results = await asyncio.gather(*language_tasks, return_exceptions=True)
    commit_results = await asyncio.gather(*commit_tasks, return_exceptions=True)

    # Aggregate language data across all repos (LOC-based)
    total_languages: Dict[str, int] = {}
    for lr in lang_results:
        if isinstance(lr, dict):
            for lang, bytes_count in lr.items():
                total_languages[lang] = total_languages.get(lang, 0) + bytes_count

    # Collect all commits for analysis — include repo_name for organic detection
    all_commits = []
    for repo, cr in zip(top_repos, commit_results):
        if isinstance(cr, list):
            for commit in cr:
                if isinstance(commit, dict):
                    # Add repo_name so scoring_engine can detect multi-repo activity
                    commit_with_repo = dict(commit)
                    commit_with_repo["repo_name"] = repo.get("name", "")
                    all_commits.append(commit_with_repo)

    # ─── Deep file content fetching for top 5 repos ───
    repo_data: Dict[str, Dict[str, Any]] = {}

    for repo in top_repos_for_files:
        repo_name = repo["name"]
        branch = repo.get("default_branch", "main")

        try:
            # Fetch full file tree
            tree = await fetch_repo_tree(username, repo_name, branch)
            tree_paths = [
                item.get("path", "") if isinstance(item, dict) else str(item)
                for item in tree
            ]

            # Filter to source files, skipping large/vendor paths
            candidate_files = []
            for item in tree:
                if not isinstance(item, dict):
                    continue
                path = item.get("path", "")
                size = item.get("size", 0)
                item_type = item.get("type", "")

                if item_type != "blob":
                    continue
                if size > MAX_FILE_SIZE or size == 0:
                    continue

                # Skip vendor/build directories
                parts = path.split("/")
                if any(p in SKIP_DIRS for p in parts):
                    continue

                # Check extension or dependency file
                is_dependency_file = path.endswith("package.json") or path.endswith("requirements.txt") or path.endswith("go.mod")
                ext = ""
                if "." in path:
                    ext = "." + path.rsplit(".", 1)[-1].lower()
                if ext not in SOURCE_EXTENSIONS and not is_dependency_file:
                    continue

                candidate_files.append({"path": path, "size": size})

            # Sort by size descending (larger files = more substance) and take top N
            candidate_files.sort(key=lambda f: f["size"], reverse=True)
            files_to_fetch = candidate_files[:MAX_FILES_PER_REPO]

            # Fetch file contents concurrently
            fetch_tasks = [
                fetch_file_raw(username, repo_name, f["path"])
                for f in files_to_fetch
            ]
            raw_results = await asyncio.gather(*fetch_tasks, return_exceptions=True)

            files = []
            for f_info, content in zip(files_to_fetch, raw_results):
                if isinstance(content, str) and content:
                    files.append({"path": f_info["path"], "content": content})

            # Fetch README
            readme = ""
            for readme_name in ["README.md", "readme.md", "README.rst", "README"]:
                readme = await fetch_file_raw(username, repo_name, readme_name)
                if readme:
                    break

            repo_data[repo_name] = {
                "files": files,
                "tree": tree_paths,
                "readme": readme,
            }

        except Exception as e:
            print(f"[GitHub] Deep fetch failed for {repo_name}: {e}")
            repo_data[repo_name] = {"files": [], "tree": [], "readme": ""}

    return {
        "language_bytes": total_languages,
        "all_commits": all_commits,
        "repos_analyzed": len(top_repos),
        "repo_data": repo_data,
    }


async def fetch_repo_tree(username: str, repo_name: str, branch: str = "main") -> List[Dict[str, Any]]:
    """
    Fetch the full file tree of a repository via the Git Trees API.
    Falls back to 'master' branch if 'main' fails.
    """
    cache_key = f"tree:{username}/{repo_name}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        # Try the given branch first
        for b in [branch, "master"]:
            response = await client.get(
                f"https://api.github.com/repos/{username}/{repo_name}/git/trees/{b}",
                params={"recursive": "1"},
                headers=GITHUB_HEADERS,
                timeout=15.0,
            )
            if response.status_code == 200:
                data = response.json()
                tree = data.get("tree", [])
                _set_cache(cache_key, tree)
                return tree

    return []


async def fetch_file_raw(username: str, repo_name: str, file_path: str) -> str:
    """
    Fetch the raw content of a single file from a repository.
    Uses the GitHub Contents API with raw media type.
    """
    cache_key = f"raw:{username}/{repo_name}/{file_path}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    raw_headers = {
        **GITHUB_HEADERS,
        "Accept": "application/vnd.github.v3.raw",
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.github.com/repos/{username}/{repo_name}/contents/{file_path}",
            headers=raw_headers,
            timeout=10.0,
        )
        if response.status_code != 200:
            return ""

        content = response.text
        _set_cache(cache_key, content)
        return content


async def fetch_pinned_repos(username: str) -> List[Dict[str, Any]]:
    """
    Fetch a user's pinned repositories using GitHub's GraphQL API.
    These are the repos the user chose to showcase on their profile.
    Falls back to top-starred repos if GraphQL fails or no token.
    """
    cache_key = f"pinned:{username}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    token = get_github_token()
    if not token:
        return []  # GraphQL requires authentication

    query = """
    query($username: String!) {
        user(login: $username) {
            pinnedItems(first: 6, types: REPOSITORY) {
                nodes {
                    ... on Repository {
                        name
                        description
                        stargazerCount
                        primaryLanguage { name }
                        forkCount
                        url
                        isPrivate
                    }
                }
            }
        }
    }
    """

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.github.com/graphql",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json={"query": query, "variables": {"username": username}},
                timeout=15.0,
            )
            if response.status_code != 200:
                return []

            data = response.json()
            nodes = data.get("data", {}).get("user", {}).get("pinnedItems", {}).get("nodes", [])

            pinned = []
            for node in nodes:
                if node and not node.get("isPrivate", True):
                    pinned.append({
                        "name": node.get("name", ""),
                        "description": node.get("description", ""),
                        "stars": node.get("stargazerCount", 0),
                        "language": (node.get("primaryLanguage") or {}).get("name", ""),
                        "forks": node.get("forkCount", 0),
                        "html_url": node.get("url", ""),
                    })

            _set_cache(cache_key, pinned)
            return pinned

    except Exception as e:
        print(f"[GitHub] Pinned repos fetch failed: {e}")
        return []


async def fetch_user_gists(username: str) -> List[Dict[str, Any]]:
    """Fetch public gists for evidence of code sharing and algorithmic work."""
    cache_key = f"gists:{username}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.github.com/users/{username}/gists",
                params={"per_page": 30},
                headers=GITHUB_HEADERS,
                timeout=10.0,
            )
            if resp.status_code != 200:
                return []

            gists = resp.json()
            result = []
            for g in gists:
                files_dict = g.get("files", {})
                result.append({
                    "id": g.get("id"),
                    "description": g.get("description", ""),
                    "files": list(files_dict.keys()),
                    "languages": list(set(
                        f.get("language")
                        for f in files_dict.values()
                        if f.get("language")
                    )),
                    "comments": g.get("comments", 0),
                    "created_at": g.get("created_at"),
                    "updated_at": g.get("updated_at"),
                })

            _set_cache(cache_key, result)
            return result

    except Exception as e:
        print(f"[GitHub] Gists fetch failed: {e}")
        return []


def score_gists(gists: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Score gist activity as an engineering signal."""
    if not gists:
        return {"gist_score": 0, "gist_count": 0}

    score = 0
    described = sum(1 for g in gists if g.get("description"))
    commented = sum(1 for g in gists if g.get("comments", 0) > 0)
    all_languages = set()
    for g in gists:
        all_languages.update(g.get("languages", []))

    # Gists with descriptions = organized developer
    score += min(3, described)
    # Gists with comments = community engagement
    score += min(3, commented)
    # Language diversity
    score += min(3, len(all_languages))
    # Base count bonus
    score += min(3, len(gists) // 3)

    return {
        "gist_score": min(score, 10),
        "gist_count": len(gists),
        "languages": list(all_languages),
        "described_count": described,
    }
