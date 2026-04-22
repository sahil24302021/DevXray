"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useRef } from "react";
import { analyzeGitHub, analyzeResume, extractScoring, scoreToTier, scoreToRisk, normalizeTier, getHiringRecommendationSummary, type AnalysisResult } from "@/lib/api";

// ── Types ──
interface DevProfile {
  username: string;
  name: string;
  avatar: string;
  score: number;
  tier: string;
  recommendation: string;
  risk: string;
  languages: string[];
  dims: { codeQuality: number; skillDepth: number; authenticity: number; consistency: number; growth: number; truthScore: number };
  strengths: string[];
  concerns: string[];
  years: number;
  source: "github" | "resume";
}

// ── Colors ──
const TIER_COLORS: Record<string, string> = { "S-Tier": "#34d399", "A-Tier": "#cdff00", "B-Tier": "#fbbf24", "C-Tier": "#fb923c", "D-Tier": "#fb7185" };
const RISK_COLORS: Record<string, string> = { "Low": "#34d399", "Medium": "#fbbf24", "High": "#fb7185" };
const DIM_LABELS: [keyof DevProfile["dims"], string][] = [
  ["codeQuality", "Code Quality"], ["skillDepth", "Skill Depth"], ["authenticity", "Authenticity"],
  ["consistency", "Consistency"], ["growth", "Growth"], ["truthScore", "Truth Score"],
];

// ── Radar Chart ──
function RadarChart({ dims, color = "#cdff00" }: { dims: DevProfile["dims"]; color?: string }) {
  const keys = Object.keys(dims) as (keyof typeof dims)[];
  const n = keys.length;
  const cx = 120, cy = 120, r = 90;
  const angles = keys.map((_, i) => (i * 2 * Math.PI) / n - Math.PI / 2);
  const toXY = (angle: number, radius: number) => [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  const dataPath = keys.map((k, i) => { const v = (dims[k] / 100) * r; const [x, y] = toXY(angles[i], v); return `${i === 0 ? "M" : "L"} ${x} ${y}`; }).join(" ") + " Z";

  return (
    <svg viewBox="0 0 240 240" className="w-full max-w-[220px] mx-auto">
      {[0.2, 0.4, 0.6, 0.8, 1.0].map(level => {
        const pts = angles.map(a => toXY(a, level * r).join(",")).join(" ");
        return <polygon key={level} points={pts} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
      })}
      {angles.map((a, i) => { const [x, y] = toXY(a, r); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />; })}
      <path d={dataPath} fill={`${color}20`} stroke={color} strokeWidth="1.5" />
      {keys.map((k, i) => { const v = (dims[k] / 100) * r; const [x, y] = toXY(angles[i], v); return <circle key={k} cx={x} cy={y} r="4" fill={color} stroke="#050505" strokeWidth="1.5" />; })}
      {keys.map((k, i) => {
        const [x, y] = toXY(angles[i], r + 16);
        return <text key={`lbl-${k}`} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="#555" fontSize="8" fontWeight="600">{DIM_LABELS[i]?.[1]}</text>;
      })}
    </svg>
  );
}

// ── Score Ring ──
function ScoreRing({ score, color, size = 80 }: { score: number; color: string; size?: number }) {
  const r = (size / 2) - 4;
  const circum = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${(score / 100) * circum} ${circum}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-white" style={{ fontFamily: "var(--font-syne)" }}>{score}</span>
        <span className="text-[9px] text-[#555]">/100</span>
      </div>
    </div>
  );
}

