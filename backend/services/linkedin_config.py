"""
LinkedIn Scraper Configuration — DevXray
─────────────────────────────────────────
Central config for the 10-strategy LinkedIn cascade engine.
All settings, user agents, rate limits, and cookie management live here.
"""
import os
import random
import time
import hashlib
from typing import Dict, Optional

# ═══════════════════════════════════════════════════════════════════════════════
# ENV-BASED CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

# Runtime cookie store — survives across requests within one server process
# Key: "li_at" → Value: (cookie_string, set_at_timestamp)
_runtime_cookie_store: dict = {}

def _save_cookie_to_supabase(cookie: str):
    """Persist li_at to Supabase so it survives server restarts."""
    try:
        from lib.supabase_client import get_supabase
        sb = get_supabase()
        sb.table("settings").upsert({
            "key": "linkedin_li_at",
            "value": cookie,
            "updated_at": "now()"
        }).execute()
        print("[LinkedIn·Config] li_at saved to Supabase")
    except Exception as e:
        print(f"[LinkedIn·Config] Supabase save failed: {e}")


def _load_cookie_from_supabase() -> str:
    """Load li_at from Supabase on startup."""
    try:
        from lib.supabase_client import get_supabase
        sb = get_supabase()
        res = sb.table("settings").select("value").eq("key", "linkedin_li_at").execute()
        if res.data:
            return res.data[0]["value"]
    except Exception as e:
        print(f"[LinkedIn·Config] Supabase load failed: {e}")
    return ""


def get_li_at() -> str:
    # 1. Runtime store (freshest, set this session)
    stored = _runtime_cookie_store.get("li_at")
    if stored:
        cookie_val, set_at = stored
        if time.time() - set_at < 172800:
            return cookie_val.strip()
        del _runtime_cookie_store["li_at"]

    # 2. Load from Supabase (persists across server restarts)
    db_cookie = _load_cookie_from_supabase()
    if db_cookie:
        _runtime_cookie_store["li_at"] = (db_cookie, time.time())
        return db_cookie

    # 3. Environment variable fallback
    return os.environ.get("LINKEDIN_LI_AT", "").strip()


def set_li_at_runtime(cookie: str) -> bool:
    cookie = cookie.strip()
    if not cookie or len(cookie) < 20:
        return False
    _runtime_cookie_store["li_at"] = (cookie, time.time())
    _save_cookie_to_supabase(cookie)  # persist to DB so it survives restarts
    print(f"[LinkedIn·Config] li_at updated (length={len(cookie)})")
    return True

def get_li_at_status() -> dict:
    """
    Return the current cookie status for the health check endpoint.
    """
    env_cookie = os.environ.get("LINKEDIN_LI_AT", "").strip()
    runtime_stored = _runtime_cookie_store.get("li_at")
    
    source = "none"
    age_hours = None
    has_cookie = False
    
    if runtime_stored:
        _, set_at = runtime_stored
        age_hours = round((time.time() - set_at) / 3600, 1)
        source = "runtime_api"
        has_cookie = True
    elif env_cookie:
        source = "environment_var"
        has_cookie = True
    
    return {
        "has_cookie": has_cookie,
        "source": source,
        "age_hours": age_hours,
        "env_var_set": bool(env_cookie),
        "runtime_set": bool(runtime_stored),
        "recommendation": (
            "Cookie is fresh — LinkedIn should work." if has_cookie and (age_hours is None or age_hours < 24)
            else "Cookie is old (>24h) — may be expired. Update via Settings." if has_cookie
            else "No li_at cookie set. LinkedIn Voyager API unavailable. Update via Settings."
        )
    }

def get_csrf_token() -> str:
    """
    Derive CSRF token from li_at cookie.
    LinkedIn uses the JSESSIONID cookie value as the csrf-token header.
    When using li_at directly, the csrf token is typically 'ajax:<random>'.
    """
    li_at = get_li_at()
    if not li_at:
        return ""
    # LinkedIn csrf token is derived from a hash of the session
    return f"ajax:{hashlib.md5(li_at.encode()).hexdigest()[:16]}"

def get_google_cse_key() -> str:
    return os.environ.get("GOOGLE_CSE_API_KEY", "").strip()

def get_google_cse_cx() -> str:
    return os.environ.get("GOOGLE_CSE_CX", "").strip()


