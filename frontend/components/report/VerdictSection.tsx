"use client";

import { motion } from "framer-motion";
import { AnalysisResult } from "@/lib/api";

interface Props {
  data: AnalysisResult;
}

export default function VerdictSection({ data }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">AI Assessment</span>
      </div>

      {data.summary && (
        <p className="text-sm text-slate-200 leading-relaxed font-medium mb-3 flex-1">
          &ldquo;{String(data.summary)}&rdquo;
        </p>
      )}
      {data.verdict_explanation && (
        <p className="text-xs text-slate-400 leading-relaxed border-t border-white/[0.06] pt-3 mt-auto">
          {String(data.verdict_explanation)}
        </p>
      )}
    </motion.div>
  );
}
