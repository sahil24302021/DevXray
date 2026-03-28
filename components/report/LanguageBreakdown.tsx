"use client";

import { motion } from "framer-motion";
import { LanguageBreakdownItem } from "@/lib/api";

const LANG_COLORS: Record<string, string> = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5", Java: "#b07219",
  C: "#555555", "C++": "#f34b7d", "C#": "#178600", Go: "#00ADD8", Rust: "#dea584",
  Ruby: "#701516", PHP: "#4F5D95", Swift: "#F05138", Kotlin: "#A97BFF", Dart: "#00B4AB",
  Shell: "#89e051", HTML: "#e34c26", CSS: "#563d7c", Scala: "#c22d40", R: "#198CE7",
  Lua: "#000080", Perl: "#0298c3", Makefile: "#427819", Assembly: "#6E4C13",
};

interface Props {
  data: LanguageBreakdownItem[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  if (bytes > 1_000) return `${(bytes / 1_000).toFixed(1)}KB`;
  return `${bytes}B`;
}

export default function LanguageBreakdown({ data }: Props) {
  if (!data || data.length === 0) return null;

  const topLangs = data.slice(0, 8);

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
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Language DNA</span>
          <p className="text-[10px] text-slate-500 mt-0.5">Code volume by lines of code</p>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="w-full h-3 rounded-full overflow-hidden flex bg-white/[0.04] mb-5">
        {topLangs.map((lang, idx) => (
          <motion.div
            key={lang.language}
            initial={{ width: 0 }}
            whileInView={{ width: `${lang.percentage}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: idx * 0.06 }}
            className="h-full"
            style={{
              backgroundColor: LANG_COLORS[lang.language] || `hsl(${idx * 45 + 200}, 55%, 50%)`,
              filter: `drop-shadow(0 0 4px ${LANG_COLORS[lang.language] || "transparent"}40)`,
            }}
          />
        ))}
      </div>

      {/* Language list */}
      <div className="space-y-2.5">
        {topLangs.map((lang, idx) => (
          <div key={lang.language} className="flex items-center justify-between group hover:bg-white/[0.02] rounded-lg px-2 py-1 -mx-2 transition-colors">
            <div className="flex items-center gap-2.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: LANG_COLORS[lang.language] || `hsl(${idx * 45 + 200}, 55%, 50%)`,
                  boxShadow: `0 0 6px ${LANG_COLORS[lang.language] || "transparent"}40`,
                }}
              />
              <span className="text-sm font-medium text-slate-300">{lang.language}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 tabular-nums">{formatBytes(lang.bytes)}</span>
              <span className="text-xs font-semibold text-slate-300 tabular-nums w-10 text-right">{lang.percentage}%</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