# ═══════════════════════════════════════════════════════════════════════════════
# RATE LIMITING — Moderate Mode (1 profile / 2 seconds, max 120/hour)
# ═══════════════════════════════════════════════════════════════════════════════

RATE_LIMIT_MODE = "moderate"  # "conservative" | "moderate" | "aggressive"

# Per-strategy delays (seconds) — randomized ±30%
STRATEGY_DELAYS = {
    "conservative": {"min": 3.0, "max": 6.0, "hourly_cap": 50},
    "moderate":     {"min": 1.5, "max": 3.5, "hourly_cap": 120},
    "aggressive":   {"min": 0.8, "max": 1.8, "hourly_cap": 300},
}

def get_rate_config() -> dict:
    return STRATEGY_DELAYS.get(RATE_LIMIT_MODE, STRATEGY_DELAYS["moderate"])

# Track request counts per hour
_request_log: list = []

def rate_limit_check() -> bool:
    """Returns True if we're under the hourly cap, False if we should stop."""
    now = time.time()
    config = get_rate_config()
    # Clean old entries
    cutoff = now - 3600
    _request_log[:] = [t for t in _request_log if t > cutoff]
    return len(_request_log) < config["hourly_cap"]

def rate_limit_record():
    """Record a request for rate limiting."""
    _request_log.append(time.time())

def get_delay() -> float:
    """Get a randomized delay between requests."""
    config = get_rate_config()
    base = random.uniform(config["min"], config["max"])
    # Add jitter (±20%)
    jitter = base * random.uniform(-0.2, 0.2)
    return max(0.5, base + jitter)


# ═══════════════════════════════════════════════════════════════════════════════
# USER AGENT POOL — 40 realistic, modern browser user agents
# ═══════════════════════════════════════════════════════════════════════════════

USER_AGENTS = [
    # Chrome on macOS (most common)
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    # Chrome on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    # Chrome on Linux
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    # Firefox on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0",
    # Firefox on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
    # Firefox on Linux
    "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
    # Safari on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    # Edge on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70",
    # Edge on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    # Opera
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/116.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0",
    # Brave (same as Chrome but slightly different versions)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    # Mobile UAs (for diversity — sometimes helps avoid detection patterns)
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    # Samsung Internet
    "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
    # Arc Browser (new, less flagged)
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    # Vivaldi
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Vivaldi/7.0.3495.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Vivaldi/6.9.3447.57",
]

# Accept-Language variants for fingerprint diversity
ACCEPT_LANGUAGES = [
    "en-US,en;q=0.9",
    "en-US,en;q=0.9,es;q=0.8",
    "en-GB,en;q=0.9,en-US;q=0.8",
    "en-US,en;q=0.9,fr;q=0.8",
    "en-US,en;q=0.9,de;q=0.8",
    "en,en-US;q=0.9",
    "en-US,en;q=0.9,ja;q=0.8",
    "en-US,en;q=0.9,zh-CN;q=0.8",
    "en-US,en;q=0.8",
    "en-US,en;q=0.9,pt;q=0.7",
]

# Sec-CH-UA variants (Client Hints) — must match the User-Agent
SEC_CH_UA_VARIANTS = [
    '"Chromium";v="131", "Google Chrome";v="131", "Not_A Brand";v="24"',
    '"Chromium";v="130", "Google Chrome";v="130", "Not_A Brand";v="99"',
    '"Chromium";v="129", "Google Chrome";v="129", "Not_A Brand";v="24"',
    '"Chromium";v="131", "Microsoft Edge";v="131", "Not_A Brand";v="24"',
    '"Chromium";v="130", "Microsoft Edge";v="130", "Not_A Brand";v="99"',
    '"Not_A Brand";v="99", "Chromium";v="131"',  # Generic chromium
]


