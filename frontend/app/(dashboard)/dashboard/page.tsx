"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  analyzeGitHub,
  extractScoring,
  scoreToTier,
  scoreToRisk,
  scoreToRecommendation,
  normalizeTier,
  getHiringRecommendationSummary,
  extractLanguages,
  healthCheck,
  AnalysisResult,
} from "@/lib/api";
import { saveCandidate, listCandidates } from "@/lib/candidates-store";
import { getCurrentUser } from "@/lib/auth";
import { useScanGate } from "@/lib/useScanGate";
import { PLANS } from "@/lib/plans";
import PaywallModal from "@/components/PaywallModal";

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────────────────────

interface ScanResult {
  username: string;
  name: string;
  avatar: string;
  score: number;
  tier: string;
  recommendation: string;
  risk: string;
  time: string;
  languages: string[];
}

const TIER_COLORS: Record<string, string> = {
  "S-Tier": "#34d399",
  "A-Tier": "#cdff00",
  "B-Tier": "#fbbf24",
  "C-Tier": "#fb923c",
  "D-Tier": "#fb7185",
};

const REC_COLORS: Record<string, string> = {
  "Strong Hire": "#34d399",
  "Likely Hire": "#cdff00",
  Hire: "#34d399",
  Conditional: "#fbbf24",
  "Not Recommended": "#fb7185",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize any tier string from backend → frontend display format */
function safeTier(rawTier: string | undefined, score: number): string {
  if (!rawTier) return scoreToTier(score);
  const normalized = normalizeTier(rawTier);
  // If normalizeTier returned back the raw string and it's not a valid tier key, use score
  if (!TIER_COLORS[normalized]) return scoreToTier(score);
  return normalized;
}

/** Normalize any recommendation string → display format */
function safeRec(raw: string | undefined, score: number): string {
  if (!raw) return scoreToRecommendation(score);
  // Check if it matches one of our known keys
  for (const key of Object.keys(REC_COLORS)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return key;
  }
  // Check for common backend formats
  if (raw.toLowerCase().includes("hire")) {
    if (raw.toLowerCase().includes("strong")) return "Strong Hire";
    if (raw.toLowerCase().includes("not")) return "Not Recommended";
    return "Likely Hire";
  }
  if (raw.toLowerCase().includes("conditional")) return "Conditional";
  return scoreToRecommendation(score);
}

/** Normalize risk level */
function safeRisk(raw: string | undefined, score: number): string {
  if (!raw) return scoreToRisk(score);
  if (raw === "Low" || raw === "Medium" || raw === "High") return raw;
  return scoreToRisk(score);
}

/** Format date nicely */
function formatTime(iso: string | undefined): string {
  if (!iso) return "Unknown";
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini bar chart
// ─────────────────────────────────────────────────────────────────────────────

function MiniBarChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1.5 h-12">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm transition-all duration-700 cursor-pointer hover:opacity-80"
          style={{
            height: `${Math.max((v / max) * 100, v > 0 ? 4 : 0)}%`,
            minHeight: v > 0 ? "3px" : 0,
            background:
              i === data.length - 1
                ? "#cdff00"
                : "rgba(205,255,0,0.25)",
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Actions
// ─────────────────────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { href: "/bulk-upload", label: "Bulk Upload", sub: "Up to 100 PDFs", color: "#cdff00", icon: "↑" },
  { href: "/compare", label: "Compare", sub: "Side-by-side analysis", color: "#a78bfa", icon: "⇄" },
  { href: "/candidates", label: "All Candidates", sub: "Browse & filter", color: "#34d399", icon: "⊞" },
  { href: "/how-we-score", label: "How We Score", sub: "Scoring methodology", color: "#60a5fa", icon: "◉" },
];

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN DASHBOARD PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [scanInput, setScanInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [scanError, setScanError] = useState("");
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [userName, setUserName] = useState("there");

  // ── Paywall gate ──
  const { checkAndScan, showPaywall, setShowPaywall, paywallTrigger, profile: gateProfile } = useScanGate();

  // ── Load everything on mount ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1) Backend health
      healthCheck().then(setBackendOnline);

      // 2) User name
      try {
        const u = await getCurrentUser();
        if (!cancelled && u) {
          const name = u.firstName || u.email?.split("@")[0] || "there";
          setUserName(name.charAt(0).toUpperCase() + name.slice(1));
        }
      } catch {}

      // 3) Load scan history from Supabase / localStorage
      try {
        const records = await listCandidates();
        if (cancelled) return;

        const history: ScanResult[] = records.map((r) => ({
          username: r.username,
          name: r.name || r.username,
          avatar: r.avatar_url || "",
          score: Number(r.final_score ?? 0),
          tier: safeTier(r.developer_tier as string, Number(r.final_score ?? 0)),
          recommendation: safeRec(r.hiring_recommendation as string, Number(r.final_score ?? 0)),
          risk: safeRisk(r.risk_level as string, Number(r.final_score ?? 0)),
          time: formatTime(r.scanned_at),
          languages: (r.top_languages as string[]) || [],
        }));
        setScans(history);
      } catch (err) {
        console.warn("[dashboard] Failed to load history:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // ── Handle scan (wrapped with paywall gate) ──
  const handleQuickScan = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      let username = scanInput.trim();
      if (!username) return;

      // Clean up GitHub URLs
      if (username.includes("github.com/")) {
        username = username.split("github.com/").pop()?.split("/")[0]?.split("?")[0] || username;
      }
      // Remove @ prefix
      username = username.replace(/^@/, "");

      // Check if already scanned
      const alreadyScanned = scans.find((s) => s.username.toLowerCase() === username.toLowerCase());
      if (alreadyScanned) {
        setScanError(`@${username} is already scanned (score: ${alreadyScanned.score}). View the report or go to Candidates for details.`);
        return;
      }

      // ── Paywall gate: check plan limits before scanning ──
      await checkAndScan("github", async () => {
        setScanning(true);
        setScanError("");
        setScanProgress("Connecting to analysis engine...");

        try {
          const jobId = `dash-${Date.now()}`;
          const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

          // SSE progress listener
          let es: EventSource | null = null;
          try {
            es = new EventSource(`${API_BASE}/api/progress/${jobId}`);
            es.onmessage = (evt) => {
              try {
                const data = JSON.parse(evt.data);
                if (data.step) setScanProgress(data.step);
                if (data.done) es?.close();
              } catch {}
            };
            es.onerror = () => es?.close();
          } catch {}

          // Actual API call
          const result = await analyzeGitHub(username, jobId);
          es?.close();

          // ─── Extract data from result robustly ───
          const scoring = extractScoring(result);
          const finalScore = scoring.finalScore || Math.round(Number(result.final_score || 0));

          // Name: try multiple paths
          const candidateName =
            String(result.name || "") ||
            String((result.basic_info as any)?.name || "") ||
            String((result.basic_info as any)?.login || "") ||
            username;

          // Avatar: try multiple paths
          const avatar =
            String(result.avatar_url || "") ||
            String((result.basic_info as any)?.avatar_url || "");

          // Languages: robust extraction
          const langs = extractLanguages(result);

          // Tier / recommendation / risk: use safe normalizers
          const tier = safeTier(
            String(result.developer_tier || ""),
            finalScore
          );
          const recommendation = safeRec(
            getHiringRecommendationSummary(result),
            finalScore
          );
          const risk = safeRisk(
            String(result.risk_level || result.risk_assessment || ""),
            finalScore
          );

          const newScan: ScanResult = {
            username,
            name: candidateName,
            avatar,
            score: finalScore,
            tier,
            recommendation,
            risk,
            time: "Just now",
            languages: langs.length > 0 ? langs.slice(0, 3) : ["Unknown"],
          };

          // Add to state (prepend)
          setScans((prev) => [newScan, ...prev.filter((s) => s.username !== username)]);
          setScanInput("");
          setScanProgress("");

          // Persist to Supabase / localStorage
          try {
            await saveCandidate(result as AnalysisResult, username);
          } catch (persistErr) {
            console.warn("[dashboard] Could not persist:", persistErr);
          }

          // Update scan counter
          try {
            const current = parseInt(localStorage.getItem("devxray_scans_used") || "0", 10);
            localStorage.setItem("devxray_scans_used", String(current + 1));
          } catch {}
        } catch (err: any) {
          setScanError(err.message || "Analysis failed. Check if backend is running.");
          setScanProgress("");
        } finally {
          setScanning(false);
        }
      });
    },
    [scanInput, scans, checkAndScan]
  );

  // ── Derived stats ──
  const totalScans = scans.length;
  const avgScore = totalScans > 0 ? Math.round(scans.reduce((s, c) => s + c.score, 0) / totalScans) : 0;
  const strongHires = scans.filter((s) => s.recommendation === "Strong Hire" || s.recommendation === "Likely Hire").length;
  const highRisk = scans.filter((s) => s.risk === "High").length;

  const STATS = [
    { label: "Total Scans", value: String(totalScans), delta: "all time", color: "#cdff00", icon: "⬡" },
    { label: "Avg Score", value: totalScans > 0 ? String(avgScore) : "—", delta: totalScans > 0 ? `across ${totalScans} scans` : "No scans yet", color: "#a78bfa", icon: "◈" },
    { label: "Strong Hires", value: String(strongHires), delta: `from ${totalScans} analyzed`, color: "#34d399", icon: "◆" },
    { label: "High Risk", value: String(highRisk), delta: highRisk > 0 ? "flagged for review" : "none detected", color: "#fb7185", icon: "◑" },
  ];

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } },
  };

  return (
    <div className="min-h-screen p-6 md:p-8" style={{ fontFamily: "var(--font-dm-sans)" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[#444] text-xs mb-1" style={{ fontFamily: "var(--font-space)" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-syne)" }}>
            Welcome back, <span style={{ color: "#cdff00" }}>{userName}</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Scan counter badges */}
          {gateProfile && (
            <div className="hidden md:flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03]">
                <span className="text-[#cdff00]">⚡</span>
                <span className="text-[#888] text-[10px]">
                  {Math.max(0, (PLANS[gateProfile.plan]?.github_scans ?? 2) - gateProfile.github_scans_used)} GitHub left
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03]">
                <span className="text-violet-400">📄</span>
                <span className="text-[#888] text-[10px]">
                  {Math.max(0, (PLANS[gateProfile.plan]?.resume_scans ?? 2) - gateProfile.resume_scans_used)} resume left
                </span>
              </div>
              {gateProfile.plan === "free" && (
                <Link href="/pricing"
                  className="px-3 py-1.5 rounded-full bg-[#cdff00] text-black text-xs font-black hover:bg-[#b8e600] transition-all no-underline">
                  Upgrade ↑
                </Link>
              )}
            </div>
          )}
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className={`w-2 h-2 rounded-full ${backendOnline === null ? "bg-[#fbbf24] animate-pulse" : backendOnline ? "bg-[#34d399]" : "bg-[#fb7185]"}`} />
            <span className="text-[10px] text-[#555]">
              {backendOnline === null ? "Checking..." : backendOnline ? "Backend Online" : "Backend Offline"}
            </span>
          </div>
          <Link
            href="/bulk-upload"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-[#050505] no-underline hover:opacity-90 transition-all"
            style={{ background: "#cdff00" }}
          >
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12l7-7 7 7" />
            </svg>
            Bulk Upload
          </Link>
        </div>
      </motion.div>

      {/* ── Plan usage stats ── */}
      {gateProfile && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl border p-4" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
            <div className="text-[#555] text-xs mb-1">GitHub Scans Used</div>
            <div className="text-2xl font-black text-white" style={{ fontFamily: "var(--font-syne)" }}>
              {gateProfile.github_scans_used}
              <span className="text-[#555] text-sm font-normal">/{PLANS[gateProfile.plan]?.github_scans === Infinity ? "∞" : PLANS[gateProfile.plan]?.github_scans ?? 2}</span>
            </div>
            <div className="mt-2 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="h-full rounded-full bg-[#cdff00] transition-all duration-700" style={{
                width: `${Math.min(100, (gateProfile.github_scans_used / ((PLANS[gateProfile.plan]?.github_scans as number) || 2)) * 100)}%`
              }} />
            </div>
          </div>
          <div className="rounded-xl border p-4" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
            <div className="text-[#555] text-xs mb-1">Resume Scans Used</div>
            <div className="text-2xl font-black text-white" style={{ fontFamily: "var(--font-syne)" }}>
              {gateProfile.resume_scans_used}
              <span className="text-[#555] text-sm font-normal">/{PLANS[gateProfile.plan]?.resume_scans === Infinity ? "∞" : PLANS[gateProfile.plan]?.resume_scans ?? 2}</span>
            </div>
            <div className="mt-2 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="h-full rounded-full bg-violet-400 transition-all duration-700" style={{
                width: `${Math.min(100, (gateProfile.resume_scans_used / ((PLANS[gateProfile.plan]?.resume_scans as number) || 2)) * 100)}%`
              }} />
            </div>
          </div>
          <div className="rounded-xl border p-4" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
            <div className="text-[#555] text-xs mb-1">Current Plan</div>
            <div className="text-2xl font-black text-white capitalize" style={{ fontFamily: "var(--font-syne)" }}>{gateProfile.plan}</div>
            {gateProfile.plan === "free" && (
              <Link href="/pricing" className="mt-2 inline-block text-xs text-[#cdff00] hover:underline no-underline">
                Upgrade for more scans →
              </Link>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Upgrade nudge banner ── */}
      {gateProfile && gateProfile.plan === "free" && (
        gateProfile.github_scans_used >= 1 || gateProfile.resume_scans_used >= 1
      ) && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-amber-400">⚡</span>
            <span className="text-sm text-[#aaa]">
              You have <strong className="text-white">{2 - gateProfile.github_scans_used} GitHub</strong> and <strong className="text-white">{2 - gateProfile.resume_scans_used} resume</strong> scans remaining on your free plan.
            </span>
          </div>
          <Link href="/pricing" className="shrink-0 px-4 py-2 rounded-lg bg-[#cdff00] text-black text-xs font-black hover:bg-[#b8e600] transition-all no-underline">
            Upgrade Now
          </Link>
        </div>
      )}

      {/* Quick scan */}
      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onSubmit={handleQuickScan}
        className="rounded-2xl p-5 border mb-6"
        style={{ background: "rgba(205,255,0,0.03)", borderColor: "rgba(205,255,0,0.12)" }}
      >
        <div className="flex items-center gap-3">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#cdff00" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            placeholder="Enter GitHub username to analyze (e.g. torvalds, gaearon)..."
            disabled={scanning}
            className="flex-1 bg-transparent text-white text-sm placeholder-[#555] outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={scanning || !scanInput.trim()}
            className="px-5 py-2 rounded-xl text-sm font-bold text-[#050505] transition-all hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            style={{ background: "#cdff00" }}
          >
            {scanning ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing...
              </>
            ) : (
              "Scan Now"
            )}
          </button>
        </div>
        {scanProgress && (
          <div className="mt-3 flex items-center gap-2">
            <svg className="animate-spin w-3 h-3 text-[#cdff00]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-[12px] text-[#cdff00]">{scanProgress}</span>
          </div>
        )}
        {scanError && <p className="mt-3 text-[12px] text-[#fb7185]">{scanError}</p>}
      </motion.form>

      {/* Stats row */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STATS.map((stat) => (
          <motion.div
            key={stat.label}
            variants={fadeUp}
            className="rounded-2xl p-5 border group hover:border-white/12 transition-all duration-300"
            style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#555]">{stat.label}</span>
              <span className="text-base" style={{ color: stat.color }}>{stat.icon}</span>
            </div>
            <p className="text-3xl font-black text-white mb-1" style={{ fontFamily: "var(--font-syne)" }}>
              {stat.value}
            </p>
            <p className="text-[11px]" style={{ color: stat.color }}>{stat.delta}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Left column */}
        <div className="space-y-5">
          {/* Recent scans */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border overflow-hidden"
            style={{ background: "rgba(255,255,255,0.01)", borderColor: "rgba(255,255,255,0.06)" }}
          >
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <h3 className="text-sm font-bold text-white">
                {loading ? "Loading Scans..." : scans.length > 0 ? `Recent Scans (${scans.length})` : "Recent Scans"}
              </h3>
              {scans.length > 0 && (
                <Link href="/candidates" className="text-[11px] text-[#cdff00] hover:underline no-underline font-medium">
                  View all →
                </Link>
              )}
            </div>

            {/* Loading state */}
            {loading && (
              <div className="px-5 py-10 text-center">
                <svg className="animate-spin w-6 h-6 text-[#cdff00] mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-[#555]">Loading scan history...</p>
              </div>
            )}

            {/* Empty state */}
            {!loading && scans.length === 0 && (
              <div className="px-5 py-10 text-center">
                <div
                  className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                  style={{ background: "rgba(205,255,0,0.06)", border: "1px solid rgba(205,255,0,0.15)" }}
                >
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#cdff00" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-sm text-[#555]">No scans yet — enter a GitHub username above</p>
                <p className="text-[11px] text-[#333] mt-1">The backend will run a full forensic analysis in 30-60 seconds</p>
              </div>
            )}

            {/* Scan list */}
            {!loading && scans.length > 0 && (
              <div>
                <AnimatePresence>
                  {scans.slice(0, 8).map((c, i) => {
                    const tierColor = TIER_COLORS[c.tier] || "#cdff00";
                    const recColor = REC_COLORS[c.recommendation] || "#888";
                    return (
                      <motion.div
                        key={`${c.username}-${i}`}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="border-b transition-colors"
                        style={{ borderColor: "rgba(255,255,255,0.03)" }}
                      >
                        <Link href={`/report/${c.username}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] no-underline">
                          {c.avatar ? (
                            <img src={c.avatar} alt={c.name} className="w-9 h-9 rounded-full border border-white/10 shrink-0 object-cover" />
                          ) : (
                            <div
                              className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center font-bold text-[#050505] text-[12px]"
                              style={{ background: tierColor }}
                            >
                              {(c.name || "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-white truncate">{c.name || c.username}</p>
                            <p className="text-[11px] text-[#444]">
                              @{c.username} · {c.time}
                              {c.languages.length > 0 && c.languages[0] !== "Unknown" && (
                                <span className="ml-2 text-[#333]">{c.languages.slice(0, 2).join(", ")}</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col items-end">
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full mb-0.5"
                                style={{ background: `${tierColor}18`, color: tierColor }}
                              >
                                {c.tier}
                              </span>
                              <span className="text-[10px] font-medium hidden md:block" style={{ color: recColor }}>
                                {c.recommendation}
                              </span>
                            </div>
                            <span className="text-xl font-black" style={{ color: tierColor, fontFamily: "var(--font-syne)" }}>
                              {c.score}
                            </span>
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#666" strokeWidth="2" className="ml-1">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Quick actions */}
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl p-5 border"
            style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
          >
            <h3 className="text-sm font-bold text-white mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map((qa) => (
                <Link
                  key={qa.href}
                  href={qa.href}
                  className="rounded-xl p-3.5 border no-underline group hover:border-white/12 transition-all duration-200"
                  style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5 text-sm font-black"
                    style={{ background: `${qa.color}16`, color: qa.color, border: `1px solid ${qa.color}25` }}
                  >
                    {qa.icon}
                  </div>
                  <p className="text-[12px] font-bold text-white">{qa.label}</p>
                  <p className="text-[10px] text-[#444] mt-0.5">{qa.sub}</p>
                </Link>
              ))}
            </div>
          </motion.div>

          {/* Plan usage */}
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 }}
            className="rounded-2xl p-5 border"
            style={{ background: "rgba(205,255,0,0.03)", borderColor: "rgba(205,255,0,0.12)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Plan Usage</h3>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-[#050505] uppercase" style={{ background: "#cdff00" }}>
                {gateProfile?.plan ?? "FREE"}
              </span>
            </div>
            {[
              { label: "GitHub Scans", used: gateProfile?.github_scans_used ?? 0, max: (PLANS[gateProfile?.plan ?? "free"]?.github_scans as number) ?? 2, color: "#cdff00" },
              { label: "Resume Scans", used: gateProfile?.resume_scans_used ?? 0, max: (PLANS[gateProfile?.plan ?? "free"]?.resume_scans as number) ?? 2, color: "#a78bfa" },
              { label: "Total Analyzed", used: totalScans, max: Math.max(totalScans, 10), color: "#34d399" },
            ].map((item) => (
              <div key={item.label} className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-[#666]">{item.label}</span>
                  <span className="text-[11px] font-bold text-white">
                    {item.used}/{item.max === Infinity ? "∞" : item.max}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min((item.used / (item.max === Infinity ? 999 : item.max)) * 100, 100)}%`,
                      background: item.used / (item.max === Infinity ? 999 : item.max) > 0.8 ? "#fb7185" : item.color,
                    }}
                  />
                </div>
              </div>
            ))}
            <Link
              href="/pricing"
              className="mt-2 block text-center text-[11px] no-underline font-semibold py-2 rounded-xl transition-all hover:bg-[#cdff00]/10"
              style={{ color: "#cdff00", border: "1px solid rgba(205,255,0,0.15)" }}
            >
              {gateProfile?.plan === "free" ? "Upgrade Plan →" : "Manage Plan →"}
            </Link>
          </motion.div>

          {/* Activity feed */}
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border overflow-hidden"
            style={{ background: "rgba(255,255,255,0.01)", borderColor: "rgba(255,255,255,0.06)" }}
          >
            <div className="px-4 py-3.5 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <h3 className="text-sm font-bold text-white">Activity Feed</h3>
            </div>
            <div>
              {scans.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12px] text-[#333]">Activity will appear as you scan profiles</div>
              ) : (
                scans.slice(0, 6).map((s, i) => {
                  const tierColor = TIER_COLORS[s.tier] || "#cdff00";
                  return (
                    <div
                      key={`act-${s.username}-${i}`}
                      className="flex items-start gap-3 px-4 py-3 border-b hover:bg-white/[0.01] transition-colors"
                      style={{ borderColor: "rgba(255,255,255,0.03)" }}
                    >
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[8px] font-black shrink-0 mt-0.5"
                        style={{ background: `${tierColor}18`, color: tierColor }}
                      >
                        GH
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-[#888] leading-relaxed">
                          Analysis complete:{" "}
                          <strong className="text-white">@{s.username}</strong> scored{" "}
                          <strong style={{ color: tierColor }}>{s.score}</strong> ({s.tier}) — {s.recommendation}
                        </p>
                        <p className="text-[10px] text-[#444] mt-0.5">{s.time}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      </div>
      {/* ── Paywall Modal ── */}
      {showPaywall && gateProfile && (
        <PaywallModal
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          userId={gateProfile.id}
          userEmail={gateProfile.email}
          userName={gateProfile.full_name}
          trigger={paywallTrigger}
        />
      )}
    </div>
  );
}
