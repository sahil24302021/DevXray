"use client";

import { motion } from "framer-motion";
import { AnalysisResult } from "@/lib/api";

interface Props {
  data: AnalysisResult;
}

export default function AuthenticityScanner({ data }: Props) {
  const score = (data.authenticity_score ?? 0) as number;
  const isGood = score >= 60;
  const organicPct = Number(data.organic_commits_percentage ?? 0);
  const bulkPct = Number((data as any).bulk_commits_percentage ?? (100 - organicPct));

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.28 }}
      className="rounded-2xl border border-white/[0.06] p-6 flex flex-col"
      style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(24px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div className="flex items-center gap-2 mb-5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${isGood ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Code Authenticity</span>
      </div>

      <div className="flex items-end gap-1 mb-3">
        <span className={`text-4xl font-bold tabular-nums ${isGood ? "text-emerald-400" : "text-red-400"}`}>
          {score}
        </span>
        <span className="text-lg font-bold text-slate-500 mb-0.5">%</span>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed mb-4 flex-1">
        {isGood
          ? "Organic, iterative coding patterns confirmed."
          : "Warning: Bulk pushes or synthetic patterns detected."}
      </p>

      {/* Organic bar */}
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-[11px] mb-1.5">
            <span className="text-slate-400 font-medium">Organic Commits</span>
            <span className="text-slate-300 font-semibold tabular-nums">{organicPct.toFixed(1)}%</span>
          </div>
          <div className="progress-track">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${organicPct}%` }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
              className="progress-fill"
              style={{ background: isGood ? "linear-gradient(90deg, #60a5fa, #34d399)" : "linear-gradient(90deg, #fb7185, #f97316)" }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] mb-1.5">
            <span className="text-slate-400 font-medium">Bulk Dumps</span>
            <span className="text-slate-300 font-semibold tabular-nums">{bulkPct.toFixed(1)}%</span>
          </div>
          <div className="progress-track">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${bulkPct}%` }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.7 }}
              className="progress-fill"
              style={{ background: "rgba(255,255,255,0.1)" }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
