"use client";

import { motion } from "framer-motion";
import { AnalysisResult } from "@/lib/api";

interface Props {
  data: AnalysisResult;
}

const langColors: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f7df1e", Python: "#3776ab", Java: "#b07219",
  "C++": "#f34b7d", Go: "#00add8", Rust: "#dea584", Ruby: "#701516",
  Swift: "#ffac45", Kotlin: "#a97bff", CSS: "#563d7c", HTML: "#e34c26",
  Move: "#4a137a", C: "#555555", PHP: "#4F5D95",
};

export default function VerifiedSkills({ data }: Props) {
  if (!data.verified_skills || data.verified_skills.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.32 }}
      className="mt-6"
    >
      <div className="glass-card p-8">
        <div className="flex items-center gap-2.5 mb-6">
          <svg className="w-4 h-4 text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <h3 className="section-label text-violet-600">Verified Skill Matrix</h3>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {data.verified_skills.map((skill, i) => (
            <motion.div
              key={skill}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + i * 0.04 }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-zinc-200 hover:border-violet-300 hover:bg-violet-50 hover:-translate-y-0.5 shadow-sm hover:shadow-md transition-all duration-200 cursor-default"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: langColors[skill] || "#a78bfa" }}
              />
              <span className="text-xs font-medium text-zinc-700 tracking-wide">
                {skill}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