// ── Parse backend result → DevProfile ──
function parseGitHubResult(result: AnalysisResult, username: string): DevProfile {
  const scoring = extractScoring(result);

  // BUG 10 FIX: Backend puts created_at at TOP LEVEL, not inside basic_info
  const created = String(
    result.created_at ||
    (result.basic_info as any)?.created_at ||
    ""
  );
  const accountYears = created
    ? Math.max(1, Math.round((Date.now() - new Date(created).getTime()) / (365.25 * 86400000)))
    : 0;

  // BUG 3 FIX: result.skills is an ARRAY of skill objects (not a dict with .languages)
  // Real language data is in result.top_languages (array of skill name strings)
  const topLangs = (result.top_languages || []) as string[];
  const skillsArr = (Array.isArray(result.skills) ? result.skills : []) as Array<Record<string, unknown>>;
  const skillLangs = skillsArr
    .filter(s => ["frontend", "backend", "ml", "mobile", "language"].includes(String(s.category || "")))
    .map(s => String(s.skill_name || ""))
    .filter(Boolean);
  const langs = skillLangs.length > 0
    ? skillLangs.slice(0, 5)
    : topLangs.slice(0, 5);

  // BUG 4 FIX: Use backend-computed strengths/weaknesses (much more accurate)
  const strengths: string[] = [...((result.strengths || []) as string[])];
  const concerns: string[] = [...((result.weaknesses || []) as string[])];

  // Only fall back to pinned_code_reviews if backend didn't provide strengths
  if (strengths.length === 0) {
    const reviews = (result.pinned_code_reviews || []) as Array<Record<string, unknown>>;
    reviews.forEach(r => {
      ((r.strengths || []) as string[]).slice(0, 2).forEach(s => strengths.push(s));
    });
  }
  if (concerns.length === 0) {
    const reviews = (result.pinned_code_reviews || []) as Array<Record<string, unknown>>;
    reviews.forEach(r => {
      ((r.concerns || []) as string[]).slice(0, 2).forEach(c => concerns.push(c));
    });
  }
  if (strengths.length === 0) strengths.push("Profile analyzed successfully");
  if (concerns.length === 0) concerns.push("No major concerns identified");

  // Profile name/avatar — backend emits at top level
  const displayName = String(result.name || (result.basic_info as any)?.name || username);
  const avatarUrl = String(result.avatar_url || (result.basic_info as any)?.avatar_url || "");

  return {
    username,
    name: displayName,
    avatar: avatarUrl,
    score: scoring.finalScore,
    // BUG 5 FIX: normalizeTier converts "Senior" → "A-Tier" etc.
    tier: normalizeTier(String(result.developer_tier || scoreToTier(scoring.finalScore))),
    // BUG 1 FIX: safely extract readable string from possibly-dict hiring_recommendation
    recommendation: getHiringRecommendationSummary(result),
    // BUG 7 FIX: use risk_level (what backend actually emits) with risk_assessment as fallback
    risk: String(result.risk_level || result.risk_assessment || scoreToRisk(scoring.finalScore)),
    languages: langs.length > 0 ? langs : ["Unknown"],
    dims: {
      codeQuality: scoring.codeQuality,
      skillDepth: scoring.skillDepth,
      authenticity: scoring.authenticity,
      consistency: scoring.consistency,
      growth: scoring.growth,
      truthScore: scoring.truthScore,
    },
    strengths,
    concerns,
    years: accountYears,
    source: "github",
  };
}

function parseResumeResult(result: AnalysisResult): DevProfile {
  const ghReport = (result.github_report || result) as AnalysisResult;
  const resumeData = (result.resume_data || {}) as Record<string, unknown>;
  const scoring = extractScoring(ghReport);
  const candidateName = String(resumeData.name || resumeData.github_username || "Resume Candidate");
  const ghUsername = String(resumeData.github_username || "");

  // BUG 3 FIX: Use top_languages from backend; fall back to resume technical_skills
  const topLangs = (ghReport.top_languages || []) as string[];
  const skillsArr = (Array.isArray(ghReport.skills) ? ghReport.skills : []) as Array<Record<string, unknown>>;
  const skillLangs = skillsArr
    .filter(s => ["frontend", "backend", "ml", "mobile", "language"].includes(String(s.category || "")))
    .map(s => String(s.skill_name || ""))
    .filter(Boolean);
  const techSkills = resumeData.technical_skills as Record<string, unknown> | undefined;
  const resumeLangs = techSkills ? Object.values(techSkills).flat().filter(Boolean).slice(0, 5).map(String) : [];
  const finalLangs =
    skillLangs.length > 0 ? skillLangs.slice(0, 5) :
    topLangs.length > 0 ? topLangs.slice(0, 5) :
    resumeLangs.length > 0 ? resumeLangs :
    ["Unknown"];

  const yrsExp = Number(resumeData.years_of_experience || 0);

  // BUG 4 FIX: Use backend-computed strengths/weaknesses
  const strengths: string[] = [...((ghReport.strengths || []) as string[])];
  const concerns: string[] = [...((ghReport.weaknesses || []) as string[])];
  if (strengths.length === 0) {
    const reviews = (ghReport.pinned_code_reviews || []) as Array<Record<string, unknown>>;
    reviews.forEach(r => {
      ((r.strengths || []) as string[]).slice(0, 2).forEach(s => strengths.push(s));
    });
  }
  if (concerns.length === 0) {
    const reviews = (ghReport.pinned_code_reviews || []) as Array<Record<string, unknown>>;
    reviews.forEach(r => {
      ((r.concerns || []) as string[]).slice(0, 2).forEach(c => concerns.push(c));
    });
  }
  if (strengths.length === 0) strengths.push("Resume analyzed with backend");
  if (concerns.length === 0) concerns.push("No major concerns identified");

  return {
    username: ghUsername || candidateName.toLowerCase().replace(/\s+/g, "-"),
    name: candidateName,
    avatar: "",
    score: scoring.finalScore,
    // BUG 5 FIX: normalizeTier
    tier: normalizeTier(String(ghReport.developer_tier || scoreToTier(scoring.finalScore))),
    // BUG 1 FIX: safe recommendation string
    recommendation: getHiringRecommendationSummary(ghReport),
    risk: String(ghReport.risk_level || ghReport.risk_assessment || scoreToRisk(scoring.finalScore)),
    languages: finalLangs,
    dims: {
      codeQuality: scoring.codeQuality,
      skillDepth: scoring.skillDepth,
      authenticity: scoring.authenticity,
      consistency: scoring.consistency,
      growth: scoring.growth,
      truthScore: scoring.truthScore,
    },
    strengths,
    concerns,
    years: yrsExp,
    source: "resume",
  };
}

