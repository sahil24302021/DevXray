"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useState, useCallback, useEffect, useRef } from "react";
import { analyzeGitHub, extractScoring, scoreToTier, scoreToRisk, scoreToRecommendation, healthCheck, AnalysisResult } from "@/lib/api";
import { saveCandidate } from "@/lib/candidates-store";

// ── Types ──
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
  "S-Tier": "#34d399", "A-Tier": "#cdff00", "B-Tier": "#fbbf24", "C-Tier": "#fb923c", "D-Tier": "#fb7185",
};

const REC_COLORS: Record<string, string> = {
  "Strong Hire": "#34d399", "Likely Hire": "#cdff00", "Conditional": "#fbbf24", "Not Recommended": "#fb7185",
};

// ── Weekly chart ──
function MiniBarChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1.5 h-12">
      {data.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm transition-all duration-700 cursor-pointer hover:opacity-80"
          style={{ height: `${(v / max) * 100}%`, background: i === data.length - 1 ? "#cdff00" : "rgba(205,255,0,0.25)" }} />
      ))}
    </div>
  );
}

const QUICK_ACTIONS = [
  { href: "/bulk-upload", label: "Bulk Upload", sub: "Up to 100 PDFs", color: "#cdff00", icon: "\u2191" },
  { href: "/compare", label: "Compare", sub: "Side-by-side analysis", color: "#a78bfa", icon: "\u21C4" },
  { href: "/candidates", label: "All Candidates", sub: "Browse & filter", color: "#34d399", icon: "\u229E" },
  { href: "/how-we-score", label: "How We Score", sub: "Scoring methodology", color: "#60a5fa", icon: "\u25C9" },
];

