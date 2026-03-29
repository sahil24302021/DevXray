"use client";

import { motion } from "framer-motion";
import { ActivityMonth } from "@/lib/api";

interface Props {
  data: ActivityMonth[];
}

export default function ActivityHeatmap({ data }: Props) {
  if (!data || data.length === 0) return null;

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const getIntensity = (count: number) => {
    if (count === 0) return "bg-white/[0.04]";
    const ratio = count / maxCount;
    if (ratio > 0.75) return "bg-[#cdff00]";
    if (ratio > 0.5) return "bg-[#cdff00]/60";
    if (ratio > 0.25) return "bg-[#cdff00]/35";
    return "bg-[#cdff00]/15";
  };

  const getGlow = (count: number) => {
    if (count === 0) return "";
    const ratio = count / maxCount;
    if (ratio > 0.75) return "shadow-[0_0_8px_rgba(205,255,0,0.3)]";
    if (ratio > 0.5) return "shadow-[0_0_6px_rgba(205,255,0,0.2)]";
    return "";
  };

  const formatMonth = (monthStr: string) => {
    const [, month] = monthStr.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[parseInt(month, 10) - 1] || month;
  };

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
      <div className="flex items-center gap-2 mb-6">
        <div className="w-7 h-7 rounded-lg bg-[#cdff00]/10 flex items-center justify-center text-[#cdff00] border border-[#cdff00]/20">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Activity Timeline</span>
          <p className="text-[10px] text-slate-500 mt-0.5">Last 12 months contribution intensity</p>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="flex items-end gap-2">
        {data.map((d, idx) => (
          <div key={idx} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="relative group">
              <div
                className={`w-full aspect-square rounded-lg ${getIntensity(d.count)} ${getGlow(d.count)} transition-all duration-300 hover:scale-110 cursor-default min-w-[24px]`}
              />
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 border border-white/10">
                {d.count} events
              </div>
            </div>
            <span className="text-[9px] text-slate-500 font-medium">{formatMonth(d.month)}</span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 mt-4">
        <span className="text-[9px] text-slate-500">Less</span>
        <div className="w-2.5 h-2.5 rounded bg-white/[0.04]" />
        <div className="w-2.5 h-2.5 rounded bg-[#cdff00]/15" />
        <div className="w-2.5 h-2.5 rounded bg-[#cdff00]/35" />
        <div className="w-2.5 h-2.5 rounded bg-[#cdff00]/60" />
        <div className="w-2.5 h-2.5 rounded bg-[#cdff00] shadow-[0_0_6px_rgba(205,255,0,0.3)]" />
        <span className="text-[9px] text-slate-500">More</span>
      </div>
    </motion.div>
  );
}
