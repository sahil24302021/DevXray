import time
import os
import json
import asyncio
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict, Any

from utils.logging_config import setup_logging, get_logger
from ingestion.github_fetcher import (
    fetch_user_repos,
    fetch_user_profile,
    fetch_user_events,
    fetch_deep_repo_data,
    fetch_pinned_repos,
    fetch_user_gists,
    score_gists,
)
from services.ai_summary import generate_ai_summary
from ingestion.resume_parser import parse_resume_with_gemini
from decision.claims_validator import validate_claims
from services.web_scraper import (
    scrape_portfolio,
    scrape_portfolio_deep,
    scrape_linkedin,
    scrape_any_url,
    cross_reference_linkedin,
    score_portfolio,
)
from services.code_reviewer import review_multiple_repos, match_resume_projects_to_repos
from services.gemini_client import generate_json
from orchestrator.orchestrator import run_github_analysis, run_resume_analysis

# New multi-source fetchers
from ingestion.stackoverflow_fetcher import fetch_stackoverflow_profile, score_stackoverflow
from ingestion.package_registry_fetcher import fetch_npm_packages, fetch_pypi_packages, score_package_publications
from ingestion.leetcode_fetcher import fetch_leetcode_profile, score_leetcode
from ingestion.devto_fetcher import fetch_devto_articles, score_devto

# Initialize structured logging
setup_logging()
log = get_logger("main")

app = FastAPI(title="DevXray AI — Developer Intelligence Platform")

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Simple in-memory cache fallback
CACHE_TTL = 1800  # 30 minutes — longer cache prevents inconsistent re-runs

# Try Redis first, fall back to in-memory dict
_redis_client = None
_memory_cache: dict = {}

def _init_redis():
    global _redis_client
    redis_url = os.environ.get("REDIS_URL", "")
    if not redis_url:
        return
    try:
        import redis
        _redis_client = redis.Redis.from_url(redis_url, decode_responses=True, socket_timeout=2)
        _redis_client.ping()
        log.info("Redis cache connected")
    except Exception as e:
        log.warning(f"Redis unavailable, using in-memory cache: {e}")
        _redis_client = None

def cache_get(key: str):
    if _redis_client:
        try:
            val = _redis_client.get(f"devxray:{key}")
            return json.loads(val) if val else None
        except Exception:
            pass
    entry = _memory_cache.get(key)
    if entry and time.time() - entry[0] < CACHE_TTL:
        return entry[1]
    return None

def cache_set(key: str, data: dict):
    if _redis_client:
        try:
            _redis_client.setex(f"devxray:{key}", CACHE_TTL, json.dumps(data, default=str))
            return
        except Exception:
            pass
    _memory_cache[key] = (time.time(), data)

# Call on startup
_init_redis()

# Build allowed origins from environment
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    # Production Vercel frontend
    "https://dev-xray.vercel.app",
    "https://www.dev-xray.vercel.app",
]

# Add production frontend URL if set
prod_url = os.environ.get("FRONTEND_URL", "")
if prod_url:
    ALLOWED_ORIGINS.append(prod_url.rstrip("/"))

