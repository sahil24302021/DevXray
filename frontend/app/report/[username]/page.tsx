"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence, useSpring, useMotionValue, useTransform } from "framer-motion";
import Link from "next/link";
import { analyzeProfile, AnalysisResult } from "@/lib/api";
import { use } from "react";
import VerdictSection from "@/components/report/VerdictSection";
import HiringRecommendation from "@/components/report/HiringRecommendation";
import AuthenticityScanner from "@/components/report/AuthenticityScanner";
import StrengthWeakness from "@/components/report/StrengthWeakness";
import RedFlags from "@/components/report/RedFlags";
import ImprovementPlan from "@/components/report/ImprovementPlan";
import RepoEvidence from "@/components/report/RepoEvidence";
import ActivityHeatmap from "@/components/report/ActivityHeatmap";
import LanguageBreakdown from "@/components/report/LanguageBreakdown";
import CommitAnalysis from "@/components/report/CommitAnalysis";
import ScoreRadar from "@/components/report/ScoreRadar";
import CodingPatterns from "@/components/report/CodingPatterns";
import CommunityStats from "@/components/report/CommunityStats";
import ContributionStreak from "@/components/report/ContributionStreak";
import ExecutiveSummary from "@/components/report/ExecutiveSummary";
import InterviewQuestions from "@/components/report/InterviewQuestions";
import VerificationSources from "@/components/report/VerificationSources";
import EvidencePanel from "@/components/report/EvidencePanel";
import EvidenceTrail from "@/components/report/EvidenceTrail";
import RecruiterBrief from "@/components/report/RecruiterBrief";
import InterviewKit from "@/components/report/InterviewKit";
import DataBasisBanner from "@/components/report/DataBasisBanner";
import VerificationMatrix from "@/components/report/VerificationMatrix";
import Logo from "@/components/Logo";

import LoadingState from "@/components/LoadingState";
import ReportErrorBoundary from "@/components/report/ReportErrorBoundary";

/* ─── Animated Score Counter ─── */
function AnimatedScore({ value, className }: { value: number; className: string }) {
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 50, damping: 20, duration: 1.5 });
  const display = useTransform(spring, (v) => Math.round(v));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  useEffect(() => {
    const unsubscribe = display.on("change", (v) => setDisplayValue(v));
    return unsubscribe;
  }, [display]);

  return <span className={className}>{displayValue}</span>;
}

