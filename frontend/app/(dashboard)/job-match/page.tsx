"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useState, useEffect } from "react";
import { listCandidates } from "@/lib/candidates-store";
import Logo from "@/components/Logo";

/* ── Types ── */
interface CandidateData {
  username: string;
  name: string;
  avatar_url: string;
  score: number;
  tier: string;
  verified_skills: string[];
  top_languages: string[];
  languages: string[];
}

interface MatchResult {
  rank: number;
  username: string;
  name: string;
  avatar_url: string;
  score: number;
  tier: string;
  match_percentage: number;
  skill_match_percentage: number;
  matched_skills: string[];
  missing_skills: string[];
  recommendation: string;
  gap_interview_questions: string[];
}

interface JobMatchResponse {
  success: boolean;
  job_title: string;
  required_skills: string[];
  experience_level: string;
  total_candidates: number;
  rankings: MatchResult[];
}

const RECOMMENDATION_COLORS: Record<string, string> = {
  "Strong Match": "#34d399",
  "Possible Match": "#fbbf24",
  "Not Recommended": "#fb7185",
};

export default function JobMatchPage() {
  const [jobTitle, setJobTitle] = useState("");
  const [requiredSkills, setRequiredSkills] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("Mid");
  const [jobDescription, setJobDescription] = useState("");
  const [candidates, setCandidates] = useState<CandidateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [results, setResults] = useState<JobMatchResponse | null>(null);
  const [error, setError] = useState("");

  // Load candidates on mount
  useEffect(() => {
    async function loadCandidates() {
      try {
        const records = await listCandidates();
        const parsed: CandidateData[] = records.map((r) => ({
          username: r.username,
          name: r.name || r.username,
          avatar_url: r.avatar_url || "",
          score: Math.round(Number(r.final_score ?? r.score ?? 0)),
          tier: String(r.developer_tier || r.tier || ""),
          verified_skills: (r.verified_skills as string[]) || [],
          top_languages: (r.top_languages as string[]) || [],
          languages: (r.languages as string[]) || [],
        }));
        setCandidates(parsed);
      } catch (err) {
        console.error("Failed to load candidates:", err);
      } finally {
        setLoading(false);
      }
    }
    loadCandidates();
  }, []);

  const handleMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle.trim() && !requiredSkills.trim()) {
      setError("Please enter a job title or required skills.");
      return;
    }
    if (candidates.length === 0) {
      setError("No scanned candidates found. Scan some developers first from the dashboard.");
      return;
    }

    setMatching(true);
    setError("");
    setResults(null);

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_BASE}/api/match-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_title: jobTitle,
          required_skills: requiredSkills,
          experience_level: experienceLevel,
          job_description: jobDescription,
          candidates: candidates,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      const data: JobMatchResponse = await res.json();
      setResults(data);
    } catch (err: any) {
      setError(err.message || "Matching failed. Is the backend running?");
    } finally {
      setMatching(false);
    }
  };

  return (
    <div className="min-h-screen p-4 pt-14 sm:p-6 md:p-8 lg:pt-8" style={{ fontFamily: "var(--font-dm-sans)" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 mb-6">
        <div>
          <Link href="/dashboard" className="text-[#555] text-xs hover:text-white transition-colors no-underline">
            ← Back to Dashboard
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-white mt-1" style={{ fontFamily: "var(--font-syne)" }}>
            Job <span style={{ color: "#f472b6" }}>Requirements</span> Matching
          </h1>
          <p className="text-[#555] text-xs mt-1">
            Match your scanned candidates against specific job requirements
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "rgba(244,114,182,0.08)", border: "1px solid rgba(244,114,182,0.2)" }}>
          <span className="text-[#f472b6] text-xs font-bold">{candidates.length}</span>
          <span className="text-[#888] text-[10px]">candidates loaded</span>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        {/* Left: Job Requirements Form */}
        <motion.form
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={handleMatch}
          className="rounded-2xl border p-5 space-y-4 h-fit sticky top-20"
          style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
        >
          <h3 className="text-sm font-bold text-white mb-3" style={{ fontFamily: "var(--font-syne)" }}>
            Define Job Requirements
          </h3>

          {/* Job Title */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[#555] font-bold block mb-1.5">
              Job Title
            </label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Senior Backend Engineer"
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-[#444] outline-none transition-all focus:border-[#f472b6]/40"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>

          {/* Required Skills */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[#555] font-bold block mb-1.5">
              Required Skills <span className="text-[#f472b6]">*</span>
            </label>
            <input
              type="text"
              value={requiredSkills}
              onChange={(e) => setRequiredSkills(e.target.value)}
              placeholder="Python, FastAPI, PostgreSQL, Docker"
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-[#444] outline-none transition-all focus:border-[#f472b6]/40"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
            <p className="text-[10px] text-[#444] mt-1">Comma-separated list of required skills</p>
          </div>

          {/* Experience Level */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[#555] font-bold block mb-1.5">
              Experience Level
            </label>
            <div className="flex gap-2">
              {["Junior", "Mid", "Senior"].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setExperienceLevel(level)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                    experienceLevel === level
                      ? "text-black"
                      : "text-[#555] hover:text-white"
                  }`}
                  style={{
                    background: experienceLevel === level ? "#f472b6" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${experienceLevel === level ? "#f472b6" : "rgba(255,255,255,0.08)"}`,
                  }}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Job Description */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[#555] font-bold block mb-1.5">
              Job Description <span className="text-[#444]">(optional)</span>
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here for better matching..."
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-[#444] outline-none resize-none transition-all focus:border-[#f472b6]/40"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={matching || loading || candidates.length === 0}
            className="w-full py-3 rounded-xl text-sm font-bold text-black transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "#f472b6" }}
          >
            {matching ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Matching...
              </>
            ) : (
              `Match ${candidates.length} Candidates`
            )}
          </button>

          {error && <p className="text-xs text-[#fb7185] mt-2">{error}</p>}
        </motion.form>

        {/* Right: Results */}
        <div className="space-y-4">
          {!results && !matching && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl border p-10 text-center"
              style={{ background: "rgba(255,255,255,0.01)", borderColor: "rgba(255,255,255,0.06)" }}
            >
              <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: "rgba(244,114,182,0.08)", border: "1px solid rgba(244,114,182,0.2)" }}>
                <span className="text-2xl">◎</span>
              </div>
              <h3 className="text-sm font-bold text-white mb-2" style={{ fontFamily: "var(--font-syne)" }}>
                Define Job Requirements
              </h3>
              <p className="text-xs text-[#555] max-w-sm mx-auto">
                Enter the job title, required skills, and experience level. We&apos;ll rank all your scanned candidates by match percentage.
              </p>
            </motion.div>
          )}

          {matching && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border p-10 text-center"
              style={{ background: "rgba(255,255,255,0.01)", borderColor: "rgba(255,255,255,0.06)" }}>
              <svg className="animate-spin w-8 h-8 text-[#f472b6] mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-[#888]">Matching {candidates.length} candidates against requirements...</p>
            </motion.div>
          )}

          {results && (
            <AnimatePresence>
              {/* Results header */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border p-4"
                style={{ background: "rgba(244,114,182,0.04)", borderColor: "rgba(244,114,182,0.15)" }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white" style={{ fontFamily: "var(--font-syne)" }}>
                      {results.job_title || "Job Match Results"}
                    </h3>
                    <p className="text-[10px] text-[#888] mt-0.5">
                      {results.total_candidates} candidates ranked · {results.experience_level} level · {results.required_skills.length} required skills
                    </p>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {results.required_skills.slice(0, 6).map((skill) => (
                      <span key={skill} className="px-2 py-0.5 rounded-full text-[9px] font-bold"
                        style={{ background: "rgba(244,114,182,0.15)", color: "#f472b6" }}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* Candidate results */}
              {results.rankings.map((r, idx) => (
                <motion.div
                  key={r.username}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="rounded-2xl border p-4 hover:border-white/10 transition-all group"
                  style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
                >
                  <div className="flex items-start gap-4">
                    {/* Rank badge */}
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black"
                        style={{
                          background: r.rank <= 3 ? "rgba(244,114,182,0.15)" : "rgba(255,255,255,0.04)",
                          color: r.rank <= 3 ? "#f472b6" : "#555",
                          border: `1px solid ${r.rank <= 3 ? "rgba(244,114,182,0.3)" : "rgba(255,255,255,0.06)"}`,
                        }}>
                        #{r.rank}
                      </div>
                    </div>

                    {/* Avatar + info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        {r.avatar_url && (
                          <img src={r.avatar_url} alt={r.name} className="w-8 h-8 rounded-full" />
                        )}
                        <div className="min-w-0">
                          <Link href={`/report/${r.username}`} className="text-sm font-bold text-white hover:text-[#f472b6] transition-colors no-underline truncate block">
                            {r.name || r.username}
                          </Link>
                          <span className="text-[10px] text-[#555]">@{r.username} · Score {r.score}/100 · {r.tier}</span>
                        </div>
                      </div>

                      {/* Skills breakdown */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {r.matched_skills.map((s) => (
                          <span key={s} className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                            style={{ background: "rgba(52,211,153,0.12)", color: "#34d399" }}>
                            ✓ {s}
                          </span>
                        ))}
                        {r.missing_skills.map((s) => (
                          <span key={s} className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                            style={{ background: "rgba(251,113,133,0.12)", color: "#fb7185" }}>
                            ✗ {s}
                          </span>
                        ))}
                      </div>

                      {/* Gap interview questions */}
                      {r.gap_interview_questions.length > 0 && (
                        <div className="mt-2 p-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                          <p className="text-[9px] uppercase tracking-wider text-[#555] font-bold mb-1">Gap Interview Questions</p>
                          {r.gap_interview_questions.map((q, qi) => (
                            <p key={qi} className="text-[11px] text-[#888] mb-1 last:mb-0">• {q}</p>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Match percentage + recommendation */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="text-2xl font-black" style={{ fontFamily: "var(--font-syne)", color: RECOMMENDATION_COLORS[r.recommendation] || "#888" }}>
                        {r.match_percentage}%
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold"
                        style={{
                          background: `${RECOMMENDATION_COLORS[r.recommendation] || "#888"}20`,
                          color: RECOMMENDATION_COLORS[r.recommendation] || "#888",
                        }}>
                        {r.recommendation}
                      </span>
                      {/* Skill match bar */}
                      <div className="w-20 h-1 rounded-full mt-1" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${r.skill_match_percentage}%`,
                            background: RECOMMENDATION_COLORS[r.recommendation] || "#888",
                          }} />
                      </div>
                      <span className="text-[9px] text-[#555]">{r.skill_match_percentage}% skill match</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
