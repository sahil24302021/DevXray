"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FeatureImportance } from "@/lib/api";

function WhyButton({ evidence }: { evidence?: string[] }) {
  const [open, setOpen] = useState(false);
  if (!evidence || evidence.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="text-[9px] uppercase tracking-wider text-violet-400 hover:text-violet-300 transition-colors font-bold mt-1 flex items-center gap-1"
      >
        <span className="opacity-60">{open ? "▾" : "▸"}</span> Why?
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1 pl-2 border-l border-violet-500/20">
              {evidence.map((e, i) => (
                <div key={i} className="text-[10px] text-slate-400 leading-relaxed">
                  <span className="text-violet-400/60 mr-1">•</span>
                  {e}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function EvidencePanel({
  features,
  decisionTrace,
  proofList,
  multiSourceBonus,
  dataSources,
  dataSourceConfidence,
}: {
  features?: FeatureImportance[];
  decisionTrace?: string[];
  proofList?: Array<{ evidence_type: string; detail: string; timestamp?: string }>;
  multiSourceBonus?: number;
  dataSources?: string[];
  dataSourceConfidence?: string;
}) {
  if (!features || features.length === 0) return null;

  // Group proof items by evidence type for "Why?" buttons
  const proofByType: Record<string, string[]> = {};
  if (proofList) {
    for (const p of proofList) {
      const key = p.evidence_type || "other";
      if (!proofByType[key]) proofByType[key] = [];
      proofByType[key].push(p.detail);
    }
  }

  // Map feature components to proof evidence types
  const getEvidenceForFeature = (component: string): string[] => {
    const mapping: Record<string, string[]> = {
      code_quality: ["code_quality", "code_analysis"],
      authenticity: ["authenticity", "ai_detection", "commit_analysis"],
      skill_depth: ["skill", "skill_verification"],
      consistency: ["consistency", "cross_repo"],
      growth: ["growth", "learning"],
      truth_score: ["truth", "claim_verification", "truth_engine"],
    };
    const keys = mapping[component] || [component];
    const evidence: string[] = [];
    for (const key of keys) {
      if (proofByType[key]) evidence.push(...proofByType[key]);
    }
    return evidence.slice(0, 5);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-white/[0.06] p-6 mb-5"
      style={{
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-violet-400" /> Scoring Evidence Panel
        </h2>
        <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
          Transparent AI Evaluation
        </span>
      </div>

      {/* Data Source Confidence Banner */}
      {dataSources && dataSources.length > 0 && (
        <div className="mb-5 flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-white/5">
          <div className="flex gap-1.5">
            {dataSources.map((src, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              >
                {src}
              </span>
            ))}
          </div>
          <span className="ml-auto text-[10px] text-slate-500">
            Confidence:{" "}
            <span
              className={
                dataSourceConfidence === "HIGH"
                  ? "text-emerald-400 font-bold"
                  : dataSourceConfidence === "MODERATE"
                  ? "text-amber-400 font-bold"
                  : "text-rose-400 font-bold"
              }
            >
              {dataSourceConfidence || "LOW"}
            </span>
          </span>
        </div>
      )}

      {/* Multi-Source Bonus */}
      {multiSourceBonus !== undefined && multiSourceBonus > 0 && (
        <div className="mb-5 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-3">
          <span className="text-emerald-400 font-bold text-sm">+{multiSourceBonus.toFixed(1)}</span>
          <span className="text-[10px] text-slate-400">
            Multi-source credibility bonus (StackOverflow, LeetCode, Gists, NPM, Dev.to)
          </span>
        </div>
      )}

      {/* Feature Importance Grid */}
      <h3 className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-3">
        Dimension Weighting
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {features.map((feat, i) => {
          const evidence = getEvidenceForFeature(feat.component);
          return (
            <div key={i} className="p-3 rounded-xl bg-black/40 border border-white/5 relative overflow-hidden">
              <div
                className={`absolute top-0 left-0 w-1 h-full ${
                  feat.impact_level === "HIGH"
                    ? "bg-emerald-500"
                    : feat.impact_level === "MEDIUM"
                    ? "bg-amber-500"
                    : "bg-slate-500"
                }`}
              />
              <div className="pl-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">
                    {feat.component.replace(/_/g, " ")}
                  </span>
                  <span className="text-[10px] text-slate-400">{(feat.weight * 100).toFixed(0)}% wgt</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-sm font-bold text-white">+{feat.contribution} pts</span>
                  <span className="text-[10px] text-slate-400 pb-[2px]">
                    (raw: {feat.raw_score})
                  </span>
                </div>
                <WhyButton evidence={evidence} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Decision Trace Log */}
      {decisionTrace && decisionTrace.length > 0 && (
        <>
          <h3 className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-3 mt-6">
            Decision Trace Log
          </h3>
          <div className="bg-black/40 rounded-xl border border-white/5 p-4 font-mono text-[11px] text-slate-400 space-y-1.5 overflow-x-auto">
            {decisionTrace.map((log, i) => {
              // Highlight penalties and final scores
              const isPenalty = log.includes("[PENALTY]") || log.includes("FLAG:");
              const isFinal = log.includes("[FINAL]");
              const colorClass = isPenalty
                ? "text-rose-400"
                : isFinal
                ? "text-[#cdff00] font-bold"
                : "text-slate-300";

              return (
                <div key={i} className={`flex gap-2 ${colorClass}`}>
                  <span className="text-slate-500 shrink-0">{'>'}</span>
                  <span className="whitespace-pre-wrap">{log}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </motion.section>
  );
}
