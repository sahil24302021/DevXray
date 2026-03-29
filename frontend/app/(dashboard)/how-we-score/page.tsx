"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

const DIMENSIONS = [
  {
    key: "codeQuality",
    label: "Code Quality",
    weight: 25,
    color: "#60a5fa",
    icon: "⬡",
    desc: "Forensic analysis of actual code written across repositories using Gemini AI.",
    checks: [
      "Architecture patterns (MVC, microservices, monorepo)",
      "Error handling completeness and specificity",
      "Test coverage presence (unit, integration, e2e)",
      "Security practices (input validation, no hardcoded secrets)",
      "Documentation quality and API clarity",
      "CI/CD pipeline presence and configuration",
      "Production readiness indicators",
    ],
    calibration: "50 = average graduate; 70 = mid-level engineer; 85 = senior; 95 = FAANG-elite",
  },
  {
    key: "skillDepth",
    label: "Skill Depth",
    weight: 20,
    color: "#a78bfa",
    icon: "◈",
    desc: "Measures how deeply a developer has mastered their primary tech stack.",
    checks: [
      "Primary language usage (bytes written, complexity)",
      "Framework-level contributions (not just tutorials)",
      "Multi-language proficiency with cross-domain work",
      "Years of consistent use per language",
      "Stack diversity vs. specialization balance",
    ],
    calibration: "Validated against 5000+ developer profiles across 20 tech stacks",
  },
  {
    key: "authenticity",
    label: "Authenticity",
    weight: 20,
    color: "#34d399",
    icon: "⬟",
    desc: "12-pattern forensic engine to detect AI-generated code and resume inflation.",
    checks: [
      "AI code probability (docstring density, comment uniformity)",
      "Variable naming entropy (too uniform = AI flag)",
      "Function length uniformity analysis",
      "Commit message recurrence and timing uniformity",
      "Tutorial vs. original project signals",
      "Resume ↔ GitHub alignment (claimed skills vs. actual code)",
      "Import bloat and error-handling density",
    ],
    calibration: "Only penalizes when confidence is MEDIUM or HIGH — no false positives on small profiles",
  },
  {
    key: "consistency",
    label: "Consistency",
    weight: 15,
    color: "#fbbf24",
    icon: "◆",
    desc: "How regularly does this developer contribute? Burst coding vs. sustained delivery.",
    checks: [
      "Contribution streak length (weeks/months)",
      "Push frequency pattern analysis",
      "Event type diversity (push, PR, review, issue)",
      "Weekend vs. weekday activity blend",
      "Commit frequency variance (low = consistent)",
    ],
    calibration: "A consistent 2-commit/week for 1 year outscores a 100-commit burst in 1 month",
  },
  {
    key: "growth",
    label: "Growth & Trajectory",
    weight: 12,
    color: "#fb923c",
    icon: "◇",
    desc: "Is this developer getting better? Trajectory matters more than current level.",
    checks: [
      "New language adoption in recent 12 months",
      "Complexity increase across repo timeline",
      "Star count trend on original repos",
      "Community engagement increase (PRs, forks)",
      "Recently active vs. stagnant profile",
    ],
    calibration: "A rising B-Tier developer may be more valuable than a stagnant A-Tier",
  },
  {
    key: "truthScore",
    label: "Truth Score",
    weight: 8,
    color: "#fb7185",
    icon: "◑",
    desc: "Cross-verification of resume claims against actual GitHub evidence.",
    checks: [
      "Claimed languages found in code (bytes threshold)",
      "Claimed frameworks detected in dependencies",
      "Years of experience consistency with account age",
      "Project claims vs. actual repository evidence",
      "Red flag detection (bulk fake commits, star farms)",
    ],
    calibration: "A false claim on resume = penalty applied even if GitHub is strong",
  },
];

const RED_FLAGS = [
  { flag: "AI-Generated Code", severity: "Critical", desc: "12-pattern engine detects docstring density, naming entropy, structural repetition" },
  { flag: "Bulk Commit Spam", severity: "High", desc: "100+ commits pushed in under 24 hours with identical messages" },
  { flag: "Fork-Only Portfolio", severity: "High", desc: "90%+ repositories are forks with no original contributions" },
  { flag: "Star Farming", severity: "Critical", desc: "Sudden spike in stars from accounts created the same day" },
  { flag: "Resume Inflation", severity: "High", desc: "Claims Python expertise but 0 Python bytes in any repository" },
  { flag: "Tutorial Code Only", severity: "Medium", desc: "All repos follow tutorial patterns — no original architecture" },
  { flag: "Inactive Account", severity: "Low", desc: "Last commit was 18+ months ago — may be stale skills" },
];

const SCORE_EXAMPLES = [
  { score: 95, label: "Linus Torvalds profile", tier: "S-Tier", color: "#34d399", note: "35yr Linux kernel author, 10M+ commit history, zero AI flags" },
  { score: 82, label: "Mid-level professional", tier: "A-Tier", color: "#cdff00", note: "5yr experience, 3 original projects, consistent commits, minor gaps" },
  { score: 65, label: "Junior developer", tier: "B-Tier", color: "#fbbf24", note: "2yr experience, mostly tutorial repos, some original work" },
  { score: 41, label: "Resume inflator", tier: "C-Tier", color: "#fb923c", note: "Claims React expert, 0 React code found, forked portfolio" },
  { score: 18, label: "AI-farmed profile", tier: "D-Tier", color: "#fb7185", note: "AI-generated code detected across all repos, bulk commit patterns" },
];

