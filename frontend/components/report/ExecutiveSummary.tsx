"use client";

import { motion } from "framer-motion";
import { DeveloperTier, DocumentationQuality } from "@/lib/api";

interface Props {
  tier: DeveloperTier;
  docQuality: DocumentationQuality;
  score: number;
  privateRepoIndicator?: boolean;
  privateRepoDisclaimer?: string;
  scoreAdjustmentNote?: string;
  experienceConfidence?: string;
  alternativeSignals?: string[];
  alternativeSignalsSummary?: { platforms_verified?: string[]; signals?: any[] };
}

export default function ExecutiveSummary({ 
  tier, docQuality, score,
  privateRepoIndicator, privateRepoDisclaimer, scoreAdjustmentNote,
  experienceConfidence, alternativeSignals, alternativeSignalsSummary,
}: Props) {
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

      {/* ─── Private Repository Disclaimer Banner ─── */}
      {privateRepoIndicator && privateRepoDisclaimer && (
        <div
          className="rounded-xl p-4 mb-6 border flex items-start gap-3"
          style={{
            background: "rgba(251, 191, 36, 0.06)",
            borderColor: "rgba(251, 191, 36, 0.18)",
          }}
        >
          <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-amber-400 mb-1">
              {privateRepoDisclaimer}
            </p>
            {scoreAdjustmentNote && (
              <p className="text-[11px] text-amber-400/70 mb-2">
                {scoreAdjustmentNote}
              </p>
            )}
            {alternativeSignals && alternativeSignals.length > 0 && (
              <div className="mt-2 pt-2 border-t" style={{ borderColor: "rgba(251, 191, 36, 0.12)" }}>
                <p className="text-[10px] font-bold text-amber-400/60 uppercase tracking-wider mb-1.5">
                  Alternative Signals Detected
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {alternativeSignals.slice(0, 6).map((sig, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: "rgba(251, 191, 36, 0.08)",
                        color: "rgba(251, 191, 36, 0.75)",
                        border: "1px solid rgba(251, 191, 36, 0.12)",
                      }}
                    >
                      {sig}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {experienceConfidence && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Experience Confidence:</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  experienceConfidence === "high" ? "bg-emerald-500/10 text-emerald-400" :
                  experienceConfidence === "medium" ? "bg-amber-500/10 text-amber-400" :
                  experienceConfidence === "low_private_heavy" ? "bg-amber-500/10 text-amber-400" :
                  "bg-red-500/10 text-red-400"
                }`}>
                  {experienceConfidence === "low_private_heavy" ? "Low (Private Repos)" : experienceConfidence}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

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

          {/* Also verified on external platforms */}
          {alternativeSignalsSummary?.platforms_verified && alternativeSignalsSummary.platforms_verified.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/[0.04]">
              <p className="text-[11px] text-slate-400">
                <span className="text-slate-500 font-semibold">Also verified on: </span>
                {alternativeSignalsSummary.platforms_verified.map((p, i) => (
                  <span key={p}>
                    <span className="text-[#cdff00]/80 font-medium">{p}</span>
                    <span className="text-emerald-400 ml-0.5">✓</span>
                    {i < alternativeSignalsSummary.platforms_verified!.length - 1 && (
                      <span className="text-slate-600 mx-1">·</span>
                    )}
                  </span>
                ))}
              </p>
            </div>
          )}
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
