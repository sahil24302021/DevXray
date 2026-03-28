"use client";

import { motion } from "framer-motion";
import { AnalysisResult } from "@/lib/api";

interface Props {
  data: AnalysisResult;
}

export default function RedFlags({ data }: Props) {
  if (!data.red_flags || data.red_flags.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="mt-5 rounded-2xl border border-red-500/20 p-6 relative overflow-hidden"
      style={{
        background: "rgba(239, 68, 68, 0.04)",
        backdropFilter: "blur(24px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.2), 0 0 30px rgba(239,68,68,0.03), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      {/* Left accent bar */}
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-red-400 to-red-600 rounded-l-2xl shadow-[0_0_10px_rgba(239,68,68,0.3)]" />

      <div className="pl-4">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-[0.15em]">Risk Indicators</span>
        </div>

        <ul className="space-y-3">
          {data.red_flags.map((flag, i) => (
            <li key={i} className="flex items-start gap-2.5 text-red-200/80 text-sm leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.4)]" />
              {flag}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
