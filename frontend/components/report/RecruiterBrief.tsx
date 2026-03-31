"use client";

import { motion } from "framer-motion";
import { AnalysisResult, scoreToRecommendation, getHiringRecommendationSummary } from "@/lib/api";

interface Props {
  data: AnalysisResult;
}

export default function RecruiterBrief({ data }: Props) {
  const score = (data.final_score ?? data.score ?? 0) as number;
  const name = data.name || data.username || "This developer";
  const tier = typeof data.developer_tier === "string" ? data.developer_tier : "Unknown";

  // Key strength (first from strengths array)
  const strengths = (data.strengths || []) as string[];
  const keyStrength = strengths[0] || "GitHub profile analyzed";

  // Key concern (first weakness)
  const weaknesses = (data.weaknesses || []) as string[];
  const keyConcern = weaknesses[0] || "No major concerns detected";

  // Recommendation
  const recommendation = getHiringRecommendationSummary(data) || scoreToRecommendation(score);

  // Top skills
  const skills = ((data.verified_skills || data.top_languages || []) as string[]).slice(0, 4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="rounded-2xl border border-white/[0.06] mb-5 overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.02)",
      }}
    >
      {/* Accent left border */}
      <div className="flex">
        <div
          className="w-1 shrink-0"
          style={{
            background: score >= 80
              ? "linear-gradient(180deg, #34d399, #22d3ee)"
              : score >= 60
              ? "linear-gradient(180deg, #fbbf24, #f97316)"
              : "linear-gradient(180deg, #f87171, #fb7185)",
          }}
        />
        <div className="p-5 flex-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em]">
              TL;DR for Recruiters
            </span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            <strong className="text-white">{name}</strong>
            {" — "}
            <span className={`font-semibold ${
              score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-rose-400"
            }`}>
              {tier}
            </span>
            {". "}
            <span className="text-slate-300">{keyStrength}.</span>
            {" "}
            <span className="text-slate-400">{keyConcern}.</span>
            {" "}
            <span className="text-white font-medium">{recommendation}.</span>
          </p>
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {skills.map((skill, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-slate-400 border border-white/[0.06] font-medium"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
