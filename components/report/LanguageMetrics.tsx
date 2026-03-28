"use client";

import { motion } from "framer-motion";

interface Props {
  languages: string[];
}

export default function LanguageMetrics({ languages }: Props) {
  if (!languages || languages.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="glass-card p-6 md:p-8 w-full print:border-none print:shadow-none print:p-0 print:mt-8 break-inside-avoid"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 print:hidden">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </div>
        <h2 className="text-xl font-bold font-[family-name:var(--font-syne)] text-zinc-900">
          Core Engineering Stack
        </h2>
      </div>

      <div className="flex flex-wrap gap-3">
        {languages.map((lang, idx) => {
          // Soft unique hues per language
          const hue = (idx * 55 + 210) % 360; 
          return (
            <div
              key={lang}
              className="px-4 py-2 border rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:shadow-sm"
              style={{
                backgroundColor: `hsla(${hue}, 80%, 95%, 0.5)`,
                borderColor: `hsla(${hue}, 40%, 85%, 1)`,
                color: `hsla(${hue}, 60%, 20%, 1)`,
              }}
            >
              <span 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: `hsl(${hue}, 70%, 50%)` }} 
              />
              {lang}
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-sm text-zinc-500 leading-relaxed max-w-2xl print:text-zinc-700">
        This candidate's primary technical competencies are structurally weighted towards these languages based on an aggregate analysis of their committed repository volume and historical coding velocity.
      </p>
    </motion.div>
  );
}
