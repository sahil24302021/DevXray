"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, useSpring, useMotionValue, useTransform } from "framer-motion";
import Link from "next/link";
import { BarChart, Bar, Cell, XAxis, Tooltip, ResponsiveContainer } from "recharts";

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
  const score = deep_report?.overall_score ?? claims_validation?.authenticity_score ?? 0;
  
  // Extract simple recommendation string if it's an object now
  let rec = deep_report?.hire_decision || claims_validation?.hiring_recommendation;
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

      <main ref={reportRef} className="relative z-10 mx-auto max-w-6xl px-6 py-10 pb-20 space-y-6">

        {/* ═══ HEADER ═══ */}
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
              <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-2">Authenticity</span>
            </div>
          </div>
          {/* Metadata bar */}
          {analysis_metadata && (
            <div className="flex flex-wrap gap-4 mt-6 pt-5 border-t border-white/[0.05]">
              {[
                { label: "GitHub Matched", value: analysis_metadata.github_matched ? "✅ Yes" : "❌ No" },
                { label: "Claims Extracted", value: analysis_metadata.claims_extracted },
                { label: "Projects Found", value: analysis_metadata.projects_found },
                { label: "Experience", value: `${resume_data?.years_of_experience || "?"} years` },
              ].map((m, i) => (
                <div key={i} className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">{m.label}</span>
                  <span className="text-sm font-bold text-white">{m.value}</span>
                </div>
              ))}
            </div>
          )}
        </motion.section>

        {/* ═══ HIRING RECOMMENDATION ═══ */}
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

        {/* ═══ GITHUB INTELLIGENCE ═══ */}
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
        {deep_report?.executive_summary && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
            className="rounded-2xl border border-white/[0.06] p-6" style={{ background: "linear-gradient(135deg, rgba(205,255,0,0.03), rgba(255,255,255,0.02))" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#cdff00]" /> Executive Summary
              </h2>
              {deep_report.candidate_tier && (
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
            <p className="text-sm text-slate-300 leading-relaxed">{deep_report.executive_summary}</p>
            {deep_report.comparison_notes && (
              <p className="text-xs text-slate-500 mt-3 italic">{deep_report.comparison_notes}</p>
            )}
          </motion.section>
        )}

        {/* ═══ DEEP REPORT: SKILL ASSESSMENT ═══ */}
        {deep_report?.skill_assessment && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
            className="rounded-2xl border border-white/[0.06] p-6" style={{ background: "rgba(255,255,255,0.02)" }}>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-violet-400" /> Skill Assessment (AI Estimated)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(deep_report.skill_assessment).map(([skill, level]: [string, any]) => (
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
                        background: (level as number) >= 7 ? "#22c55e" : (level as number) >= 4 ? "#eab308" : "#ef4444"
                      }} />
                    </div>
                    <span className="text-xs font-bold text-white">{level}/10</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}

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

      </main>
    </div>
  );
}