// ═══ CANDIDATE INPUT PANEL ═══
function CandidateInput({
  label, side, dev, loading, error, progress,
  onAnalyzeGitHub, onAnalyzeResume,
}: {
  label: string; side: string; dev: DevProfile | null; loading: boolean; error: string; progress: string;
  onAnalyzeGitHub: (username: string) => void;
  onAnalyzeResume: (file: File, linkedinText?: string) => void;
}) {
  const [ghInput, setGhInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [liText, setLiText] = useState("");
  const [showLi, setShowLi] = useState(false);
  const accentColor = side === "A" ? "#cdff00" : "#a78bfa";

  return (
    <div className="rounded-2xl p-5 border space-y-4" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black text-[#050505]"
          style={{ background: accentColor }}>{side}</div>
        <span className="text-[11px] font-bold text-[#555] uppercase tracking-wider">{label}</span>
        {dev && (
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${TIER_COLORS[dev.tier]}18`, color: TIER_COLORS[dev.tier] }}>
            {dev.score} - {dev.tier}
          </span>
        )}
      </div>

      {/* GitHub analysis */}
      <div>
        <label className="block text-[9px] text-[#444] uppercase tracking-wider mb-1.5 font-semibold">GitHub Username</label>
        <div className="flex gap-2">
          <input type="text" value={ghInput} onChange={e => setGhInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && onAnalyzeGitHub(ghInput)}
            placeholder="e.g. torvalds"
            className="flex-1 rounded-lg px-3 py-2 text-sm text-white placeholder-[#333] border outline-none transition-all focus:border-[rgba(205,255,0,0.4)]"
            style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
          />
          <button onClick={() => onAnalyzeGitHub(ghInput)} disabled={loading || !ghInput.trim()}
            className="px-3 py-2 rounded-lg text-[11px] font-bold text-[#050505] shrink-0 transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: accentColor }}>
            {loading ? "..." : "Analyze"}
          </button>
        </div>
      </div>

      {/* Resume upload */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label className="block text-[9px] text-[#444] uppercase tracking-wider font-semibold">Or Upload Resume (PDF)</label>
          <button onClick={() => setShowLi(!showLi)} className="text-[9px] text-[#888] hover:text-white transition-colors">
            {showLi ? "- Hide LinkedIn Text" : "+ Paste LinkedIn Text (Beta)"}
          </button>
        </div>
        
        {showLi && (
          <textarea 
            value={liText} onChange={e => setLiText(e.target.value)}
            placeholder="Paste LinkedIn profile text here to improve AI truth verification accuracy if scraping is blocked..."
            className="w-full rounded-lg px-3 py-2 mb-2 text-[11px] text-white placeholder-[#444] border outline-none min-h-[60px] resize-y"
            style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
          />
        )}

        <input ref={fileRef} type="file" accept=".pdf" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) { setFileName(f.name); onAnalyzeResume(f, liText); }
          }} />
        <button onClick={() => fileRef.current?.click()} disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed text-[12px] font-medium transition-all hover:border-white/20 disabled:opacity-50"
          style={{ borderColor: `${accentColor}30`, color: accentColor, background: `${accentColor}08` }}>
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {fileName || "Choose PDF resume"}
        </button>
      </div>

      {/* Status */}
      {progress && (
        <div className="flex items-center gap-2">
          <svg className="animate-spin w-3 h-3" style={{ color: accentColor }} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-[11px] animate-pulse" style={{ color: accentColor }}>{progress}</span>
        </div>
      )}
      {error && <p className="text-[11px] text-[#fb7185]">{error}</p>}
    </div>
  );
}

// ═══ MAIN COMPONENT ═══
export default function ComparePage() {
  const [devA, setDevA] = useState<DevProfile | null>(null);
  const [devB, setDevB] = useState<DevProfile | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [errorA, setErrorA] = useState("");
  const [errorB, setErrorB] = useState("");
  const [progressA, setProgressA] = useState("");
  const [progressB, setProgressB] = useState("");
  // BUG 8 FIX: Track active EventSource per side to prevent memory leaks on re-click
  const esRefA = useRef<EventSource | null>(null);
  const esRefB = useRef<EventSource | null>(null);

  const loadGitHub = useCallback(async (username: string, side: "A" | "B") => {
    let cleanUsername = username.trim();
    if (!cleanUsername) return;
    if (cleanUsername.includes("github.com/")) {
      cleanUsername = cleanUsername.split("github.com/").pop()?.split("/")[0] || cleanUsername;
    }
    const setLoading = side === "A" ? setLoadingA : setLoadingB;
    const setDev = side === "A" ? setDevA : setDevB;
    const setError = side === "A" ? setErrorA : setErrorB;
    const setProgress = side === "A" ? setProgressA : setProgressB;

    // BUG 8 FIX: Close any existing EventSource for this side before opening a new one
    const esRef = side === "A" ? esRefA : esRefB;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    setLoading(true); setError(""); setProgress("Connecting...");
    try {
      const jobId = `compare-${side}-${Date.now()}`;
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const es = new EventSource(`${API_BASE}/api/progress/${jobId}`);
      esRef.current = es;
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.step) setProgress(d.step);
          if (d.done) { es.close(); esRef.current = null; }
        } catch {}
      };
      es.onerror = () => { es.close(); esRef.current = null; };
      setProgress("Analyzing GitHub profile...");
      const result = await analyzeGitHub(cleanUsername, jobId);
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      setProgress("");
      setDev(parseGitHubResult(result, cleanUsername));
    } catch (err: unknown) {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      setError(err instanceof Error ? err.message : "Analysis failed");
      setProgress("");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadResume = useCallback(async (file: File, side: "A" | "B", linkedinText?: string) => {
    const setLoading = side === "A" ? setLoadingA : setLoadingB;
    const setDev = side === "A" ? setDevA : setDevB;
    const setError = side === "A" ? setErrorA : setErrorB;
    const setProgress = side === "A" ? setProgressA : setProgressB;
    setLoading(true); setError(""); setProgress("Parsing resume...");
    try {
      const result = await analyzeResume(file, { linkedinText });
      setProgress("");
      setDev(parseResumeResult(result));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Resume analysis failed"); setProgress("");
    } finally { setLoading(false); }
  }, []);

  const bothLoaded = devA && devB;
  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
  const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  return (
    <div className="min-h-screen p-4 pt-14 sm:p-6 md:p-8 lg:pt-8" style={{ fontFamily: "var(--font-dm-sans)" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1" style={{ fontFamily: "var(--font-syne)" }}>
          Candidate <span style={{ color: "#cdff00" }}>Comparison</span>
        </h1>
        <p className="text-[#555] text-xs sm:text-sm">Compare two candidates side-by-side using GitHub profiles or resume PDFs</p>
      </motion.div>

      {/* Candidate input panels */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <CandidateInput label="Candidate A" side="A" dev={devA} loading={loadingA} error={errorA} progress={progressA}
          onAnalyzeGitHub={(u) => loadGitHub(u, "A")} onAnalyzeResume={(f) => loadResume(f, "A")} />
        <CandidateInput label="Candidate B" side="B" dev={devB} loading={loadingB} error={errorB} progress={progressB}
          onAnalyzeGitHub={(u) => loadGitHub(u, "B")} onAnalyzeResume={(f) => loadResume(f, "B")} />
      </motion.div>

      {/* Loading state */}
      {(loadingA || loadingB) && !bothLoaded && (
        <div className="text-center py-12">
          <svg className="animate-spin w-8 h-8 text-[#cdff00] mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-[#555] text-sm">Running full intelligence analysis...</p>
          <p className="text-[10px] text-[#333] mt-1">This may take 30-60 seconds per candidate</p>
        </div>
      )}

      {/* Empty state */}
      {!bothLoaded && !loadingA && !loadingB && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "rgba(205,255,0,0.06)", border: "1px solid rgba(205,255,0,0.15)" }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#cdff00" strokeWidth="1.5">
              <path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M12 8v8M8 12h8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-white mb-2">
            {devA || devB ? "Load the other candidate to compare" : "Load two candidates to compare"}
          </h3>
          <p className="text-[#444] text-sm max-w-md mx-auto">
            Enter GitHub usernames or upload resume PDFs above. Each candidate is analyzed with the full backend pipeline: code quality, AI detection, consistency, growth, and truth verification.
          </p>
        </motion.div>
      )}

      {/* ═══ COMPARISON RESULTS ═══ */}
      {bothLoaded && (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">

          {/* Profile cards — A | VS | B */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-[1fr_80px_1fr] gap-4 items-start">
            <ProfileCard dev={devA!} side="left" />
            <div className="hidden md:flex flex-col items-center justify-center pt-12">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-[#050505] text-sm"
                style={{ background: "#cdff00" }}>VS</div>
            </div>
            <ProfileCard dev={devB!} side="right" />
          </motion.div>

          {/* Radar charts */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[devA!, devB!].map(dev => (
              <div key={dev.username} className="rounded-2xl p-6 border" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
                <h3 className="text-sm font-bold text-white mb-4 text-center">
                  {dev.source === "resume" ? dev.name : `@${dev.username}`} — Score Radar
                </h3>
                <RadarChart dims={dev.dims} color={TIER_COLORS[dev.tier] || "#cdff00"} />
              </div>
            ))}
          </motion.div>

          {/* Dimension breakdown bars */}
          <motion.div variants={fadeUp} className="rounded-2xl border overflow-hidden" style={{ background: "rgba(255,255,255,0.01)", borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <h3 className="text-sm font-bold text-white">Dimension Breakdown</h3>
            </div>
            <div>
              {DIM_LABELS.map(([key, label]) => {
                const av = devA!.dims[key]; const bv = devB!.dims[key];
                const winner = av > bv ? "A" : bv > av ? "B" : "tie";
                return (
                  <div key={key} className="flex flex-col sm:grid sm:grid-cols-[1fr_100px_1fr] gap-2 sm:gap-4 items-center px-4 sm:px-6 py-3 sm:py-3.5 border-b" style={{ borderColor: "rgba(255,255,255,0.03)" }}>
                    {/* Label on mobile shown first */}
                    <div className="sm:hidden text-center w-full">
                      <span className="text-[11px] text-[#555]">{label}</span>
                    </div>
                    <div className="flex items-center gap-3 w-full">
                      <div className="flex-1 h-2 rounded-full overflow-hidden bg-white/[0.04]">
                        <div className="h-full rounded-full transition-all duration-700 ml-auto"
                          style={{ width: `${av}%`, background: winner === "A" ? "#cdff00" : "#555" }} />
                      </div>
                      <span className={`text-sm font-bold w-8 text-right ${winner === "A" ? "text-[#cdff00]" : "text-[#555]"}`}>{av}</span>
                    </div>
                    <div className="hidden sm:block text-center">
                      <span className="text-[11px] text-[#555]">{label}</span>
                      {winner !== "tie" && (
                        <div className="text-[9px] mt-0.5" style={{ color: "#cdff00" }}>
                          {winner === "A" ? "\u2190" : "\u2192"} +{Math.abs(av - bv)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold w-8 ${winner === "B" ? "text-[#cdff00]" : "text-[#555]"}`}>{bv}</span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden bg-white/[0.04]">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${bv}%`, background: winner === "B" ? "#cdff00" : "#555" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Strengths & concerns */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[devA!, devB!].map(dev => (
              <div key={dev.username} className="rounded-2xl p-5 border space-y-4" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  {dev.source === "resume" ? dev.name : `@${dev.username}`}
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded" style={{
                    background: dev.source === "resume" ? "rgba(167,139,250,0.15)" : "rgba(205,255,0,0.1)",
                    color: dev.source === "resume" ? "#a78bfa" : "#cdff00",
                  }}>{dev.source === "resume" ? "Resume" : "GitHub"}</span>
                </h4>
                <div>
                  <p className="text-[10px] font-bold text-[#34d399] uppercase tracking-wider mb-2">Strengths</p>
                  {dev.strengths.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1.5">
                      <div className="w-1 h-1 rounded-full bg-[#34d399] mt-1.5 shrink-0" />
                      <span className="text-[12px] text-[#888]">{s}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#fb7185] uppercase tracking-wider mb-2">Concerns</p>
                  {dev.concerns.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1.5">
                      <div className="w-1 h-1 rounded-full bg-[#fb7185] mt-1.5 shrink-0" />
                      <span className="text-[12px] text-[#888]">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>

          {/* Winner verdict */}
          <motion.div variants={fadeUp} className="rounded-2xl p-6 text-center border"
            style={{ background: "rgba(205,255,0,0.04)", borderColor: "rgba(205,255,0,0.15)" }}>
            <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">Overall Winner</p>
            {devA!.score === devB!.score ? (
              <p className="text-xl font-black text-[#fbbf24]" style={{ fontFamily: "var(--font-syne)" }}>It&apos;s a Tie!</p>
            ) : (
              <>
                <p className="text-xl font-black text-[#cdff00]" style={{ fontFamily: "var(--font-syne)" }}>
                  {devA!.score > devB!.score ? devA!.name : devB!.name}
                </p>
                <p className="text-sm text-[#888] mt-1">
                  Score: {Math.max(devA!.score, devB!.score)} vs {Math.min(devA!.score, devB!.score)} — Difference: +{Math.abs(devA!.score - devB!.score)} points
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

// ── Profile Card ──
function ProfileCard({ dev, side }: { dev: DevProfile; side: "left" | "right" }) {
  const isRight = side === "right";
  return (
    <div className={`rounded-2xl p-6 border ${isRight ? "text-right" : "text-left"}`}
      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
      <div className={`flex items-center gap-3 mb-4 ${isRight ? "flex-row-reverse" : ""}`}>
        {dev.avatar ? (
          <img src={dev.avatar} alt={dev.name} className="w-12 h-12 rounded-full border-2 border-white/10" />
        ) : (
          <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg text-[#050505]"
            style={{ background: TIER_COLORS[dev.tier] || "#cdff00" }}>
            {dev.name.charAt(0)}
          </div>
        )}
        <div className={isRight ? "text-right" : ""}>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            {dev.name}
            <span className="text-[8px] font-medium px-1.5 py-0.5 rounded" style={{
              background: dev.source === "resume" ? "rgba(167,139,250,0.15)" : "rgba(205,255,0,0.1)",
              color: dev.source === "resume" ? "#a78bfa" : "#cdff00",
            }}>{dev.source === "resume" ? "Resume" : "GitHub"}</span>
          </h3>
          <p className="text-[12px] text-[#555]">
            {dev.source === "resume" ? `${dev.years}yr experience` : `@${dev.username} · ${dev.years}yr`}
          </p>
        </div>
      </div>
      <ScoreRing score={dev.score} color={TIER_COLORS[dev.tier] || "#cdff00"} />
      <div className={`mt-4 flex items-center gap-2 flex-wrap ${isRight ? "justify-end" : ""}`}>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${TIER_COLORS[dev.tier]}18`, color: TIER_COLORS[dev.tier] }}>{dev.tier}</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${RISK_COLORS[dev.risk]}18`, color: RISK_COLORS[dev.risk] }}>{dev.risk} Risk</span>
        <span className="text-[10px] text-[#cdff00]">{dev.recommendation}</span>
      </div>
      <div className={`flex flex-wrap gap-1 mt-3 ${isRight ? "justify-end" : ""}`}>
        {dev.languages.map(l => (
          <span key={l} className="text-[10px] px-2 py-0.5 rounded text-[#888]"
            style={{ background: "rgba(255,255,255,0.04)" }}>{l}</span>
        ))}
      </div>
    </div>
  );
}
