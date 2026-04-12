"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, useSpring, useMotionValue, useTransform } from "framer-motion";
import Link from "next/link";
import { BarChart, Bar, Cell, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import InterviewKit from "@/components/report/InterviewKit";
import ReportErrorBoundary from "@/components/report/ReportErrorBoundary";

/* --- Status Badge --- */
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; border: string; icon: string }> = {
    "Verified": { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", icon: "✅" },
    "Partially Verified": { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30", icon: "⚡" },
    "Unverifiable": { bg: "bg-slate-500/15", text: "text-slate-400", border: "border-slate-500/30", icon: "⚪" },
    "Discrepancy": { bg: "bg-rose-500/15", text: "text-rose-400", border: "border-rose-500/30", icon: "🚩" },
    "Exaggeration": { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30", icon: "⚠️" },
  };
  const s = config[status] || config["Unverifiable"];
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase border ${s.bg} ${s.text} ${s.border} whitespace-nowrap`}>
      {s.icon} {status}
    </span>
  );
}

/* --- Animated Score Counter --- */
function AnimatedScoreValue({ value, className }: { value: number; className?: string }) {
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

/* --- Score Ring --- */
function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#eab308" : score >= 25 ? "#f97316" : "#ef4444";
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
        <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <AnimatedScoreValue value={score} className="text-3xl font-bold" />
        <span className="text-[10px] text-slate-500 uppercase tracking-widest">/ 100</span>
      </div>
    </div>
  );
}

/* --- Badge Share Section --- */
function BadgeShareSection({ username }: { username: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const badgeMarkdown = `[![DevXray](https://devxray-backend.onrender.com/badge/${username})](https://dev-xray.vercel.app/report/${username})`;

  const handleCopy = () => {
    navigator.clipboard.writeText(badgeMarkdown).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
      className="rounded-2xl border border-white/[0.06] p-6" style={{ background: "rgba(255,255,255,0.02)" }}>
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between cursor-pointer">
        <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#cdff00]" /> Share Your DevXray Badge
        </h2>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isOpen && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 space-y-4">
          <p className="text-xs text-slate-500">
            Embed this badge in your GitHub README. When hiring managers click it, they&apos;ll land directly on your verification report.
          </p>
          {/* Badge preview */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center">
            <img
              src={`https://devxray-backend.onrender.com/badge/${username}`}
              alt="DevXray Badge"
              className="h-6"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          {/* Markdown code */}
          <div className="relative">
            <pre className="p-3 rounded-xl bg-black/60 border border-white/5 text-[11px] text-[#cdff00] font-mono overflow-x-auto whitespace-pre-wrap break-all">
              {badgeMarkdown}
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 px-3 py-1 text-[10px] font-bold rounded-lg transition-all border"
              style={{
                background: copied ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.05)',
                borderColor: copied ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.1)',
                color: copied ? '#34d399' : '#888',
              }}
            >
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-[10px] text-slate-600">
            Paste into your GitHub profile README.md • The badge auto-updates when you get rescanned
          </p>
        </motion.div>
      )}
    </motion.section>
  );
}

/* --- Share Report Button + Modal --- */
function ShareReportButton({ candidateName }: { candidateName?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate a pseudo-unique share URL (using current URL + timestamp hash)
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/report/resume?share=${btoa(String(Date.now())).slice(0, 12)}`
    : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-3.5 py-1.5 text-xs font-bold text-white bg-white/10 rounded-lg transition-all hover:bg-white/20 border border-white/10 cursor-pointer flex items-center gap-1.5"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setIsOpen(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-md mx-4 rounded-2xl p-6 border border-white/10"
            style={{ background: '#0f0f0f' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setIsOpen(false)} className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
            </button>

            <h3 className="font-[family-name:var(--font-syne)] font-bold text-lg text-white mb-1">
              Share Report
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              {candidateName ? `Share ${candidateName}'s` : 'Share this'} verification report with your team
            </p>

            {/* Share URL */}
            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2.5 rounded-xl text-xs text-slate-300 font-mono border border-white/10 outline-none"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              />
              <button
                onClick={handleCopy}
                className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0"
                style={{
                  background: copied ? 'rgba(52,211,153,0.15)' : '#cdff00',
                  color: copied ? '#34d399' : '#050505',
                }}
              >
                {copied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>

            {/* Quick share options */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Email', icon: '📧', action: () => window.open(`mailto:?subject=DevXray Report - ${candidateName || 'Candidate'}&body=Check out this verification report: ${shareUrl}`) },
                { label: 'Slack', icon: '💬', action: handleCopy },
                { label: 'Print', icon: '🖨️', action: () => window.print() },
              ].map(opt => (
                <button key={opt.label} onClick={opt.action}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-white/5 hover:border-white/15 transition-all text-center hover:bg-white/[0.02]">
                  <span className="text-lg">{opt.icon}</span>
                  <span className="text-[10px] text-slate-400 font-medium">{opt.label}</span>
                </button>
              ))}
            </div>

            <p className="text-[10px] text-slate-600 mt-4 text-center">
              This link is private and will not appear in search results
            </p>
          </motion.div>
        </div>
      )}
    </>
  );
}

