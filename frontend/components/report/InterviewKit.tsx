"use client";

import { useState, useEffect } from "react";
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

/**
 * Compute difficulty level from the candidate's score:
 * < 60 → "junior", 60-80 → "mid", > 80 → "senior"
 */
function getDifficulty(reportData: any): string {
  const github = reportData?.github_intelligence || reportData?.github_report;
  const score: number =
    github?.final_score ??
    github?.score ??
    reportData?.deep_report?.overall_score ??
    reportData?.claims_validation?.authenticity_score ??
    0;
  if (score < 60) return "junior";
  if (score <= 80) return "mid";
  return "senior";
}

/**
 * Extract the candidate's current role from the report, with a sensible fallback.
 */
function getCandidateRole(reportData: any): string {
  return (
    reportData?.resume_data?.current_role ||
    reportData?.github_intelligence?.role_fit?.best_role ||
    "Software Engineer"
  );
}

export default function InterviewKit({ reportData, candidateName }: InterviewKitProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [interviewKit, setInterviewKit] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"auto" | "ai">("auto");
  const [error, setError] = useState("");

  const github = reportData?.github_intelligence || reportData?.github_report;
  const autoQuestions: InterviewQuestion[] = (
    github?.auto_interview_questions ||
    reportData?.auto_interview_questions ||
    []
  );

  // Generate fallback questions from weaknesses if auto list is empty
  const weaknesses: string[] = github?.weaknesses || reportData?.weaknesses || [];
  const fallbackQuestions: InterviewQuestion[] = weaknesses.slice(0, 3).map((w: string, i: number) => ({
    category: "Gap Analysis",
    question: `Your assessment flagged: "${w}". Can you walk me through a specific example where you encountered this challenge and how you handled it?`,
    good_answer: "Candidate shows self-awareness and describes concrete steps they took or are taking to improve.",
    triggered_by: w,
    severity: "MEDIUM"
  }));

  const displayQuestions = autoQuestions.length > 0 ? autoQuestions : fallbackQuestions;

  // ── Check for existing interview kit data in the report ──
  // If already present, load it immediately instead of making an API call.
  useEffect(() => {
    const existingKit =
      reportData?.interview_kit ||
      reportData?.deep_report?.interview_kit ||
      null;

    if (existingKit && typeof existingKit === "object" && Object.keys(existingKit).length > 0) {
      setInterviewKit(existingKit);
    }
  }, [reportData]);

  // ── Generate Interview Kit via API ──
  const generateAIKit = async () => {
    // If we already have kit data, just switch to the AI tab
    if (interviewKit) {
      setActiveTab("ai");
      return;
    }

    setIsLoading(true);
    setError("");

    const difficulty = getDifficulty(reportData);
    const role = getCandidateRole(reportData);

    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        "https://devxray-backend.onrender.com";

      const resp = await fetch(`${backendUrl}/api/interview-prep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: github || reportData,
          role,
          difficulty,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Server error ${resp.status}: ${text || resp.statusText}`);
      }

      const data = await resp.json();

      if (!data.success) {
        throw new Error(data.detail || data.error || "Server returned success=false");
      }

      // The backend returns { success: true, interview_kit: {...}, role, difficulty }
      const kit = data.interview_kit || data;
      setInterviewKit(kit);
      setActiveTab("ai");
    } catch (err: any) {
      const msg = err.message || "Failed to generate AI interview kit";
      setError(msg);
      alert(`Interview Kit Error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // ── Helper: render a list of Q&A items ──
  const renderQAList = (items: any[], sectionColor: string) => {
    if (!items || !Array.isArray(items) || items.length === 0) return null;
    return (
      <div className="space-y-3">
        {items.map((item: any, i: number) => (
          <div
            key={i}
            className={`p-4 rounded-xl border border-${sectionColor}-500/20 bg-${sectionColor}-500/5 print:border-gray-300 print:bg-white`}
          >
            <p className="text-sm text-white font-medium leading-relaxed print:text-black">
              <span className="text-slate-500 font-mono mr-2 text-xs">Q{i + 1}.</span>
              {typeof item === "string" ? item : item.question || item.text || JSON.stringify(item)}
            </p>
            {item.purpose && (
              <p className="text-[11px] text-slate-500 mt-2 print:text-gray-500">
                <span className="font-bold text-slate-400">Purpose:</span> {item.purpose}
              </p>
            )}
            {item.follow_up && (
              <p className="text-[11px] text-cyan-400/70 mt-1.5 print:text-gray-500">
                <span className="font-bold">Follow-up:</span> {item.follow_up}
              </p>
            )}
            {item.good_answer_looks_like && (
              <div className="mt-2 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <span className="text-[9px] uppercase tracking-widest text-emerald-500 font-bold block mb-1">
                  ✓ Good answer looks like
                </span>
                <p className="text-[11px] text-emerald-300/70 leading-relaxed print:text-gray-600">
                  {item.good_answer_looks_like}
                </p>
              </div>
            )}
            {item.red_flag_answer && (
              <div className="mt-2 p-2.5 rounded-lg bg-rose-500/5 border border-rose-500/10">
                <span className="text-[9px] uppercase tracking-widest text-rose-500 font-bold block mb-1">
                  🚩 Red flag answer
                </span>
                <p className="text-[11px] text-rose-300/70 leading-relaxed print:text-gray-600">
                  {item.red_flag_answer}
                </p>
              </div>
            )}
            {item.skill && (
              <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-500 border border-white/5">
                Tests: {item.skill}
              </span>
            )}
            {item.probes_for && (
              <p className="text-[10px] text-slate-600 mt-1.5 print:text-gray-400">
                Probes for: {item.probes_for}
              </p>
            )}
            {item.good_signal && (
              <p className="text-[11px] text-emerald-400/60 mt-1.5 print:text-gray-500">
                <span className="font-bold">Good signal:</span> {item.good_signal}
              </p>
            )}
            {item.red_flag && (
              <p className="text-[11px] text-rose-400/60 mt-1 print:text-gray-500">
                <span className="font-bold">Red flag:</span> {item.red_flag}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Trigger Button */}
      <motion.button
        onClick={() => { setIsOpen(true); if (!interviewKit && !isLoading) generateAIKit(); }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        disabled={isLoading}
        className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all cursor-pointer disabled:opacity-60"
        style={{
          background: "linear-gradient(135deg, rgba(205,255,0,0.15), rgba(205,255,0,0.05))",
          border: "1px solid rgba(205,255,0,0.3)",
          color: "#cdff00",
        }}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating...
          </>
        ) : (
          <>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Generate Interview Kit
          </>
        )}
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
                      {interviewKit && (
                        <span className="ml-3 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          ✓ Kit Ready
                        </span>
                      )}
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
                    🎯 Auto-Generated ({displayQuestions.length})
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
                      <>🤖 AI Deep-Dive {interviewKit ? "✓" : ""}</>
                    )}
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="rounded-b-2xl border border-t-0 border-white/[0.06] p-6 space-y-4 print:border-black/10"
                   style={{ background: "rgba(5,5,5,0.95)" }}>

                {error && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                    ⚠️ {error}
                  </div>
                )}

                {/* Auto-Generated Questions Tab */}
                {activeTab === "auto" && (
                  <div className="space-y-3">
                    {displayQuestions.length === 0 ? (
                      <div className="text-center py-12 text-slate-500">
                        <p className="text-lg mb-2">No auto-generated questions</p>
                        <p className="text-sm">No specific red flags or weak dimensions detected. Try the AI deep-dive instead.</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-slate-500 mb-4">
                          These questions are auto-generated from detected red flags and score weaknesses — zero AI cost.
                        </p>
                        {displayQuestions.map((q, i) => {
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

                {/* AI Deep-Dive Tab — Loading */}
                {activeTab === "ai" && isLoading && (
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", padding: "4rem 2rem", gap: "1rem"
                  }}>
                    <div style={{
                      width: 36, height: 36,
                      border: "2px solid rgba(168,85,247,0.3)",
                      borderTopColor: "#a855f7",
                      borderRadius: "50%",
                      animation: "devxray-spin 0.8s linear infinite"
                    }} />
                    <p style={{fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0}}>
                      Generating AI deep-dive interview kit...
                    </p>
                  </div>
                )}

                {/* AI Deep-Dive Tab — Rendered Kit */}
                {activeTab === "ai" && interviewKit && !isLoading && (
                  <div className="space-y-6">
                    <p className="text-xs text-slate-500 mb-2">
                      AI-generated comprehensive interview kit — role: <span className="text-purple-400 font-bold">{getCandidateRole(reportData)}</span>, difficulty: <span className="text-purple-400 font-bold">{getDifficulty(reportData)}</span>
                    </p>

                    {/* Overall Interview Strategy */}
                    {interviewKit.overall_interview_strategy && (
                      <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20">
                        <h4 className="text-sm font-bold text-purple-400 mb-2 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                          📋 Interview Strategy
                        </h4>
                        <p className="text-sm text-slate-300 leading-relaxed print:text-black">
                          {interviewKit.overall_interview_strategy}
                        </p>
                      </div>
                    )}

                    {/* Time Allocation */}
                    {interviewKit.time_allocation && (
                      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                        <h4 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          ⏱️ Time Allocation
                        </h4>
                        <div className="flex flex-wrap gap-3">
                          {Object.entries(interviewKit.time_allocation).map(([section, time]: [string, any]) => (
                            <div key={section} className="px-3 py-2 rounded-lg bg-white/5 border border-white/5">
                              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">{section.replace(/_/g, " ")}</span>
                              <span className="text-sm font-bold text-white">{time}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Opening Questions */}
                    {interviewKit.opening_questions?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-[#cdff00] mb-3 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#cdff00]" />
                          👋 Opening Questions
                        </h4>
                        {renderQAList(interviewKit.opening_questions, "yellow")}
                      </div>
                    )}

                    {/* Technical Deep Dives */}
                    {interviewKit.technical_deep_dives?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-cyan-400 mb-3 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                          🔬 Technical Deep Dives
                        </h4>
                        {renderQAList(interviewKit.technical_deep_dives, "cyan")}
                      </div>
                    )}

                    {/* Gap Probing Questions */}
                    {interviewKit.gap_probing_questions?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-amber-400 mb-3 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          🔍 Gap Probing Questions
                        </h4>
                        {renderQAList(interviewKit.gap_probing_questions, "amber")}
                      </div>
                    )}

                    {/* System Design Challenge */}
                    {interviewKit.system_design_challenge && (
                      <div className="p-4 rounded-xl bg-[#cdff00]/5 border border-[#cdff00]/20 print:border-gray-300 print:bg-white">
                        <h4 className="text-sm font-bold text-[#cdff00] mb-2 print:text-gray-800">🏗️ System Design Challenge</h4>
                        <p className="text-sm text-slate-300 leading-relaxed print:text-black mb-3">
                          {typeof interviewKit.system_design_challenge === "string"
                            ? interviewKit.system_design_challenge
                            : interviewKit.system_design_challenge.problem || JSON.stringify(interviewKit.system_design_challenge)}
                        </p>
                        {interviewKit.system_design_challenge.what_to_look_for && (
                          <div className="mt-2">
                            <span className="text-[10px] uppercase tracking-widest text-[#cdff00]/60 font-bold block mb-1.5">
                              What to look for:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {interviewKit.system_design_challenge.what_to_look_for.map((item: string, i: number) => (
                                <span key={i} className="text-[11px] px-2 py-1 rounded-md bg-[#cdff00]/10 text-[#cdff00]/80 border border-[#cdff00]/15">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {interviewKit.system_design_challenge.time_allocation && (
                          <p className="text-[10px] text-slate-500 mt-2">
                            ⏱️ Suggested time: {interviewKit.system_design_challenge.time_allocation}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Culture Fit Questions */}
                    {interviewKit.culture_fit_questions?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          🤝 Culture Fit
                        </h4>
                        {renderQAList(interviewKit.culture_fit_questions, "emerald")}
                      </div>
                    )}

                    {/* Coding Challenge */}
                    {interviewKit.coding_challenge && (
                      <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20 print:border-gray-300 print:bg-white">
                        <h4 className="text-sm font-bold text-indigo-400 mb-2 print:text-gray-800">💻 Coding Challenge</h4>
                        <p className="text-sm text-slate-300 leading-relaxed print:text-black">
                          {typeof interviewKit.coding_challenge === "string"
                            ? interviewKit.coding_challenge
                            : interviewKit.coding_challenge.problem || JSON.stringify(interviewKit.coding_challenge)}
                        </p>
                        {interviewKit.coding_challenge.difficulty && (
                          <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 uppercase tracking-wider font-bold">
                            {interviewKit.coding_challenge.difficulty}
                          </span>
                        )}
                        {interviewKit.coding_challenge.what_it_tests && (
                          <p className="text-[11px] text-slate-500 mt-2">
                            Tests: {interviewKit.coding_challenge.what_it_tests}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Closing Questions */}
                    {interviewKit.closing_questions?.length > 0 && (
                      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                        <h4 className="text-sm font-bold text-slate-300 mb-2">🎤 Closing — Questions the candidate should ask</h4>
                        <ul className="space-y-1.5">
                          {interviewKit.closing_questions.map((q: any, i: number) => (
                            <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                              <span className="text-slate-600 mt-0.5">•</span>
                              {typeof q === "string" ? q : q.question || JSON.stringify(q)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Fallback: if the kit has a flat "questions" dict (legacy format) */}
                    {interviewKit.questions && typeof interviewKit.questions === "object" && !interviewKit.technical_deep_dives && (
                      <>
                        {Object.entries(interviewKit.questions).map(([category, items]: [string, any], idx) => (
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
                        ))}
                      </>
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

/* Spin animation for the loading spinner */
const spinStyle = typeof document !== 'undefined' ? (() => {
  const id = 'devxray-spin-keyframes';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = '@keyframes devxray-spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
  return null;
})() : null;
