"use client";

import { motion } from "framer-motion";
import { ContributionStreak as StreakType } from "@/lib/api";

interface Props {
  data: StreakType;
}

export default function ContributionStreak({ data }: Props) {
  if (!data) return null;

  const isActive = data.current_streak_weeks > 0;
  const streakPercent = Math.min((data.current_streak_weeks / Math.max(data.longest_streak_weeks, 1)) * 100, 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="rounded-2xl border border-white/[0.06] p-6 flex flex-col"
      style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(24px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div className="flex items-center gap-2 mb-5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
          isActive
            ? "bg-[#cdff00]/10 text-[#cdff00] border-[#cdff00]/20"
            : "bg-white/[0.05] text-slate-400 border-white/[0.06]"
        }`}>
          {/* Flame icon */}
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
          </svg>
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">
          Contribution Streak
        </span>
        {isActive && (
          <span className="ml-auto text-[9px] font-bold text-[#cdff00] bg-[#cdff00]/10 px-2 py-0.5 rounded-full border border-[#cdff00]/20 animate-pulse">
            🔥 ACTIVE
          </span>
        )}
      </div>

      {/* Streak numbers */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div>
          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Current</div>
          <div className="flex items-end gap-1">
            <span className={`text-3xl font-bold tabular-nums ${isActive ? "text-[#cdff00]" : "text-slate-500"}`}>
              {data.current_streak_weeks}
            </span>
            <span className="text-xs text-slate-500 mb-1">weeks</span>
          </div>
        </div>
        <div>
          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Longest</div>
          <div className="flex items-end gap-1">
            <span className="text-3xl font-bold tabular-nums text-white">
              {data.longest_streak_weeks}
            </span>
            <span className="text-xs text-slate-500 mb-1">weeks</span>
          </div>
        </div>
      </div>

      {/* Streak progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-[11px] mb-1.5">
          <span className="text-slate-400 font-medium">Current vs Longest</span>
          <span className="text-slate-300 font-semibold tabular-nums">{Math.round(streakPercent)}%</span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-white/[0.04] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${streakPercent}%` }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
            className="h-full rounded-full"
            style={{
              background: isActive
                ? "linear-gradient(90deg, #cdff00, #a0cc00)"
                : "rgba(255,255,255,0.15)",
              filter: isActive ? "drop-shadow(0 0 6px rgba(205,255,0,0.3))" : "none",
            }}
          />
        </div>
      </div>

      {/* Extra stats */}
      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3 mt-auto">
        <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">Active Days</div>
          <div className="text-sm font-semibold text-slate-200 tabular-nums">{data.total_active_days}</div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">Best Day</div>
          <div className="text-sm font-semibold text-slate-200">{data.best_day}</div>
        </div>
      </div>
    </motion.div>
  );
}