function ErrorState({ error, username }: { error: string; username: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#050505]">
      <div className="grain-overlay" />
      <div className="rounded-2xl border border-white/[0.06] p-10 max-w-md w-full text-center relative z-10"
        style={{
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-5 border border-red-500/20">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-white mb-2 font-[family-name:var(--font-syne)]">Analysis Failed</h3>
        <p className="text-red-400 mb-1 text-sm font-medium">{error}</p>
        <p className="text-slate-500 text-xs mb-8">Could not generate a report for &quot;{username}&quot;</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-white/[0.05] border border-white/[0.08] text-slate-300 rounded-xl font-medium hover:bg-white/[0.08] transition-colors text-sm"
          >
            Retry
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl font-medium text-sm no-underline text-[#050505] bg-[#cdff00] hover:bg-[#b0d800] transition-colors"
          >
            New Report
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ReportPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [jobId, setJobId] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const reportRef = useRef<HTMLElement>(null);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement("input");
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const handleExportPDF = async () => {
    if (!reportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const el = reportRef.current;

      // Temporarily make all sections visible for capture
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "visible";

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#050505",
        logging: false,
        windowWidth: 1200,
        scrollY: -window.scrollY,
        onclone: (clonedDoc: Document) => {
          // ── FIX 1: Remove all CSS gradients (causes CanvasGradient crash) ──
          clonedDoc.querySelectorAll("*").forEach((node) => {
            const htmlEl = node as HTMLElement;
            const cs = htmlEl.style;
            const computed = clonedDoc.defaultView?.getComputedStyle(htmlEl);

            // Fix framer-motion invisible elements
            if (cs.opacity === "0") cs.opacity = "1";
            if (cs.transform && cs.transform !== "none") cs.transform = "none";

            // Remove backdrop-filter (unsupported by html2canvas)
            if (cs.backdropFilter) cs.backdropFilter = "none";
            if ((cs as any).webkitBackdropFilter) (cs as any).webkitBackdropFilter = "none";

            // Replace gradient backgrounds with solid fallback
            const bg = computed?.background || computed?.backgroundImage || cs.background || cs.backgroundImage || "";
            if (bg && (bg.includes("gradient") || bg.includes("linear-") || bg.includes("radial-"))) {
              const colorMatch = bg.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)/);
              cs.background = colorMatch ? colorMatch[0] : "rgba(255,255,255,0.03)";
              cs.backgroundImage = "none";
            }

            // Remove mix-blend-mode (unsupported)
            if (computed?.mixBlendMode && computed.mixBlendMode !== "normal") {
              cs.mixBlendMode = "normal";
            }

            // Remove CSS filter on non-SVG elements
            if (computed?.filter && computed.filter !== "none" && htmlEl.tagName !== "SVG") {
              cs.filter = "none";
            }
          });

          // ── FIX 2: Remove SVG filters and drop-shadows ──
          clonedDoc.querySelectorAll("svg").forEach((svg) => {
            svg.style.filter = "none";
          });

          // ── FIX 3: Hide print-hidden and decorative elements ──
          clonedDoc.querySelectorAll(".print\\:hidden, [class*='grain-overlay'], [class*='pointer-events-none']").forEach((node) => {
            (node as HTMLElement).style.display = "none";
          });

          // ── FIX 4: Ensure all motion.div elements are visible ──
          clonedDoc.querySelectorAll("[style*='opacity']").forEach((node) => {
            const htmlEl = node as HTMLElement;
            const opacity = parseFloat(htmlEl.style.opacity);
            if (!isNaN(opacity) && opacity < 0.5) {
              htmlEl.style.opacity = "1";
            }
          });
        },
      });

      document.body.style.overflow = originalOverflow;

      // ── FIX 5: Proper per-page canvas slicing (no image duplication) ──
      const imgWidthMM = 210; // A4 width in mm
      const pageHeightMM = 297; // A4 height in mm
      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;
      const pxPerMM = imgWidthPx / imgWidthMM;
      const pageHeightPx = Math.floor(pageHeightMM * pxPerMM);
      const totalPages = Math.ceil(imgHeightPx / pageHeightPx);

      const pdf = new jsPDF("p", "mm", "a4");

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage();

        // Create a per-page canvas slice
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = imgWidthPx;
        const sliceHeight = Math.min(pageHeightPx, imgHeightPx - page * pageHeightPx);
        sliceCanvas.height = sliceHeight;

        const sliceCtx = sliceCanvas.getContext("2d");
        if (sliceCtx) {
          // Fill background first
          sliceCtx.fillStyle = "#050505";
          sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          // Draw the relevant slice from the full canvas
          sliceCtx.drawImage(
            canvas,
            0, page * pageHeightPx, imgWidthPx, sliceHeight,
            0, 0, imgWidthPx, sliceHeight,
          );
        }

        const sliceData = sliceCanvas.toDataURL("image/png");
        const sliceHeightMM = (sliceHeight / pxPerMM);
        pdf.addImage(sliceData, "PNG", 0, 0, imgWidthMM, sliceHeightMM);
      }

      // PDF metadata
      pdf.setProperties({
        title: `DevXray Report — @${data?.username || "report"}`,
        subject: "GitHub Developer Intelligence Report",
        creator: "DevXray AI",
      });

      pdf.save(`DevXray_${data?.username || "report"}_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("PDF export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (!username) return;
    
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      // 1) Check if we already have a cached report in Supabase/localStorage
      try {
        const { listCandidates } = await import("@/lib/candidates-store");
        const cached = await listCandidates();
        const existing = cached.find(c => c.username === username);
        if (existing && existing.report_payload) {
          // We have a cached result — use it directly instead of re-scanning
          const payload = existing.report_payload as Record<string, unknown>;
          // Reconstruct enough of an AnalysisResult for the report to render
          const cachedResult: AnalysisResult = {
            ...payload,
            username: existing.username,
            name: existing.name,
            avatar_url: existing.avatar_url,
            final_score: existing.final_score,
            developer_tier: existing.developer_tier,
            risk_level: existing.risk_level,
            hiring_recommendation: existing.hiring_recommendation as any,
            verified_skills: existing.verified_skills,
            top_languages: existing.top_languages,
            confidence_score: existing.confidence_score,
          };
          // If cached payload has enough data, use it; otherwise fall through to API
          if (cachedResult.final_score && cachedResult.final_score > 0) {
            setData(cachedResult);
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // Cache miss — proceed to API
      }

      // 2) No cache hit — call the backend
      const newJobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      setJobId(newJobId);

      try {
        const result = await analyzeProfile(username, newJobId);
        setData(result);

        // Save to cache for next time
        try {
          const { saveCandidate, addScoreHistory } = await import("@/lib/candidates-store");
          await saveCandidate(result as any, username);
          const s = Number((result as any).final_score || (result as any).score || 0);
          if (s > 0) addScoreHistory(username, s);
        } catch {}
      } catch (err: any) {
        setError(err.message || "An unknown error occurred");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [username]);

  if (isLoading) return <LoadingState username={username} jobId={jobId} />;
  if (error) return <ErrorState error={error} username={username} />;
  if (!data) return null;

  // ─── Derive convenience fields the backend doesn't emit directly ───
  const score = data.final_score ?? (data.score as number) ?? 0;
  const createdAt = data.created_at || (data.basic_info as any)?.created_at || "";
  const accountAgeDays = createdAt
    ? Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 86400000)
    : 0;
  const accountAgeYears = Math.round(accountAgeDays / 365.25 * 10) / 10;
  // Inject computed fields back so sub-components can access them via data.*
  const dataWithAliases = { ...data, score, account_age_years: accountAgeYears };

  const data2 = dataWithAliases;

  return (
    <div className="min-h-screen bg-[#050505] text-[#fafafa] font-[family-name:var(--font-dm-sans)] relative print:min-h-0 print:block print:overflow-visible">
      <div className="grain-overlay" />
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none z-0 print:hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#cdff00]/[0.03] blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-[#cdff00]/[0.02] blur-[100px] rounded-full mix-blend-screen" />
      </div>

      {/* --- Print Styles (page-specific overrides) --- */}
      <style jsx global>{`
        @media print {
          /* Ensure framer-motion sections are uniformly visible */
          div[class*="rounded-2xl"], section[class*="rounded-2xl"] {
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* --- Nav --- */}
      <nav className="sticky top-0 z-50 px-4 sm:px-6 md:px-10 pt-4 print:hidden">
        <div
          className="mx-auto max-w-5xl flex items-center justify-between rounded-2xl px-4 sm:px-6 py-3 border border-white/[0.06]"
          style={{
            background: "rgba(5, 5, 5, 0.85)",
            backdropFilter: "blur(20px) saturate(150%)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          <Link href="/" className="flex items-center gap-2 sm:gap-3 no-underline group flex-shrink-0">
            <Logo className="w-6 h-6 sm:w-8 sm:h-8 transition-transform duration-500 group-hover:scale-105" />
            <span className="font-[family-name:var(--font-syne)] font-bold text-[15px] tracking-tight text-white">
              DevXray<span className="grad-text">.ai</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => {
                // Force a fresh scan by clearing cache and reloading
                import("@/lib/candidates-store").then(({ deleteCandidate }) => {
                  deleteCandidate(username).then(() => window.location.reload());
                });
              }}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white border border-white/[0.08] rounded-lg hover:bg-white/[0.05] transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline">Re-scan</span>
            </button>
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white border border-white/[0.08] rounded-lg hover:bg-white/[0.05] transition-all disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="hidden sm:inline">Export PDF{isExporting ? "..." : ""}</span>
            </button>
            {/* Copy Link / Share Button */}
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white border border-white/[0.08] rounded-lg hover:bg-white/[0.05] transition-all"
            >
              {linkCopied ? (
                <>
                  <svg className="w-3.5 h-3.5 text-[#cdff00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="hidden sm:inline text-[#cdff00]">Copied!</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  <span className="hidden sm:inline">Copy Link</span>
                </>
              )}
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-bold text-[#050505] bg-[#cdff00] rounded-lg transition-all no-underline hover:bg-[#b0d800] tracking-wide"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span className="hidden sm:inline">New Report</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Interview Kit — rendered OUTSIDE the nav to prevent backdrop-filter from breaking position:fixed modal */}
      <div className="sticky top-[68px] z-40 px-4 sm:px-6 md:px-10 mb-2 print:hidden">
        <div className="mx-auto max-w-5xl flex justify-end">
          <InterviewKit reportData={dataWithAliases} candidateName={data.name || data.username || "Candidate"} />
        </div>
      </div>

      {/* --- Report Content --- */}
      <main ref={reportRef} className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-10 pb-20 animate-fade-in print:p-0 print:m-0 print:max-w-none print:w-full print:block print:overflow-visible">
          {/* -- Profile Card + Score Radar -- */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-5 mb-5 print:block print:space-y-5">
            {/* Profile Card */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="rounded-2xl border border-white/[0.06] p-5 sm:p-6 md:p-8"
              style={{
                background: "rgba(255,255,255,0.03)",
                backdropFilter: "blur(24px)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                {/* Left: Avatar + Info */}
                <div className="flex items-center gap-5 flex-1 min-w-0">
                  <div className="relative shrink-0">
                    <svg className="w-[80px] h-[80px] -rotate-90" viewBox="0 0 100 100">
                      <circle className="score-ring-track" cx="50" cy="50" r="46" />
                      <motion.circle
                        className="score-ring-fill"
                        cx="50" cy="50" r="46"
                        stroke={score >= 80 ? "#34d399" : score >= 60 ? "#fbbf24" : "#fb7185"}
                        strokeDasharray={2 * Math.PI * 46}
                        initial={{ strokeDashoffset: 2 * Math.PI * 46 }}
                        animate={{ strokeDashoffset: 2 * Math.PI * 46 - (score / 100) * 2 * Math.PI * 46 }}
                        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                      />
                    </svg>
                    <img
                      src={data.avatar_url}
                      alt={data.username}
                      className="w-[56px] h-[56px] rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-white/10 shadow-lg object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <h1 className="font-[family-name:var(--font-syne)] font-bold text-xl text-white truncate">
                      @{data.username}
                    </h1>
                    {data.name && <p className="text-sm text-slate-400 truncate">{data.name}</p>}
                    {data.bio && <p className="text-xs text-slate-500 mt-1 truncate max-w-md">{data.bio}</p>}
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="stat-pill text-[11px]">{data2.total_repos || data2.public_repos} repos</span>
                      <span className="stat-pill text-[11px]">{data2.followers?.toLocaleString()} followers</span>
                      <span className="stat-pill text-[11px]">{data2.total_stars?.toLocaleString()} ★</span>
                      {accountAgeYears > 0 && (
                        <span className="stat-pill text-[11px]">{accountAgeYears}yr</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Score */}
                <div className="text-center md:text-right shrink-0">
                  <div className="inline-flex flex-col items-center md:items-end">
                    <AnimatedScore
                      value={score}
                      className={`text-5xl font-bold tabular-nums ${
                        score >= 80 ? "grad-text-score-strong" :
                        score >= 60 ? "grad-text-score-moderate" : "grad-text-score-risky"
                      }`}
                    />
                    <span className="text-xs text-slate-500 font-medium mt-1">/ 100 intelligence score</span>
                    {(data2 as any).score_percentile && (
                      <span className="text-[10px] text-cyan-400/80 font-semibold mt-0.5 tracking-wide">
                        {(data2 as any).score_percentile}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Score Breakdown Bar */}
              {data2.score_breakdown?.breakdown && (
                <div className="mt-6 pt-5 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1 h-2 rounded-full overflow-hidden bg-white/[0.04] mb-3">
                    <ScoreBar value={data2.score_breakdown.breakdown.code_quality} max={30} color="#60a5fa" />
                    <ScoreBar value={data2.score_breakdown.breakdown.skill_depth} max={20} color="#a78bfa" />
                    <ScoreBar value={data2.score_breakdown.breakdown.consistency} max={20} color="#34d399" />
                    <ScoreBar value={data2.score_breakdown.breakdown.growth} max={15} color="#fbbf24" />
                    <ScoreBar value={data2.score_breakdown.breakdown.authenticity} max={15} color="#f472b6" />
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-500 font-semibold uppercase tracking-wider">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Code</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400" />Skills</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Consistency</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Growth</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-pink-400" />Auth</span>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Score Radar */}
            <div className="print:hidden">
              <ScoreRadar dimensions={data2.score_dimensions ?? []} />
            </div>
          </div>

          {/* ═══ NARRATIVE FLOW ═══ */}

          {/* -- Recruiter Brief (TL;DR) -- */}
          <ReportErrorBoundary section="Recruiter Brief">
            <RecruiterBrief data={data2} />
          </ReportErrorBoundary>

          {/* -- Section: Assessment -- */}
          <div className="flex items-center gap-3 mb-4 mt-2">
            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em]">Assessment</span>
            <div className="flex-1 h-px bg-white/[0.04]" />
          </div>

          {/* -- Executive Summary (Hero) -- */}
          <ReportErrorBoundary section="Executive Summary">
            <ExecutiveSummary 
              tier={{
                tier: (data2 as any).benchmark?.tier || ((typeof data2.developer_tier === 'string') ? data2.developer_tier : 'Unknown'),
                tier_level: Math.ceil(((data2 as any).benchmark?.percentile || 50) / 20),
                tier_description: (data2 as any).benchmark?.tier_description || data2.verdict_explanation || "No description provided.",
                evidence: data2.strengths || [],
                signal_strength: data2.confidence_score || 50
              }} 
              docQuality={data2.documentation_quality || {
                grade: (data2 as any).system_design?.folder_maturity === "Production" ? "A" : (data2 as any).system_design?.folder_maturity === "Structured" ? "B" : "C",
                insight: "Based on repository structure and readme presence.",
                score: 0, repos_with_descriptions: 0, repos_with_topics: 0, repos_with_pages: 0, total_assessed: 0
              }} 
              score={score}
              privateRepoIndicator={(data2 as any).private_repo_indicator}
              privateRepoDisclaimer={(data2 as any).private_repo_disclaimer}
              scoreAdjustmentNote={(data2 as any).score_adjustment_note}
              experienceConfidence={(data2 as any).experience_confidence}
              alternativeSignals={(data2 as any).alternative_signals}
              alternativeSignalsSummary={(data2 as any).alternative_signals_summary}
            />
          </ReportErrorBoundary>

          {/* -- Data Basis Banner (Phase 3) -- */}
          {((data2 as any).github_sparse_mode || (data2 as any).needs_more_data) && (
            <DataBasisBanner
              dataBasis={(data2 as any).data_basis || "GitHub"}
              confidenceLevel={(data2 as any).data_assessment?.confidence_level || "Medium"}
              needsMoreData={(data2 as any).needs_more_data || false}
              requestSignals={(data2 as any).request_signals || []}
              githubSparseMode={(data2 as any).github_sparse_mode || false}
              username={data2.username || ""}
            />
          )}

          {/* -- Verdict + Hiring -- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5 print:block print:space-y-5">
            <ReportErrorBoundary section="Verdict">
              <VerdictSection data={data2} />
            </ReportErrorBoundary>
            <ReportErrorBoundary section="Hiring Recommendation">
              <HiringRecommendation data={data2} />
            </ReportErrorBoundary>
          </div>

          {/* -- Strengths + Weaknesses -- */}
          <ReportErrorBoundary section="Strengths & Weaknesses">
            <StrengthWeakness data={data2} />
          </ReportErrorBoundary>

          {/* -- Red Flags -- */}
          <ReportErrorBoundary section="Red Flags">
            <RedFlags data={data2} />
          </ReportErrorBoundary>

          {/* -- Section: Evidence -- */}
          <div className="flex items-center gap-3 mb-4 mt-8">
            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em]">Evidence</span>
            <div className="flex-1 h-px bg-white/[0.04]" />
          </div>

          {/* -- Evidence Panel (Scoring Details) -- */}
          {(data2.feature_importance || data2.decision_trace) && (
            <EvidencePanel 
              features={data2.feature_importance} 
              decisionTrace={data2.decision_trace}
              proofList={(data2 as any).proof}
              dataSources={(data2 as any).data_sources}
              dataSourceConfidence={(data2 as any).data_source_confidence}
              multiSourceBonus={(data2 as any).multi_source_bonus}
            />
          )}

          {/* -- Evidence Trail (Claim vs Reality) -- */}
          <ReportErrorBoundary section="Evidence Trail">
            <EvidenceTrail items={(data2 as any).evidence_trail} />
          </ReportErrorBoundary>

          {/* -- Verification Matrix (Resume vs GitHub) -- */}
          {(data2 as any).verification_matrix && (data2 as any).verification_matrix.length > 0 && (
            <ReportErrorBoundary section="Verification Matrix">
              <VerificationMatrix matrix={(data2 as any).verification_matrix} />
            </ReportErrorBoundary>
          )}

          {/* -- Authenticity + Commit Intelligence -- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5 print:block print:space-y-5">
            <ReportErrorBoundary section="Authenticity Scanner">
              <AuthenticityScanner data={data2} />
            </ReportErrorBoundary>
            <ReportErrorBoundary section="Commit Analysis">
              {data2.commit_analysis && <CommitAnalysis data={data2.commit_analysis} />}
            </ReportErrorBoundary>
          </div>

          {/* -- Multi-Source Verification -- */}
          <ReportErrorBoundary section="Verification Sources">
            {data2.verification_sources && <VerificationSources data={data2.verification_sources} multiSource={(data2 as any).multi_source_verification} />}
          </ReportErrorBoundary>

          {/* -- Section: Deep Dive -- */}
          <div className="flex items-center gap-3 mb-4 mt-8">
            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em]">Deep Dive</span>
            <div className="flex-1 h-px bg-white/[0.04]" />
          </div>

          {/* -- Streak + Community -- */}
          {(data2.contribution_streak || data2.community_stats) && (
            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-5 mb-5 print:block print:space-y-5">
              {data2.contribution_streak && <ContributionStreak data={data2.contribution_streak} />}
              {data2.community_stats && <CommunityStats data={data2.community_stats} />}
            </div>
          )}

          {/* -- Language DNA -- */}
          <ReportErrorBoundary section="Language Breakdown">
            {data2.language_breakdown && <LanguageBreakdown data={data2.language_breakdown} />}
          </ReportErrorBoundary>

          {/* -- Activity Timeline -- */}
          <ReportErrorBoundary section="Activity Heatmap">
            {data2.activity_heatmap && <ActivityHeatmap data={data2.activity_heatmap} />}
          </ReportErrorBoundary>

          {/* -- Coding Patterns -- */}
          <ReportErrorBoundary section="Coding Patterns">
            {data2.coding_patterns && <CodingPatterns data={data2.coding_patterns} />}
          </ReportErrorBoundary>

          {/* -- Growth Roadmap -- */}
          <ReportErrorBoundary section="Growth Roadmap">
            {data2.improvements && <ImprovementPlan data={data2} />}
          </ReportErrorBoundary>

          {/* -- Interview Questions -- */}
          {data2.interview_questions && data2.interview_questions.length > 0 && (
            <div className="mt-5 mb-5">
              <InterviewQuestions questions={data2.interview_questions} />
            </div>
          )}

          {/* -- Top Repositories -- */}
          <ReportErrorBoundary section="Repository Evidence">
            {(data2.top_repos && data2.top_repos.length > 0) && <RepoEvidence data={data2} />}
          </ReportErrorBoundary>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-white/[0.06] text-center">
            <p className="text-slate-500 text-[10px] tracking-[0.15em] uppercase font-medium">
              DevXray AI · Deep Intelligence Report · @{data2.username} · {data2.repos_deep_analyzed} repos deep-analyzed
            </p>
          </div>
      </main>
    </div>
  );
}

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  const percentage = (value / max) * 100;
  return (
    <motion.div
      initial={{ width: 0 }}
      animate={{ width: `${percentage}%` }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
      className="h-full rounded-full"
      style={{ backgroundColor: color, minWidth: value > 0 ? "2px" : 0, filter: `drop-shadow(0 0 4px ${color}40)` }}
    />
  );
}
