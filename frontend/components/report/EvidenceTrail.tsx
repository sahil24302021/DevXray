"use client";

import { motion } from "framer-motion";

interface EvidenceTrailItem {
  claim: string;
  evidence: string;
  repo?: string;
  verified: boolean;
}

export default function EvidenceTrail({ items }: { items?: EvidenceTrailItem[] }) {
  if (!items || items.length === 0) return null;

  const verified = items.filter(i => i.verified).length;
  const total = items.length;
  const pct = Math.round((verified / total) * 100);

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
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            pct >= 80 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
            pct >= 50 ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
            "bg-rose-500/10 text-rose-400 border border-rose-500/20"
          }`}>
            {verified}/{total} verified
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="text-[9px] uppercase tracking-wider text-slate-500 font-bold pb-3 pr-4">Claim</th>
              <th className="text-[9px] uppercase tracking-wider text-slate-500 font-bold pb-3 pr-4">Evidence Found</th>
              <th className="text-[9px] uppercase tracking-wider text-slate-500 font-bold pb-3 text-center w-20">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 20).map((item, i) => (
              <tr key={i} className="border-b border-white/[0.04] last:border-0">
                <td className="py-3 pr-4">
                  <span className="text-[12px] text-slate-300 leading-relaxed">{item.claim}</span>
                  {item.repo && (
                    <span className="ml-2 text-[9px] text-violet-400/70 font-mono bg-violet-500/5 px-1.5 py-0.5 rounded">
                      {item.repo}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <span className="text-[11px] text-slate-400">{item.evidence}</span>
                </td>
                <td className="py-3 text-center">
                  {item.verified ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-500/10 border border-rose-500/20">
                      <svg className="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items.length > 20 && (
        <p className="text-[10px] text-slate-500 mt-3 text-center">
          Showing 20 of {items.length} evidence items
        </p>
      )}
    </motion.section>
  );
}
