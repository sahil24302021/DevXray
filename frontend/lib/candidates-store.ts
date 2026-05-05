/**
 * lib/candidates-store.ts
 *
 * Unified CRUD layer for DevXray candidate records.
 *
 * Strategy:
 *   1. If Supabase is configured → write to `candidates` table and read from it.
 *   2. If Supabase is NOT configured → fall back to localStorage for local dev.
 *
 * This means the candidates dashboard works out-of-the-box even without a
 * Supabase project, and silently upgrades to real persistence once env vars
 * are set.
 *
 * IMPORTANT: The Supabase `candidates` table has a FIXED schema:
 *   id, username, name, avatar_url, source, score, tier, risk_level,
 *   recommendation_summary, languages (TEXT[]), full_report (JSONB),
 *   scanned_at, created_at, user_id
 * All other fields (final_score, developer_tier, hiring_recommendation,
 * verified_skills, top_languages, confidence_score, report_payload)
 * are stored INSIDE `full_report` JSONB to avoid schema mismatch errors.
 */

"use client";

import { supabase, isSupabaseAvailable, CandidateRecord } from "./db";
import { AnalysisResult } from "./api";

const LS_KEY = "devxray_candidates";

// ─── Columns that actually exist in the Supabase `candidates` table ──────────
// Anything NOT in this list goes into `full_report` JSONB.
const SUPABASE_COLUMNS = new Set([
  "id", "username", "name", "avatar_url", "source", "score", "tier",
  "risk_level", "recommendation_summary", "languages", "full_report",
  "scanned_at", "created_at", "user_id",
]);

// ─── localStorage helpers ────────────────────────────────────────────────────

function lsGetAll(): CandidateRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]") as CandidateRecord[];
  } catch {
    return [];
  }
}

function lsSave(records: CandidateRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(records));
  } catch (e) {
    console.warn("[candidates-store] localStorage save failed:", e);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a minimal CandidateRecord from a raw backend AnalysisResult.
 * Handles both GitHub scan results AND resume scan results (which nest data
 * inside `github_report` and `resume_data`).
 */
export function buildCandidateRecord(
  result: AnalysisResult,
  username: string
): CandidateRecord {
  // For resume scans, real data lives inside github_report
  const ghReport = (result.github_report || result) as Record<string, unknown>;
  const resumeData = (result.resume_data || {}) as Record<string, unknown>;

  // Hiring recommendation — handle all shapes
  const hr = result.hiring_recommendation || (ghReport as any).hiring_recommendation;
  const hiringText =
    !hr
      ? ""
      : typeof hr === "string"
      ? hr
      : (hr as any).summary ?? JSON.stringify(hr);

  // Skills arrays
  const skillsArr = Array.isArray(result.verified_skills)
    ? (result.verified_skills as string[])
    : Array.isArray((ghReport as any).verified_skills)
    ? ((ghReport as any).verified_skills as string[])
    : [];

  const langsArr = Array.isArray(result.top_languages)
    ? (result.top_languages as string[])
    : Array.isArray((ghReport as any).top_languages)
    ? ((ghReport as any).top_languages as string[])
    : [];

  // FIX: Get score from ALL possible locations
  const rawScore = Number(
    result.final_score ||
    (ghReport as any).final_score ||
    (result as any).score ||
    (ghReport as any).score ||
    (result.score_breakdown as any)?.final_score ||
    (result.scoring as any)?.final_score ||
    0
  );

  // Name: try top-level → basic_info → resume_data → github_report → username
  const candidateName = String(
    result.name ||
    (result.basic_info as any)?.name ||
    resumeData.name ||
    (ghReport as any).name ||
    (result.basic_info as any)?.login ||
    username
  );

  // Avatar
  const avatarUrl = String(
    result.avatar_url ||
    (result.basic_info as any)?.avatar_url ||
    (ghReport as any).avatar_url ||
    ""
  );

  // Get developer tier from all sources
  const rawTier = (ghReport as any).developer_tier || result.developer_tier;
  const tierStr = typeof rawTier === "string" ? rawTier :
    (typeof rawTier === "object" && rawTier ? (rawTier as any).tier || "" : "");

  return {
    id: crypto.randomUUID(),
    username,
    name: candidateName,
    avatar_url: avatarUrl,
    score: Math.round(rawScore),           // integer for legacy compat
    final_score: rawScore,                  // FIX: also save as final_score
    tier: tierStr,
    developer_tier: tierStr,               // FIX: save both column names
    risk_level: String((result.risk_level || result.risk_assessment || (ghReport as any).risk_level) || ""),
    hiring_recommendation: hiringText,
    recommendation_summary: hiringText,
    languages: langsArr,
    top_languages: langsArr,               // FIX: save both column names
    verified_skills: skillsArr,
    confidence_score: Number((ghReport as any).confidence_score || result.confidence_score || 0),
    scanned_at: new Date().toISOString(),
    // CRITICAL FIX: Save the FULL result so cached reports retain all data
    // (authenticity_score, organic_commits_percentage, authenticity, etc.)
    // Previously only 5 fields were saved → cached reports showed 0% authenticity.
    report_payload: ghReport as Record<string, unknown>,
  };
}

/**
 * Build a Supabase-safe row from a CandidateRecord.
 * Only includes columns that exist in the actual `candidates` table schema.
 * Everything else goes into `full_report` JSONB.
 */
function buildSupabaseRow(record: CandidateRecord): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const extras: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (SUPABASE_COLUMNS.has(key)) {
      row[key] = value;
    } else {
      extras[key] = value;
    }
  }

  // Merge extras into full_report JSONB (include report_payload data too)
  const existingReport = (record as any).report_payload || (record as any).full_report || {};
  row["full_report"] = {
    ...existingReport,
    // Store extra fields that don't have their own DB column
    _extra: {
      final_score: record.final_score,
      developer_tier: record.developer_tier,
      hiring_recommendation: record.hiring_recommendation,
      verified_skills: record.verified_skills,
      top_languages: record.top_languages,
      confidence_score: record.confidence_score,
    },
  };

  return row;
}

