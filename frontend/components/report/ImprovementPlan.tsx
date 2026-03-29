"use client";

import { motion } from "framer-motion";
import { AnalysisResult } from "@/lib/api";

interface ImprovementItem {
  action: string;
  impact?: string;
  priority?: string;
}

interface Props {
  data: AnalysisResult;
}

export default function ImprovementPlan({ data }: Props) {
  if (!data.improvements || data.improvements.length === 0) return null;

  const priorityStyle: Record<string, string> = {
    High: "text-red-400 bg-red-500/10 border-red-500/20",
    Medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    Low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="mt-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-[#cdff00]/10 flex items-center justify-center border border-[#cdff00]/20">
          <svg className="w-3.5 h-3.5 text-[#cdff00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Growth Roadmap</span>
      </div>

      <div className="space-y-3">
        {data.improvements.map((rawItem, i) => {
          // Backend may send strings or objects with action/impact/priority
          const item: ImprovementItem = typeof rawItem === "string"
            ? { action: rawItem as string, impact: undefined, priority: undefined }
            : rawItem as unknown as ImprovementItem;

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="rounded-2xl border border-white/[0.06] p-5 flex items-start gap-4 hover:border-[#cdff00]/15 transition-all group cursor-default"
              style={{
                background: "rgba(255,255,255,0.03)",
                backdropFilter: "blur(24px)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              <span className="flex-shrink-0 w-8 h-8 rounded-xl bg-white/[0.05] text-slate-400 flex items-center justify-center text-sm font-bold group-hover:bg-[#cdff00]/10 group-hover:text-[#cdff00] transition-colors border border-white/[0.06]">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">{item.action}</p>
                {item.impact && <p className="text-slate-400 text-xs mt-1">{item.impact}</p>}
              </div>
              {item.priority && (
                <span
                  className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                    priorityStyle[item.priority] || priorityStyle.Low
                  }`}
                >
                  {item.priority}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
