// lib/useProfile.ts
// Hook for fetching/managing the user's subscription profile from Supabase.

"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseAvailable } from "./db";
import { type PlanKey } from "./plans";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  plan: PlanKey;
  github_scans_used: number;
  resume_scans_used: number;
  subscription_status: string;
  subscription_end_date: string | null;
}

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!isSupabaseAvailable || !supabase) {
      setLoading(false);
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      let { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      // Auto-create profile row if it doesn't exist
      if (!data) {
        const newProfile = {
          id: user.id,
          email: user.email || "",
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || "",
          plan: "free",
          github_scans_used: 0,
          resume_scans_used: 0,
          subscription_status: "inactive",
        };
        const { data: inserted, error } = await supabase
          .from("profiles")
          .upsert(newProfile)
          .select()
          .single();
        if (!error && inserted) {
          data = inserted;
        }
      }

      if (data) {
        setProfile({
          id: data.id,
          email: data.email || user.email || "",
          full_name: data.full_name || "",
          plan: (data.plan as PlanKey) || "free",
          github_scans_used: data.github_scans_used || 0,
          resume_scans_used: data.resume_scans_used || 0,
          subscription_status: data.subscription_status || "inactive",
          subscription_end_date: data.subscription_end_date || null,
        });
      }
    } catch (err) {
      console.warn("[useProfile] Failed to fetch profile:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const incrementScan = useCallback(
    async (type: "github" | "resume") => {
      if (!isSupabaseAvailable || !supabase || !profile) return;

      const field =
        type === "github" ? "github_scans_used" : "resume_scans_used";
      const newVal = (profile[field] as number) + 1;

      await supabase
        .from("profiles")
        .update({ [field]: newVal })
        .eq("id", profile.id);

      setProfile((prev) => (prev ? { ...prev, [field]: newVal } : null));
    },
    [profile]
  );

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, loading, refetch: fetchProfile, incrementScan };
}