export default function DashboardPage() {
  const [scanInput, setScanInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [scanError, setScanError] = useState("");
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const scansRef = useRef<ScanResult[]>([]);

  // Check backend health on mount and fetch history
  useEffect(() => {
    healthCheck().then(setBackendOnline);

    import("@/lib/candidates-store").then(({ listCandidates }) => {
      listCandidates().then((records) => {
        const history: ScanResult[] = records.map(r => ({
          username: r.username,
          name: r.name || r.username,
          avatar: r.avatar_url || "",
          score: r.final_score,
          tier: (r.developer_tier as string) || scoreToTier(r.final_score),
          recommendation: (r.hiring_recommendation as string) || scoreToRecommendation(r.final_score),
          risk: (r.risk_level as string) || scoreToRisk(r.final_score),
          time: new Date(r.scanned_at || Date.now()).toLocaleDateString(),
          languages: (r.top_languages as string[]) || [],
        }));
        setScans(history);
      });
    });
  }, []);

  // Keep ref in sync
  useEffect(() => { scansRef.current = scans; }, [scans]);

  const handleQuickScan = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let username = scanInput.trim();
    if (!username) return;

    // Handle full URLs gracefully
    if (username.includes("github.com/")) {
      username = username.split("github.com/").pop()?.split("/")[0] || username;
    }

    setScanning(true);
    setScanError("");
    setScanProgress("Connecting to analysis engine...");

    try {
      // SSE progress
      const jobId = `dash-${Date.now()}`;
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const es = new EventSource(`${API_BASE}/api/progress/${jobId}`);
      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.step) setScanProgress(data.step);
          if (data.done) es.close();
        } catch {}
      };
      es.onerror = () => es.close();

      const result = await analyzeGitHub(username, jobId);
      es.close();

      const scoring = extractScoring(result);
      const profile = (result.basic_info || {}) as Record<string, unknown>;
      const skills = (result.skills || {}) as Record<string, unknown>;
      const langs = ((skills.languages || []) as Array<Record<string, unknown>>).map(l => String(l.name || "")).filter(Boolean).slice(0, 3);

      const newScan: ScanResult = {
        username,
        name: String(profile.name || profile.login || username),
        avatar: String(profile.avatar_url || ""),
        score: scoring.finalScore,
        tier: String(result.developer_tier || scoreToTier(scoring.finalScore)),
        recommendation: String(result.hiring_recommendation || scoreToRecommendation(scoring.finalScore)),
        risk: String(result.risk_assessment || scoreToRisk(scoring.finalScore)),
        time: "Just now",
        languages: langs.length > 0 ? langs : [String(skills.primary_language || "Unknown")],
      };

      setScans(prev => [newScan, ...prev]);
      setScanInput("");
      setScanProgress("");

      // Persist to candidates store (Supabase or localStorage fallback)
      try {
        await saveCandidate(result as unknown as AnalysisResult, username);
      } catch (persistErr) {
        console.warn("[dashboard] Could not persist candidate:", persistErr);
      }

      // Increment scan counter for sidebar tracking
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
  }, [scanInput]);

  const totalScans = scans.length;
  const avgScore = totalScans > 0 ? Math.round(scans.reduce((s, c) => s + c.score, 0) / totalScans) : 0;
  const strongHires = scans.filter(s => String(s.recommendation).includes("Strong")).length;
  const highRisk = scans.filter(s => s.risk === "High").length;
  const weekData = totalScans > 0 ? [2, 5, 3, 6, 4, 7, totalScans] : [0, 0, 0, 0, 0, 0, 0];

  const STATS = [
    { label: "Total Scans", value: String(totalScans), delta: "this session", color: "#cdff00", icon: "\u2B21" },
    { label: "Avg Score", value: totalScans > 0 ? String(avgScore) : "\u2014", delta: totalScans > 0 ? `across ${totalScans} scans` : "No scans yet", color: "#a78bfa", icon: "\u25C8" },
    { label: "Strong Hires", value: String(strongHires), delta: `from ${totalScans} analyzed`, color: "#34d399", icon: "\u25C6" },
    { label: "High Risk", value: String(highRisk), delta: highRisk > 0 ? "flagged for review" : "none detected", color: "#fb7185", icon: "\u25D1" },
  ];

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
  const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } } };

  return (
    <div className="min-h-screen p-6 md:p-8" style={{ fontFamily: "var(--font-dm-sans)" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[#444] text-xs mb-1" style={{ fontFamily: "var(--font-space)" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-syne)" }}>
            Welcome back, <span style={{ color: "#cdff00" }}>Sahil</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Backend status */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className={`w-2 h-2 rounded-full ${backendOnline === null ? "bg-[#fbbf24] animate-pulse" : backendOnline ? "bg-[#34d399]" : "bg-[#fb7185]"}`} />
            <span className="text-[10px] text-[#555]">{backendOnline === null ? "Checking..." : backendOnline ? "Backend Online" : "Backend Offline"}</span>
          </div>
          <Link href="/bulk-upload"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-[#050505] no-underline hover:opacity-90 transition-all"
            style={{ background: "#cdff00" }}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12l7-7 7 7" />
            </svg>
            Bulk Upload
          </Link>
        </div>
      </motion.div>

      {/* Quick scan */}
      <motion.form initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        onSubmit={handleQuickScan}
        className="rounded-2xl p-5 border mb-6"
        style={{ background: "rgba(205,255,0,0.03)", borderColor: "rgba(205,255,0,0.12)" }}>
        <div className="flex items-center gap-3">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#cdff00" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input type="text" value={scanInput} onChange={e => setScanInput(e.target.value)}
            placeholder="Enter GitHub username to analyze (e.g. torvalds, gaearon)..."
            disabled={scanning}
            className="flex-1 bg-transparent text-white text-sm placeholder-[#555] outline-none disabled:opacity-50"
          />
          <button type="submit" disabled={scanning || !scanInput.trim()}
            className="px-5 py-2 rounded-xl text-sm font-bold text-[#050505] transition-all hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            style={{ background: "#cdff00" }}>
            {scanning ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing...
              </>
            ) : "Scan Now"}
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
        {STATS.map(stat => (
          <motion.div key={stat.label} variants={fadeUp}
            className="rounded-2xl p-5 border group hover:border-white/12 transition-all duration-300"
            style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#555]">{stat.label}</span>
              <span className="text-base" style={{ color: stat.color }}>{stat.icon}</span>
            </div>
            <p className="text-3xl font-black text-white mb-1" style={{ fontFamily: "var(--font-syne)" }}>{stat.value}</p>
            <p className="text-[11px]" style={{ color: stat.color }}>{stat.delta}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Left column */}
        <div className="space-y-5">
          {/* Weekly chart */}
          {totalScans > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="rounded-2xl p-5 border"
              style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
              <h3 className="text-sm font-bold text-white mb-4">Scans This Session</h3>
              <MiniBarChart data={weekData} />
            </motion.div>
          )}

          {/* Recent scans (real data) */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="rounded-2xl border overflow-hidden"
            style={{ background: "rgba(255,255,255,0.01)", borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="px-5 py-4 border-b flex items-center justify-between"
              style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <h3 className="text-sm font-bold text-white">
                {scans.length > 0 ? `Recent Scans (${scans.length})` : "Recent Scans"}
              </h3>
              {scans.length > 0 && (
                <Link href="/candidates" className="text-[11px] text-[#cdff00] hover:underline no-underline font-medium">View all &rarr;</Link>
              )}
            </div>
            {scans.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                  style={{ background: "rgba(205,255,0,0.06)", border: "1px solid rgba(205,255,0,0.15)" }}>
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#cdff00" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-sm text-[#555]">No scans yet — enter a GitHub username above</p>
                <p className="text-[11px] text-[#333] mt-1">The backend will run a full forensic analysis in 30-60 seconds</p>
              </div>
            ) : (
              <div>
                <AnimatePresence>
                  {scans.slice(0, 8).map((c, i) => (
                    <motion.div key={`${c.username}-${i}`}
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b transition-colors"
                      style={{ borderColor: "rgba(255,255,255,0.03)" }}>
                      <Link href={`/report/${c.username}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] no-underline">
                        {c.avatar ? (
                          <img src={c.avatar} alt={c.name} className="w-9 h-9 rounded-full border border-white/10 shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center font-bold text-[#050505] text-[12px]"
                            style={{ background: TIER_COLORS[c.tier] || "#cdff00" }}>
                            {c.name.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-white truncate">{c.name}</p>
                          <p className="text-[11px] text-[#444]">@{c.username} · {c.time}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mb-0.5"
                              style={{ background: `${TIER_COLORS[c.tier]}18`, color: TIER_COLORS[c.tier] }}>
                              {c.tier}
                            </span>
                            <span className="text-[10px] font-medium hidden md:block" style={{ color: REC_COLORS[c.recommendation] }}>
                              {c.recommendation}
                            </span>
                          </div>
                          <span className="text-xl font-black" style={{ color: TIER_COLORS[c.tier], fontFamily: "var(--font-syne)" }}>
                            {c.score}
                          </span>
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#666" strokeWidth="2" className="ml-1">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Quick actions */}
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
            className="rounded-2xl p-5 border"
            style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
            <h3 className="text-sm font-bold text-white mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map(qa => (
                <Link key={qa.href} href={qa.href}
                  className="rounded-xl p-3.5 border no-underline group hover:border-white/12 transition-all duration-200"
                  style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5 text-sm font-black"
                    style={{ background: `${qa.color}16`, color: qa.color, border: `1px solid ${qa.color}25` }}>
                    {qa.icon}
                  </div>
                  <p className="text-[12px] font-bold text-white">{qa.label}</p>
                  <p className="text-[10px] text-[#444] mt-0.5">{qa.sub}</p>
                </Link>
              ))}
            </div>
          </motion.div>

          {/* Plan usage */}
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}
            className="rounded-2xl p-5 border"
            style={{ background: "rgba(205,255,0,0.03)", borderColor: "rgba(205,255,0,0.12)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Plan Usage</h3>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-[#050505]" style={{ background: "#cdff00" }}>PRO</span>
            </div>
            {[
              { label: "Scans Used", used: totalScans, max: 100 },
              { label: "Bulk Uploads", used: 0, max: 10 },
              { label: "Team Seats", used: 1, max: 10 },
            ].map(item => (
              <div key={item.label} className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-[#666]">{item.label}</span>
                  <span className="text-[11px] font-bold text-white">{item.used}/{item.max}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min((item.used / item.max) * 100, 100)}%`, background: item.used / item.max > 0.8 ? "#fb7185" : "#cdff00" }} />
                </div>
              </div>
            ))}
            <Link href="/settings" className="mt-2 block text-center text-[11px] no-underline font-semibold py-2 rounded-xl transition-all hover:bg-[#cdff00]/10"
              style={{ color: "#cdff00", border: "1px solid rgba(205,255,0,0.15)" }}>
              Manage Plan &rarr;
            </Link>
          </motion.div>

          {/* Activity feed (real-time based on scans) */}
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="rounded-2xl border overflow-hidden"
            style={{ background: "rgba(255,255,255,0.01)", borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="px-4 py-3.5 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <h3 className="text-sm font-bold text-white">Activity Feed</h3>
            </div>
            <div>
              {scans.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12px] text-[#333]">
                  Activity will appear as you scan profiles
                </div>
              ) : (
                scans.slice(0, 6).map((s, i) => (
                  <div key={`act-${i}`} className="flex items-start gap-3 px-4 py-3 border-b hover:bg-white/[0.01] transition-colors"
                    style={{ borderColor: "rgba(255,255,255,0.03)" }}>
                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-[8px] font-black shrink-0 mt-0.5"
                      style={{ background: `${TIER_COLORS[s.tier]}18`, color: TIER_COLORS[s.tier] }}>
                      GH
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-[#888] leading-relaxed">
                        Analysis complete: <strong className="text-white">@{s.username}</strong> scored <strong style={{ color: TIER_COLORS[s.tier] }}>{s.score}</strong> ({s.tier}) — {s.recommendation}
                      </p>
                      <p className="text-[10px] text-[#444] mt-0.5">{s.time}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
