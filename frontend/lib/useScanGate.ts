// lib/useScanGate.ts
// Wraps scan actions with plan limit checks and paywall display.

"use client";

import { useState } from "react";
import { useProfile } from "./useProfile";
import { canScan } from "./plans";

export function useScanGate() {
  const { profile, loading, incrementScan, refetch } = useProfile();
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallTrigger, setPaywallTrigger] = useState<"github" | "resume">(
    "github"
  );

  const checkAndScan = async (
    type: "github" | "resume",
    onAllowed: () => Promise<void>
  ) => {
    // No profile = not logged in = redirect to auth
    if (!profile && !loading) {
      window.location.href = "/signin";
      return;
    }

    // Check limits
    const plan = profile?.plan ?? "free";
    const githubUsed = profile?.github_scans_used ?? 0;
    const resumeUsed = profile?.resume_scans_used ?? 0;

    if (!canScan(plan, githubUsed, resumeUsed, type)) {
      setPaywallTrigger(type);
      setShowPaywall(true);
      return;
    }

    // Allowed — run scan and increment counter
    await onAllowed();
    await incrementScan(type);
  };

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
