"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface SparseDataContext {
  hasPrivateRepos: boolean | null;
  worksAtCompany: boolean | null;
  submitted: boolean;
}

interface SparseDataPromptProps {
  username: string;
  repoCount: number;
  onContextSubmit: (context: SparseDataContext) => void;
  onSkip: () => void;
}

export default function SparseDataPrompt({
  username,
  repoCount,
  onContextSubmit,
  onSkip,
}: SparseDataPromptProps) {
  const [hasPrivateRepos, setHasPrivateRepos] = useState<boolean | null>(null);
  const [worksAtCompany, setWorksAtCompany] = useState<boolean | null>(null);

  const handleSubmit = () => {
    onContextSubmit({
      hasPrivateRepos,
      worksAtCompany,
      submitted: true,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-amber-500/20 p-5 mb-5"
      style={{ background: "rgba(251, 191, 36, 0.04)" }}
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
          <svg
            className="w-4 h-4 text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-300 mb-1">
            @{username} has {repoCount} public repo
            {repoCount !== 1 ? "s" : ""} — two quick questions improve accuracy
          </p>
          <p className="text-xs text-slate-500">
            Many senior developers work primarily on private code. Your answers
            help us weight the score correctly.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Question 1 */}
        <div>
          <p className="text-sm text-slate-300 mb-2">
            Are your main repositories private (work, client projects, NDA
            code)?
          </p>
          <div className="flex gap-3">
            {(
              [
                { value: true, label: "Yes, mostly private" },
                { value: false, label: "No, GitHub reflects my work" },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={String(value)}
                onClick={() => setHasPrivateRepos(value)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
                  hasPrivateRepos === value
                    ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                    : "bg-white/[0.03] border-white/[0.08] text-slate-400 hover:border-white/[0.15]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Question 2 */}
        <div>
          <p className="text-sm text-slate-300 mb-2">
            Do you primarily code at work (not on personal GitHub)?
          </p>
          <div className="flex gap-3">
            {(
              [
                { value: true, label: "Yes, work code is elsewhere" },
                { value: false, label: "No, I code actively on GitHub" },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={String(value)}
                onClick={() => setWorksAtCompany(value)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
                  worksAtCompany === value
                    ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                    : "bg-white/[0.03] border-white/[0.08] text-slate-400 hover:border-white/[0.15]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/[0.06]">
        <button
          onClick={onSkip}
          className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
        >
          Skip — analyze GitHub only
        </button>
        <button
          onClick={handleSubmit}
          disabled={hasPrivateRepos === null && worksAtCompany === null}
          className="px-4 py-2 bg-[#cdff00] text-[#050505] rounded-lg text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#b0d800] transition-colors"
        >
          Improve accuracy ↗
        </button>
      </div>
    </motion.div>
  );
}