/**
 * Reconstruct a full CandidateRecord from a Supabase row.
 * Pulls extra fields back out of `full_report._extra`.
 */
function fromSupabaseRow(row: Record<string, unknown>): CandidateRecord {
  const fullReport = (row.full_report || {}) as Record<string, unknown>;
  const extra = (fullReport._extra || {}) as Record<string, unknown>;

  return {
    id: String(row.id || ""),
    username: String(row.username || ""),
    name: String(row.name || ""),
    avatar_url: String(row.avatar_url || ""),
    score: Number(row.score || 0),
    final_score: Number(extra.final_score || row.score || 0),
    tier: String(row.tier || ""),
    developer_tier: String(extra.developer_tier || row.tier || ""),
    risk_level: String(row.risk_level || ""),
    hiring_recommendation: String(extra.hiring_recommendation || row.recommendation_summary || ""),
    recommendation_summary: String(row.recommendation_summary || ""),
    languages: (row.languages || []) as string[],
    top_languages: (extra.top_languages || row.languages || []) as string[],
    verified_skills: (extra.verified_skills || []) as string[],
    confidence_score: Number(extra.confidence_score || 0),
    scanned_at: String(row.scanned_at || ""),
    report_payload: fullReport as Record<string, unknown>,
    user_id: String(row.user_id || ""),
  };
}

/**
 * Persist one candidate scan result.
 * Returns the saved record, or null on failure.
 */
export async function saveCandidate(
  result: AnalysisResult,
  username: string
): Promise<CandidateRecord | null> {
  const record = buildCandidateRecord(result, username);

  // Stamp with current user ID for auth isolation
  if (isSupabaseAvailable && supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        record.user_id = user.id;
      }
    } catch {}
  }

  if (isSupabaseAvailable && supabase) {
    try {
      const supabaseRow = buildSupabaseRow(record);

      // First try to find an existing record
      const { data: existing } = await supabase
        .from("candidates")
        .select("id")
        .eq("username", username)
        .eq("user_id", record.user_id)
        .maybeSingle();

      if (existing) {
        // Update existing record — only send valid columns
        const { id: _existingId, ...updateData } = supabaseRow;
        const { data, error } = await supabase
          .from("candidates")
          .update(updateData)
          .eq("id", existing.id)
          .select()
          .single();

        if (error) {
          console.warn("[candidates-store] Supabase update failed:", error.message);
          // Fall through to localStorage
        } else {
          // Also update localStorage as a cache
          lsSaveOne(record, username);
          return fromSupabaseRow(data as Record<string, unknown>);
        }
      } else {
        // Insert new record — only send valid columns
        const { data, error } = await supabase
          .from("candidates")
          .insert(supabaseRow)
          .select()
          .single();

        if (error) {
          console.warn("[candidates-store] Supabase insert failed:", error.message);
          // Fall through to localStorage
        } else {
          lsSaveOne(record, username);
          return fromSupabaseRow(data as Record<string, unknown>);
        }
      }
    } catch (err) {
      console.warn("[candidates-store] Supabase operation failed:", err);
    }
  }

  // localStorage fallback (or cache update)
  lsSaveOne(record, username);
  return record;
}