def get_random_headers(include_sec_ch: bool = True) -> Dict[str, str]:
    """
    Generate highly realistic, randomized browser headers.
    Each call produces a unique fingerprint to avoid pattern detection.
    """
    ua = random.choice(USER_AGENTS)
    headers = {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": random.choice(ACCEPT_LANGUAGES),
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Cache-Control": random.choice(["no-cache", "max-age=0"]),
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": random.choice(["none", "same-origin", "cross-site"]),
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "DNT": random.choice(["1", ""]),  # Do Not Track — randomize
        "Priority": "u=0, i",  # Modern Chrome priority hint
    }

    # Add Sec-CH-UA for Chrome-like user agents
    if include_sec_ch and "Chrome" in ua:
        headers["Sec-CH-UA"] = random.choice(SEC_CH_UA_VARIANTS)
        headers["Sec-CH-UA-Mobile"] = "?0"
        headers["Sec-CH-UA-Platform"] = (
            '"macOS"' if "Macintosh" in ua
            else '"Windows"' if "Windows" in ua
            else '"Linux"'
        )

    # Remove empty values
    headers = {k: v for k, v in headers.items() if v}

    return headers


def get_linkedin_api_headers() -> Dict[str, str]:
    """
    Generate headers specifically for LinkedIn Voyager API requests.
    These must look like a real LinkedIn web app making API calls.
    """
    li_at = get_li_at()
    csrf = get_csrf_token()

    if not li_at:
        return {}

    return {
        "User-Agent": random.choice([ua for ua in USER_AGENTS if "Chrome" in ua and "Mobile" not in ua]),
        "Accept": "application/vnd.linkedin.normalized+json+2.1",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "x-li-lang": "en_US",
        "x-li-track": '{"clientVersion":"1.13.20","mpVersion":"1.13.20","osName":"web","timezoneOffset":-5.5,"timezone":"Asia/Kolkata","deviceFormFactor":"DESKTOP","mpName":"voyager-web","displayDensity":2,"displayWidth":1920,"displayHeight":1080}',
        "x-li-page-instance": "urn:li:page:d_flagship3_profile_view_base;",
        "csrf-token": csrf,
        "x-restli-protocol-version": "2.0.0",
        "Cookie": f"li_at={li_at}; JSESSIONID=\"{csrf}\"",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "Sec-CH-UA": '"Chromium";v="131", "Google Chrome";v="131", "Not_A Brand";v="24"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"macOS"',
        "Referer": "https://www.linkedin.com/",
        "Origin": "https://www.linkedin.com",
    }


def get_authenticated_browser_headers() -> Dict[str, str]:
    """Headers for fetching LinkedIn profile pages with authentication (Strategy 2)."""
    li_at = get_li_at()
    csrf = get_csrf_token()

    if not li_at:
        return {}

    headers = get_random_headers()
    headers["Cookie"] = f"li_at={li_at}; JSESSIONID=\"{csrf}\"; lang=v=2&lang=en-us"
    headers["Referer"] = "https://www.linkedin.com/feed/"
    return headers


# ═══════════════════════════════════════════════════════════════════════════════
# SCRAPE CACHE
# ═══════════════════════════════════════════════════════════════════════════════

CACHE_TTL = 3600  # 1 hour cache for scraped data
_scrape_cache: Dict[str, dict] = {}
_cache_timestamps: Dict[str, float] = {}


def cache_get(key: str) -> Optional[dict]:
    """Get cached scrape result if still valid."""
    ts = _cache_timestamps.get(key)
    if ts and (time.time() - ts) < CACHE_TTL:
        return _scrape_cache.get(key)
    return None


def cache_set(key: str, data: dict):
    """Store scrape result in cache."""
    _scrape_cache[key] = data
    _cache_timestamps[key] = time.time()


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY PRIORITY CONFIG
# ═══════════════════════════════════════════════════════════════════════════════

# Which strategies to attempt and in what order
# Set False to disable a strategy globally
STRATEGY_ENABLED = {
    "voyager_api": True,           # Strategy 1: LinkedIn Voyager API
    "authenticated_render": True,   # Strategy 2: Authenticated page render
    "google_cse_api": True,         # Strategy 3: Google Custom Search API
    "google_search": True,          # Strategy 4: Google Search scrape
    "bing_search": True,            # Strategy 5: Bing Search
    "duckduckgo": True,             # Strategy 6: DuckDuckGo HTML
    "direct_scrape": True,          # Strategy 7: Direct public profile scrape
    "google_cache": True,           # Strategy 8: Google Cache
    "wayback_machine": True,        # Strategy 9: Wayback Machine
    "ai_extraction": True,          # Strategy 10: AI-enhanced extraction
}

def is_strategy_enabled(name: str) -> bool:
    """Check if a strategy is enabled."""
    return STRATEGY_ENABLED.get(name, True)
