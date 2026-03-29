// lib/auth.ts
// Auth helpers using Supabase Auth.
// Works gracefully when Supabase is not configured (dev without env vars).

"use client";

import { supabase, isSupabaseAvailable } from "./db";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  fullName: string;
  avatar_url?: string;
}

// ─── Get current session user (client side) ──────────────────
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isSupabaseAvailable || !supabase) return null;

  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;

    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || "";
    const firstName = fullName.split(" ")[0] || user.email?.split("@")[0] || "Developer";
    const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;

    return {
      id: user.id,
      email: user.email ?? "",
      firstName,
      fullName: fullName || firstName,
      avatar_url: avatar,
    };
  } catch {
    return null;
  }
}

// ─── Sign up with email + password ───────────────────────────
export async function signUpWithEmail(
  email: string,
  password: string,
  fullName: string
): Promise<{ error: string | null }> {
  if (!isSupabaseAvailable || !supabase) {
    // Dev mode fallback: simulate success
    return { error: null };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });

  return { error: error?.message ?? null };
}

// ─── Sign in with email + password ───────────────────────────
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ error: string | null }> {
  if (!isSupabaseAvailable || !supabase) {
    return { error: null }; // Dev mode: always succeeds
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

// ─── Sign in with Google OAuth ────────────────────────────────
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  if (!isSupabaseAvailable || !supabase) {
    return { error: "Supabase not configured" };
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  return { error: error?.message ?? null };
}

// ─── Sign out ─────────────────────────────────────────────────
export async function signOut(): Promise<void> {
  if (!isSupabaseAvailable || !supabase) return;
  await supabase.auth.signOut();
}

// ─── Subscribe to auth state changes ─────────────────────────
export function onAuthStateChange(
  callback: (user: AuthUser | null) => void
): () => void {
  if (!isSupabaseAvailable || !supabase) {
    return () => {};
  }

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (session?.user) {
        const fullName = session.user.user_metadata?.full_name || "";
        const firstName = fullName.split(" ")[0] || session.user.email?.split("@")[0] || "Developer";
        callback({
          id: session.user.id,
          email: session.user.email ?? "",
          firstName,
          fullName,
        });
      } else {
        callback(null);
      }
    }
  );

  return () => subscription.unsubscribe();
}