/** Helper: save one record to localStorage (upsert by username) */
function lsSaveOne(record: CandidateRecord, username: string): void {
  const existing = lsGetAll();
  const idx = existing.findIndex((r) => r.username === username);
  if (idx >= 0) {
    existing[idx] = record;
  } else {
    existing.push(record);
  }
  lsSave(existing);
}

/**
 * Fetch all saved candidates (sorted by score descending).
 */
export async function listCandidates(): Promise<CandidateRecord[]> {
  if (isSupabaseAvailable && supabase) {
    try {
      // Get current user for auth isolation
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      let query = supabase
        .from("candidates")
        .select("*")
        .order("scanned_at", { ascending: false });

      // Filter: show ONLY the current user's own records (strict isolation)
      if (userId) {
        query = query.eq("user_id", userId);
      } else {
        // No logged-in user → return localStorage only, never query Supabase
        return lsGetAll().sort((a, b) => {
          const da = new Date(a.scanned_at || 0).getTime();
          const db = new Date(b.scanned_at || 0).getTime();
          return db - da;
        });
      }

      const { data, error } = await query;

      if (!error && data && data.length > 0) {
        return data.map((row) => fromSupabaseRow(row as Record<string, unknown>));
      }
      if (error) {
        console.warn("[candidates-store] Supabase fetch failed:", error.message);
      }
    } catch (err) {
      console.warn("[candidates-store] Supabase query failed:", err);
    }
  }

  // Fallback to localStorage
  return lsGetAll().sort((a, b) => {
    // Sort by scanned_at descending (most recent first)
    const da = new Date(a.scanned_at || 0).getTime();
    const db = new Date(b.scanned_at || 0).getTime();
    return db - da;
  });
}

/**
 * Delete a candidate record by username.
 */
export async function deleteCandidate(username: string): Promise<void> {
  if (isSupabaseAvailable && supabase) {
    try {
      await supabase.from("candidates").delete().eq("username", username);
    } catch (err) {
      console.warn("[candidates-store] Supabase delete failed:", err);
    }
  }
  // Always also clean localStorage
  const existing = lsGetAll().filter((r) => r.username !== username);
  lsSave(existing);
}

/**
 * Check whether any candidate data exists (used for empty state).
 */
export async function hasCandidates(): Promise<boolean> {
  const records = await listCandidates();
  return records.length > 0;
}

// ─── Score History (PDF Guide: "Score trend over time") ──────────────────────

const LS_HISTORY_KEY = "devxray_score_history";

export interface ScoreHistoryPoint {
  date: string; // ISO string
  score: number;
}

function lsGetHistory(): Record<string, ScoreHistoryPoint[]> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LS_HISTORY_KEY) || "{}");
  } catch {
    return {};
  }
}

function lsSaveHistory(data: Record<string, ScoreHistoryPoint[]>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(data));
  } catch {}
}

/**
 * Record a score data point for a candidate.
 * Called after each successful scan to build a score trend.
 */
export function addScoreHistory(username: string, score: number): void {
  const all = lsGetHistory();
  if (!all[username]) all[username] = [];
  all[username].push({ date: new Date().toISOString(), score });
  // Keep last 20 data points max
  if (all[username].length > 20) all[username] = all[username].slice(-20);
  lsSaveHistory(all);
}

/**
 * Get score history for a candidate (for the Score Trend chart).
 * Returns empty array if no history exists.
 */
export function getScoreHistory(username: string): ScoreHistoryPoint[] {
  const all = lsGetHistory();
  return all[username] || [];
}
