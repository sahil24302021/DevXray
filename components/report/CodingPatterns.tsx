"use client";

import { motion } from "framer-motion";
import { CodingPatterns as CodingPatternsType } from "@/lib/api";

interface Props {
  data: CodingPatternsType;
}

export default function CodingPatterns({ data }: Props) {
  if (!data || !data.day_hour_heatmap || data.day_hour_heatmap.length === 0) return null;

  // Find max value across all cells for intensity mapping
  let maxVal = 1;
  data.day_hour_heatmap.forEach((row) => {
    Object.values(row.hours).forEach((v) => {
      if (v > maxVal) maxVal = v;
    });
  });

  const getIntensity = (count: number): string => {
    if (count === 0) return "rgba(255,255,255,0.04)";
    const ratio = count / maxVal;
    if (ratio > 0.75) return "rgba(205,255,0,0.85)";
    if (ratio > 0.5) return "rgba(205,255,0,0.5)";
    if (ratio > 0.25) return "rgba(205,255,0,0.25)";
    return "rgba(205,255,0,0.1)";
  };

  const dayAbbr: Record<string, string> = {
    Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed",
    Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const hourLabels = [0, 3, 6, 9, 12, 15, 18, 21];

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
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#cdff00]/10 flex items-center justify-center text-[#cdff00] border border-[#cdff00]/20">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Coding Patterns</span>
            <p className="text-[10px] text-slate-600 mt-0.5">When does this developer code?</p>
          </div>
        </div>
        <span className="text-[10px] font-bold text-[#cdff00] bg-[#cdff00]/10 px-2.5 py-1 rounded-full border border-[#cdff00]/20">
          {data.coding_session}
        </span>
      </div>

      {/* GitHub-style 7×24 Heatmap Grid */}
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[500px]">
          {/* Hour labels row */}
          <div className="flex items-end mb-1.5 pl-10">
            {hours.map((h) => (
              <div key={h} className="flex-1 text-center">
                {hourLabels.includes(h) && (
                  <span className="text-[8px] text-slate-600 font-medium tabular-nums">
                    {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Grid rows — one per day */}
          {data.day_hour_heatmap.map((row, dayIdx) => (
            <div key={row.day} className="flex items-center gap-[3px] mb-[3px]">
              <span className="w-8 text-[9px] text-slate-500 font-medium text-right shrink-0 pr-1">
                {dayAbbr[row.day] || row.day.slice(0, 3)}
              </span>
              <div className="flex gap-[3px] flex-1">
                {hours.map((h) => {
                  const count = row.hours[String(h)] || 0;
                  return (
                    <motion.div
                      key={h}
                      initial={{ opacity: 0, scale: 0.5 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: dayIdx * 0.02 + h * 0.005, duration: 0.2 }}
                      className="flex-1 aspect-square rounded-[3px] cursor-default relative group transition-transform hover:scale-125 hover:z-10"
                      style={{ background: getIntensity(count) }}
                    >
                      {count > 0 && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1a1a1a] text-white text-[9px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20 border border-white/10 shadow-xl">
                          <span className="font-semibold text-[#cdff00]">{count}</span>
                          <span className="text-slate-400 ml-1">{dayAbbr[row.day]} {h}:00</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center justify-end gap-1.5 mt-3 pr-0.5">
            <span className="text-[8px] text-slate-600 font-medium">Less</span>
            {[0, 0.1, 0.25, 0.5, 0.85].map((opacity, i) => (
              <div
                key={i}
                className="w-[10px] h-[10px] rounded-[2px]"
                style={{ background: opacity === 0 ? "rgba(255,255,255,0.04)" : `rgba(205,255,0,${opacity})` }}
              />
            ))}
            <span className="text-[8px] text-slate-600 font-medium">More</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-white/[0.06]">
        <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
          <div className="text-[8px] text-slate-600 uppercase tracking-wider font-semibold mb-1">Peak Day</div>
          <div className="text-[13px] font-semibold text-slate-200">{data.most_active_day}</div>
        </div>
        <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
          <div className="text-[8px] text-slate-600 uppercase tracking-wider font-semibold mb-1">Weekend %</div>
          <div className="text-[13px] font-semibold text-slate-200 tabular-nums">{data.weekend_ratio}%</div>
        </div>
        <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
          <div className="text-[8px] text-slate-600 uppercase tracking-wider font-semibold mb-1">Avg/Day</div>
          <div className="text-[13px] font-semibold text-slate-200 tabular-nums">{data.avg_commits_per_active_day}</div>
        </div>
        <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
          <div className="text-[8px] text-slate-600 uppercase tracking-wider font-semibold mb-1">Peak Hour</div>
          <div className="text-[13px] font-semibold text-slate-200 tabular-nums">
            {data.peak_hours?.[0] ? `${data.peak_hours[0].hour > 12 ? data.peak_hours[0].hour - 12 : data.peak_hours[0].hour}${data.peak_hours[0].hour >= 12 ? 'pm' : 'am'}` : "—"}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
