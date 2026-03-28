"use client";

import { motion } from "framer-motion";
import { CommitAnalysis as CommitAnalysisType } from "@/lib/api";

interface Props {
  data: CommitAnalysisType;
}

export default function CommitAnalysis({ data }: Props) {
  if (!data || data.total_analyzed === 0) return null;

  const qualityColor =
    data.quality_score >= 7 ? "text-emerald-400" :
    data.quality_score >= 4 ? "text-amber-400" : "text-red-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.32 }}
      className="rounded-2xl border border-white/[0.06] p-6 flex flex-col"
      style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(24px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div className="flex items-center gap-2 mb-5">
        <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Commit Intelligence</span>
      </div>

      <div className="flex items-end gap-1 mb-2">
        <span className={`text-4xl font-bold tabular-nums ${qualityColor}`}>{data.quality_score}</span>
        <span className="text-lg font-bold text-slate-500 mb-0.5">/10</span>
      </div>
      <p className="text-xs text-slate-500 mb-4">{data.total_analyzed} commits analyzed</p>

      <p className="text-xs text-slate-300 leading-relaxed mb-4 flex-1">{data.insight}</p>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3 mt-auto">
        <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">Conventional</div>
          <div className="text-sm font-semibold text-slate-200 tabular-nums">{data.conventional_ratio}%</div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">Lazy Commits</div>
          <div className={`text-sm font-semibold tabular-nums ${data.lazy_commit_ratio > 30 ? "text-red-400" : "text-slate-200"}`}>
            {data.lazy_commit_ratio}%
          </div>
        </div>
      </div>
    </motion.div>
  );
}
