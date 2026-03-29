"use client";

import { motion } from "framer-motion";
import { AnalysisResult } from "@/lib/api";

interface RepoItem {
  name: string;
  html_url?: string;
  description?: string;
  stars?: number;
  language?: string;
  contribution_level?: string;
  size_kb?: number;
  [key: string]: unknown;
}

interface Props {
  data: AnalysisResult;
}

export default function RepoEvidence({ data }: Props) {
  if (!data.top_repos || data.top_repos.length === 0) return null;

  const repos = data.top_repos as RepoItem[];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="mt-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center text-slate-400 border border-white/[0.06]">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Top Repositories</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {repos.map((repo, idx) => (
          <motion.a
            key={String(repo.name)}
            href={repo.html_url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.05 }}
            className="rounded-2xl border border-white/[0.06] p-5 flex flex-col gap-3 no-underline hover:border-[#cdff00]/20 transition-all group cursor-pointer"
            style={{
              background: "rgba(255,255,255,0.03)",
              backdropFilter: "blur(24px)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <h4 className="text-sm font-bold text-white group-hover:text-[#cdff00] transition-colors truncate">
                    {String(repo.name)}
                  </h4>
                  <svg className="w-3 h-3 text-slate-600 group-hover:text-[#cdff00] transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-1">{String(repo.description || "No description")}</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="tabular-nums font-medium">{(repo.stars as number | undefined)?.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                repo.contribution_level === "Heavy"
                  ? "bg-[#cdff00]/10 text-[#cdff00] border-[#cdff00]/20"
                  : repo.contribution_level === "Moderate"
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-white/[0.05] text-slate-400 border-white/[0.06]"
              }`}>{String(repo.contribution_level ?? "")}</span>
              {repo.language && (
                <span className="text-[9px] text-slate-400 px-2 py-0.5 bg-white/[0.04] rounded border border-white/[0.06]">{String(repo.language)}</span>
              )}
              {(repo.size_kb as number) > 0 && (
                <span className="text-[9px] text-slate-500 px-2 py-0.5 bg-white/[0.03] rounded border border-white/[0.04]">
                  {(repo.size_kb as number) > 1000 ? `${((repo.size_kb as number) / 1000).toFixed(1)}MB` : `${repo.size_kb as number}KB`}
                </span>
              )}
            </div>
          </motion.a>
        ))}
      </div>
    </motion.div>
  );
}
