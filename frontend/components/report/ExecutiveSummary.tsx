"use client";

import { motion } from "framer-motion";
import { DeveloperTier, DocumentationQuality } from "@/lib/api";

interface Props {
  tier: DeveloperTier;
  docQuality: DocumentationQuality;
  score: number;
}

export default function ExecutiveSummary({ tier, docQuality, score }: Props) {
  if (!tier) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="rounded-2xl border border-[#cdff00]/10 p-6 sm:p-8 mb-5 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(205, 255, 0, 0.04), rgba(255,255,255,0.02))",
        backdropFilter: "blur(24px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(205,255,0,0.08)",
      }}
    >
      {/* Hero accent bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: "linear-gradient(90deg, transparent, #cdff00, transparent)" }}
      />

      <div className="flex items-start justify-between gap-6 flex-col md:flex-row">
        
        {/* Left: Tier Badge & Context */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#cdff00]/10 border border-[#cdff00]/20 rounded-lg">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cdff00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L15 8L22 9L17 14L18 21L12 17L6 21L7 14L2 9L9 8L12 2Z" />
              </svg>
              <span className="text-[12px] font-bold text-[#cdff00] uppercase tracking-wide">
                {tier.tier}
              </span>
            </div>
            <span className="text-xs text-slate-500 font-medium">Level {tier.tier_level} / 5</span>
          </div>
          
          <h3 className="text-base sm:text-lg text-white font-medium mb-4 leading-relaxed">
            {tier.tier_description}
          </h3>
          
          <div className="space-y-2">
            {tier.evidence.slice(0, 3).map((ev, i) => (
              <div key={i} className="flex items-start gap-2">
                <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-slate-300">{ev}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Docs Score & Signal Strength */}
        <div className="flex flex-row md:flex-col gap-4 md:min-w-[200px] w-full md:w-auto">
          {/* Docs Score */}
          <div className="flex-1 bg-white/[0.03] rounded-xl p-4 border border-white/[0.04]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Docs Quality</span>
              <span className={`text-lg font-bold ${
                docQuality.grade === 'A' || docQuality.grade === 'B' ? 'text-emerald-400' : 
                docQuality.grade === 'C' ? 'text-amber-400' : 'text-red-400'
              }`}>{docQuality.grade}</span>
            </div>
            <p className="text-[11px] text-slate-400 line-clamp-2">{docQuality.insight}</p>
          </div>

          {/* Hiring Signal Strength */}
          <div className="flex-1 bg-white/[0.03] rounded-xl p-4 border border-white/[0.04]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Signal Strength</span>
            </div>
            <div className="flex gap-1 h-1.5 w-full">
              {[1, 2, 3, 4, 5].map((level) => {
                const isActive = (tier.signal_strength / 16) * 5 >= level;
                return (
                  <div 
                    key={level} 
                    className={`flex-1 rounded-full ${isActive ? 'bg-[#cdff00]' : 'bg-white/10'}`} 
                    style={isActive ? { boxShadow: '0 0 8px rgba(205,255,0,0.4)' } : undefined}
                  />
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </motion.div>
  );
}
