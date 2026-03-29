/**
 * lib/db.ts — Supabase client with graceful localStorage fallback.
 *
 * Usage:
 *   import { supabase, isSupabaseAvailable } from "@/lib/db";
 *
 * If Supabase env vars are missing (local dev without a project) the module
 * sets supabase = null and isSupabaseAvailable = false.  All helpers in
 * candidates-store.ts check this flag and fall back to localStorage.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseAvailable = !!(supabaseUrl && supabaseAnonKey);

// Export a properly-typed client or null when env vars are absent.
export const supabase: SupabaseClient | null = isSupabaseAvailable
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// ─── Database schema (mirrors Supabase table) ───────────────────────────────
export interface CandidateRecord {
  id: string;                  // UUID (generated client-side)
  username: string;
  name?: string;
  avatar_url?: string;
  final_score: number;
  developer_tier?: string;
  risk_level?: string;
  hiring_recommendation?: string;
  verified_skills?: string[];
  top_languages?: string[];
  confidence_score?: number;
  scanned_at: string;          // ISO timestamp
  report_payload?: object;     // Full JSON from backend (optional)
  [key: string]: unknown;
}
