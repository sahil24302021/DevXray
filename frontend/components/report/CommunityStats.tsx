"use client";

import { motion } from "framer-motion";
import { CommunityStats as CommunityStatsType } from "@/lib/api";

interface Props {
  data: CommunityStatsType;
}

function AnimatedCounter({ value, delay = 0 }: { value: number; delay?: number }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="text-2xl font-bold tabular-nums text-white"
    >
      {value}
    </motion.span>
  );
}

export default function CommunityStats({ data }: Props) {
  if (!data) return null;

  const stats = [
    {
      label: "PRs Opened",
      value: data.prs_opened,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
    },
    {
      label: "Issues",
      value: data.issues_opened,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      label: "Reviews",
      value: data.review_events,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      ),
    },
    {
      label: "Comments",
      value: data.comments,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-white/[0.06] p-6 mt-5"
      style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(24px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#cdff00]/10 flex items-center justify-center text-[#cdff00] border border-[#cdff00]/20">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Community Engagement</span>
            <p className="text-[10px] text-slate-500 mt-0.5">{data.total_community_actions} total actions</p>
          </div>
        </div>

        {/* Collaboration ratio */}
        <div className="text-right">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Collab Ratio</div>
          <div className="text-sm font-bold text-[#cdff00] tabular-nums">{data.collaboration_ratio}%</div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] text-center hover:bg-white/[0.05] transition-colors"
          >
            <div className="text-[#cdff00]/60 flex justify-center mb-2">{s.icon}</div>
            <AnimatedCounter value={s.value} delay={0.3 + i * 0.1} />
            <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Engagement bar */}
      <div className="mt-4 pt-3 border-t border-white/[0.06]">
        <div className="flex justify-between text-[11px] mb-1.5">
          <span className="text-slate-400 font-medium">Engagement Score</span>
          <span className="text-slate-300 font-semibold tabular-nums">{data.engagement_score}/15</span>
        </div>
        <div className="w-full h-2 rounded-full bg-white/[0.04] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: `${(data.engagement_score / 15) * 100}%` }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #cdff00, #a0cc00)", filter: "drop-shadow(0 0 4px rgba(205,255,0,0.3))" }}
          />
        </div>
      </div>
    </motion.div>
  );
}
