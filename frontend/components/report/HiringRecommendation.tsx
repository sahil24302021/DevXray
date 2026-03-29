"use client";

import { motion } from "framer-motion";
import { AnalysisResult } from "@/lib/api";

interface Props {
  data: AnalysisResult;
}

export default function HiringRecommendation({ data }: Props) {
  const riskColors: Record<string, string> = {
    Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    High: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  const riskStyle = riskColors[data.risk_level as string] || riskColors.Medium;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.22 }}
      className="rounded-2xl border border-white/[0.06] p-6 flex flex-col"
      style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(24px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-[#cdff00]/10 flex items-center justify-center text-[#cdff00] border border-[#cdff00]/20">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Hiring Decision</span>
      </div>

      <div className="text-sm text-white font-semibold leading-relaxed mb-4 flex-1 space-y-3">
        {typeof data.hiring_recommendation === "string" ? (
          <p>{data.hiring_recommendation}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.hiring_recommendation?.recommendation || {}).map(([level, decision]) => {
                const isYes = decision === "YES";
                const isMaybe = decision === "MAYBE";
                return (
                  <div key={level} className={`px-2 py-1 rounded-md text-xs font-bold border ${isYes ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : isMaybe ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-white/5 text-white/40 border-white/10"}`}>
                    <span className="capitalize">{level}</span>: {decision as string}
                  </div>
                );
              })}
            </div>
            {(data.hiring_recommendation as any)?.reasoning?.length > 0 && (
              <ul className="space-y-1.5 mt-2 text-xs text-white/70 font-normal">
                {((data.hiring_recommendation as any)?.reasoning ?? []).map((r: string, i: number) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-[#cdff00] mt-0.5">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-white/[0.06] pt-3 mt-auto">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Risk</span>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${riskStyle}`}>
          {data.risk_level}
        </span>
        <span className="text-[10px] text-slate-500 ml-1 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-[#cdff00]" />
          {Math.round(((data.confidence_score ?? 0) > 1 ? (data.confidence_score ?? 0) : (data.confidence_score ?? 0) * 100))}% confidence
        </span>
      </div>
    </motion.div>
  );
}
