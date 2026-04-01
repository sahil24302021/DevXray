"""
Supabase scan persistence — makes scans survive Render restarts.
Scan results are stored in the `github_scans` table and retrieved on cache miss.
"""
import os
import json
import time
from typing import Optional, Dict, Any

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

async def save_scan_result(username: str, report: Dict[str, Any]) -> bool:
    """Save a scan result to Supabase scans table."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return False
    try:
        import httpx
        url = f"{SUPABASE_URL}/rest/v1/github_scans"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",  # upsert
        }
        payload = {
            "username": username,
            "report_data": json.dumps(report, default=str),
            "scanned_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "final_score": report.get("final_score", 0),
        }
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            return resp.status_code in (200, 201)
    except Exception:
        return False


async def get_recent_scan(username: str, max_age_seconds: int = 3600) -> Optional[Dict[str, Any]]:
    """Get a recent scan from Supabase if it's not too old."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None
    try:
        import httpx
        from datetime import datetime, timezone, timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=max_age_seconds)
        cutoff_str = cutoff.strftime("%Y-%m-%dT%H:%M:%SZ")
        
        url = f"{SUPABASE_URL}/rest/v1/github_scans"
        params = {
            "username": f"eq.{username}",
            "scanned_at": f"gte.{cutoff_str}",
            "order": "scanned_at.desc",
            "limit": "1",
            "select": "report_data,scanned_at",
        }
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        }
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code == 200:
                results = resp.json()
                if results:
                    return json.loads(results[0]["report_data"])
        return None
    except Exception:
        return None