export default function ResumeReportPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLElement>(null);

  const handleExportPDF = async () => {
    if (!reportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const el = reportRef.current;
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
          clonedDoc.querySelectorAll("*").forEach((node) => {
            const htmlEl = node as HTMLElement;
            const cs = htmlEl.style;
            const computed = clonedDoc.defaultView?.getComputedStyle(htmlEl);
            if (cs.opacity === "0") cs.opacity = "1";
            if (cs.transform && cs.transform !== "none") cs.transform = "none";
            if (cs.backdropFilter) cs.backdropFilter = "none";
            if ((cs as any).webkitBackdropFilter) (cs as any).webkitBackdropFilter = "none";
            const bg = computed?.background || computed?.backgroundImage || cs.background || cs.backgroundImage || "";
            if (bg && (bg.includes("gradient") || bg.includes("linear-") || bg.includes("radial-"))) {
              const colorMatch = bg.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)/);
              cs.background = colorMatch ? colorMatch[0] : "rgba(255,255,255,0.03)";
              cs.backgroundImage = "none";
            }
            if (computed?.mixBlendMode && computed.mixBlendMode !== "normal") cs.mixBlendMode = "normal";
            if (computed?.filter && computed.filter !== "none" && htmlEl.tagName !== "SVG") cs.filter = "none";
          });
          clonedDoc.querySelectorAll("svg").forEach((svg) => { svg.style.filter = "none"; });
          clonedDoc.querySelectorAll(".print\\:hidden, [class*='grain-overlay'], [class*='pointer-events-none']").forEach((node) => {
            (node as HTMLElement).style.display = "none";
          });
          clonedDoc.querySelectorAll("[style*='opacity']").forEach((node) => {
            const htmlEl = node as HTMLElement;
            const opacity = parseFloat(htmlEl.style.opacity);
            if (!isNaN(opacity) && opacity < 0.5) htmlEl.style.opacity = "1";
          });
        },
      });

      document.body.style.overflow = originalOverflow;

      const imgWidthMM = 210;
      const pageHeightMM = 297;
      const pxPerMM = canvas.width / imgWidthMM;
      const pageHeightPx = Math.floor(pageHeightMM * pxPerMM);
      const totalPages = Math.ceil(canvas.height / pageHeightPx);
      const pdf = new jsPDF("p", "mm", "a4");

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage();
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        const sliceHeight = Math.min(pageHeightPx, canvas.height - page * pageHeightPx);
        sliceCanvas.height = sliceHeight;
        const sliceCtx = sliceCanvas.getContext("2d");
        if (sliceCtx) {
          sliceCtx.fillStyle = "#050505";
          sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          sliceCtx.drawImage(canvas, 0, page * pageHeightPx, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        }
        const sliceData = sliceCanvas.toDataURL("image/png");
        pdf.addImage(sliceData, "PNG", 0, 0, imgWidthMM, sliceHeight / pxPerMM);
      }

      pdf.setProperties({
        title: `DevXray Resume Report — ${data?.resume_data?.name || "Candidate"}`,
        subject: "Resume Intelligence Report",
        creator: "DevXray AI",
      });

      pdf.save(`DevXray_Resume_${(data?.resume_data?.name || "report").replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("PDF export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    const rawData = sessionStorage.getItem("resume_report_data");
    if (!rawData) {
      router.push("/");
      return;
    }
    try {
      setData(JSON.parse(rawData));
    } catch {
      setError("Failed to parse report data.");
    }
  }, [router]);

  if (error) return (
    <div className="min-h-screen bg-[#050505] text-rose-400 flex items-center justify-center text-lg">{error}</div>
  );
  if (!data) return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center text-lg">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        className="w-8 h-8 border-2 border-[#050505] border-t-[#cdff00] rounded-full mr-4" />
      Loading Intelligence Report...
    </div>
  );

  const { resume_data, github_intelligence, claims_validation, analysis_metadata, deep_report, linkedin_data, job_requirements } = data;
  const score = github_intelligence?.final_score 
    ?? github_intelligence?.score 
    ?? deep_report?.overall_score 
    ?? claims_validation?.authenticity_score 
    ?? 0;
  
  // Extract simple recommendation string if it's an object now
  let rec = github_intelligence?.hiring_recommendation?.summary
    || github_intelligence?.hiring_recommendation
    || deep_report?.hire_decision 
    || claims_validation?.hiring_recommendation;
  if (typeof rec === 'object' && rec !== null) {
      rec = rec.recommendation || "N/A";
  }
  const recommendation = rec || "N/A";
  
  const skills = resume_data?.technical_skills || {};

  // JD Matching display variables
  const jdMatch = github_intelligence?.jd_match;
  const matchPercentage = jdMatch?.match_percentage || 0;

  const forensics = github_intelligence?.authenticity?.commit_timeline_forensics;
  const isStuffer = forensics?.stuffer_detected;

  // Confidence score + low-confidence detection
  const confidenceRaw = github_intelligence?.confidence_score ?? 0;
  const confidenceScore = confidenceRaw > 1 ? confidenceRaw : Math.round(confidenceRaw * 100);
  const isLowConfidence = github_intelligence?.is_low_confidence === true || confidenceScore < 50;

  // JD Match data
  const jdSkillGap = github_intelligence?.jd_match;
  const jdMatchPct = jdSkillGap?.match_percentage || 0;
  const matchedSkills: string[] = jdSkillGap?.matched_skills || jdSkillGap?.verified_skills || [];
  const missingSkills: string[] = jdSkillGap?.missing_skills || jdSkillGap?.unverified_skills || [];

  // GitHub username for badge
  const githubUsername = analysis_metadata?.github_username || github_intelligence?.username || '';

  // Confidence tooltip text
  const confidenceExplanation = confidenceScore > 80
    ? `High confidence (${confidenceScore}%): We analyzed 15+ repos and 3+ external sources.`
    : confidenceScore >= 50
    ? `Medium confidence (${confidenceScore}%): Limited repos or external data available.`
    : `Low confidence (${confidenceScore}%): Very few data points \u2014 treat report as preliminary.`;

  return (
    <div className="min-h-screen bg-[#050505] text-[#fafafa] font-[family-name:var(--font-dm-sans)] relative overflow-hidden">
      {/* --- Print Styles (page-specific overrides) --- */}
      <style jsx global>{`
        @media print {
          /* Hide nav buttons for this page */
          nav { display: none !important; }
          /* Ensure framer-motion sections are visible */
          section[class*="rounded-2xl"] {
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* --- Nav --- */}
      <nav className="sticky top-0 z-50 px-6 md:px-10 pt-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between rounded-2xl px-6 py-3 border border-white/[0.06]"
             style={{ background: "rgba(5, 5, 5, 0.85)", backdropFilter: "blur(20px)" }}>
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <span className="font-[family-name:var(--font-syne)] font-bold text-[15px] tracking-tight text-white">
              DevXray<span className="text-[#cdff00]">.ai</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ShareReportButton candidateName={resume_data?.name} />
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-white/10 rounded-lg transition-all hover:bg-white/20 border border-white/10 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export PDF{isExporting ? "..." : ""}
            </button>
            <Link href="/" className="px-3.5 py-1.5 text-xs font-bold text-[#050505] bg-[#cdff00] rounded-lg transition-all no-underline hover:bg-[#b0d800]">
              New Scan
            </Link>
          </div>
        </div>
      </nav>

      {/* Interview Kit — rendered OUTSIDE the nav to prevent backdrop-filter from breaking position:fixed modal */}
      <div className="sticky top-[68px] z-40 px-6 md:px-10 mb-2">
        <div className="mx-auto max-w-6xl flex justify-end">
          <InterviewKit reportData={data} candidateName={resume_data?.name || "Candidate"} />
        </div>
      </div>

      <main ref={reportRef} className="relative z-10 mx-auto max-w-6xl px-6 py-10 pb-20 space-y-6">

        {/* ═══ AI VERIFICATION UNAVAILABLE BANNER ═══ */}
        {data?.analysis_metadata?.ai_verification_available === false && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-4 border border-amber-500/20 flex items-center gap-3"
            style={{ background: "rgba(251,191,36,0.05)" }}>
            <span className="text-xl">🔬</span>
            <div>
              <p className="text-sm font-bold text-amber-400">Deterministic Analysis Only</p>
              <p className="text-xs text-amber-300/60 mt-0.5">
                AI narrative generation was unavailable during this scan (API quota exceeded).
                All scores are fully deterministic — calculated from actual GitHub code analysis.
                The hiring recommendation is rule-based. Re-run in a few minutes for full AI insights.
              </p>
            </div>
          </motion.div>
        )}

        {/* ═══ LOW CONFIDENCE BANNER ═══ */}
        {isLowConfidence && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-4 border border-amber-500/30 flex items-center gap-3"
            style={{ background: "rgba(251,191,36,0.08)" }}>
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-sm font-bold text-amber-400">Low Confidence Report</p>
              <p className="text-xs text-amber-300/60 mt-0.5">
                This report is based on limited data ({confidenceScore}% confidence). Very few data points were available
                — treat this as a preliminary assessment and verify claims manually.
              </p>
            </div>
          </motion.div>
        )}

        {/* ═══ HEADER ═══ */}
        <ReportErrorBoundary section="Candidate Profile">
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="rounded-2xl border border-white/[0.06] p-8" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h1 className="font-[family-name:var(--font-syne)] font-bold text-3xl mb-1">{resume_data?.name || "Unknown Candidate"}</h1>
              <p className="text-slate-400 text-sm">{resume_data?.current_role}</p>
              <p className="text-slate-500 text-sm mt-1">{resume_data?.email} {resume_data?.phone ? `• ${resume_data.phone}` : ""} {resume_data?.location ? `• ${resume_data.location}` : ""}</p>
              <div className="flex flex-wrap gap-3 mt-4">
                {resume_data?.github_url && <a href={resume_data.github_url} target="_blank" className="text-xs text-[#cdff00] hover:underline">🔗 GitHub</a>}
                {resume_data?.linkedin_url && <a href={resume_data.linkedin_url} target="_blank" className="text-xs text-[#cdff00] hover:underline">🔗 LinkedIn</a>}
                {resume_data?.portfolio_url && <a href={resume_data.portfolio_url} target="_blank" className="text-xs text-[#cdff00] hover:underline">🔗 Portfolio</a>}
              </div>
            </div>
            <div className="flex flex-col items-center">
              <ScoreRing score={score} />
              <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-2">DIP Score</span>
              {/* Confidence tooltip */}
              <div className="relative group mt-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full cursor-help border ${
                  confidenceScore > 80
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : confidenceScore >= 50
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}>
                  {confidenceScore}% confidence
                </span>
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-xl text-[11px] text-slate-300 leading-relaxed z-50"
                  style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                  {confidenceExplanation}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45" style={{ background: '#1a1a1a', borderRight: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)' }} />
                </div>
              </div>
            </div>
          </div>
          {/* Metadata bar */}
          {analysis_metadata && (
            <div className="flex flex-wrap gap-4 mt-6 pt-5 border-t border-white/[0.05]">
              {[
                { label: "GitHub Matched", value: analysis_metadata.github_matched ? "✅ Yes" : "❌ No" },
                { label: "Claims Extracted", value: analysis_metadata.claims_extracted },
                { label: "Projects Found", value: analysis_metadata.projects_found },
                { label: "Experience", value: github_intelligence?.experience || (resume_data?.years_of_experience ? `${resume_data.years_of_experience} years` : "< 1 year") },
              ].map((m, i) => (
                <div key={i} className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">{m.label}</span>
                  <span className="text-sm font-bold text-white">{m.value}</span>
                </div>
              ))}
            </div>
          )}
        </motion.section>
        </ReportErrorBoundary>

        {/* ═══ HIRING RECOMMENDATION ═══ */}
        <ReportErrorBoundary section="Hiring Recommendation">
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className={`rounded-2xl border p-6 ${
            recommendation.startsWith("HIRE") ? "border-emerald-500/30 bg-emerald-500/5" :
            recommendation.startsWith("PASS") ? "border-rose-500/30 bg-rose-500/5" :
            "border-amber-500/30 bg-amber-500/5"
          }`}>
          <div className="flex items-center gap-4">
            <span className="text-3xl">{recommendation.startsWith("HIRE") ? "✅" : recommendation.startsWith("PASS") ? "🚫" : "⚡"}</span>
            <div>
              <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg">Hiring Recommendation</h2>
              <p className="text-sm text-slate-300 mt-1">{recommendation}</p>
            </div>
          </div>
          {claims_validation?.overall_assessment && (
            <p className="text-sm text-slate-400 mt-4 leading-relaxed">{claims_validation.overall_assessment}</p>
          )}
        </motion.section>
        </ReportErrorBoundary>

        {/* ═══ JOB REQUIREMENTS MATCH ═══ */}
        {job_requirements && Object.keys(job_requirements).length > 0 && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            className="rounded-2xl border border-white/[0.06] p-6" style={{ background: "rgba(255,255,255,0.02)" }}>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400" /> Targeted Position: {job_requirements.job_title}
            </h2>
            <div className="flex flex-col gap-3">
              <div className="p-4 rounded-xl bg-black/40 border border-white/[0.05]">
                {job_requirements.company_name && <h3 className="text-sm font-bold text-white mb-2">{job_requirements.company_name}</h3>}
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs mb-3">
                  {job_requirements.job_type && <span className="text-slate-300"><strong className="text-slate-500 uppercase tracking-widest text-[9px]">Type </strong> {job_requirements.job_type}</span>}
                  {job_requirements.experience_required && <span className="text-slate-300"><strong className="text-slate-500 uppercase tracking-widest text-[9px]">Exp </strong> {job_requirements.experience_required}</span>}
                  {job_requirements.required_skills && <span className="text-slate-300"><strong className="text-slate-500 uppercase tracking-widest text-[9px]">Core Skills </strong> {job_requirements.required_skills}</span>}
                </div>
                {job_requirements.job_description && <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-white/5">{job_requirements.job_description}</p>}
                {job_requirements.additional_notes && <p className="text-xs text-indigo-300/70 mt-2 italic">"{job_requirements.additional_notes}"</p>}
              </div>
            </div>
          </motion.section>
        )}

        {/* ═══ JD SKILL GAP ANALYSIS ═══ */}
        {(matchedSkills.length > 0 || missingSkills.length > 0) && (
          <ReportErrorBoundary section="Job Fit Analysis">
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}
            className="rounded-2xl border border-indigo-500/20 p-6" style={{ background: "rgba(99,102,241,0.03)" }}>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400" /> Job Fit Analysis
            </h2>
            <p className="text-xs text-slate-500 mb-5">How the candidate's verified skills match the job requirements</p>

            {/* Match score */}
            <div className="flex items-center gap-4 mb-6">
              <div className="text-4xl font-bold" style={{ color: jdMatchPct >= 75 ? '#22c55e' : jdMatchPct >= 50 ? '#eab308' : '#ef4444' }}>
                {jdMatchPct}%
              </div>
              <div className="flex-1">
                <div className="h-2.5 rounded-full overflow-hidden bg-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${jdMatchPct}%` }}
                    transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full"
                    style={{ background: jdMatchPct >= 75 ? '#22c55e' : jdMatchPct >= 50 ? '#eab308' : '#ef4444' }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Skill match score</p>
              </div>
            </div>

            {/* Two columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {matchedSkills.length > 0 && (
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                  <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold block mb-3">✅ Matched Skills</span>
                  <div className="flex flex-wrap gap-1.5">
                    {matchedSkills.map((s: string, i: number) => (
                      <span key={i} className="text-xs px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {missingSkills.length > 0 && (
                <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/15">
                  <span className="text-[10px] uppercase tracking-widest text-rose-400 font-bold block mb-3">❌ Missing Skills</span>
                  <div className="flex flex-wrap gap-1.5">
                    {missingSkills.map((s: string, i: number) => (
                      <span key={i} className="text-xs px-2 py-1 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Gap closure estimate */}
            {missingSkills.length > 0 && (
              <p className="text-xs text-slate-500 mt-4 pt-3 border-t border-white/5">
                ⏱ Estimated time to close skill gaps: <span className="text-white font-bold">
                  ~{missingSkills.length <= 2 ? '1-2' : missingSkills.length <= 4 ? '2-3' : '3-6'} months
                </span> with focused learning
              </p>
            )}
          </motion.section>
          </ReportErrorBoundary>
        )}

        {/* ═══ SKILLS MATRIX ═══ */}
        {skills && Object.keys(skills).length > 0 && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="rounded-2xl border border-white/[0.06] p-6" style={{ background: "rgba(255,255,255,0.02)" }}>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#cdff00]" /> Technical Skills
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(skills).map(([category, items]: [string, any]) => (
                Array.isArray(items) && items.length > 0 && (
                  <div key={category} className="p-4 rounded-xl bg-black/40 border border-white/[0.05]">
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 block mb-2">{category}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((skill: string, i: number) => (
                        <span key={i} className="text-xs px-2 py-1 rounded-md bg-white/[0.05] text-slate-300 border border-white/[0.04]">{skill}</span>
                      ))}
                    </div>
                  </div>
                )
              ))}
            </div>
          </motion.section>
        )}

        {/* ═══ SKILL MATCH ANALYSIS ═══ */}
        {claims_validation?.skill_match_analysis && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="rounded-2xl border border-white/[0.06] p-6" style={{ background: "rgba(255,255,255,0.02)" }}>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" /> Skill Verification Matrix
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { title: "Verified by GitHub", items: claims_validation.skill_match_analysis.verified_skills, color: "emerald" },
                { title: "Unverified (claimed)", items: claims_validation.skill_match_analysis.unverified_skills, color: "amber" },
                { title: "Hidden Skills (in GitHub, not resume)", items: claims_validation.skill_match_analysis.hidden_skills, color: "cyan" },
              ].map((group) => (
                group.items?.length > 0 && (
                  <div key={group.title} className={`p-4 rounded-xl border border-${group.color}-500/20 bg-${group.color}-500/5`}>
                    <span className={`text-[10px] uppercase tracking-widest text-${group.color}-400 block mb-2`}>{group.title}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((s: string, i: number) => (
                        <span key={i} className={`text-xs px-2 py-1 rounded-md bg-${group.color}-500/10 text-${group.color}-300 border border-${group.color}-500/20`}>{s}</span>
                      ))}
                    </div>
                  </div>
                )
              ))}
            </div>
          </motion.section>
        )}

        {/* ═══ TRUTH VALIDATION ═══ */}
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="rounded-2xl border border-white/[0.06] p-6" style={{ background: "rgba(255,255,255,0.02)" }}>
          <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#cdff00]" /> Claim-by-Claim Verification
          </h2>
          <div className="space-y-3">
            {claims_validation?.validations?.length > 0 ? (
              claims_validation.validations.map((v: any, i: number) => (
                <div key={i} className="p-4 rounded-xl border border-white/[0.05] bg-[#0a0a0a]">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-slate-200 flex-1 font-medium leading-relaxed">&ldquo;{v.claim}&rdquo;</p>
                    <StatusBadge status={v.status} />
                  </div>
                  <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">{v.reasoning}</p>
                  {v.evidence && <p className="text-xs text-slate-600 mt-1 italic">Evidence: {v.evidence}</p>}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">No claims to validate.</p>
            )}
          </div>
        </motion.section>

        {/* ═══ RED FLAGS ═══ */}
        {claims_validation?.red_flags?.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="rounded-2xl border border-rose-500/20 p-6 bg-rose-500/5">
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-4 text-rose-400 flex items-center gap-2">
              🚨 Red Flags Detected
            </h2>
            <ul className="space-y-2">
              {claims_validation.red_flags.map((flag: string, i: number) => (
                <li key={i} className="text-sm text-rose-300 flex items-start gap-2">
                  <span className="text-rose-500 mt-0.5">•</span> {flag}
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {/* ═══ STRENGTHS CONFIRMED ═══ */}
        {claims_validation?.strengths_confirmed?.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className="rounded-2xl border border-emerald-500/20 p-6 bg-emerald-500/5">
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-4 text-emerald-400 flex items-center gap-2">
              ✅ Confirmed Strengths
            </h2>
            <ul className="space-y-2">
              {claims_validation.strengths_confirmed.map((s: string, i: number) => (
                <li key={i} className="text-sm text-emerald-300 flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">•</span> {s}
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {/* ═══ PROJECTS ═══ */}
        {resume_data?.projects?.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="rounded-2xl border border-white/[0.06] p-6" style={{ background: "rgba(255,255,255,0.02)" }}>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400" /> Projects Extracted
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {resume_data.projects.map((p: any, i: number) => (
                <div key={i} className="p-4 rounded-xl bg-black/40 border border-white/[0.05]">
                  <h3 className="text-sm font-bold text-white mb-1">{p.name}</h3>
                  <p className="text-xs text-slate-400 mb-2">{p.description}</p>
                  {p.technologies?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.technologies.map((t: string, j: number) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* ═══ GITHUB-DISCOVERED PROJECTS (Not in Resume) ═══ */}
        {github_intelligence?.github_discovered_projects?.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}
            className="rounded-2xl border border-cyan-500/20 p-6" style={{ background: "rgba(6,182,212,0.03)" }}>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" /> More Projects on GitHub
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Found on GitHub but not mentioned in the resume — {github_intelligence.github_discovered_projects.length} additional projects
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {github_intelligence.github_discovered_projects.map((p: any, i: number) => (
                <div key={i} className="p-4 rounded-xl bg-black/40 border border-cyan-500/10 hover:border-cyan-500/30 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-bold text-white">{p.name}</h3>
                    <div className="flex items-center gap-2">
                      {p.language && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                          {p.language}
                        </span>
                      )}
                      {p.stars > 0 && <span className="text-[10px] text-slate-500">⭐{p.stars}</span>}
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">{p.description}</p>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer"
                       className="text-[10px] text-cyan-400 hover:underline">
                      View on GitHub →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </motion.section>
        )}
        {github_intelligence ? (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
            className="rounded-2xl border border-[#cdff00]/20 p-6" style={{ background: "rgba(205,255,0,0.02)" }}>
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="font-[family-name:var(--font-syne)] font-bold text-xl mb-1 text-[#cdff00]">GitHub Intelligence</h2>
                <p className="text-sm text-slate-400">Deep forensic scan of @{github_intelligence.username}</p>
              </div>
              <Link href={`/report/${github_intelligence.username}`}
                className="text-xs bg-[#cdff00] text-black px-4 py-2 rounded-lg font-bold hover:opacity-80 transition no-underline">
                Full GitHub Report →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Signal Score", value: `${github_intelligence.score}/100` },
                { label: "Risk Level", value: github_intelligence.risk_level },
                { label: "Languages", value: github_intelligence.top_languages?.slice(0, 3).join(", ") },
                { label: "Tier", value: github_intelligence.developer_tier?.tier },
                { label: "Public Repos", value: github_intelligence.public_repos },
                { label: "Total Stars", value: github_intelligence.total_stars },
                { label: "Authenticity", value: `${github_intelligence.authenticity_score}%` },
                { label: "Verdict", value: github_intelligence.verdict },
                { label: "Docs Quality", value: github_intelligence.documentation_quality || "-" },
                { label: "Coding Patterns", value: github_intelligence.coding_patterns || "-" },
                { label: "Code Health", value: github_intelligence.code_health_score ? `${github_intelligence.code_health_score}/100` : "-" },
                { label: "Streak", value: github_intelligence.contribution_streak || "-" }
              ].map((stat, i) => (
                stat.value !== "-" && (
                  <div key={i} className="p-3 rounded-xl bg-black/40 border border-white/5">
                    <span className="block text-slate-400 text-[10px] uppercase tracking-wider mb-1">{stat.label}</span>
                    <span className="text-sm font-bold text-white">{stat.value || "N/A"}</span>
                  </div>
                )
              ))}
            </div>
            {github_intelligence.developer_tier?.tier_description && (
              <div className="mt-4 p-4 rounded-xl border border-[#cdff00]/10 bg-[#cdff00]/5">
                <p className="text-sm text-[#cdff00]/80">
                  <strong className="text-[#cdff00]">Tier {github_intelligence.developer_tier.tier}:</strong> {github_intelligence.developer_tier.tier_description}
                </p>
              </div>
            )}
          </motion.section>
        ) : (
          <section className="rounded-2xl border border-white/[0.06] p-8 text-center text-slate-500">
            No GitHub profile linked or found for cross-reference.
          </section>
        )}

        {/* ═══ COMMIT TIMELINE FORENSICS ═══ */}
        {forensics && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48 }}
            className="rounded-2xl border border-white/[0.06] p-6" style={{ background: "rgba(255,255,255,0.02)" }}>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400" /> Commit Timeline Forensics
            </h2>
            
            {isStuffer && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-500 p-3 rounded-lg mb-5 font-bold flex items-center gap-2 text-sm">
                ⚠️ GITHUB STUFFER DETECTED — {forensics.stuffer_evidence?.commits} commits on {forensics.stuffer_evidence?.date} ({forensics.stuffer_evidence?.ratio_vs_avg}x avg)
              </div>
            )}
            
            <div className="h-32 w-full mt-2 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forensics.timeline}>
                  <XAxis dataKey="date" hide />
                  <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#0a0a0a', borderColor: '#333', borderRadius: '8px', fontSize: '12px'}} itemStyle={{color: '#fff'}} />
                  <Bar dataKey="commits" radius={[2, 2, 0, 0]}>
                    {forensics.timeline?.map((entry: any, index: number) => {
                      const spike = forensics.forensics?.spikes?.find((s: any) => s.date === entry.date);
                      return <Cell key={`cell-${index}`} fill={spike ? '#ef4444' : '#22c55e'} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-center">
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Active Days</span>
                <span className="text-sm font-bold">{forensics.forensics?.active_coding_days}</span>
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-center">
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Longest Gap</span>
                <span className="text-sm font-bold">{forensics.forensics?.longest_gap_days} d</span>
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-center">
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Pattern</span>
                <span className="text-sm font-bold uppercase">{forensics.forensics?.coding_pattern?.replace('_', ' ')}</span>
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-center">
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Weekend Ratio</span>
                <span className="text-sm font-bold">{forensics.forensics?.weekend_ratio}%</span>
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-center">
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Velocity</span>
                <span className="text-sm font-bold uppercase">{forensics.forensics?.velocity_trend}</span>
              </div>
            </div>
          </motion.section>
        )}

        {/* ═══ TIMELINE ═══ */}
        {claims_validation?.timeline_consistency && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="rounded-2xl border border-white/[0.06] p-6" style={{ background: "rgba(255,255,255,0.02)" }}>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" /> Timeline Consistency
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">{claims_validation.timeline_consistency}</p>
          </motion.section>
        )}

        {/* ═══ DEEP REPORT: EXECUTIVE SUMMARY ═══ */}
        {(() => {
          const rawSummary = deep_report?.executive_summary ?? "";
          const summaryIsEmpty = !rawSummary
            || rawSummary.includes("unavailable")
            || rawSummary.includes("quota exceeded")
            || rawSummary.includes("not available");

          const cName = resume_data?.name || "This candidate";
          const dipScore = Math.round(github_intelligence?.final_score ?? github_intelligence?.score ?? 0);
          const devTier = (() => {
            const t = github_intelligence?.developer_tier;
            return typeof t === "string" ? t : (t as any)?.tier ?? "Mid-Tier";
          })();
          const repoCount = github_intelligence?.public_repos ?? 0;
          const authPct = Math.round(
            ((github_intelligence?.authenticity_score ?? 0) > 1
              ? (github_intelligence?.authenticity_score ?? 0)
              : (github_intelligence?.authenticity_score ?? 0) * 100)
          );
          const topSkillNames = (github_intelligence?.top_skills ?? [])
            .slice(0, 3)
            .map((s: any) => typeof s === "string" ? s : (s?.skill_name || s?.name || ""))
            .filter(Boolean).join(", ") || "their claimed technologies";

          const displaySummary = summaryIsEmpty
            ? `${cName} is a ${devTier} developer scoring ${dipScore}/100 on the DevXray Intelligence Engine. ` +
              `${repoCount > 0 ? `GitHub forensic analysis across ${repoCount} repositories shows ${authPct}% code authenticity. ` : ""}` +
              `Strongest verified skills from actual code: ${topSkillNames}. ` +
              `${dipScore >= 75 ? "Recommendation: Strong candidate for mid-level roles." : dipScore >= 55 ? "Recommendation: Good fit for junior roles with mentorship." : "Recommendation: Additional screening advised."}`
            : rawSummary;

          return (dipScore > 0 || !summaryIsEmpty) ? (
            <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
              className="rounded-2xl border border-white/[0.06] p-6" style={{ background: "linear-gradient(135deg, rgba(205,255,0,0.03), rgba(255,255,255,0.02))" }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#cdff00]" /> Executive Summary
                </h2>
                {deep_report?.candidate_tier && (
                  <span className={`text-sm px-3 py-1 rounded-full font-bold border ${
                    deep_report.candidate_tier === "S" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                    deep_report.candidate_tier === "A" ? "bg-blue-500/15 text-blue-400 border-blue-500/30" :
                    deep_report.candidate_tier === "B" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                    "bg-rose-500/15 text-rose-400 border-rose-500/30"
                  }`}>
                    Tier {deep_report.candidate_tier}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">{displaySummary}</p>
              {deep_report?.comparison_notes && (
                <p className="text-xs text-slate-500 mt-3 italic">{deep_report.comparison_notes}</p>
              )}
            </motion.section>
          ) : null;
        })()}

        {/* ═══ DEEP REPORT: SKILL ASSESSMENT ═══ */}
        {(() => {
          const aiSkills = deep_report?.skill_assessment as Record<string, number> | undefined;
          const hasRealSkills = aiSkills && Object.values(aiSkills).some(v => Number(v) > 0);

          // Use DIP skill_summary (category averages from actual code analysis)
          const dipSummary: Record<string, number> = github_intelligence?.skill_summary ?? {};
          const dipS = github_intelligence?.final_score ?? github_intelligence?.score ?? 50;

          // skill_name list from top_skills (for presence checks)
          const skillNames = (github_intelligence?.top_skills ?? [])
            .map((s: any) => (typeof s === "string" ? s : s?.skill_name || "").toLowerCase());

          // Helper: average scores from multiple DIP categories
          const avgCategories = (...cats: string[]): number => {
            const vals = cats.map(c => dipSummary[c]).filter(v => v != null && Number(v) > 0);
            if (vals.length === 0) return 0;
            return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
          };

          const computedSkills: Record<string, number> = hasRealSkills ? aiSkills! : {
            // Frontend: use DIP "frontend" category if present, else presence check
            "Frontend": avgCategories("frontend") ||
              (skillNames.some((s: string) => ["react","vue","angular","tailwind","next.js","html","css","svelte"].includes(s))
                ? Math.min(Math.round(dipS * 0.13), 10) : 2),

            // Backend: use DIP "backend" category
            "Backend": avgCategories("backend") ||
              (skillNames.some((s: string) => ["node.js","python","flask","express","fastapi","django","java","go"].includes(s))
                ? Math.min(Math.round(dipS * 0.11), 10) : 2),

            // Problem Solving: proxy from testing + overall score
            "Problem Solving": avgCategories("testing") ||
              Math.min(Math.round(dipS * 0.09), 10),

            // System Design: proxy from database + backend
            "System Design": avgCategories("database","sql/databases") ||
              Math.min(Math.round(dipS * 0.07), 10),

            // AI / ML: aggregate ALL ml-related DIP categories — this fixes the 1/10 bug
            // DIP uses "ml", "ai_ml" as separate category keys
            "AI / ML": avgCategories("ml", "ai_ml") ||
              (skillNames.some((s: string) =>
                ["tensorflow","pytorch","opencv","pandas","numpy","scikit-learn",
                 "machine learning","deep learning","mediapipe","huggingface",
                 "openai api","langchain","face recognition","data science"].includes(s))
                ? Math.min(Math.round(dipS * 0.10), 10) : 0),

            // DevOps: use DIP "devops" category
            "DevOps": avgCategories("devops") ||
              (skillNames.some((s: string) => ["docker","kubernetes","ci/cd","redis","aws","gcp","terraform"].includes(s))
                ? Math.min(Math.round(dipS * 0.08), 10) : 0),
          };

          // Remove zero scores so bars don't show for genuinely absent skills
          const filteredSkills = Object.fromEntries(
            Object.entries(computedSkills).filter(([, v]) => Number(v) > 0)
          );

          if (Object.keys(filteredSkills).length === 0) return null;

          return (
            <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
              className="rounded-2xl border border-white/[0.06] p-6" style={{ background: "rgba(255,255,255,0.02)" }}>
              <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-400" /> Skill Assessment {hasRealSkills ? "(AI Estimated)" : "(DIP Engine)"}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(filteredSkills).map(([skill, level]: [string, any]) => (
                  <div key={skill} className="p-3 rounded-xl bg-black/40 border border-white/5">
                    <span className="block text-[10px] text-slate-500 uppercase tracking-wider mb-2">{skill.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${(level as number) * 10}%` }}
                          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
                          style={{
                          background: (level as number) >= 7 ? "#22c55e" : (level as number) >= 4 ? "#eab308" : "#64748b"
                        }} />
                      </div>
                      <span className="text-xs font-bold text-white">{level}/10</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          );
        })()}

        {/* ═══ LINKEDIN ASSESSMENT ═══ */}
        {(linkedin_data || deep_report?.linkedin_assessment) && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}
            className="rounded-2xl border border-blue-500/20 p-6 bg-blue-500/5">
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-4 text-blue-400 flex items-center gap-2">
              🔗 LinkedIn Assessment
            </h2>
            {linkedin_data?.name && <p className="text-sm text-white font-bold">{linkedin_data.name}</p>}
            {linkedin_data?.headline && <p className="text-xs text-slate-400 mt-1">{linkedin_data.headline}</p>}
            {linkedin_data?.note && <p className="text-xs text-slate-500 mt-2 italic">{linkedin_data.note}</p>}
            {deep_report?.linkedin_assessment && (
              <p className="text-sm text-slate-300 mt-3 leading-relaxed">{deep_report.linkedin_assessment}</p>
            )}
          </motion.section>
        )}

        {/* ═══ INTERVIEW FOCUS AREAS ═══ */}
        {deep_report?.interview_focus_areas?.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
            className="rounded-2xl border border-white/[0.06] p-6" style={{ background: "rgba(255,255,255,0.02)" }}>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400" /> Interview Deep-Dive Areas
            </h2>
            <div className="space-y-2">
              {deep_report.interview_focus_areas.map((area: string, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-black/30 border border-white/[0.04]">
                  <span className="text-orange-400 font-bold text-sm mt-0.5">{i + 1}.</span>
                  <p className="text-sm text-slate-300">{area}</p>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* ═══ GROWTH TRAJECTORY ═══ */}
        {deep_report?.growth_trajectory && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }}
            className="rounded-2xl border border-white/[0.06] p-6" style={{ background: "rgba(255,255,255,0.02)" }}>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400" /> Growth Trajectory
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">{deep_report.growth_trajectory}</p>
          </motion.section>
        )}

        {/* ═══ GITHUB BADGE SHARING ═══ */}
        {githubUsername && (
          <ReportErrorBoundary section="GitHub Badge">
          <BadgeShareSection username={githubUsername} />
          </ReportErrorBoundary>
        )}

      </main>
    </div>
  );
}
