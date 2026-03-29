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
  localStorage.setItem(LS_KEY, JSON.stringify(records));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a minimal CandidateRecord from a raw backend AnalysisResult.
 */
export function buildCandidateRecord(
  result: AnalysisResult,
  username: string
): CandidateRecord {
  // For resume scans, real data lives inside github_report
  const ghReport = (result.github_report || result) as Record<string, unknown>;
  const resumeData = (result.resume_data || {}) as Record<string, unknown>;

  const hr = result.hiring_recommendation || (ghReport as any).hiring_recommendation;
  const hiringText =
    !hr
      ? ""
      : typeof hr === "string"
      ? hr
      : (hr as any).summary ?? "";

  const skillsArr = Array.isArray(result.verified_skills)
    ? result.verified_skills as string[]
    : Array.isArray((ghReport as any).verified_skills)
    ? (ghReport as any).verified_skills as string[]
    : [];
  const langsArr = Array.isArray(result.top_languages)
    ? result.top_languages as string[]
    : Array.isArray((ghReport as any).top_languages)
    ? (ghReport as any).top_languages as string[]
    : [];

  // Score: try top-level, then github_report, then score_breakdown
  const rawScore = Number(
    result.final_score ||
    (ghReport as any).final_score ||
    (result.score_breakdown as any)?.final_score ||
    0
  );

  // Name: try top-level, then resume_data, then github_report
  const candidateName = String(
    result.name ||
    resumeData.name ||
    (ghReport as any).name ||
    (result.basic_info as any)?.name ||
    username
  );

  // Avatar
  const avatarUrl = String(
    result.avatar_url ||
    (ghReport as any).avatar_url ||
    (result.basic_info as any)?.avatar_url ||
    ""
  );

  return {
    id: crypto.randomUUID(),
    username,
    name: candidateName,
    avatar_url: avatarUrl,
    final_score: Math.round(rawScore),
    developer_tier: String((result.developer_tier || (ghReport as any).developer_tier) || ""),
    risk_level: String((result.risk_level || (ghReport as any).risk_level) || ""),
    hiring_recommendation: hiringText,
    verified_skills: skillsArr,
    top_languages: langsArr,
    confidence_score: Math.round(Number(result.confidence_score || (ghReport as any).confidence_score || 0)),
    scanned_at: new Date().toISOString(),
    report_payload: {
      final_score: rawScore,
      score_breakdown: result.score_breakdown || (ghReport as any).score_breakdown,
      strengths: result.strengths || (ghReport as any).strengths,
      weaknesses: result.weaknesses || (ghReport as any).weaknesses,
      verdict_explanation: result.verdict_explanation || (ghReport as any).verdict_explanation,
    },
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

  if (isSupabaseAvailable && supabase) {
    const { data, error } = await supabase
      .from("candidates")
      .upsert(record, { onConflict: "username" })
      .select()
      .single();

    if (error) {
      console.warn("[candidates-store] Supabase upsert failed, falling back to localStorage:", error.message);
      // Fall through to localStorage
    } else {
      return data as CandidateRecord;
    }
  }

  // localStorage fallback
  const existing = lsGetAll();
  const idx = existing.findIndex((r) => r.username === username);
  if (idx >= 0) {
    existing[idx] = record;
  } else {
    existing.push(record);
  }
  lsSave(existing);
  return record;
}

/**
 * Fetch all saved candidates (sorted by score descending).
 */
export async function listCandidates(): Promise<CandidateRecord[]> {
  if (isSupabaseAvailable && supabase) {
    const { data, error } = await supabase
      .from("candidates")
      .select("*")
      .order("final_score", { ascending: false });

    if (!error && data) {
      return data as CandidateRecord[];
    }
    console.warn("[candidates-store] Supabase fetch failed, using localStorage:", error?.message);
  }

  return lsGetAll().sort((a, b) => b.final_score - a.final_score);
}

/**
 * Delete a candidate record by username.
 */
export async function deleteCandidate(username: string): Promise<void> {
  if (isSupabaseAvailable && supabase) {
    await supabase.from("candidates").delete().eq("username", username);
    return;
  }
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
