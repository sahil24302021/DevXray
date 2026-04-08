"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface InterviewQuestion {
  category: string;
  question: string;
  good_answer?: string;
  triggered_by?: string;
  severity?: string;
}

interface InterviewKitProps {
  reportData: any;
  candidateName: string;
}

const SEVERITY_CONFIG: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  "CRITICAL": { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400", icon: "🔴" },
  "HIGH": { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", icon: "🟠" },
  "MEDIUM": { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", icon: "🟡" },
  "LOW": { bg: "bg-slate-500/10", border: "border-slate-500/30", text: "text-slate-400", icon: "⚪" },
  "POSITIVE": { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", icon: "✅" },
};

const CATEGORY_ICONS: Record<string, string> = {
  "Originality": "🎨",
  "Authenticity": "🔍",
  "Consistency": "📊",
  "Engineering Practices": "⚙️",
  "Documentation": "📝",
  "Breadth": "🌐",
  "Depth": "🧠",
  "Verification": "✔️",
  "Career Continuity": "📅",
  "Growth": "📈",
  "Technical Depth": "🏗️",
};

export default function InterviewKit({ reportData, candidateName }: InterviewKitProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [aiQuestions, setAiQuestions] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"auto" | "ai">("auto");
  const [error, setError] = useState("");

  const github = reportData?.github_intelligence;
  const autoQuestions: InterviewQuestion[] = github?.auto_interview_questions || [];

  const generateAIKit = async () => {
    if (aiQuestions) {
      setActiveTab("ai");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "https://devxray-backend.onrender.com";
      const resp = await fetch(`${backendUrl}/api/interview-prep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: reportData }),
      });
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      const data = await resp.json();
      setAiQuestions(data);
      setActiveTab("ai");
    } catch (err: any) {
      setError(err.message || "Failed to generate AI interview kit");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Trigger Button */}
      <motion.button
        onClick={() => setIsOpen(true)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all cursor-pointer"
        style={{
          background: "linear-gradient(135deg, rgba(205,255,0,0.15), rgba(205,255,0,0.05))",
          border: "1px solid rgba(205,255,0,0.3)",
          color: "#cdff00",
        }}
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Generate Interview Kit
      </motion.button>

      {/* Full-screen Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto print:static print:overflow-visible"
            style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
          >
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.97 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-4xl mx-4 my-8 print:mx-0 print:my-0 print:max-w-none"
            >
              {/* Header */}
              <div className="rounded-t-2xl px-8 py-6 border border-white/[0.06] print:border-black/10"
                   style={{ background: "linear-gradient(135deg, rgba(205,255,0,0.08), rgba(255,255,255,0.03))" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white print:text-black"
                        style={{ fontFamily: "var(--font-syne)" }}>
                      Interview Kit
                    </h2>
                    <p className="text-sm text-slate-400 mt-1 print:text-gray-600">
                      Prepared for: <span className="text-white print:text-black font-medium">{candidateName}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 print:hidden">
                    <button
                      onClick={handlePrint}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-white/10 rounded-lg hover:bg-white/20 border border-white/10 cursor-pointer flex items-center gap-1.5 transition-colors"
                    >
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Print
                    </button>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer border border-white/[0.06]"
                    >
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-4 print:hidden">
                  <button
                    onClick={() => setActiveTab("auto")}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      activeTab === "auto"
                        ? "bg-[#cdff00]/15 text-[#cdff00] border border-[#cdff00]/30"
                        : "bg-white/5 text-slate-400 border border-white/[0.06] hover:bg-white/10"
                    }`}
                  >
                    🎯 Auto-Generated ({autoQuestions.length})
                  </button>
                  <button
                    onClick={generateAIKit}
                    disabled={isLoading}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeTab === "ai"
                        ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                        : "bg-white/5 text-slate-400 border border-white/[0.06] hover:bg-white/10"
                    } disabled:opacity-50`}
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>🤖 AI Deep-Dive {aiQuestions ? `(${Object.keys(aiQuestions.questions || {}).length} areas)` : ""}</>
                    )}
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="rounded-b-2xl border border-t-0 border-white/[0.06] p-6 space-y-4 print:border-black/10"
                   style={{ background: "rgba(5,5,5,0.95)" }}>

                {error && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                    {error}
                  </div>
                )}

                {/* Auto-Generated Questions Tab */}
                {activeTab === "auto" && (
                  <div className="space-y-3">
                    {autoQuestions.length === 0 ? (
                      <div className="text-center py-12 text-slate-500">
                        <p className="text-lg mb-2">No auto-generated questions</p>
                        <p className="text-sm">No specific red flags or weak dimensions detected. Try the AI deep-dive instead.</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-slate-500 mb-4">
                          These questions are auto-generated from detected red flags and score weaknesses — zero AI cost.
                        </p>
                        {autoQuestions.map((q, i) => {
                          const sev = SEVERITY_CONFIG[q.severity || "MEDIUM"] || SEVERITY_CONFIG["MEDIUM"];
                          const icon = CATEGORY_ICONS[q.category] || "❓";
                          return (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.06 }}
                              className={`p-5 rounded-xl border ${sev.border} ${sev.bg} print:border-gray-300 print:bg-white`}
                            >
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-sm">{icon}</span>
                                <span className={`text-[10px] uppercase tracking-widest font-bold ${sev.text} print:text-gray-600`}>
                                  {q.category}
                                </span>
                                <span className="text-[9px] text-slate-600 ml-auto print:text-gray-400">
                                  {sev.icon} {q.severity}
                                </span>
                              </div>
                              <p className="text-sm text-white font-medium leading-relaxed mb-3 print:text-black">
                                {q.question}
                              </p>
                              {q.good_answer && (
                                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05] print:bg-gray-50 print:border-gray-200">
                                  <span className="text-[9px] uppercase tracking-widest text-emerald-500 font-bold block mb-1">
                                    ✓ What a good answer looks like
                                  </span>
                                  <p className="text-xs text-slate-400 leading-relaxed print:text-gray-600">
                                    {q.good_answer}
                                  </p>
                                </div>
                              )}
                              {q.triggered_by && (
                                <p className="text-[10px] text-slate-600 mt-2 print:text-gray-400">
                                  Triggered by: {q.triggered_by}
                                </p>
                              )}
                            </motion.div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}

                {/* AI Deep-Dive Tab */}
                {activeTab === "ai" && aiQuestions && (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500 mb-2">
                      AI-generated deep-dive questions based on full candidate analysis.
                    </p>
                    {aiQuestions.questions && typeof aiQuestions.questions === "object" && (
                      Object.entries(aiQuestions.questions).map(([category, items]: [string, any], idx) => (
                        <div key={category} className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 print:border-gray-300 print:bg-white">
                          <h4 className="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2 print:text-gray-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                            {category}
                          </h4>
                          <div className="space-y-2.5">
                            {(Array.isArray(items) ? items : [items]).map((q: any, j: number) => (
                              <div key={j} className="flex items-start gap-3">
                                <span className="text-slate-600 text-xs mt-0.5 font-mono">{j + 1}.</span>
                                <p className="text-sm text-slate-300 leading-relaxed print:text-black">
                                  {typeof q === "string" ? q : q.question || q.text || JSON.stringify(q)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                    {aiQuestions.system_design_challenge && (
                      <div className="p-4 rounded-xl bg-[#cdff00]/5 border border-[#cdff00]/20 print:border-gray-300 print:bg-white">
                        <h4 className="text-sm font-bold text-[#cdff00] mb-2 print:text-gray-800">🏗️ System Design Challenge</h4>
                        <p className="text-sm text-slate-300 leading-relaxed print:text-black">
                          {aiQuestions.system_design_challenge}
                        </p>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
