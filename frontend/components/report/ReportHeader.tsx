"use client";

import { motion } from "framer-motion";
import { AnalysisResult } from "@/lib/api";

interface Props {
  data: AnalysisResult;
}

export default function ReportHeader({ data }: Props) {
  const score = (data.final_score ?? data.score ?? 0) as number;
  const circumference = 2 * Math.PI * 46;
  const offset = circumference - (score / 100) * circumference;
  const scoreColor =
    score >= 80 ? "#34d399" :
    score >= 60 ? "#fbbf24" : "#fb7185";

  const gradClass =
    score >= 80 ? "grad-text-score-strong" :
    score >= 60 ? "grad-text-score-moderate" : "grad-text-score-risky";

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center text-center relative w-full pt-8"
    >
      {/* PDF Download */}
      <div className="absolute top-0 right-0 print:hidden z-10 w-full flex justify-end">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-white/[0.05] border border-white/[0.08] rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:border-white/[0.15] transition-all flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download PDF
        </button>
      </div>

      {/* Badge */}
      <div
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-[0.2em] uppercase mb-8"
        style={{
          background: "linear-gradient(135deg, rgba(34,211,238,0.06), rgba(167,139,250,0.06))",
          border: "1px solid rgba(34,211,238,0.15)",
          color: "#22d3ee",
        }}
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
        DevXray Intelligence Report
      </div>

      {/* Avatar */}
      <div className="relative mb-6">
        <svg className="w-[120px] h-[120px] -rotate-90" viewBox="0 0 100 100">
          <circle className="score-ring-track" cx="50" cy="50" r="46" />
          <motion.circle
            className="score-ring-fill"
            cx="50" cy="50" r="46"
            stroke={scoreColor}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          />
        </svg>
        <img
          src={data.avatar_url}
          alt={data.username}
          className="w-[88px] h-[88px] rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-white/10 shadow-lg object-cover"
        />
      </div>

      {/* Username */}
      <h1 className="font-[family-name:var(--font-syne)] font-bold text-2xl text-white mb-1">
        @{data.username}
      </h1>
      {data.name && <p className="text-sm text-slate-400 mb-1">{data.name}</p>}
      {data.bio && <p className="text-xs text-slate-500 max-w-md mb-5">{data.bio}</p>}

      {/* Score */}
      <div className="mb-4">
        <span className={`text-6xl font-bold tabular-nums ${gradClass}`}>{score}</span>
        <span className="text-xl text-slate-500 font-light ml-1">/ 100</span>
      </div>

      {/* Verdict + Confidence */}
      <div className="flex items-center gap-3 mb-6 flex-wrap justify-center">
        <span className="text-sm font-semibold text-white">{data.verdict}</span>
        <span className="text-slate-500">·</span>
        <span className="stat-pill text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.4)]" />
          {Math.round(((data.confidence_score ?? 0) > 1 ? (data.confidence_score ?? 0) : (data.confidence_score ?? 0) * 100))}% confidence
        </span>
      </div>

      {/* Stats Pills */}
      <div className="flex flex-wrap gap-2 justify-center mb-6">
        <span className="stat-pill">{data.total_repos || data.public_repos} repos</span>
        <span className="stat-pill">{data.followers?.toLocaleString()} followers</span>
        <span className="stat-pill">{data.total_stars?.toLocaleString()} stars</span>
        {((data.account_age_years as number) ?? 0) > 0 && (
          <span className="stat-pill">{data.account_age_years as number}yr account</span>
        )}
        {((data.repos_deep_analyzed as number) ?? 0) > 0 && (
          <span className="stat-pill">{data.repos_deep_analyzed as number} repos deep-analyzed</span>
        )}
      </div>

      {/* Score Breakdown Bar */}
      {data.score_breakdown?.breakdown && (
        <div className="w-full max-w-md">
          <div className="flex items-center gap-1 h-2.5 rounded-full overflow-hidden bg-white/[0.04] mb-3">
            <ScoreSegment value={data.score_breakdown.breakdown.code_quality} max={30} color="#60a5fa" />
            <ScoreSegment value={data.score_breakdown.breakdown.skill_depth} max={20} color="#a78bfa" />
            <ScoreSegment value={data.score_breakdown.breakdown.consistency} max={20} color="#34d399" />
            <ScoreSegment value={data.score_breakdown.breakdown.growth} max={15} color="#fbbf24" />
            <ScoreSegment value={data.score_breakdown.breakdown.authenticity} max={15} color="#f472b6" />
          </div>
          <div className="flex justify-between text-[9px] text-slate-500 font-medium uppercase tracking-wider">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Depth</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400" />Own</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Active</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Complex</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-pink-400" />Lang</span>
          </div>
        </div>
      )}
    </motion.section>
  );
}

function ScoreSegment({ value, max, color }: { value: number; max: number; color: string }) {
  const percentage = (value / max) * (max);
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
