"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

interface ContributionDay {
  date: string;
  count: number;
}

interface ResumeClaimMarker {
  date: string;
  label: string;
  isVerified: boolean;
}

export default function ContributionHeatmap({
  commitDates,
  resumeClaims,
}: {
  commitDates?: string[];
  resumeClaims?: Array<{ date: string; label: string; is_verified?: boolean }>;
}) {
  const { weeks, maxCount, claimMarkers, totalCommits, streakDays } = useMemo(() => {
    if (!commitDates || commitDates.length === 0) {
      return { weeks: [], maxCount: 0, claimMarkers: [], totalCommits: 0, streakDays: 0 };
    }

    // Build daily counts for last 52 weeks
    const now = new Date();
    const dayMs = 86400000;
    const start = new Date(now.getTime() - 52 * 7 * dayMs);
    start.setHours(0, 0, 0, 0);

    const dayCounts: Record<string, number> = {};
    let total = 0;
    for (const d of commitDates) {
      const dateStr = d.slice(0, 10);
      if (dateStr) {
        dayCounts[dateStr] = (dayCounts[dateStr] || 0) + 1;
        total++;
      }
    }

    // Build week arrays
    const weeksArr: ContributionDay[][] = [];
    let currentWeek: ContributionDay[] = [];
    let maxC = 0;
    let streak = 0;
    let longestStreak = 0;

    for (let d = new Date(start); d <= now; d = new Date(d.getTime() + dayMs)) {
      const dateStr = d.toISOString().slice(0, 10);
      const count = dayCounts[dateStr] || 0;
      if (count > maxC) maxC = count;

      if (count > 0) {
        streak++;
        if (streak > longestStreak) longestStreak = streak;
      } else {
        streak = 0;
      }

      currentWeek.push({ date: dateStr, count });
      if (currentWeek.length === 7) {
        weeksArr.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) weeksArr.push(currentWeek);

    // Map resume claims to markers
    const markers: ResumeClaimMarker[] = (resumeClaims || []).map((c) => ({
      date: c.date,
      label: c.label,
      isVerified: c.is_verified ?? false,
    }));

    return {
      weeks: weeksArr,
      maxCount: maxC,
      claimMarkers: markers,
      totalCommits: total,
      streakDays: longestStreak,
    };
  }, [commitDates, resumeClaims]);

  if (weeks.length === 0) return null;

  const getColor = (count: number): string => {
    if (count === 0) return "rgba(255,255,255,0.03)";
    const intensity = Math.min(count / Math.max(maxCount, 1), 1);
    if (intensity > 0.75) return "rgba(52, 211, 153, 0.85)";
    if (intensity > 0.5) return "rgba(52, 211, 153, 0.6)";
    if (intensity > 0.25) return "rgba(52, 211, 153, 0.35)";
    return "rgba(52, 211, 153, 0.15)";
  };

  // Check if a day has a resume claim marker
  const hasClaimMarker = (dateStr: string): ResumeClaimMarker | undefined => {
    return claimMarkers.find((m) => m.date === dateStr);
  };

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-white/[0.06] p-6 mb-5"
      style={{ background: "rgba(255,255,255,0.02)" }}
    >
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> Activity Timeline
        </h2>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-slate-500">
            <span className="text-emerald-400 font-bold">{totalCommits}</span> contributions
          </span>
          <span className="text-[10px] text-slate-500">
            <span className="text-amber-400 font-bold">{streakDays}d</span> longest streak
          </span>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="overflow-x-auto">
        <div className="flex gap-[3px] min-w-[720px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day, di) => {
                const marker = hasClaimMarker(day.date);
                return (
                  <div
                    key={di}
                    className="relative group"
                    style={{ width: 12, height: 12 }}
                  >
                    <div
                      className="w-full h-full rounded-[2px] transition-all duration-150 hover:scale-150 hover:z-10"
                      style={{ backgroundColor: getColor(day.count) }}
                    />
                    {marker && (
                      <div
                        className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border ${
                          marker.isVerified
                            ? "bg-emerald-400 border-emerald-500"
                            : "bg-rose-400 border-rose-500"
                        }`}
                      />
                    )}
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20">
                      <div className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-[9px] whitespace-nowrap">
                        <div className="text-slate-300 font-bold">{day.date}</div>
                        <div className="text-slate-500">{day.count} contribution{day.count !== 1 ? "s" : ""}</div>
                        {marker && (
                          <div className={marker.isVerified ? "text-emerald-400" : "text-rose-400"}>
                            {marker.label} — {marker.isVerified ? "✓ Verified" : "⚠ Unverified"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Month labels */}
        <div className="flex mt-2 min-w-[720px]">
          {Array.from({ length: 12 }, (_, i) => {
            const monthDate = new Date();
            monthDate.setMonth(monthDate.getMonth() - 11 + i);
            return (
              <span
                key={i}
                className="text-[9px] text-slate-500 flex-1 text-center"
              >
                {months[monthDate.getMonth()]}
              </span>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
        <div className="flex items-center gap-2 text-[9px] text-slate-500">
          Less
          <div className="flex gap-[3px]">
            {["rgba(255,255,255,0.03)", "rgba(52,211,153,0.15)", "rgba(52,211,153,0.35)", "rgba(52,211,153,0.6)", "rgba(52,211,153,0.85)"].map((c, i) => (
              <div key={i} className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: c }} />
            ))}
          </div>
          More
        </div>
        {claimMarkers.length > 0 && (
          <div className="flex items-center gap-3 text-[9px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Verified claim
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-400" /> Unverified claim
            </span>
          </div>
        )}
      </div>
    </motion.section>
  );
}
