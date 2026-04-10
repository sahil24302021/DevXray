"use client";

import { useState } from "react";
import { motion } from "framer-motion";

export interface VerificationSource {
  name: string;
  status: string;
  detail?: string;
  url?: string;
  handle?: string;
  // Extended fields for rich display
  reputation?: number;
  top_topics?: string[];
  best_answer_url?: string;
  problems_solved?: number;
  easy?: number;
  medium?: number;
  hard?: number;
  package_names?: string[];
  download_count?: number;
}

/**
 * PDF Guide item: "Stack Overflow / LeetCode proof in report"
 * Shows detailed breakdowns for each verified source.
 */
export default function VerificationSources({ data, multiSource }: { data: VerificationSource[]; multiSource?: any }) {
  if (!data || data.length === 0) return null;

  // Merge in multi_source data if available for richer display
  const enrichedData = data.map(source => {
    const enriched = { ...source };
    if (multiSource) {
      if (source.name === "StackOverflow" && multiSource.stackoverflow?.raw) {
        const so = multiSource.stackoverflow.raw;
        if (so.found) {
          enriched.reputation = so.reputation;
          enriched.top_topics = so.top_tags?.slice(0, 3) || [];
          enriched.best_answer_url = so.profile_url;
        }
      }
      if (source.name === "LeetCode" && multiSource.leetcode?.raw) {
        const lc = multiSource.leetcode.raw;
        if (lc.found) {
          enriched.problems_solved = lc.problems_solved || lc.total_solved;
          enriched.easy = lc.easy_solved || lc.easy || 0;
          enriched.medium = lc.medium_solved || lc.medium || 0;
          enriched.hard = lc.hard_solved || lc.hard || 0;
        }
      }
      if (source.name === "NPM" && multiSource.npm?.raw) {
        const npm = multiSource.npm.raw;
        if (npm.found || npm.total_packages > 0) {
          enriched.package_names = npm.packages?.map((p: any) => p.name || p).slice(0, 3) || [];
          enriched.download_count = npm.total_downloads || 0;
        }
      }
    }
    return enriched;
  });

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case "verified":
      case "live":
      case "fetched":
      case "found":
        return { icon: "✅", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "Found" };
      case "blocked":
      case "pending":
        return { icon: "⏳", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", label: "Pending" };
      case "not_found":
      case "found_empty":
      default:
        return { icon: "⚪", color: "text-slate-400", bg: "bg-slate-500/8", border: "border-slate-500/10", label: "Not Found" };
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-white/[0.06] p-5 sm:p-6 mb-5"
      style={{
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-cyan-400" /> Multi-Source Verification
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {enrichedData.map((source, i) => {
          const s = getStatusDisplay(source.status);
          const isNotFound = source.status === "not_found" || source.status === "found_empty"
            || (!["verified", "live", "fetched", "found", "blocked", "pending"].includes(source.status));
          const isFound = !isNotFound;

          return (
            <SourceCard key={i} source={source} status={s} isNotFound={isNotFound} isFound={isFound} />
          );
        })}
      </div>
    </motion.section>
  );
}

function SourceCard({ source, status, isNotFound, isFound }: {
  source: VerificationSource;
  status: { icon: string; color: string; bg: string; border: string; label: string };
  isNotFound: boolean;
  isFound: boolean;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const hasSoDetails = source.name === "StackOverflow" && isFound && (source.reputation || (source.top_topics && source.top_topics.length > 0));
  const hasLcDetails = source.name === "LeetCode" && isFound && (source.problems_solved !== undefined);
  const hasNpmDetails = source.name === "NPM" && isFound && (source.package_names && source.package_names.length > 0);

  return (
    <div
      className={`p-4 rounded-xl border ${status.border} ${status.bg} relative`}
      onMouseEnter={() => isNotFound && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-white text-sm">{source.name}</span>
        <span title={status.label}>{status.icon}</span>
      </div>

      {source.handle && (
        <p className="text-xs text-slate-400 truncate mb-1">{source.handle}</p>
      )}
      {source.url && (
        <a href={source.url} target="_blank" className="text-xs text-cyan-400 hover:underline truncate block mb-1">
          View Source ↗
        </a>
      )}

      {isNotFound ? (
        <p className="text-[10px] font-medium text-slate-500 truncate mt-2 uppercase tracking-wider">
          Not found
        </p>
      ) : (
        source.detail && (
          <p className={`text-[10px] font-medium ${status.color} truncate mt-2 uppercase tracking-wider`}>
            {source.detail}
          </p>
        )
      )}

      {/* Stack Overflow detailed breakdown */}
      {hasSoDetails && (
        <div className="mt-2.5 pt-2.5 border-t border-white/5 space-y-1.5">
          {source.reputation !== undefined && source.reputation > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">Reputation</span>
              <span className="text-[11px] font-bold text-amber-400">{source.reputation.toLocaleString()}</span>
            </div>
          )}
          {source.top_topics && source.top_topics.length > 0 && (
            <div>
              <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Top Tags</span>
              <div className="flex flex-wrap gap-1">
                {source.top_topics.map((t, i) => (
                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/15">{t}</span>
                ))}
              </div>
            </div>
          )}
          {source.best_answer_url && (
            <a href={source.best_answer_url} target="_blank" rel="noopener noreferrer"
              className="text-[9px] text-cyan-400 hover:underline block mt-1">
              View Profile →
            </a>
          )}
        </div>
      )}

      {/* LeetCode detailed breakdown */}
      {hasLcDetails && (
        <div className="mt-2.5 pt-2.5 border-t border-white/5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">Problems Solved</span>
            <span className="text-[11px] font-bold text-emerald-400">{source.problems_solved}</span>
          </div>
          {(source.easy || source.medium || source.hard) ? (
            <div className="space-y-1">
              <div className="flex gap-1 h-1.5 rounded-full overflow-hidden">
                {source.easy! > 0 && <div className="bg-emerald-500 rounded-full" style={{ flex: source.easy }} />}
                {source.medium! > 0 && <div className="bg-amber-500 rounded-full" style={{ flex: source.medium }} />}
                {source.hard! > 0 && <div className="bg-rose-500 rounded-full" style={{ flex: source.hard }} />}
              </div>
              <div className="flex justify-between text-[9px]">
                <span className="text-emerald-400">E: {source.easy}</span>
                <span className="text-amber-400">M: {source.medium}</span>
                <span className="text-rose-400">H: {source.hard}</span>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* NPM package details */}
      {hasNpmDetails && (
        <div className="mt-2.5 pt-2.5 border-t border-white/5 space-y-1.5">
          <div>
            <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Packages</span>
            <div className="flex flex-wrap gap-1">
              {source.package_names!.map((p, i) => (
                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/15">{p}</span>
              ))}
            </div>
          </div>
          {source.download_count !== undefined && source.download_count > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">Total Downloads</span>
              <span className="text-[11px] font-bold text-red-400">{source.download_count.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {/* Tooltip for not-found sources */}
      {showTooltip && isNotFound && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#1a1a1a] text-slate-300 text-[10px] px-3 py-1.5 rounded-lg border border-white/10 shadow-xl whitespace-nowrap z-20 pointer-events-none">
          This platform was checked but no profile was found for this username.
        </div>
      )}
    </div>
  );
}
