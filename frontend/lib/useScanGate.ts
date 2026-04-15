// lib/useScanGate.ts
// Wraps scan actions with plan limit checks and paywall display.

"use client";

import { useState, useCallback, useRef } from "react";
import { useProfile } from "./useProfile";
import { canScan } from "./plans";
import { getCurrentUser } from "./auth";

export function useScanGate() {
  const { profile, loading, incrementScan, refetch } = useProfile();
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallTrigger, setPaywallTrigger] = useState<"github" | "resume">(
    "github"
  );

  const checkAndScan = useCallback(
    async (type: "github" | "resume", onAllowed: () => Promise<void>) => {
      // First, check if user is even logged in
      const user = await getCurrentUser();
      if (!user) {
        window.location.href = "/signin";
        return;
      }

      // If profile hasn't loaded yet, try to refetch it
      let currentProfile = profile;
      if (!currentProfile && !loading) {
        await refetch();
        // Small delay to let state update
        await new Promise((r) => setTimeout(r, 200));
      }

      // Use the profile if available, otherwise assume free plan with 0 usage
      const plan = currentProfile?.plan ?? "free";
      const githubUsed = currentProfile?.github_scans_used ?? 0;
      const resumeUsed = currentProfile?.resume_scans_used ?? 0;

      if (!canScan(plan, githubUsed, resumeUsed, type)) {
        setPaywallTrigger(type);
        setShowPaywall(true);
        return;
      }

      // Allowed — run scan and increment counter
      await onAllowed();
      await incrementScan(type);
    },
    [profile, loading, incrementScan, refetch]
  );

  return {
    checkAndScan,
    showPaywall,
    setShowPaywall,
    paywallTrigger,
    profile,
    loading,
    refetch,
  };
}