# Add Vercel preview URLs pattern support
vercel_url = os.environ.get("VERCEL_URL", "")
if vercel_url:
    ALLOWED_ORIGINS.append(f"https://{vercel_url}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_today_str() -> str:
    """Returns today's date as a clear string for LLM prompts."""
    return datetime.now(timezone.utc).strftime("%B %d, %Y")


def _compute_account_age_context(account_created: str) -> dict:
    """
    Computes account age metadata for LLM context.
    Returns plain-English description so LLM never misclassifies dates.
    """
    if not account_created:
        return {
            "created_at": "unknown",
            "days_ago": None,
            "months_ago": None,
            "is_future": False,
            "plain_english": "Account creation date unknown.",
        }
    try:
        created_dt = datetime.fromisoformat(account_created.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        delta = now - created_dt
        days_ago = delta.days
        months_ago = round(days_ago / 30.4, 1)
        is_future = days_ago < 0

        if is_future:
            description = f"WARNING: Account was created {abs(days_ago)} days IN THE FUTURE — data integrity issue."
        elif days_ago < 30:
            description = f"Account is {days_ago} days old — very new account."
        elif days_ago < 365:
            description = f"Account is {months_ago} months old — relatively recent."
        else:
            years = round(days_ago / 365.25, 1)
            description = f"Account is {years} years old ({days_ago} days ago as of today)."

        return {
            "created_at": account_created,
            "days_ago": days_ago,
            "months_ago": months_ago,
            "is_future": is_future,
            "plain_english": description,
        }
    except Exception as e:
        log.warning(f"Could not parse account_created date: {e}")
        return {
            "created_at": account_created,
            "days_ago": None,
            "months_ago": None,
            "is_future": False,
            "plain_english": f"Account creation date: {account_created}",
        }


def _build_repo_context_for_llm(repos: list, deep_data: dict | None) -> str:
    """
    Builds a structured repo list for LLM prompts.
    This prevents the LLM from ever saying 'top_repos is empty'
    when repos actually exist.
    """
    if not repos:
        return "No public repositories found."

    non_fork = [r for r in repos if not r.get("is_fork", r.get("fork", False))]
    original = non_fork if non_fork else repos

    # Sort by stars then size
    sorted_repos = sorted(original, key=lambda r: (r.get("stars", 0), r.get("size", 0)), reverse=True)
    top_repos = sorted_repos[:10]

    lines = [f"Total repositories: {len(repos)} ({len(non_fork)} original, {len(repos)-len(non_fork)} forks)"]
    lines.append("Top repositories:")

    for i, repo in enumerate(top_repos, 1):
        name = repo.get("name", "unknown")
        desc = repo.get("description", "No description")
        lang = repo.get("language") or "Unknown language"
        stars = repo.get("stars", 0)
        size = repo.get("size", 0)
        updated = repo.get("updated_at", repo.get("pushed_at", "unknown"))

        # Check if we have deep file data for this repo
        has_files = False
        if deep_data and "repo_data" in deep_data:
            repo_files = deep_data["repo_data"].get(name, {}).get("files", [])
            has_files = len(repo_files) > 0

        lines.append(
            f"  {i}. {name} | {lang} | ⭐{stars} | {size}KB | "
            f"Updated: {updated[:10] if updated and len(updated)>=10 else updated} | "
            f"{'Code analyzed ✓' if has_files else 'No files fetched'}"
        )
        if desc and desc != "No description":
            lines.append(f"     Description: {desc[:120]}")

    return "\n".join(lines)


def _build_verification_sources(
    username: str,
    so_data: dict,
    npm_data: dict,
    lc_data: dict,
    devto_data: dict,
    gists_data: list,
    linkedin_data: dict = None,
    portfolio_data: dict = None,
) -> list:
    """Build structured verification status panel for the frontend."""
    sources = []

    # GitHub (always present if we got this far)
    sources.append({
        "name": "GitHub",
        "status": "verified",
        "handle": f"@{username}" if username else "",
        "detail": "Profile analyzed",
    })

    # Portfolio
    if portfolio_data and isinstance(portfolio_data, dict):
        sources.append({
            "name": "Portfolio",
            "status": "live" if portfolio_data.get("is_live") else "not_found",
            "url": portfolio_data.get("url", ""),
            "detail": ", ".join(portfolio_data.get("tech_stack", [])[:3]) or "No tech detected",
        })

    # LinkedIn
    if linkedin_data and isinstance(linkedin_data, dict):
        li_status = "fetched" if linkedin_data.get("accessible") else ("blocked" if linkedin_data.get("blocked") else "pending")
        sources.append({
            "name": "LinkedIn",
            "status": li_status,
            "detail": linkedin_data.get("headline", "") or linkedin_data.get("note", ""),
        })

    # Stack Overflow
    if so_data and isinstance(so_data, dict):
        sources.append({
            "name": "Stack Overflow",
            "status": "found" if so_data.get("found") else "not_found",
            "detail": f"Rep: {so_data.get('reputation', 0)}" if so_data.get("found") else "No profile found",
        })

    # NPM
    if npm_data and isinstance(npm_data, dict):
        npm_count = npm_data.get("total_packages", 0)
        sources.append({
            "name": "NPM",
            "status": "found" if npm_count > 0 else "not_found",
            "detail": f"{npm_count} packages" if npm_count > 0 else "No packages published",
        })

    # LeetCode (FIX 17: don't show green for 0 solved)
    if lc_data and isinstance(lc_data, dict):
        lc_solved = lc_data.get("total_solved", 0) or 0
        lc_found = lc_data.get("found", False)
        sources.append({
            "name": "LeetCode",
            "status": (
                "found" if (lc_found and lc_solved > 0)
                else "found_empty" if lc_found
                else "not_found"
            ),
            "detail": (
                f"{lc_solved} problems solved" if lc_found and lc_solved > 0
                else "Profile found — 0 problems solved" if lc_found
                else "No profile found"
            ),
        })

    # Dev.to
    if devto_data and isinstance(devto_data, dict):
        sources.append({
            "name": "Dev.to",
            "status": "found" if devto_data.get("found") else "not_found",
            "detail": f"{devto_data.get('article_count', 0)} articles" if devto_data.get("found") else "No articles found",
        })

    # Gists
    if gists_data:
        sources.append({
            "name": "GitHub Gists",
            "status": "found",
            "detail": f"{len(gists_data)} gists",
        })

    return sources


# ═══════════════════════════════════════════════════════
#  SSE PROGRESS STREAMING
# ═══════════════════════════════════════════════════════
from fastapi import Request
from fastapi.responses import StreamingResponse

progress_queues: dict = {}  # job_id -> asyncio.Queue


@app.get("/api/progress/{job_id}")
async def stream_progress(request: Request, job_id: str):
    """Server-Sent Events endpoint for real-time pipeline progress."""
    async def event_generator():
        queue = progress_queues.get(job_id)
        if not queue:
            queue = asyncio.Queue()
            progress_queues[job_id] = queue

        while True:
            if await request.is_disconnected():
                break
            try:
                message = await asyncio.wait_for(queue.get(), timeout=30)
                yield f"data: {json.dumps(message)}\n\n"
                if message.get("done"):
                    break
            except asyncio.TimeoutError:
                yield 'data: {"heartbeat": true}\n\n'

    return StreamingResponse(event_generator(), media_type="text/event-stream")


async def emit_progress(job_id: Optional[str], step: str, done: bool = False, progress: int = 0, detail: str = ""):
    """Push a progress event to the client stream."""
    if not job_id:
        return
    queue = progress_queues.get(job_id)
    if queue:
        payload = {"step": step, "done": done, "progress": progress}
        if detail:
            payload["detail"] = detail
        await queue.put(payload)


@app.get("/analyze")
@limiter.limit("10/minute")
async def analyze_user(request: Request, username: str, job_id: Optional[str] = None):
    """
    Developer Intelligence Analysis — GitHub-only mode.
    """
    if not username:
        raise HTTPException(status_code=400, detail="Username parameter is required")

    username_lower = username.lower()
    now = time.time()

    # Check cache
    cached_data = cache_get(username_lower)
    if cached_data:
        log.info(f"Cache hit for {username}")
        return cached_data

    # Check Supabase for a recent scan (< 1 hour old) before running full analysis
    try:
        from lib.supabase_client import get_recent_scan
        recent_scan = await get_recent_scan(username_lower, max_age_seconds=3600)
        if recent_scan:
            log.info(f"Supabase cache hit for {username} — returning persisted scan")
            cache_set(username_lower, recent_scan)  # warm the memory cache too
            return recent_scan
    except Exception as e:
        log.debug(f"Supabase scan lookup skipped: {e}")

    log.info(f"Starting analysis for {username}")
    await emit_progress(job_id, "Fetching GitHub profile", progress=5, detail="Connecting to GitHub API")

    # ─── Fetch all data ───
    await emit_progress(job_id, "Fetching GitHub profile", progress=10, detail="Loading profile data")
    profile = await fetch_user_profile(username)
    if not profile:
        raise HTTPException(status_code=404, detail=f"GitHub user '{username}' not found")

    # NOTE: data_error is logged as a WARNING, but we do NOT abort the pipeline.
    # The pipeline handles date anomalies gracefully. Aborting here would return
    # no data for accounts with timezone/clock edge cases.
    if profile.get("data_error"):
        log.warning(
            f"[{username}] data_error flag set on profile (possible future date). "
            f"Continuing with analysis — data_error is non-fatal."
        )

    repos = await fetch_user_repos(username, expected_count=profile.get("public_repos", 0))
    events = await fetch_user_events(username)

    if not repos:
        raise HTTPException(
            status_code=404,
            detail=f"No accessible repositories found for '{username}'",
        )

    # ─── Deep repo analysis ───
    await emit_progress(job_id, "Analyzing repositories", progress=25, detail=f"{len(repos)} repos found")
    try:
        deep_data = await asyncio.wait_for(
            fetch_deep_repo_data(username, repos),
            timeout=45.0  # was previously unlimited — caused silent partial results
        )
        if deep_data is None:
            deep_data = {"language_bytes": {}, "all_commits": [], "repos_analyzed": 0, "repo_data": {}}
            log.warning(f"[{username}] deep_data returned None — using empty fallback")
    except asyncio.TimeoutError:
        log.warning(f"[{username}] fetch_deep_repo_data timed out after 45s — using partial data")
        deep_data = {"language_bytes": {}, "all_commits": [], "repos_analyzed": 0, "repo_data": {}}
    except Exception as e:
        log.warning(f"[{username}] fetch_deep_repo_data failed: {e} — using empty fallback")
        deep_data = {"language_bytes": {}, "all_commits": [], "repos_analyzed": 0, "repo_data": {}}

    # ─── Multi-source data fetching (parallel, best-effort) ───
    await emit_progress(job_id, "Cross-referencing sources", progress=40, detail="StackOverflow, NPM, LeetCode")
    async def _code_review_with_timeout():
        try:
            pinned = await asyncio.wait_for(fetch_pinned_repos(username), timeout=5.0)
            repos_to_review = pinned if pinned else []
            if not repos_to_review:
                originals = [r for r in repos if not r.get("is_fork", False)]
                repos_to_review = sorted(originals, key=lambda r: r.get("stars", 0), reverse=True)[:3]
            reviews = await asyncio.wait_for(
                review_multiple_repos(username=username, repos=repos_to_review, max_repos=3),
                timeout=20.0,
            )
            return reviews
        except asyncio.TimeoutError:
            log.warning(f"Code review timed out for {username}")
            return []
        except Exception as e:
            log.warning(f"Code review failed for {username}: {e}")
            return []

    async def _safe_fetch(coro, label):
        try:
            return await asyncio.wait_for(coro, timeout=10.0)
        except Exception as e:
            log.warning(f"[{label}] fetch failed for {username}: {e}")
            return None

    # Fire all in parallel
    code_review_task = asyncio.create_task(_code_review_with_timeout())
    gists_task = asyncio.create_task(_safe_fetch(fetch_user_gists(username), "Gists"))
    so_task = asyncio.create_task(_safe_fetch(fetch_stackoverflow_profile(username), "StackOverflow"))
    npm_task = asyncio.create_task(_safe_fetch(fetch_npm_packages(username), "NPM"))
    lc_task = asyncio.create_task(_safe_fetch(fetch_leetcode_profile(username), "LeetCode"))
    devto_task = asyncio.create_task(_safe_fetch(fetch_devto_articles(username), "Dev.to"))

    pinned_code_reviews = await code_review_task
    gists_data = await gists_task or []
    so_data = await so_task or {"found": False}
    npm_data = await npm_task or {"packages": [], "total_packages": 0, "credibility": "NONE"}
    lc_data = await lc_task or {"found": False}
    devto_data = await devto_task or {"found": False}

    # Score multi-source data
    gists_scored = score_gists(gists_data)
    so_scored = score_stackoverflow(so_data, [])
    lc_scored = score_leetcode(lc_data)
    devto_scored = score_devto(devto_data, [])
    pkg_scored = score_package_publications(npm_data, {"packages": [], "total_packages": 0})

    multi_source_data = {
        "gists": {"raw": gists_data, "scored": gists_scored},
        "stackoverflow": {"raw": so_data, "scored": so_scored},
        "npm": {"raw": npm_data},
        "leetcode": {"raw": lc_data, "scored": lc_scored},
        "devto": {"raw": devto_data, "scored": devto_scored},
        "packages": {"scored": pkg_scored},
    }

    # ─── Calculate multi-source bonus (FIX 11: only when found) ───
    multi_source_bonus = 0.0
    if so_data.get("found"):
        multi_source_bonus += min(float(so_scored.get("so_score", 0)), 5.0)
    if lc_data.get("found"):
        multi_source_bonus += min(float(lc_scored.get("lc_score", 0)) * 0.25, 5.0)
    if len(gists_data) > 0:
        multi_source_bonus += min(float(gists_scored.get("gist_score", 0)) * 0.5, 3.0)
    if devto_data.get("found"):
        multi_source_bonus += min(float(devto_scored.get("devto_score", 0)) * 0.5, 3.0)
    if npm_data.get("total_packages", 0) > 0:
        multi_source_bonus += min(float(pkg_scored.get("publication_score", 0)) * 0.5, 4.0)
    multi_source_bonus = min(multi_source_bonus, 15.0)  # Cap at +15 total

    log.info(
        f"Multi-source bonus for {username}: +{multi_source_bonus:.1f} "
        f"(SO={so_scored.get('so_score', 0)}, LC={lc_scored.get('lc_score', 0)}, "
        f"Gists={gists_scored.get('gist_score', 0)}, DevTo={devto_scored.get('devto_score', 0)}, "
        f"Pkg={pkg_scored.get('publication_score', 0)})"
    )

    # ─── Compute account age ───
    account_created = profile.get("created_at", "")
    account_age_ctx = _compute_account_age_context(account_created)
    account_age = max(0.0, account_age_ctx.get("days_ago", 0) or 0) / 365.25

    # ─── Run the DIP Orchestrator ───
    await emit_progress(job_id, "Running intelligence engine", progress=60, detail="Scoring dimensions")
    engine_results, pipeline_meta = run_github_analysis(
        username=username,
        profile=profile,
        repos=repos,
        commits=deep_data.get("all_commits", []) if deep_data else [],
        events=events,
        deep_data=deep_data,
        account_age_years=account_age,
    )

    # ─── Apply multi-source bonus to final score ───
    if multi_source_bonus > 0 and "scoring" in engine_results:
        old_score = engine_results["scoring"].get("final_score", 0)
        new_score = min(old_score + multi_source_bonus, 100.0)
        engine_results["scoring"]["final_score"] = new_score
        engine_results["scoring"]["_multi_source_bonus"] = multi_source_bonus
        log.info(f"Applied multi-source bonus: {old_score:.1f} → {new_score:.1f} (+{multi_source_bonus:.1f})")

    # ─── Data source confidence cap ───
    # Adjust confidence based on available data sources
    data_sources_available = ["github"]
    if so_data.get("found"): data_sources_available.append("stackoverflow")
    if lc_data.get("found"): data_sources_available.append("leetcode")
    if devto_data.get("found"): data_sources_available.append("devto")
    if len(gists_data) > 0: data_sources_available.append("gists")
    if npm_data.get("total_packages", 0) > 0: data_sources_available.append("npm")
    pipeline_meta["data_sources"] = data_sources_available
    if len(data_sources_available) >= 3:
        pipeline_meta["data_source_confidence"] = "HIGH"
    elif len(data_sources_available) >= 2:
        pipeline_meta["data_source_confidence"] = "MODERATE"
    else:
        pipeline_meta["data_source_confidence"] = "LOW"
        # Dynamic confidence cap based on how much GitHub data we actually have
        repo_count = len([r for r in repos if not r.get("is_fork", False)])
        if repo_count >= 15:
            confidence_cap = 0.80  # Lots of repos = high confidence even without multi-source
        elif repo_count >= 5:
            confidence_cap = 0.70
        else:
            confidence_cap = 0.55  # Only cap hard when very few repos
        if pipeline_meta.get("confidence_score", 0) > confidence_cap:
            pipeline_meta["confidence_score"] = min(pipeline_meta["confidence_score"], confidence_cap)

    # AI Summary (best-effort) — pass scoring data for richer intelligence
    ai_summary = None
    _scoring = engine_results.get("scoring", {})
    _benchmark = _scoring.get("benchmark", {})
    try:
        ai_summary = await generate_ai_summary(
            profile=profile,
            repos=repos,
            events=events,
            score=int(_scoring.get("final_score", 0)),
            verdict=_scoring.get("hiring_recommendation", {}).get("reasoning", [""])[0] if isinstance(_scoring.get("hiring_recommendation"), dict) else None,
            risk_level=_benchmark.get("comparable_to", ""),
            strengths=_scoring.get("score_breakdown", {}).get("strengths", []),
            weaknesses=_scoring.get("score_breakdown", {}).get("weaknesses", []),
            tier=_benchmark.get("tier", "Unknown"),
        )
    except Exception as e:
        log.warning(f"AI summary failed: {e}")

    # Generate final report
    await emit_progress(job_id, "Generating AI summary", progress=80, detail="Synthesizing findings")
    from orchestrator.report_generator import generate_report
    report = generate_report(
        profile=profile,
        projects=engine_results.get("projects", []),
        code_analysis=engine_results.get("code_analysis", {}),
        system_design=engine_results.get("system_design", {}),
        skills=engine_results.get("skills", {}),
        truth=engine_results.get("truth", {}),
        authenticity=engine_results.get("authenticity", {}),
        consistency=engine_results.get("consistency", {}),
        growth=engine_results.get("growth", {}),
        scoring=engine_results.get("scoring", {}),
        proof_list=engine_results.get("proof_list", []),
        deep_data=deep_data,
        pinned_code_reviews=pinned_code_reviews,
        ai_summary=ai_summary,
    )

    # Inject pipeline metadata
    report["confidence_score"] = pipeline_meta.get("confidence_score", 0)
    report["is_low_confidence"] = pipeline_meta.get("is_low_confidence", False)
    if report["is_low_confidence"]:
        report["warning"] = "LOW CONFIDENCE REPORT: Insufficient data for a reliable analysis."

    report["proof_density"] = pipeline_meta.get("proof_density", {})
    report["data_sufficiency"] = pipeline_meta.get("sufficiency", {})
    report["pipeline_timing"] = pipeline_meta.get("timing", {})
    report["data_sources"] = pipeline_meta.get("data_sources", ["github"])
    report["data_source_confidence"] = pipeline_meta.get("data_source_confidence", "LOW")

    # Inject multi-source intelligence
    report["multi_source"] = multi_source_data
    report["verification_sources"] = _build_verification_sources(
        username, so_data, npm_data, lc_data, devto_data, gists_data, None, None
    )

    # Inject date context into report so frontend never shows wrong dates
    report["account_age_context"] = account_age_ctx
    report["analysis_date"] = _get_today_str()

    # Cache result
    cache_set(username_lower, report)

    # Persist scan result to Supabase so it survives Render restarts
    try:
        from lib.supabase_client import save_scan_result  # create this helper
        await save_scan_result(username_lower, report)
        log.info(f"Scan result persisted to Supabase for {username}")
    except Exception as e:
        log.debug(f"Supabase persist skipped: {e}")  # non-fatal

    log.info(
        f"Analysis complete for {username} — "
        f"Score: {report.get('final_score', 'N/A')} | "
        f"Confidence: {pipeline_meta.get('confidence_score', 0)}"
    )

    await emit_progress(job_id, "Building report", progress=100, detail="Complete", done=True)
    return report


@app.post("/analyze-resume")
@limiter.limit("5/minute")
async def analyze_resume_endpoint(
    request: Request,
    file: UploadFile = File(...),
    job_id: Optional[str] = Form(None),
    job_title: Optional[str] = Form(None),
    job_type: Optional[str] = Form(None),
    required_skills: Optional[str] = Form(None),
    experience_required: Optional[str] = Form(None),
    job_description: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    additional_notes: Optional[str] = Form(None),
    linkedin_text: Optional[str] = Form(None),
):
    """
    Developer Intelligence + Resume Analysis.
    Full pipeline with Truth Engine (resume vs reality comparison).
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum 5MB.")

    # Build job requirements dict
    job_requirements = None
    if any([job_title, job_type, required_skills, experience_required, job_description, company_name]):
        job_requirements = {
            "job_title": job_title or "",
            "job_type": job_type or "",
            "required_skills": required_skills or "",
            "experience_required": experience_required or "",
            "job_description": job_description or "",
            "company_name": company_name or "",
            "additional_notes": additional_notes or "",
        }

    # ═══ STEP 1: Parse Resume ═══
    await emit_progress(job_id, "Reading code files", progress=10, detail="Extracting resume text")
    try:
        resume_data = await parse_resume_with_gemini(content, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Resume parsing failed: {e}")

    # ═══ Extract GitHub username — 5-fallback cascade ═══
    import re as _re_username

    username = ""

    # Source 1: Direct github_username field from resume parser
    raw_username = (resume_data.get("github_username") or "").strip()
    if raw_username:
        # Handle full URL stored in username field (common parser bug)
        if "github.com" in raw_username or "/" in raw_username:
            # Strip protocol, www, github.com, trailing slashes
            cleaned = raw_username.replace("https://", "").replace("http://", "").replace("www.", "")
            parts = [p for p in cleaned.rstrip("/").split("/") if p and p.lower() != "github.com"]
            if parts:
                username = parts[0].strip()
        else:
            # Plain username — accept as-is (handles sahil24302021, dashes, underscores)
            username = raw_username

    # Source 2: github_url field — extract username from URL
    if not username:
        github_url = (resume_data.get("github_url") or "").strip()
        if github_url:
            # Normalize: ensure it starts with protocol for consistent parsing
            if not github_url.startswith("http"):
                github_url = "https://" + github_url
            # Extract: github.com/USERNAME (handles http, https, www, trailing paths)
            m = _re_username.search(r'github\.com/([a-zA-Z0-9][\w-]{0,38})(?:[/?#]|$)', github_url)
            if m:
                username = m.group(1)

    # Source 3: Scan other_links for any github.com URL
    if not username:
        all_links = (resume_data.get("other_links") or []) + [resume_data.get("github_url", "")]
        for link in all_links:
            link_str = str(link or "").strip()
            if link_str and "github.com" in link_str.lower():
                m = _re_username.search(r'github\.com/([a-zA-Z0-9][\w-]{0,38})(?:[/?#]|$)', link_str)
                if m:
                    candidate = m.group(1).lower()
                    # Skip common non-username paths
                    if candidate not in ("settings", "notifications", "pulls", "issues",
                                         "marketplace", "explore", "topics", "trending",
                                         "collections", "events", "sponsors", "orgs"):
                        username = m.group(1)
                        break

    # Source 4: Email prefix as GitHub handle guess
    if not username:
        email = (resume_data.get("email") or "").strip()
        if email and "@" in email:
            prefix = email.split("@")[0]
            # Only use if it looks like a plausible username (no dots, reasonable length)
            clean_prefix = prefix.replace(".", "").replace("-", "").replace("_", "")
            if 3 <= len(clean_prefix) <= 39 and clean_prefix.isalnum():
                username = prefix.replace(".", "")
                log.info(f"[ResumeParser] Using email prefix as GitHub username guess: '{username}'")

    # Source 5: Regex scan the full resume text (last resort)
    if not username:
        raw_text = resume_data.get("_raw_text", "") or resume_data.get("raw_text", "")
        if raw_text:
            m = _re_username.search(r'github\.com/([a-zA-Z0-9][\w-]{0,38})(?:[/?#\s]|$)', raw_text)
            if m:
                username = m.group(1)
                log.info(f"[ResumeParser] Extracted username from raw resume text: '{username}'")

    log.info(f"[ResumeParser] Final GitHub username: '{username}'")

    portfolio_url = resume_data.get("portfolio_url", "")
    linkedin_url = resume_data.get("linkedin_url", "")
    other_links = resume_data.get("other_links", [])

    # Bug 1d: LinkedIn fallback — search other_links for LinkedIn URL
    if not linkedin_url and other_links:
        for link in other_links:
            if isinstance(link, str) and "linkedin.com/in/" in link.lower():
                linkedin_url = link if link.startswith("http") else "https://" + link
                log.info(f"LinkedIn URL found in other_links: {linkedin_url}")
                break

    # ═══ STEP 2: PARALLEL data fetching ═══
    await emit_progress(job_id, "Verifying resume claims", progress=30, detail=f"Fetching data for {username or 'candidate'}")
    async def _fetch_github():
        if not username:
            return None, None, None, None
        try:
            profile = await fetch_user_profile(username)
            if not profile:
                return None, None, None, None

            # FIX: data_error is NON-FATAL. Log it, but continue fetching.
            # The LLM will be given accurate date context so it won't misclassify.
            if profile.get("data_error"):
                log.warning(
                    f"[{username}] Profile has data_error flag. "
                    f"Account created: {profile.get('created_at')}. "
                    f"Continuing — date context will be injected into LLM prompts."
                )

            repos = await fetch_user_repos(username, expected_count=profile.get("public_repos", 0))
            events = await fetch_user_events(username)
            try:
                deep_data = await asyncio.wait_for(
                    fetch_deep_repo_data(username, repos),
                    timeout=60.0
                ) if repos else None
            except asyncio.TimeoutError:
                log.warning(f"[{username}] deep_data timed out in resume pipeline — using empty fallback")
                deep_data = {"language_bytes": {}, "all_commits": [], "repos_analyzed": 0, "repo_data": {}}
            except Exception as e:
                log.warning(f"[{username}] deep_data fetch failed in resume pipeline: {e}")
                deep_data = {"language_bytes": {}, "all_commits": [], "repos_analyzed": 0, "repo_data": {}}
            return profile, repos, events, deep_data
        except Exception as e:
            log.warning(f"GitHub fetch failed for '{username}': {e}")
            return None, None, None, None

    async def _fetch_portfolio():
        if not portfolio_url:
            return ""
        return await scrape_portfolio(portfolio_url)

    async def _fetch_linkedin():
        if linkedin_text:
            return {
                "url": linkedin_url or "Provided via text",
                "accessible": True,
                "name": "",
                "headline": "Provided via Form",
                "about": "",
                "raw_text": linkedin_text,
                "note": "LinkedIn profile provided via manual text paste from frontend.",
                "recommendation": "Manual input parsed cleanly.",
                "blocked": False,
            }
        if not linkedin_url:
            return {"url": "", "accessible": False, "note": "No LinkedIn URL in resume."}
        return await scrape_linkedin(linkedin_url)

    async def _fetch_other_links():
        if not other_links:
            return {}
        results = {}
        tasks = [scrape_any_url(url) for url in other_links[:3]]
        scraped = await asyncio.gather(*tasks, return_exceptions=True)
        for url, text in zip(other_links[:3], scraped):
            if isinstance(text, str) and text:
                results[url] = text[:2000]
        return results

    async def _safe_fetch(coro, label):
        try:
            return await asyncio.wait_for(coro, timeout=10.0)
        except Exception as e:
            log.warning(f"[{label}] fetch failed: {e}")
            return None

    # Run ALL in parallel (GitHub + LinkedIn + Portfolio + Multi-source)
    github_task = asyncio.create_task(_fetch_github())
    portfolio_task = asyncio.create_task(_fetch_portfolio())
    portfolio_deep_task = asyncio.create_task(
        _safe_fetch(scrape_portfolio_deep(portfolio_url), "PortfolioDeep") if portfolio_url else asyncio.sleep(0)
    )
    linkedin_task = asyncio.create_task(_fetch_linkedin())
    other_task = asyncio.create_task(_fetch_other_links())

    # Multi-source fetchers (use username from resume if available)
    so_task = asyncio.create_task(_safe_fetch(fetch_stackoverflow_profile(username), "SO")) if username else None
    npm_task = asyncio.create_task(_safe_fetch(fetch_npm_packages(username), "NPM")) if username else None
    lc_task = asyncio.create_task(_safe_fetch(fetch_leetcode_profile(username), "LC")) if username else None
    devto_task = asyncio.create_task(_safe_fetch(fetch_devto_articles(username), "DevTo")) if username else None
    gists_task = asyncio.create_task(_safe_fetch(fetch_user_gists(username), "Gists")) if username else None

    import typing

    github_result = typing.cast(tuple, await github_task)
    portfolio_text = await portfolio_task
    portfolio_deep_data = await portfolio_deep_task if portfolio_url else None
    linkedin_data = await linkedin_task
    other_data = await other_task

    # Bug 2c: Merge deep portfolio text into portfolio_text for richer cross-referencing
    if portfolio_deep_data and isinstance(portfolio_deep_data, dict):
        deep_raw = portfolio_deep_data.get("raw_text", "")
        if deep_raw and len(deep_raw) > len(portfolio_text or ""):
            portfolio_text = deep_raw
            log.info(f"Portfolio deep text merged: {len(portfolio_text)} chars")

    # Await multi-source (graceful degradation)
    so_data = (await so_task) if so_task else {"found": False}
    npm_data = (await npm_task) if npm_task else {"packages": [], "total_packages": 0, "credibility": "NONE"}
    lc_data = (await lc_task) if lc_task else {"found": False}
    devto_data = (await devto_task) if devto_task else {"found": False}
    gists_data = (await gists_task) if gists_task else []
    so_data = so_data or {"found": False}
    npm_data = npm_data or {"packages": [], "total_packages": 0, "credibility": "NONE"}
    lc_data = lc_data or {"found": False}
    devto_data = devto_data or {"found": False}
    gists_data = gists_data or []

    profile, repos, events, deep_data = github_result

    # ═══ Compute account age context (used in ALL LLM prompts) ═══
    account_created = profile.get("created_at", "") if profile else ""
    account_age_ctx = _compute_account_age_context(account_created)
    account_age = max(0.0, account_age_ctx.get("days_ago", 0) or 0) / 365.25

    # Build repo context string for LLM (prevents "top_repos empty" hallucination)
    repo_context_str = _build_repo_context_for_llm(repos or [], deep_data)

    # ═══ STEP 3: Run DIP Analysis ═══
    github_report = None
    if profile and repos:
        # Code review (best-effort)
        pinned_code_reviews = []
        try:
            repo_reviews = [r for r in repos if not r.get("is_fork", False)]
            repo_reviews = sorted(repo_reviews, key=lambda r: r.get("stars", 0), reverse=True)[:3]
            pinned_code_reviews = await asyncio.wait_for(
                review_multiple_repos(username=username, repos=repo_reviews, max_repos=3),
                timeout=20.0,
            )
        except Exception as e:
            log.warning(f"Code review error: {e}")

        years_exp = resume_data.get("years_of_experience", 0) or 0

        engine_results, pipeline_meta = run_resume_analysis(
            username=username,
            profile=profile,
            repos=repos,
            commits=deep_data.get("all_commits", []) if deep_data else [],
            events=events,
            resume_data=resume_data,
            deep_data=deep_data,
            job_requirements=job_requirements,
            account_age_years=account_age,
            years_experience=years_exp,
        )

        ai_summary = None
        _scoring_r = engine_results.get("scoring", {})
        _benchmark_r = _scoring_r.get("benchmark", {})
        try:
            ai_summary = await generate_ai_summary(
                profile=profile, repos=repos, events=events,
                score=int(_scoring_r.get("final_score", 0)),
                verdict=_scoring_r.get("hiring_recommendation", {}).get("reasoning", [""])[0] if isinstance(_scoring_r.get("hiring_recommendation"), dict) else None,
                risk_level=_benchmark_r.get("comparable_to", ""),
                strengths=_scoring_r.get("score_breakdown", {}).get("strengths", []),
                weaknesses=_scoring_r.get("score_breakdown", {}).get("weaknesses", []),
                tier=_benchmark_r.get("tier", "Unknown"),
            )
        except Exception as e:
            log.warning(f"AI summary failed: {e}")

        # ─── JD Matching ───
        jd_match = None
        if job_requirements and job_requirements.get("job_description"):
            try:
                from intelligence.jd_matcher import match_jd
                verified_skills_list = [
                    s.get("skill_name") for s in engine_results.get("skills", {}).get("skills", [])
                ]
                jd_match = await match_jd(
                    job_description=job_requirements["job_description"],
                    candidate_skills=verified_skills_list,
                    candidate_tier=engine_results.get("scoring", {}).get("benchmark", {}).get("tier", "Unknown"),
                    years_experience=years_exp,
                    github_repos_summary=repo_context_str,
                    commit_forensics=engine_results.get("authenticity", {}).get("commit_timeline_forensics", {})
                )
            except Exception as e:
                log.warning(f"JD matching failed: {e}")

        from orchestrator.report_generator import generate_report
        github_report = generate_report(
            profile=profile,
            projects=engine_results.get("projects", []),
            code_analysis=engine_results.get("code_analysis", {}),
            system_design=engine_results.get("system_design", {}),
            skills=engine_results.get("skills", {}),
            truth=engine_results.get("truth", {}),
            authenticity=engine_results.get("authenticity", {}),
            consistency=engine_results.get("consistency", {}),
            growth=engine_results.get("growth", {}),
            scoring=engine_results.get("scoring", {}),
            proof_list=engine_results.get("proof_list", []),
            deep_data=deep_data,
            pinned_code_reviews=pinned_code_reviews,
            ai_summary=ai_summary,
            jd_match=jd_match,
            resume_data=resume_data,
            repos_param=repos,
        )

        github_report["confidence_score"] = pipeline_meta.get("confidence_score", 0)
        github_report["is_low_confidence"] = pipeline_meta.get("is_low_confidence", False)
        if github_report["is_low_confidence"]:
            github_report["warning"] = "LOW CONFIDENCE REPORT: Insufficient data for a reliable analysis."

        github_report["proof_density"] = pipeline_meta.get("proof_density", {})
        github_report["data_sufficiency"] = pipeline_meta.get("sufficiency", {})
        github_report["pipeline_timing"] = pipeline_meta.get("timing", {})

        # Inject date + repo context into report
        github_report["account_age_context"] = account_age_ctx
        github_report["repo_context"] = repo_context_str
        github_report["analysis_date"] = _get_today_str()

    # ═══ STEP 3.5: Multi-source scoring ═══
    resume_skills_flat = []
    tech_skills = resume_data.get("technical_skills", {})
    if isinstance(tech_skills, dict):
        for v in tech_skills.values():
            if isinstance(v, list):
                resume_skills_flat.extend(v)
            elif isinstance(v, str):
                resume_skills_flat.append(v)
    elif isinstance(tech_skills, list):
        resume_skills_flat = tech_skills

    gists_scored = score_gists(gists_data)
    so_scored = score_stackoverflow(so_data, resume_skills_flat)
    lc_scored = score_leetcode(lc_data)
    devto_scored = score_devto(devto_data, resume_skills_flat)
    pypi_data = await _safe_fetch(
        fetch_pypi_packages(username, [r.get("name", "") for r in (repos or [])]),
        "PyPI"
    ) if username and repos else {"packages": [], "total_packages": 0, "credibility": "NONE"}
    pypi_data = pypi_data or {"packages": [], "total_packages": 0, "credibility": "NONE"}
    pkg_scored = score_package_publications(npm_data, pypi_data)
    portfolio_scored = score_portfolio(portfolio_deep_data) if portfolio_deep_data and isinstance(portfolio_deep_data, dict) else {"portfolio_score": 0}
    linkedin_xref = cross_reference_linkedin(linkedin_data, resume_data) if linkedin_data and linkedin_data.get("accessible") else {"flags": [], "cross_reference_score": 0, "not_available": True}

    multi_source_data = {
        "gists": {"raw": gists_data, "scored": gists_scored},
        "stackoverflow": {"raw": so_data, "scored": so_scored},
        "npm": {"raw": npm_data},
        "pypi": {"raw": pypi_data},
        "leetcode": {"raw": lc_data, "scored": lc_scored},
        "devto": {"raw": devto_data, "scored": devto_scored},
        "packages": {"scored": pkg_scored},
        "portfolio_deep": {"raw": portfolio_deep_data, "scored": portfolio_scored},
        "linkedin_cross_reference": linkedin_xref,
    }

    # ═══ STEP 4: Claims Validation ═══
    claims_validation = {
        "authenticity_score": 0,
        "overall_assessment": "No GitHub profile found to cross-reference claims.",
        "validations": [],
        "red_flags": ["No GitHub profile linked — cannot verify technical claims."],
        "strengths_confirmed": [],
        "hiring_recommendation": "MAYBE — Manual verification recommended."
    }

    if github_report:
        try:
            result = await validate_claims(
                resume_data, github_report, portfolio_text
            )
            # SAFETY: if AI returned a list instead of dict, wrap it
            if isinstance(result, list):
                claims_validation["validations"] = result
                claims_validation["overall_assessment"] = "Claims validated."
            elif isinstance(result, dict):
                claims_validation = result
            # else keep default
        except Exception as e:
            log.warning(f"Claims validation error: {e}")
            claims_validation["overall_assessment"] = f"Validation error: {e}"

    # ═══ STEP 5: Generate Deep AI Report ═══
    deep_report = {}
    try:
        deep_report = await _generate_deep_report(
            resume_data=resume_data,
            github_report=github_report,
            claims_validation=claims_validation,
            linkedin_data=linkedin_data,
            portfolio_text=portfolio_text,
            other_data=other_data,
            project_code_reviews=[],
            job_requirements=job_requirements,
            account_age_ctx=account_age_ctx,
            repo_context_str=repo_context_str,
        )
    except Exception as e:
        log.warning(f"Deep report generation failed (AI unavailable): {e}")
        # Graceful fallback — use DIP engine data directly
        deep_report = {
            "executive_summary": f"AI summary unavailable (quota exceeded). DIP engine score: {github_report.get('final_score', 'N/A')}/100. Tier: {github_report.get('developer_tier', {}).get('tier', 'Unknown') if isinstance(github_report.get('developer_tier'), dict) else github_report.get('developer_tier', 'Unknown')}." if github_report else "AI summary unavailable. No GitHub data found.",
            "candidate_tier": github_report.get("developer_tier", {}).get("tier", "B") if github_report and isinstance(github_report.get("developer_tier"), dict) else "B",
            "overall_score": github_report.get("final_score", 0) if github_report else 0,
            "hire_decision": github_report.get("hiring_recommendation", {}).get("summary", "REVIEW NEEDED") if github_report and isinstance(github_report.get("hiring_recommendation"), dict) else "REVIEW NEEDED",
            "confidence_level": "Low — AI analysis unavailable",
            "key_strengths": github_report.get("strengths", []) if github_report else [],
            "key_concerns": github_report.get("weaknesses", []) if github_report else ["AI analysis unavailable — manual review recommended"],
            "skill_assessment": {},
            "interview_focus_areas": [],
            "growth_trajectory": "",
            "_ai_unavailable": True,
        }

    # ═══ Build verification sources panel ═══
    verification_sources = _build_verification_sources(
        username, so_data, npm_data, lc_data, devto_data, gists_data,
        linkedin_data, portfolio_deep_data,
    )

    # ═══ Build Final Response ═══
    return {
        "resume_data": resume_data,
        "github_intelligence": github_report,
        "claims_validation": claims_validation,
        "linkedin_data": linkedin_data,
        "multi_source": multi_source_data,
        "verification_sources": verification_sources,
        "deep_report": deep_report,
        "project_code_reviews": [],
        "job_requirements": job_requirements,
        "portfolio_scraped": bool(portfolio_text),
        "portfolio_text_length": len(portfolio_text),
        "analysis_metadata": {
            "github_matched": bool(github_report),
            "github_username": username or None,
            "linkedin_found": bool(linkedin_url),
            "linkedin_accessible": linkedin_data.get("accessible", False) if linkedin_data else False,
            "portfolio_found": bool(portfolio_url),
            "stackoverflow_found": so_data.get("found", False) if so_data else False,
            "leetcode_found": lc_data.get("found", False) if lc_data else False,
            "devto_found": devto_data.get("found", False) if devto_data else False,
            "npm_packages": npm_data.get("total_packages", 0) if npm_data else 0,
            "gists_found": len(gists_data) if gists_data else 0,
            "other_links_scraped": len(other_data) if other_data else 0,
            "claims_extracted": len(resume_data.get("claims", [])),
            "projects_found": len(resume_data.get("projects", [])),
            "projects_code_reviewed": 0,
            "job_requirements_provided": bool(job_requirements),
            "analysis_date": _get_today_str(),
            "account_age_context": account_age_ctx,
            "dip_version": "4.0",
            "engines_run": [
                "code_intelligence", "skill_verification",
                "truth_engine", "authenticity_engine",
                "consistency_engine", "growth_engine",
                "scoring_engine", "multi_source_engine",
            ] if github_report else [],
        }
    }


@app.post("/api/reports/save")
async def save_report_for_sharing(request: Request):
    """
    Save a report and return a public shareable link.
    No login needed to VIEW the link — only to create one.
    
    Body: { "report": {...}, "candidate_name": "John Doe", "expires_hours": 72 }
    Returns: { "share_url": "https://dev-xray.vercel.app/report/abc123", "token": "abc123" }
    """
    import secrets
    import time
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    report = body.get("report", {})
    candidate_name = body.get("candidate_name", "Developer")
    expires_hours = min(body.get("expires_hours", 72), 168)  # max 7 days

    if not report:
        raise HTTPException(status_code=400, detail="Report data required")

    # Generate a short random token
    token = secrets.token_urlsafe(8)  # e.g. "xK9mP2qR"
    expires_at = time.time() + (expires_hours * 3600)

    # Save to Supabase
    try:
        import httpx as _hx
        from services.linkedin_config import _get_supabase_creds
        url, key = _get_supabase_creds()
        if url and key:
            payload = {
                "token": token,
                "candidate_name": candidate_name,
                "report_data": json.dumps(report, default=str),
                "expires_at": datetime.fromtimestamp(
                    expires_at, tz=timezone.utc
                ).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "view_count": 0,
            }
            async with _hx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    f"{url}/rest/v1/shared_reports",
                    json=payload,
                    headers={
                        "apikey": key,
                        "Authorization": f"Bearer {key}",
                        "Content-Type": "application/json",
                        "Prefer": "resolution=merge-duplicates",
                    }
                )
    except Exception as e:
        log.warning(f"Supabase save for sharing failed: {e}")
        # Fall back to in-memory
        _memory_cache[f"shared:{token}"] = (expires_at, report)

    frontend_url = os.environ.get("FRONTEND_URL", "https://dev-xray.vercel.app")
    return {
        "success": True,
        "token": token,
        "share_url": f"{frontend_url}/report/shared/{token}",
        "expires_hours": expires_hours,
        "candidate_name": candidate_name,
    }


@app.get("/api/reports/shared/{token}")
async def get_shared_report(token: str):
    """
    Retrieve a shared report by token. Public endpoint — no auth needed.
    """
    import time
    # Try Supabase first
    try:
        import httpx as _hx
        from services.linkedin_config import _get_supabase_creds
        url, key = _get_supabase_creds()
        if url and key:
            async with _hx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{url}/rest/v1/shared_reports",
                    params={
                        "token": f"eq.{token}",
                        "select": "report_data,candidate_name,expires_at,view_count",
                        "limit": "1"
                    },
                    headers={"apikey": key, "Authorization": f"Bearer {key}"}
                )
                if resp.status_code == 200 and resp.json():
                    row = resp.json()[0]
                    # Increment view count
                    await client.patch(
                        f"{url}/rest/v1/shared_reports",
                        params={"token": f"eq.{token}"},
                        json={"view_count": row["view_count"] + 1},
                        headers={
                            "apikey": key,
                            "Authorization": f"Bearer {key}",
                            "Content-Type": "application/json",
                        }
                    )
                    return {
                        "success": True,
                        "candidate_name": row["candidate_name"],
                        "report": json.loads(row["report_data"]),
                        "expires_at": row["expires_at"],
                    }
    except Exception as e:
        log.warning(f"Supabase shared report lookup failed: {e}")

    # Fallback: in-memory
    entry = _memory_cache.get(f"shared:{token}")
    if entry:
        expires_at, report = entry
        if time.time() < expires_at:
            return {"success": True, "report": report}

    raise HTTPException(status_code=404, detail="Report not found or expired")


@app.post("/api/interview-prep")
async def generate_interview_prep(request: Request):
    """
    Generate a complete interview kit from a DevXray report.
    HRs use this before every technical interview.
    
    Input: { "report": {...}, "role": "Backend Engineer", "difficulty": "senior" }
    Output: structured interview kit with 15 questions, red flags to probe,
            technical challenges, and expected answers
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    report = body.get("report", {})
    role = body.get("role", "Software Engineer")
    difficulty = body.get("difficulty", "mid")  # junior / mid / senior

    if not report:
        raise HTTPException(status_code=400, detail="Report required")

    top_skills = [s.get("skill_name", "") for s in report.get("top_skills", [])[:5]]
    risk_flags = [f.get("flag", "") for f in report.get("risk_flags", [])[:3]]
    weaknesses = report.get("weaknesses", [])[:3]
    final_score = report.get("final_score", 0)
    stuffer = report.get("authenticity", {}).get("commit_timeline_forensics", {}).get("stuffer_detected", False)

    prompt = f"""You are the world's best technical interviewer.
Generate a complete interview kit for this candidate.

CANDIDATE PROFILE:
- Role being hired for: {role}
- Seniority level: {difficulty}
- DevXray score: {final_score}/100
- Top verified skills: {top_skills}
- Risk flags detected: {risk_flags}
- Weaknesses found: {weaknesses}
- Commit stuffer detected: {stuffer}

Generate a complete interview kit. Return ONLY this JSON:
{{
    "opening_questions": [
        {{"question": "...", "purpose": "build rapport / assess communication"}}
    ],
    "technical_deep_dives": [
        {{
            "skill": "which skill this tests",
            "question": "technical question",
            "follow_up": "harder follow-up if they answer correctly",
            "red_flag_answer": "what answer would concern you",
            "good_answer_looks_like": "what a strong answer covers"
        }}
    ],
    "gap_probing_questions": [
        {{"question": "...", "probes_for": "which gap/risk this targets"}}
    ],
    "system_design_challenge": {{
        "problem": "a relevant system design problem for this role",
        "what_to_look_for": ["key concepts they should mention"],
        "time_allocation": "20 minutes"
    }},
    "culture_fit_questions": [
        {{"question": "...", "good_signal": "...", "red_flag": "..."}}
    ],
    "coding_challenge": {{
        "problem": "a short relevant coding problem",
        "difficulty": "{difficulty}",
        "what_it_tests": "..."
    }},
    "closing_questions": ["questions candidate should ask you — absence is a red flag"],
    "overall_interview_strategy": "1 paragraph on how to approach this specific candidate",
    "time_allocation": {{
        "technical": "40 min",
        "behavioral": "15 min",
        "system_design": "20 min",
        "q_and_a": "10 min"
    }}
}}"""

    try:
        from services.gemini_client import generate_json
        result = await generate_json(prompt, temperature=0)
        return {"success": True, "interview_kit": result, "role": role, "difficulty": difficulty}
    except Exception as e:
        log.warning(f"Interview prep AI generation failed (likely quota issue): {e}")
        # Generate a structured fallback kit from the raw report data
        fallback_kit = {
            "opening_questions": [
                {"question": "Can you walk me through your most complex project?", "purpose": "Assess communication and project ownership"}
            ],
            "technical_deep_dives": [
                {
                    "skill": s,
                    "question": f"How have you used {s} in production? What were the hardest scaling issues?",
                    "follow_up": "How did you monitor or debug it in production?",
                    "red_flag_answer": "Only describes tutorial-level usage or lacks understanding of failure modes.",
                    "good_answer_looks_like": "Discusses real-world trade-offs, architecture decisions, and edge cases."
                } for s in top_skills
            ] if top_skills else [
                {
                    "skill": "Software Architecture",
                    "question": "Describe a time you had to refactor a significant part of a codebase. What was your approach?",
                    "follow_up": "How did you ensure you didn't break existing functionality?",
                    "red_flag_answer": "Never refactored code or did it without tests/planning.",
                    "good_answer_looks_like": "Mentions adding tests first, gradual rollouts, and defining clear boundaries."
                }
            ],
            "gap_probing_questions": [
                {
                    "question": f"Our analysis flagged a potential gap in: {w}. Can you speak to your experience with this?",
                    "probes_for": f"Self-awareness and plan to improve {w}"
                } for w in weaknesses
            ] if weaknesses else [
                {
                    "question": "What is an area of backend development you feel you are currently weak in and trying to improve?",
                    "probes_for": "Self-awareness and continuous learning"
                }
            ],
            "system_design_challenge": {
                "problem": "Design a highly available URL shortener (like bit.ly) or a rate-limiter suitable for this role's level.",
                "what_to_look_for": ["Data modeling", "Caching strategies", "Database partitioning", "Latency vs throughput trade-offs"],
                "time_allocation": "20 minutes"
            },
            "culture_fit_questions": [
                {
                    "question": "Tell me about a time you strongly disagreed with a technical decision made by your team or manager.",
                    "good_signal": "Approached the disagreement with data, communicated respectfully, and committed to the team's final decision.",
                    "red_flag": "Became defensive, undermined the decision, or just gave up without explaining their technical stance."
                }
            ],
            "coding_challenge": {
                "problem": "Implement a function that finds the longest substring without repeating characters.",
                "difficulty": difficulty,
                "what_it_tests": "Algorithmic thinking and edge-case handling (empty strings, all identical characters)"
            },
            "closing_questions": ["What does your deployment pipeline typically look like?", "How do you handle technical debt?"],
            "overall_interview_strategy": "This is a fallback interview kit automatically generated from the candidate's top tools because AI generation was unavailable. Focus on probing the depth of their knowledge in their top listed skills.",
            "time_allocation": {
                "technical": "30 min",
                "behavioral": "15 min",
                "system_design": "20 min",
                "q_and_a": "10 min"
            }
        }
        # Include risk flag probes if any exist
        if risk_flags:
            fallback_kit["gap_probing_questions"].extend([
                {
                    "question": f"I noticed an irregularity regarding: {f}. Can you elaborate on your experience here?",
                    "probes_for": f"Clarifying the risk flag: {f}"
                } for f in risk_flags
            ])
            
        return {"success": True, "interview_kit": fallback_kit, "role": role, "difficulty": difficulty, "is_fallback": True}

async def _generate_deep_report(
    resume_data: dict,
    github_report: dict | None,
    claims_validation: dict,
    linkedin_data: dict | None,
    portfolio_text: str,
    other_data: dict,
    project_code_reviews: list = None,
    job_requirements: dict | None = None,
    account_age_ctx: dict | None = None,
    repo_context_str: str = "",
) -> dict:
    """
    Final AI pass: synthesize ALL collected data into a comprehensive,
    actionable hiring intelligence report.

    KEY FIX: Today's date, account age in plain English, and actual repo list
    are all injected into the prompt so the LLM cannot misclassify dates or
    claim that repos don't exist.
    """
    from orchestrator.report_generator import compute_experience_display
    today = _get_today_str()

    # Build date context block — this is the #1 fix for wrong verdicts
    age_ctx = account_age_ctx or {}
    account_created = age_ctx.get("created_at", "unknown")
    age_plain = age_ctx.get("plain_english", f"Account created: {account_created}")
    is_future = age_ctx.get("is_future", False)

    date_context_block = f"""
=== CRITICAL DATE CONTEXT (DO NOT IGNORE) ===
TODAY'S DATE: {today}
GitHub Account Created: {account_created}
Account Age Assessment: {age_plain}
Is Future Date: {"YES — DATA INTEGRITY ISSUE" if is_future else "NO — This is a PAST date, account exists normally"}

INSTRUCTION: The account creation date above is in the PAST relative to today ({today}).
Do NOT classify this as a "future date" or use it as a reason to mark claims as unverifiable.
Only flag date issues if is_future=True.
==========================================
"""

    # Build repo context block — prevents "top_repos empty" hallucination
    # Build accurate counts from actual fetched data
    actual_repo_count = 0
    non_fork_count = 0
    if github_report and github_report.get("public_repos"):
        actual_repo_count = github_report.get("public_repos", 0)
    if github_report and github_report.get("repos_deep_analyzed"):
        non_fork_count = github_report.get("repos_deep_analyzed", 0)

    # Build language breakdown from actual data
    lang_summary = ""
    if github_report and github_report.get("top_languages"):
        langs = github_report["top_languages"]
        if isinstance(langs, list):
            lang_summary = "Primary languages (by code volume): " + ", ".join(
                f"{l}" if isinstance(l, str) else f"{l.get('language','?')} ({l.get('percentage','?')}%)"
                for l in langs[:5]
            )
        elif isinstance(langs, dict):
            sorted_langs = sorted(langs.items(), key=lambda x: x[1], reverse=True)
            lang_summary = "Primary languages (by code volume): " + ", ".join(
                f"{k}" for k, v in sorted_langs[:5]
            )

    repo_block = f"""
=== VERIFIED REPOSITORY DATA ===
Total repos on profile: {actual_repo_count}
Repos fetched and analyzed: {non_fork_count} original (non-fork)
{lang_summary}

{repo_context_str if repo_context_str else "No repositories found."}
================================
"""

    # Build Job Requirements Context
    job_context = ""
    if job_requirements:
        job_context = f"""
=== JOB REQUIREMENTS (HR/Company specified) ===
Position: {job_requirements.get('job_title', 'Not specified')}
Type: {job_requirements.get('job_type', 'Not specified')}
Required Skills: {job_requirements.get('required_skills', 'Not specified')}
Experience Required: {job_requirements.get('experience_required', 'Not specified')}
Company: {job_requirements.get('company_name', 'Not specified')}
Job Description: {job_requirements.get('job_description', 'Not specified')}
Additional Notes: {job_requirements.get('additional_notes', 'None')}

CRITICAL: You MUST evaluate this candidate SPECIFICALLY against these job requirements.
"""

    # Build DIP intelligence context
    dip_context = ""
    if github_report:
        dip_context = f"""
=== DIP ENGINE RESULTS (Deterministic — Verified by Code Analysis) ===
Final Score: {github_report.get('final_score', 'N/A')}/100
Developer Tier: {github_report.get('developer_tier', 'Unknown')}
Hiring Recommendation: {github_report.get('hiring_recommendation', 'N/A')}
Role Fit: {json.dumps(github_report.get('role_fit', {}))}
Score Breakdown: {json.dumps(github_report.get('score_breakdown', {}))}
Top Skills: {json.dumps([s.get('skill_name') + ' (' + str(s.get('skill_score', 0)) + '/10)' for s in github_report.get('top_skills', [])])}
Strengths: {json.dumps(github_report.get('strengths', []))}
Weaknesses: {json.dumps(github_report.get('weaknesses', []))}
Risk Flags: {json.dumps([f.get('flag') for f in github_report.get('risk_flags', [])])}
Truth Analysis: {json.dumps(github_report.get('truth_analysis', {}).get('mismatches', []))}
Authenticity Score: {github_report.get('authenticity', {}).get('authenticity_score', 'N/A')}
Consistency Score: {github_report.get('consistency', {}).get('consistency_score', 'N/A')}
Growth Score: {github_report.get('growth', {}).get('growth_score', 'N/A')}
"""

    prompt = f"""You are the world's most experienced technical hiring consultant.
You have VERIFIED, DETERMINISTIC intelligence from the DIP engine plus resume data.
Synthesize ALL data into a comprehensive hiring report. Use the DIP engine scores as the
primary source of truth — they are computed from actual code analysis, not AI guesses.

{date_context_block}

{repo_block}

=== RESUME DATA ===
Name: {resume_data.get('name')}
Current Role: {resume_data.get('current_role')}
Experience: {compute_experience_display(account_age_ctx.get('created_at', '') if account_age_ctx else '', resume_data.get('years_of_experience', 0))} (GitHub account age)
Skills: {json.dumps(resume_data.get('technical_skills', {}))}
Projects: {json.dumps(resume_data.get('projects', [])[:5])}
Education: {json.dumps(resume_data.get('education', []))}
{dip_context}
=== CLAIMS VERIFICATION ===
Authenticity Score: {claims_validation.get('authenticity_score') if isinstance(claims_validation, dict) else 0}/100
Red Flags: {json.dumps(claims_validation.get('red_flags', []) if isinstance(claims_validation, dict) else [])}
{job_context}
=== LINKEDIN DATA ===
{json.dumps(linkedin_data) if linkedin_data else "Not available"}

=== PORTFOLIO ===
{"Content found (" + str(len(portfolio_text)) + " chars)" if portfolio_text else "No portfolio"}

IMPORTANT INSTRUCTIONS:
1. Today is {today}. Any GitHub account created before today is a REAL, EXISTING account.
2. The repository list above shows ACTUAL repos on this profile. Do not say repos are "empty" or "unverifiable" if they appear in the list above.
3. Base skill verification on the DIP engine scores and the repo list, NOT on whether the account seems "new."
4. A developer can have a relatively new account ({age_plain}) and still have real projects — evaluate the CODE, not the age.

Generate a comprehensive JSON report:
{{
    "executive_summary": "3-4 sentence executive summary for a hiring manager",
    "candidate_tier": "S / A / B / C / D (S being elite, D being reject)",
    "overall_score": 0-100,
    "hire_decision": "STRONG HIRE / HIRE / LEAN HIRE / LEAN NO HIRE / NO HIRE",
    "confidence_level": "High / Medium / Low",
    "key_strengths": ["Top 3-5 genuine strengths backed by evidence"],
    "key_concerns": ["Top 3-5 concerns or risks"],
    "skill_assessment": {{
        "frontend": 0-10,
        "backend": 0-10,
        "devops": 0-10,
        "system_design": 0-10,
        "problem_solving": 0-10,
        "ai_ml": 0-10,
        "mobile": 0-10,
        "data_engineering": 0-10
    }},
    "experience_quality": {{
        "depth": "Deep / Moderate / Shallow",
        "breadth": "Wide / Moderate / Narrow",
        "consistency": "Consistent / Inconsistent / Concerning"
    }},
    "red_flag_analysis": {{
        "severity": "None / Low / Medium / High / Critical",
        "flags": ["detailed description of any red flags"],
        "recommendation": "What to ask about in interview"
    }},
    "interview_focus_areas": ["Top 5 things to deep-dive in interview"],
    "comparison_notes": "How this candidate compares to typical applicants at their level",
    "growth_trajectory": "Assessment of the candidate's growth pattern and potential"{', "role_fit_analysis": {{ "overall_fit": "Strong Fit / Moderate Fit / Weak Fit / Poor Fit", "skill_match_percentage": 0-100, "missing_skills": ["Skills required but not demonstrated"], "recommendation_for_role": "Specific recommendation for THIS role" }}' if job_requirements else ''}
}}
"""

    try:
        result = await generate_json(prompt, temperature=0)
        return result
    except Exception as e:
        log.warning(f"Deep report generation failed: {e}")
        return {
            "executive_summary": "Deep report generation was not available.",
            "candidate_tier": "?",
            "overall_score": claims_validation.get("authenticity_score", 0) if isinstance(claims_validation, dict) else 0,
            "hire_decision": claims_validation.get("hiring_recommendation", "N/A") if isinstance(claims_validation, dict) else "N/A",
            "confidence_level": "Low",
        }


@app.post("/api/v1/batch-analyze-resumes")
async def batch_analyze_resumes_endpoint(
    request: Request,
    files: List[UploadFile] = File(...),
    job_title: Optional[str] = Form(None),
    job_type: Optional[str] = Form(None),
    required_skills: Optional[str] = Form(None),
    experience_required: Optional[str] = Form(None),
    job_description: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    additional_notes: Optional[str] = Form(None),
    linkedin_text: Optional[str] = Form(None),
):
    """
    Batch async endpoint for mass resume processing against a single job requisition.
    """
    if len(files) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 resumes allowed per batch.")

    BATCH_SIZE = 5
    results = []

    async def _process_single(file):
        try:
            return await analyze_resume_endpoint(
                request=request,
                file=file,
                job_title=job_title,
                job_type=job_type,
                required_skills=required_skills,
                experience_required=experience_required,
                job_description=job_description,
                company_name=company_name,
                additional_notes=additional_notes,
                linkedin_text=linkedin_text,
            )
        except Exception as e:
            return {"candidate": file.filename, "error": str(e), "score": 0}

    for i in range(0, len(files), BATCH_SIZE):
        batch = files[i:i + BATCH_SIZE]
        batch_tasks = [_process_single(f) for f in batch]
        batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
        for req_result, f in zip(batch_results, batch):
            if isinstance(req_result, Exception):
                results.append({"candidate": f.filename, "error": str(req_result), "score": 0})
            elif "error" in req_result:
                results.append(req_result)
            else:
                final_score = req_result.get("github_report", {}).get("scoring", {}).get("final_score", 0)
                if not final_score:
                    final_score = req_result.get("claims_validation", {}).get("authenticity_score", 0)

                results.append({
                    "candidate": req_result.get("resume_data", {}).get("name", f.filename),
                    "github_username": req_result.get("resume_data", {}).get("github_username", "None"),
                    "score": final_score,
                    "tier": req_result.get("github_report", {}).get("developer_tier", "Unknown"),
                    "hiring_recommendation": req_result.get("claims_validation", {}).get("hiring_recommendation", "Unknown"),
                    "full_report": req_result
                })

    # Sort by score descending
    results.sort(key=lambda x: x.get("score", 0), reverse=True)

    return {
        "batch_size": len(files),
        "job_context": job_title or "General Pool",
        "ranking": [
            {
                "rank": i + 1,
                "candidate": r["candidate"],
                "score": r["score"],
                "tier": r.get("tier"),
                "recommendation": r.get("hiring_recommendation")
            } for i, r in enumerate(results)
        ]
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN: LinkedIn Cookie Management
# ═══════════════════════════════════════════════════════════════════════════════

from services.linkedin_config import set_li_at_runtime, get_li_at_status

ADMIN_SECRET = os.environ.get("DEVXRAY_ADMIN_SECRET", "devxray-admin-2024")

@app.post("/api/admin/update-linkedin-cookie")
async def update_linkedin_cookie(request: Request):
    """
    Securely update the LinkedIn li_at cookie at runtime.
    No redeployment needed. Cookie is stored in memory for 48 hours.
    
    Request body: { "cookie": "AQEDATxxx...", "secret": "your-admin-secret" }
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    # Validate admin secret
    secret = body.get("secret", "")
    if secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    
    cookie = body.get("cookie", "").strip()
    if not cookie:
        raise HTTPException(status_code=400, detail="Cookie value is required")
    
    if len(cookie) < 20:
        raise HTTPException(status_code=400, detail="Cookie too short — does not look valid")
    
    success = set_li_at_runtime(cookie)
    if not success:
        raise HTTPException(status_code=400, detail="Cookie validation failed")
    
    log.info(f"[Admin] LinkedIn li_at cookie updated via API (length={len(cookie)})")
    
    return {
        "success": True,
        "message": "LinkedIn cookie updated successfully. LinkedIn scraping will use this cookie for the next 48 hours.",
        "cookie_length": len(cookie),
        "source": "runtime_api"
    }


@app.get("/api/admin/linkedin-cookie-status")
async def linkedin_cookie_status(secret: str = ""):
    """
    Check the current LinkedIn cookie status.
    Query param: ?secret=your-admin-secret
    """
    if secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    
    status = get_li_at_status()
    return status


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "4.0",
        "platform": "Developer Intelligence Platform",
        "today": _get_today_str(),
        "linkedin_scraper": "10-strategy cascade",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC BADGE ENDPOINT — embeddable SVG for GitHub READMEs
# ═══════════════════════════════════════════════════════════════════════════════

# Simple in-memory badge cache (username -> {score, tier, timestamp})
_badge_cache: Dict[str, Dict[str, Any]] = {}

@app.get("/badge/{username}")
async def get_badge(username: str):
    """
    Returns an SVG badge showing the developer's DIP score.
    
    Usage in GitHub README:
      ![DevXray](https://devxray-backend.onrender.com/badge/username)
    """

    # Check cache first
    cached = _badge_cache.get(username.lower())
    score = 0
    tier = "Unrated"
    if cached:
        score = cached.get("score", 0)
        tier = cached.get("tier", "Unrated")

    # Color logic
    if score >= 80:
        color = "#22c55e"  # green
    elif score >= 60:
        color = "#eab308"  # yellow
    elif score >= 40:
        color = "#f97316"  # orange
    elif score > 0:
        color = "#ef4444"  # red
    else:
        color = "#6b7280"  # gray (unrated)

    label = "DevXray"
    value = f"{score}/100 {tier}" if score > 0 else "Unrated"
    label_width = len(label) * 7 + 12
    value_width = len(value) * 6.5 + 12
    total_width = label_width + value_width

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{total_width}" height="20" role="img" aria-label="{label}: {value}">
  <title>{label}: {value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="{total_width}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="{label_width}" height="20" fill="#555"/>
    <rect x="{label_width}" width="{value_width}" height="20" fill="{color}"/>
    <rect width="{total_width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="{label_width/2}" y="14">{label}</text>
    <text x="{label_width + value_width/2}" y="14">{value}</text>
  </g>
</svg>"""

    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
        },
    )


def update_badge_cache(username: str, score: float, tier: str):
    """Update the badge cache after a successful analysis. Called from pipelines."""
    import time
    _badge_cache[username.lower()] = {
        "score": int(score),
        "tier": tier,
        "timestamp": time.time(),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# KEEP-ALIVE: Self-ping to prevent Render/Railway free tier from sleeping
# Pings /health every 10 minutes. Zero cost, always warm.
# ═══════════════════════════════════════════════════════════════════════════════

import httpx as _httpx_keepalive

_KEEP_ALIVE_INTERVAL = 600  # 10 minutes
_keep_alive_task = None

async def _keep_alive_loop():
    """Background task that pings this server's own /health endpoint every 10 min."""
    backend_url = os.environ.get("RENDER_EXTERNAL_URL", os.environ.get("BACKEND_URL", ""))
    if not backend_url:
        log.info("[KeepAlive] No RENDER_EXTERNAL_URL or BACKEND_URL set — keep-alive disabled")
        return

    health_url = f"{backend_url.rstrip('/')}/health"
    log.info(f"[KeepAlive] Started — pinging {health_url} every {_KEEP_ALIVE_INTERVAL}s")

    while True:
        try:
            await asyncio.sleep(_KEEP_ALIVE_INTERVAL)
            async with _httpx_keepalive.AsyncClient(timeout=10.0) as client:
                resp = await client.get(health_url)
                log.debug(f"[KeepAlive] Ping OK (status {resp.status_code})")
        except asyncio.CancelledError:
            break
        except Exception as e:
            log.warning(f"[KeepAlive] Ping failed: {e}")

@app.on_event("startup")
async def _start_keep_alive():
    global _keep_alive_task
    _keep_alive_task = asyncio.create_task(_keep_alive_loop())
    log.info("[KeepAlive] Background keep-alive task scheduled")

@app.on_event("shutdown")
async def _stop_keep_alive():
    global _keep_alive_task
    if _keep_alive_task:
        _keep_alive_task.cancel()
        log.info("[KeepAlive] Background keep-alive task stopped")