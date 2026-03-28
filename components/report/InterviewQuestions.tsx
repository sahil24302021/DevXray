"use client";

import { motion } from "framer-motion";
import { InterviewQuestion } from "@/lib/api";

type ExtendedQuestion = InterviewQuestion & {
  category?: string;
  why?: string;
};

interface Props {
  questions: ExtendedQuestion[];
}

export default function InterviewQuestions({ questions }: Props) {
  if (!questions || questions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="rounded-2xl border border-white/[0.06] p-6 lg:col-span-2"
      style={{
        background: "rgba(255, 255, 255, 0.02)",
        backdropFilter: "blur(24px)",
      }}
    >
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 rounded-lg bg-[#cdff00]/10 flex items-center justify-center text-[#cdff00] border border-[#cdff00]/20">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide">AI Interview Copilot</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">Targeted technical questions based on code forensic analysis</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {questions.map((q, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="group relative p-5 rounded-xl border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03] transition-colors"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-[#cdff00]/30 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-[#cdff00] uppercase tracking-wider">{q.category ?? q.focus_area ?? "Technical"}</span>
              <span className="text-[10px] font-medium text-slate-500 bg-white/5 px-2 py-0.5 rounded-sm">Q{i + 1}</span>
            </div>
            
            <p className="text-[13px] text-slate-200 font-medium mb-4 leading-relaxed group-hover:text-white transition-colors">
              "{q.question}"
            </p>
            
            <div className="pt-3 border-t border-white/[0.04] flex items-start gap-2">
              <svg className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-[10px] text-slate-400">
                <span className="font-semibold text-slate-300">Why ask this: </span>
                {q.why ?? q.suggested_answer ?? "Helps evaluate depth of understanding."}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
