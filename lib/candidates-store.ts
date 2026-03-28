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
  const hr = result.hiring_recommendation;
  const hiringText =
    !hr
      ? ""
      : typeof hr === "string"
      ? hr
      : hr.summary ?? "";

  const skillsArr = Array.isArray(result.verified_skills)
    ? result.verified_skills as string[]
    : [];
  const langsArr = Array.isArray(result.top_languages)
    ? result.top_languages as string[]
    : [];

  return {
    id: crypto.randomUUID(),
    username,
    name: (result.name as string) || "",
    avatar_url: (result.avatar_url as string) || "",
    final_score: Number(result.final_score ?? 0),
    developer_tier: (result.developer_tier as string) || "",
    risk_level: (result.risk_level as string) || "",
    hiring_recommendation: hiringText,
    verified_skills: skillsArr,
    top_languages: langsArr,
    confidence_score: Number(result.confidence_score ?? 0),
    scanned_at: new Date().toISOString(),
    // Store light report summary — strip large payload to keep storage lean
    report_payload: {
      final_score: result.final_score,
      score_breakdown: result.score_breakdown,
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      verdict_explanation: result.verdict_explanation,
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
