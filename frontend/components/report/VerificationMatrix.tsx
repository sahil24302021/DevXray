"use client";

import { motion } from "framer-motion";

interface MatrixEntry {
  skill: string;
  status: "verified" | "partial" | "not_found";
  source: string;
  evidence: string;
  flag?: string;
}

interface Props {
  matrix: MatrixEntry[];
}

const statusConfig = {
  verified: {
    label: "Verified",
    bg: "rgba(52, 211, 153, 0.08)",
    border: "rgba(52, 211, 153, 0.2)",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  partial: {
    label: "Partial",
    bg: "rgba(251, 191, 36, 0.08)",
    border: "rgba(251, 191, 36, 0.2)",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  not_found: {
    label: "Not Found",
    bg: "rgba(251, 113, 133, 0.08)",
    border: "rgba(251, 113, 133, 0.2)",
    text: "text-red-400",
    dot: "bg-red-400",
  },
};

export default function VerificationMatrix({ matrix }: Props) {
  if (!matrix || matrix.length === 0) return null;

  const verified = matrix.filter((m) => m.status === "verified").length;
  const partial = matrix.filter((m) => m.status === "partial").length;
  const notFound = matrix.filter((m) => m.status === "not_found").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="rounded-2xl border border-white/[0.06] p-6 sm:p-8 mb-5"
      style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(24px)",
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-[#cdff00]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <h3 className="text-sm font-bold text-white">
            Skill Verification Matrix
          </h3>
        </div>
        <div className="flex gap-3">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
            {verified} verified
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
            {partial} partial
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">
            {notFound} not found
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold pb-3 pr-4">
                Claim
              </th>
              <th className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold pb-3 pr-4">
                Source
              </th>
              <th className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold pb-3 pr-4">
                Evidence
              </th>
              <th className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold pb-3">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((entry, i) => {
              const cfg = statusConfig[entry.status] || statusConfig.not_found;
              return (
                <tr
                  key={i}
                  className="border-b border-white/[0.03] last:border-0"
                >
                  <td className="py-3 pr-4">
                    <span className="text-[13px] text-white font-medium">
                      {entry.skill}
                    </span>
                    {entry.flag && (
                      <p className="text-[10px] text-red-400/80 mt-0.5">
                        ⚠ {entry.flag}
                      </p>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-[12px] text-slate-400">
                      {entry.source}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-[12px] text-slate-400">
                      {entry.evidence}
                    </span>
                  </td>
                  <td className="py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.text}`}
                      style={{
                        background: cfg.bg,
                        border: `1px solid ${cfg.border}`,
                      }}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}
                      />
                      {cfg.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
