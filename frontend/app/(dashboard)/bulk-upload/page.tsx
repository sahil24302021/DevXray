"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useCallback } from "react";
import { analyzeResume, extractScoring, scoreToTier, scoreToRisk, scoreToRecommendation, normalizeTier, getHiringRecommendationSummary, extractLanguages } from "@/lib/api";

type FileStatus = "queued" | "parsing" | "analyzing" | "done" | "error";

interface UploadFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: FileStatus;
  progress: number;
  score?: number;
  candidate?: string;
  tier?: string;
  recommendation?: string;
  risk?: string;
  languages?: string[];
  error?: string;
}

const TIER_COLORS: Record<string, string> = {
  "S-Tier": "#34d399", "A-Tier": "#cdff00", "B-Tier": "#fbbf24", "C-Tier": "#fb923c", "D-Tier": "#fb7185",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function BulkUploadPage() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [jobTitle, setJobTitle] = useState("");
  const [requiredSkills, setRequiredSkills] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((rawFiles: FileList | File[]) => {
    const arr = Array.from(rawFiles);
    const pdfsOnly = arr.filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    const allowed = pdfsOnly.slice(0, Math.max(0, 100 - files.length));

    const newItems: UploadFile[] = allowed.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      file: f,
      name: f.name,
      size: f.size,
      status: "queued" as FileStatus,
      progress: 0,
    }));
    setFiles(prev => [...prev, ...newItems]);
    if (pdfsOnly.length > allowed.length) {
      alert(`Only 100 resumes allowed at once. ${pdfsOnly.length - allowed.length} files were skipped.`);
    }
  }, [files.length]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  // Process files — call real backend for each resume
  const processAll = async () => {
    if (files.length === 0) return;
    setProcessing(true);
    setDone(false);

    const CONCURRENCY = 5; // Process 5 resumes simultaneously

    const processFile = async (uploadFile: UploadFile) => {
      const fid = uploadFile.id;

      setFiles(prev => prev.map(f =>
        f.id === fid ? { ...f, status: "parsing" as FileStatus, progress: 20 } : f
      ));

      try {
        setFiles(prev => prev.map(f =>
          f.id === fid ? { ...f, status: "analyzing" as FileStatus, progress: 50 } : f
        ));

        const result = await analyzeResume(uploadFile.file, {
          jobTitle: jobTitle || undefined,
          requiredSkills: requiredSkills || undefined,
          jobDescription: jobDesc || undefined,
        });

        const ghReport = (result.github_report || result) as Record<string, unknown>;
        const scoring = extractScoring(ghReport as any);
        const resumeData = (result.resume_data || {}) as Record<string, unknown>;
        const candidateName = String(resumeData.name || resumeData.github_username || uploadFile.name.replace(".pdf", ""));
        const tier = normalizeTier(String((ghReport as any).developer_tier || scoreToTier(scoring.finalScore)));
        const langs = extractLanguages(ghReport as any);

        // Auto-save to candidates store
        import("@/lib/candidates-store").then(({ saveCandidate }) => {
          saveCandidate(result, "resume").catch(console.warn);
        });

        setFiles(prev => prev.map(f =>
          f.id === fid
            ? {
                ...f,
                status: "done" as FileStatus,
                progress: 100,
                score: scoring.finalScore,
                candidate: candidateName,
                tier,
                recommendation: getHiringRecommendationSummary(ghReport as any),
                risk: String((ghReport as any).risk_level || scoreToRisk(scoring.finalScore)),
                languages: langs.length > 0 ? langs : ["Unknown"],
              }
            : f
        ));
      } catch (err: unknown) {
        setFiles(prev => prev.map(f =>
          f.id === fid
            ? {
                ...f,
                status: "error" as FileStatus,
                progress: 0,
                error: err instanceof Error ? err.message : "Analysis failed",
              }
            : f
        ));
      }
    };

    // Process in batches of CONCURRENCY
    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(f => processFile(f)));
    }

    setProcessing(false);
    setDone(true);
  };

  const removeFile = (id: string) => setFiles(prev => prev.filter(f => f.id !== id));
  const clearAll = () => { setFiles([]); setProcessing(false); setDone(false); };

  const doneFiles = files.filter(f => f.status === "done");
  const errorFiles = files.filter(f => f.status === "error");
  const pending = files.filter(f => f.status !== "done" && f.status !== "error").length;
  const avgScore = doneFiles.length > 0 ? Math.round(doneFiles.reduce((s, f) => s + (f.score || 0), 0) / doneFiles.length) : 0;
  const topCandidates = [...doneFiles].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  return (
    <div className="min-h-screen p-6 md:p-8" style={{ fontFamily: "var(--font-dm-sans)" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="section-tag text-[10px] py-1 px-3">Pro Feature</span>
          </div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-syne)" }}>
            Bulk Resume <span style={{ color: "#cdff00" }}>Analysis</span>
          </h1>
          <p className="text-[#555] text-sm mt-1">Upload up to 100 PDF resumes — each is analyzed against the real backend</p>
        </div>
        <div className="flex items-center gap-3">
          {done && doneFiles.length > 0 && (
            <button onClick={() => {
              // Export CSV of results
              const csv = [
                "Candidate,Score,Tier,Recommendation,Risk,Languages",
                ...doneFiles.map(f =>
                  `"${f.candidate}",${f.score},"${f.tier}","${f.recommendation}","${f.risk}","${(f.languages || []).join("; ")}"`
                )
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "devxray-bulk-results.csv"; a.click();
              URL.revokeObjectURL(url);
            }} className="px-4 py-2 text-xs font-bold text-white rounded-xl border border-white/10 hover:border-white/20 transition-colors flex items-center gap-2">
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Export CSV
            </button>
          )}
          <button onClick={clearAll}
            className="px-4 py-2 text-xs font-bold text-[#555] hover:text-white rounded-xl border border-white/[0.06] hover:border-white/10 transition-all">
            Clear All
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Config */}
        <div className="lg:col-span-1 space-y-4">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
            className="rounded-2xl p-5 border"
            style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
            <h3 className="text-sm font-bold text-white mb-4">Job Requirements</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-[#555] uppercase tracking-wider mb-2">Job Title</label>
                <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                  placeholder="e.g. Senior Full-Stack Engineer"
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#333] border outline-none transition-all focus:border-[#cdff00]/40"
                  style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#555] uppercase tracking-wider mb-2">Required Skills</label>
                <input type="text" value={requiredSkills} onChange={e => setRequiredSkills(e.target.value)}
                  placeholder="React, Python, Node.js, AWS..."
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#333] border outline-none transition-all focus:border-[#cdff00]/40"
                  style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#555] uppercase tracking-wider mb-2">Job Description</label>
                <textarea value={jobDesc} onChange={e => setJobDesc(e.target.value)}
                  placeholder="Paste full job description for deep matching..."
                  rows={4}
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#333] border outline-none transition-all focus:border-[#cdff00]/40 resize-none"
                  style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
                />
              </div>
            </div>
          </motion.div>

          {/* Batch summary */}
          {done && doneFiles.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-5 border space-y-3"
              style={{ background: "rgba(205,255,0,0.03)", borderColor: "rgba(205,255,0,0.15)" }}>
              <h3 className="text-sm font-bold text-[#cdff00]">Batch Summary</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Analyzed", value: doneFiles.length, color: "#cdff00" },
                  { label: "Failed", value: errorFiles.length, color: "#fb7185" },
                  { label: "Avg Score", value: `${avgScore}`, color: "#a78bfa" },
                  { label: "Top Tier", value: topCandidates[0]?.tier || "\u2014", color: "#34d399" },
                ].map(stat => (
                  <div key={stat.label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <p className="text-[10px] text-[#555]">{stat.label}</p>
                    <p className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</p>
                  </div>
                ))}
              </div>
              {topCandidates.length > 0 && (
                <div>
                  <p className="text-[10px] text-[#555] mb-2 uppercase tracking-wider">Top Candidates</p>
                  {topCandidates.map((f, i) => (
                    <div key={f.id} className="flex items-center gap-2 py-1.5">
                      <span className="text-[10px] text-[#444] w-4">#{i + 1}</span>
                      <span className="text-[12px] text-white flex-1">{f.candidate}</span>
                      <span className="text-[11px] font-bold" style={{ color: TIER_COLORS[f.tier!] || "#cdff00" }}>{f.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Right: Drop zone + file list */}
        <div className="lg:col-span-2 space-y-4">
          {/* Drop zone */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,application/pdf" className="hidden"
              onChange={e => e.target.files && addFiles(e.target.files)} />
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300 flex flex-col items-center justify-center text-center py-12 px-6 ${
                dragging ? "border-[#cdff00]/60 bg-[#cdff00]/5 scale-[1.01]" : "border-white/10 hover:border-white/20 hover:bg-white/[0.01]"
              }`}>
              <div className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center mx-auto"
                style={{ background: dragging ? "rgba(205,255,0,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${dragging ? "rgba(205,255,0,0.3)" : "rgba(255,255,255,0.08)"}` }}>
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke={dragging ? "#cdff00" : "#555"} strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-white mb-1">{dragging ? "Drop your PDFs here" : "Drag & drop up to 100 PDF resumes"}</h3>
              <p className="text-[#444] text-sm mb-4">or click to browse files · PDF only · Max 10MB per file</p>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <span className="px-3 py-1 rounded-full text-[11px] font-semibold"
                  style={{ background: "rgba(205,255,0,0.08)", color: "#cdff00", border: "1px solid rgba(205,255,0,0.15)" }}>
                  {files.length}/100 files selected
                </span>
                {files.length > 0 && (
                  <span className="px-3 py-1 rounded-full text-[11px] font-semibold text-[#555]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {formatBytes(files.reduce((s, f) => s + f.size, 0))} total
                  </span>
                )}
              </div>
            </div>
          </motion.div>

          {/* Action button */}
          {files.length > 0 && !processing && !done && (
            <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              onClick={processAll}
              className="magnetic-btn w-full flex items-center justify-center gap-2">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Analyze {files.length} Resume{files.length !== 1 ? "s" : ""} with Backend
            </motion.button>
          )}

          {/* Progress indicator */}
          {processing && (
            <div className="rounded-2xl p-4 border" style={{ background: "rgba(205,255,0,0.03)", borderColor: "rgba(205,255,0,0.12)" }}>
              <div className="flex items-center gap-3">
                <svg className="animate-spin w-4 h-4 text-[#cdff00]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-[#cdff00] font-medium">
                  Analyzing {files.length - pending}/{files.length} resumes via backend...
                </span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden ml-auto" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.round(((files.length - pending) / files.length) * 100)}%`, background: "#cdff00" }} />
                </div>
              </div>
              <p className="text-[10px] text-[#444] mt-2">Each resume is fully analyzed: resume parsing → GitHub analysis → AI detection → scoring. ~30-60s per resume.</p>
            </div>
          )}

          {/* File list */}
          {files.length > 0 && (
            <motion.div variants={stagger} initial="hidden" animate="show"
              className="rounded-2xl border overflow-hidden"
              style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="px-5 py-3 border-b flex items-center justify-between"
                style={{ borderColor: "rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.01)" }}>
                <span className="text-[11px] font-bold text-[#666] uppercase tracking-wider">Resume Queue ({files.length})</span>
                {done && <span className="text-[10px] text-[#34d399] font-semibold">{doneFiles.length} completed</span>}
              </div>
              <div className="divide-y divide-white/[0.03] max-h-[520px] overflow-y-auto">
                <AnimatePresence>
                  {files.map((file) => (
                    <motion.div key={file.id} variants={fadeUp}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.01] transition-colors">
                      {/* PDF icon */}
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[9px] font-bold"
                        style={{ background: "rgba(251,65,65,0.1)", color: "#fb4141", border: "1px solid rgba(251,65,65,0.2)" }}>
                        PDF
                      </div>
                      {/* Name + details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-white font-medium truncate">{file.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-[#444]">{formatBytes(file.size)}</span>
                          {file.candidate && <span className="text-[10px] text-[#cdff00]">{file.candidate}</span>}
                          {file.languages && file.languages.length > 0 && (
                            <span className="text-[10px] text-[#555]">{file.languages.join(", ")}</span>
                          )}
                        </div>
                      </div>
                      {/* Status / score */}
                      <div className="w-32 shrink-0">
                        {file.status === "done" ? (
                          <div className="flex items-center gap-2 justify-end">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${TIER_COLORS[file.tier!]}20`, color: TIER_COLORS[file.tier!] || "#cdff00" }}>
                              {file.tier}
                            </span>
                            <span className="text-base font-bold" style={{ color: TIER_COLORS[file.tier!] || "#cdff00" }}>
                              {file.score}
                            </span>
                          </div>
                        ) : file.status === "error" ? (
                          <div className="text-right">
                            <span className="text-[10px] text-[#fb7185]">Failed</span>
                            <p className="text-[9px] text-[#444] mt-0.5 truncate">{file.error}</p>
                          </div>
                        ) : file.status === "queued" ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-[10px] text-[#444]">Queued</span>
                            {!processing && (
                              <button onClick={() => removeFile(file.id)} className="text-[#333] hover:text-[#fb7185] transition-colors">
                                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-[9px] text-[#555] capitalize">{file.status}...</span>
                              <span className="text-[9px] text-[#cdff00]">{file.progress}%</span>
                            </div>
                            <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                              <div className="h-full rounded-full transition-all duration-300"
                                style={{ width: `${file.progress}%`, background: "#cdff00" }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {files.length === 0 && (
            <div className="text-center py-8 text-[#333] text-sm">
              No files selected yet. Upload up to 100 resumes above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
