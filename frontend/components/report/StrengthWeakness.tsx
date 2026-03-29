"use client";

import { motion } from "framer-motion";
import { AnalysisResult } from "@/lib/api";

interface Props {
  data: AnalysisResult;
}

export default function StrengthWeakness({ data }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5"
    >
      {/* Strengths */}
      <div
        className="rounded-2xl border border-white/[0.06] p-6"
        style={{
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Strengths</span>
        </div>
        <ul className="space-y-3">
          {(data.strengths ?? []).length > 0 ? (
            (data.strengths ?? []).map((str: string, i: number) => (
              <li key={i} className="flex items-start gap-2.5 text-slate-300 text-sm leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
                {str}
              </li>
            ))
          ) : (
            <p className="text-slate-500 text-sm italic">No strong signals identified.</p>
          )}
        </ul>
      </div>

      {/* Weaknesses */}
      <div
        className="rounded-2xl border border-white/[0.06] p-6"
        style={{
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
            </svg>
          </div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Weaknesses</span>
        </div>
        <ul className="space-y-3">
          {(data.weaknesses ?? []).length > 0 ? (
            (data.weaknesses ?? []).map((w: string, i: number) => (
              <li key={i} className="flex items-start gap-2.5 text-slate-300 text-sm leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0 shadow-[0_0_6px_rgba(251,191,36,0.4)]" />
                {w}
              </li>
            ))
          ) : (
            <p className="text-slate-500 text-sm italic">No major weaknesses detected.</p>
          )}
        </ul>
      </div>
    </motion.div>
  );
}
