// lib/db.ts
// Supabase client for BOTH auth and database operations.
// Uses @supabase/ssr for proper Next.js Server/Client separation.

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseAvailable = !!(supabaseUrl && supabaseAnonKey);

// Browser client (for use in Client Components and auth)
// Using createBrowserClient automatically syncs the auth session to cookies
// so that the Next.js middleware can protect routes securely.
export const supabase = isSupabaseAvailable
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : null;

// ─── Database schema ─────────────────────────────────────────
export interface CandidateRecord {
  id: string;
  username: string;
  name?: string;
  avatar_url?: string;
  score: number;
  final_score?: number;
  tier?: string;
  developer_tier?: string;
  risk_level?: string;
  hiring_recommendation?: any;
  recommendation_summary?: string;
  verified_skills?: string[];
  top_languages?: string[];
  confidence_score?: number;
  languages?: string[];
  scanned_at: string;
  full_report?: object;
  user_id?: string;  // Links to authenticated user (optional for guest scans)
  [key: string]: unknown;
}