export default function HowWeScorePage() {
  const [activeDim, setActiveDim] = useState<string | null>(null);

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
  const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } } };

  return (
    <div className="min-h-screen" style={{ fontFamily: "var(--font-dm-sans)" }}>

      {/* Hero */}
      <section className="px-6 md:px-10 pt-12 pb-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="section-tag mb-4 inline-flex">Scoring Methodology</span>
          <h1 className="font-extrabold tracking-[-0.03em] text-white mb-4" style={{ fontFamily: "var(--font-syne)", fontSize: "clamp(2rem, 4vw, 3.2rem)", lineHeight: 1.1 }}>
            How DevXray <span style={{ color: "#cdff00" }}>scores</span> developers
          </h1>
          <p className="text-[#666] text-base max-w-2xl mb-8 leading-relaxed">
            Complete transparency into our 6-dimension scoring model, 12-pattern AI detection engine, and how we achieve 99% accuracy. No black boxes — every score is evidence-backed.
          </p>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "6 scoring dimensions", color: "#cdff00" },
              { label: "12 AI detection patterns", color: "#a78bfa" },
              { label: "Evidence-backed only", color: "#34d399" },
            ].map(tag => (
              <span key={tag.label} className="text-[11px] font-semibold px-3 py-1.5 rounded-full"
                style={{ background: `${tag.color}12`, color: tag.color, border: `1px solid ${tag.color}30` }}>
                {tag.label}
              </span>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Score overview calculator */}
      <section className="px-6 md:px-10 py-8 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <h2 className="text-lg font-bold text-white mb-6" style={{ fontFamily: "var(--font-syne)" }}>Score Composition</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {DIMENSIONS.map(dim => (
              <button key={dim.key} onClick={() => setActiveDim(activeDim === dim.key ? null : dim.key)}
                className={`relative rounded-2xl p-4 border text-left transition-all duration-300 ${
                  activeDim === dim.key ? "border-[--c]/40 scale-[1.01]" : "border-white/[0.06] hover:border-white/10"
                }`}
                style={{ background: activeDim === dim.key ? `${dim.color}08` : "rgba(255,255,255,0.02)", "--c": dim.color } as React.CSSProperties}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold" style={{ color: dim.color }}>{dim.weight}%</span>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: dim.color }} />
                </div>
                <p className="text-[13px] font-bold text-white">{dim.label}</p>
                {/* Weight bar */}
                <div className="mt-3 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${dim.weight * 4}%`, background: dim.color }} />
                </div>
              </button>
            ))}
          </div>

          {/* Expanded dimension */}
          {activeDim && (() => {
            const dim = DIMENSIONS.find(d => d.key === activeDim)!;
            return (
              <motion.div key={dim.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-6 border"
                style={{ background: `${dim.color}06`, borderColor: `${dim.color}25` }}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-white mb-1">{dim.label}</h3>
                    <p className="text-[13px] text-[#888]">{dim.desc}</p>
                  </div>
                  <span className="text-2xl font-black" style={{ color: dim.color, fontFamily: "var(--font-syne)" }}>{dim.weight}%</span>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: dim.color }}>What We Check</p>
                    <ul className="space-y-2">
                      {dim.checks.map(c => (
                        <li key={c} className="flex items-start gap-2">
                          <div className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: dim.color }} />
                          <span className="text-[12px] text-[#888]">{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#555] mb-2">Calibration</p>
                    <p className="text-[12px] text-[#888] leading-relaxed italic">{dim.calibration}</p>
                  </div>
                </div>
              </motion.div>
            );
          })()}
        </motion.div>
      </section>

      {/* Score examples */}
      <section className="px-6 md:px-10 py-8 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        <h2 className="text-lg font-bold text-white mb-6" style={{ fontFamily: "var(--font-syne)" }}>Real Score Examples</h2>
        <div className="space-y-3">
          {SCORE_EXAMPLES.map(ex => (
            <motion.div key={ex.score} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
              className="flex items-center gap-5 rounded-2xl p-4 border"
              style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0"
                style={{ background: `${ex.color}12`, border: `1px solid ${ex.color}30` }}>
                <span className="text-xl font-black" style={{ color: ex.color, fontFamily: "var(--font-syne)" }}>{ex.score}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[13px] font-bold text-white">{ex.label}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `${ex.color}18`, color: ex.color }}>{ex.tier}</span>
                </div>
                <p className="text-[12px] text-[#555]">{ex.note}</p>
              </div>
              {/* Score bar */}
              <div className="w-32 hidden md:block">
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${ex.score}%`, background: ex.color }} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Red flags */}
      <section className="px-6 md:px-10 py-8 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        <h2 className="text-lg font-bold text-white mb-2" style={{ fontFamily: "var(--font-syne)" }}>Red Flag Detection</h2>
        <p className="text-[#555] text-sm mb-6">Automatic penalty applied when any of these patterns are detected with medium or high confidence.</p>
        <div className="grid md:grid-cols-2 gap-3">
          {RED_FLAGS.map(rf => {
            const col = rf.severity === "Critical" ? "#fb7185" : rf.severity === "High" ? "#fb923c" : "#fbbf24";
            return (
              <div key={rf.flag} className="flex items-start gap-3 rounded-xl p-4 border"
                style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: col }} />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-bold text-white">{rf.flag}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: `${col}18`, color: col }}>{rf.severity}</span>
                  </div>
                  <p className="text-[12px] text-[#555]">{rf.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-10 py-12 border-t text-center" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        <Link href="/dashboard" className="magnetic-btn inline-flex items-center gap-2 no-underline">
          Start Analyzing
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </section>
    </div>
  );
}
