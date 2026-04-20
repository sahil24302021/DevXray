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
 */

"use client";

import { supabase, isSupabaseAvailable, CandidateRecord } from "./db";
import { AnalysisResult } from "./api";

const LS_KEY = "devxray_candidates";

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

  // Score: try top-level → github_report → score_breakdown → scoring (legacy)
  const rawScore = Number(
    result.final_score ||
    (ghReport as any).final_score ||
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

  return {
    id: crypto.randomUUID(),
    username,
    name: candidateName,
    avatar_url: avatarUrl,
    score: Math.round(rawScore),
    tier: String((result.developer_tier || (ghReport as any).developer_tier) || ""),
    risk_level: String((result.risk_level || result.risk_assessment || (ghReport as any).risk_level) || ""),
    recommendation_summary: hiringText,
    languages: langsArr,
    scanned_at: new Date().toISOString(),
    // CRITICAL FIX: Save the FULL result so cached reports retain all data
    // (authenticity_score, organic_commits_percentage, authenticity, etc.)
    // Previously only 5 fields were saved → cached reports showed 0% authenticity.
    report_payload: ghReport as Record<string, unknown>,
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
      // First try to find an existing record
      const { data: existing } = await supabase
        .from("candidates")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (existing) {
        // Update existing record
        const { data, error } = await supabase
          .from("candidates")
          .update({
            ...record,
            id: existing.id,  // Keep original ID
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (error) {
          console.warn("[candidates-store] Supabase update failed:", error.message);
        } else {
          // Also update localStorage as a cache
          lsSaveOne(record, username);
          return data as CandidateRecord;
        }
      } else {
        // Insert new record
        const { data, error } = await supabase
          .from("candidates")
          .insert(record)
          .select()
          .single();

        if (error) {
          console.warn("[candidates-store] Supabase insert failed:", error.message);
        } else {
          lsSaveOne(record, username);
          return data as CandidateRecord;
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

      // Filter: show user's own records + legacy records with no user_id
      if (userId) {
        query = query.or(`user_id.eq.${userId},user_id.is.null,user_id.eq.`);
      }

      const { data, error } = await query;

      if (!error && data && data.length > 0) {
        return data as CandidateRecord[];
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
