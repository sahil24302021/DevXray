"use client";

import { motion } from "framer-motion";

interface EvidenceTrailItem {
  claim: string;
  source?: string;
  evidence_found?: string;
  status?: string;  // SUPPORTED | NOT_FOUND | PARTIALLY_SUPPORTED
  confidence?: string;
  repo?: string;
  // Legacy fields for backwards compatibility
  evidence?: string;
  verified?: boolean;
}

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  resume: { label: "Resume", color: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  github_bio: { label: "GitHub Bio", color: "bg-violet-500/15 text-violet-400 border-violet-500/25" },
  github_code: { label: "Code Analysis", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  analysis: { label: "Analysis", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25" },
  growth: { label: "Growth", color: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
  skill: { label: "Skills", color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/25" },
};

function getSourceBadge(source: string) {
  const key = source?.toLowerCase() || "analysis";
  return SOURCE_BADGES[key] || { label: source || "Analysis", color: "bg-slate-500/15 text-slate-400 border-slate-500/25" };
}

function getStatusDisplay(item: EvidenceTrailItem) {
  const status = item.status || (item.verified !== false ? "SUPPORTED" : "NOT_FOUND");

  if (status === "SUPPORTED") return { label: "Supported", icon: "check", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
  if (status === "PARTIALLY_SUPPORTED") return { label: "Partial", icon: "minus", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  if (status === "NOT_FOUND") return { label: "Not Found", icon: "x", color: "bg-rose-500/10 text-rose-400 border-rose-500/20" };
  return { label: status, icon: "check", color: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
}

export default function EvidenceTrail({ items }: { items?: EvidenceTrailItem[] }) {
  if (!items || items.length === 0) return null;

  const supported = items.filter(i => (i.status || "SUPPORTED") === "SUPPORTED").length;
  const notFound = items.filter(i => i.status === "NOT_FOUND").length;

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
          <span className="w-2 h-2 rounded-full bg-cyan-400" /> Evidence Trail
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            Claim vs Reality
          </span>
          <div className="flex items-center gap-2">
            {supported > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {supported} verified
              </span>
            )}
            {notFound > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                {notFound} not found
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="text-[9px] uppercase tracking-wider text-slate-500 font-bold pb-3 pr-4">Claim</th>
              <th className="text-[9px] uppercase tracking-wider text-slate-500 font-bold pb-3 pr-4 w-20">Source</th>
              <th className="text-[9px] uppercase tracking-wider text-slate-500 font-bold pb-3 pr-4">Evidence Found</th>
              <th className="text-[9px] uppercase tracking-wider text-slate-500 font-bold pb-3 text-center w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 15).map((item, i) => {
              const source = getSourceBadge(item.source || "");
              const statusDisplay = getStatusDisplay(item);

              return (
                <tr key={i} className="border-b border-white/[0.04] last:border-0">
                  <td className="py-3 pr-4">
                    <span className="text-[12px] text-slate-300 leading-relaxed italic">
                      {item.claim}
                    </span>
                    {item.repo && (
                      <span className="ml-2 text-[9px] text-violet-400/70 font-mono bg-violet-500/5 px-1.5 py-0.5 rounded">
                        {item.repo}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${source.color}`}>
                      {source.label}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-[11px] text-slate-400">
                      {item.evidence_found || item.evidence || "—"}
                    </span>
                  </td>
                  <td className="py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${statusDisplay.color}`}>
                      {statusDisplay.icon === "check" && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {statusDisplay.icon === "x" && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      {statusDisplay.icon === "minus" && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                        </svg>
                      )}
                      {statusDisplay.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {items.length > 15 && (
        <p className="text-[10px] text-slate-500 mt-3 text-center">
          Showing 15 of {items.length} evidence items
        </p>
      )}
    </motion.section>
  );
}
