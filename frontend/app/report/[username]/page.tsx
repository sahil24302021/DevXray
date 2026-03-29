"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { analyzeProfile, AnalysisResult } from "@/lib/api";
import { use } from "react";
import VerdictSection from "@/components/report/VerdictSection";
import HiringRecommendation from "@/components/report/HiringRecommendation";
import AuthenticityScanner from "@/components/report/AuthenticityScanner";
import StrengthWeakness from "@/components/report/StrengthWeakness";
import RedFlags from "@/components/report/RedFlags";
import ImprovementPlan from "@/components/report/ImprovementPlan";
import RepoEvidence from "@/components/report/RepoEvidence";
import ActivityHeatmap from "@/components/report/ActivityHeatmap";
import LanguageBreakdown from "@/components/report/LanguageBreakdown";
import CommitAnalysis from "@/components/report/CommitAnalysis";
import ScoreRadar from "@/components/report/ScoreRadar";
import CodingPatterns from "@/components/report/CodingPatterns";
import CommunityStats from "@/components/report/CommunityStats";
import ContributionStreak from "@/components/report/ContributionStreak";
import ExecutiveSummary from "@/components/report/ExecutiveSummary";
import InterviewQuestions from "@/components/report/InterviewQuestions";
import VerificationSources from "@/components/report/VerificationSources";
import EvidencePanel from "@/components/report/EvidencePanel";

import LoadingState from "@/components/LoadingState";

function ErrorState({ error, username }: { error: string; username: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#050505]">
      <div className="grain-overlay" />
      <div className="rounded-2xl border border-white/[0.06] p-10 max-w-md w-full text-center relative z-10"
        style={{
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-5 border border-red-500/20">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-white mb-2 font-[family-name:var(--font-syne)]">Analysis Failed</h3>
        <p className="text-red-400 mb-1 text-sm font-medium">{error}</p>
        <p className="text-slate-500 text-xs mb-8">Could not generate a report for &quot;{username}&quot;</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-white/[0.05] border border-white/[0.08] text-slate-300 rounded-xl font-medium hover:bg-white/[0.08] transition-colors text-sm"
          >
            Retry
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl font-medium text-sm no-underline text-[#050505] bg-[#cdff00] hover:bg-[#b0d800] transition-colors"
          >
            New Report
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ReportPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [jobId, setJobId] = useState<string>("");

  useEffect(() => {
    if (!username) return;
    
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      // 1) Check if we already have a cached report in Supabase/localStorage
      try {
        const { listCandidates } = await import("@/lib/candidates-store");
        const cached = await listCandidates();
        const existing = cached.find(c => c.username === username);
        if (existing && existing.report_payload) {
          // We have a cached result — use it directly instead of re-scanning
          const payload = existing.report_payload as Record<string, unknown>;
          // Reconstruct enough of an AnalysisResult for the report to render
          const cachedResult: AnalysisResult = {
            ...payload,
            username: existing.username,
            name: existing.name,
            avatar_url: existing.avatar_url,
            final_score: existing.final_score,
            developer_tier: existing.developer_tier,
            risk_level: existing.risk_level,
            hiring_recommendation: existing.hiring_recommendation as any,
            verified_skills: existing.verified_skills,
            top_languages: existing.top_languages,
            confidence_score: existing.confidence_score,
          };
          // If cached payload has enough data, use it; otherwise fall through to API
          if (cachedResult.final_score && cachedResult.final_score > 0) {
            setData(cachedResult);
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // Cache miss — proceed to API
      }

      // 2) No cache hit — call the backend
      const newJobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      setJobId(newJobId);

      try {
        const result = await analyzeProfile(username, newJobId);
        setData(result);

        // Save to cache for next time
        try {
          const { saveCandidate } = await import("@/lib/candidates-store");
          await saveCandidate(result as any, username);
        } catch {}
      } catch (err: any) {
        setError(err.message || "An unknown error occurred");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [username]);

  if (isLoading) return <LoadingState username={username} jobId={jobId} />;
  if (error) return <ErrorState error={error} username={username} />;
  if (!data) return null;

  // ─── Derive convenience fields the backend doesn't emit directly ───
  const score = data.final_score ?? (data.score as number) ?? 0;
  const createdAt = data.created_at || (data.basic_info as any)?.created_at || "";
  const accountAgeDays = createdAt
    ? Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 86400000)
    : 0;
  const accountAgeYears = Math.round(accountAgeDays / 365.25 * 10) / 10;
  // Inject computed fields back so sub-components can access them via data.*
  const dataWithAliases = { ...data, score, account_age_years: accountAgeYears };

  const data2 = dataWithAliases;

  return (
    <div className="min-h-screen bg-[#050505] text-[#fafafa] font-[family-name:var(--font-dm-sans)] relative print:min-h-0 print:bg-[#050505] print:block print:overflow-visible">
      <div className="grain-overlay" />
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none z-0 print:hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#cdff00]/[0.03] blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-[#cdff00]/[0.02] blur-[100px] rounded-full mix-blend-screen" />
      </div>

      {/* --- Print Styles (page-specific overrides) --- */}
      <style jsx global>{`
        @media print {
          /* Ensure framer-motion sections are uniformly visible */
          div[class*="rounded-2xl"], section[class*="rounded-2xl"] {
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* --- Nav --- */}
      <nav className="sticky top-0 z-50 px-6 md:px-10 pt-4 print:hidden">
        <div
          className="mx-auto max-w-5xl flex items-center justify-between rounded-2xl px-6 py-3 border border-white/[0.06]"
          style={{
            background: "rgba(5, 5, 5, 0.85)",
            backdropFilter: "blur(20px) saturate(150%)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <div className="w-6 h-6 rounded-md bg-[#cdff00] flex items-center justify-center shadow-[0_0_15px_rgba(205,255,0,0.2)]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#050505" />
              </svg>
            </div>
            <span className="font-[family-name:var(--font-syne)] font-bold text-[15px] tracking-tight text-white">
              DevXray<span className="grad-text">.ai</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                // Force a fresh scan by clearing cache and reloading
                import("@/lib/candidates-store").then(({ deleteCandidate }) => {
                  deleteCandidate(username).then(() => window.location.reload());
                });
              }}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white border border-white/[0.08] rounded-lg hover:bg-white/[0.05] transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Re-scan
            </button>
            <button
              onClick={() => window.print()}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white border border-white/[0.08] rounded-lg hover:bg-white/[0.05] transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export PDF
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-[#050505] bg-[#cdff00] rounded-lg transition-all no-underline hover:bg-[#b0d800] tracking-wide"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Report
            </Link>
          </div>
        </div>
      </nav>

      {/* --- Report Content --- */}
      <main className="relative z-10 mx-auto max-w-5xl px-6 py-10 pb-20 animate-fade-in print:p-0 print:m-0 print:max-w-none print:w-full print:block print:overflow-visible">
          {/* -- Profile Card + Score Radar -- */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-5 mb-5 print:block print:space-y-5">
            {/* Profile Card */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="rounded-2xl border border-white/[0.06] p-6 md:p-8"
              style={{
                background: "rgba(255,255,255,0.03)",
                backdropFilter: "blur(24px)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                {/* Left: Avatar + Info */}
                <div className="flex items-center gap-5 flex-1 min-w-0">
                  <div className="relative shrink-0">
                    <svg className="w-[80px] h-[80px] -rotate-90" viewBox="0 0 100 100">
                      <circle className="score-ring-track" cx="50" cy="50" r="46" />
                      <motion.circle
                        className="score-ring-fill"
                        cx="50" cy="50" r="46"
                        stroke={score >= 80 ? "#34d399" : score >= 60 ? "#fbbf24" : "#fb7185"}
                        strokeDasharray={2 * Math.PI * 46}
                        initial={{ strokeDashoffset: 2 * Math.PI * 46 }}
                        animate={{ strokeDashoffset: 2 * Math.PI * 46 - (score / 100) * 2 * Math.PI * 46 }}
                        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                      />
                    </svg>
                    <img
                      src={data.avatar_url}
                      alt={data.username}
                      className="w-[56px] h-[56px] rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-white/10 shadow-lg object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <h1 className="font-[family-name:var(--font-syne)] font-bold text-xl text-white truncate">
                      @{data.username}
                    </h1>
                    {data.name && <p className="text-sm text-slate-400 truncate">{data.name}</p>}
                    {data.bio && <p className="text-xs text-slate-500 mt-1 truncate max-w-md">{data.bio}</p>}
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="stat-pill text-[11px]">{data2.total_repos || data2.public_repos} repos</span>
                      <span className="stat-pill text-[11px]">{data2.followers?.toLocaleString()} followers</span>
                      <span className="stat-pill text-[11px]">{data2.total_stars?.toLocaleString()} ★</span>
                      {accountAgeYears > 0 && (
                        <span className="stat-pill text-[11px]">{accountAgeYears}yr</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Score */}
                <div className="text-center md:text-right shrink-0">
                  <div className="inline-flex flex-col items-center md:items-end">
                    <span className={`text-5xl font-bold tabular-nums ${
                      score >= 80 ? "grad-text-score-strong" :
                      score >= 60 ? "grad-text-score-moderate" : "grad-text-score-risky"
                    }`}>
                      {score}
                    </span>
                    <span className="text-xs text-slate-500 font-medium mt-1">/ 100 intelligence score</span>
                  </div>
                </div>
              </div>

              {/* Score Breakdown Bar */}
              {data2.score_breakdown?.breakdown && (
                <div className="mt-6 pt-5 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1 h-2 rounded-full overflow-hidden bg-white/[0.04] mb-3">
                    <ScoreBar value={data2.score_breakdown.breakdown.code_quality} max={30} color="#60a5fa" />
                    <ScoreBar value={data2.score_breakdown.breakdown.skill_depth} max={20} color="#a78bfa" />
                    <ScoreBar value={data2.score_breakdown.breakdown.consistency} max={20} color="#34d399" />
                    <ScoreBar value={data2.score_breakdown.breakdown.growth} max={15} color="#fbbf24" />
                    <ScoreBar value={data2.score_breakdown.breakdown.authenticity} max={15} color="#f472b6" />
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-500 font-semibold uppercase tracking-wider">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Depth</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400" />Ownership</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Activity</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Complexity</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-pink-400" />Languages</span>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Score Radar */}
            <div className="print:hidden">
              <ScoreRadar dimensions={data2.score_dimensions ?? []} />
            </div>
          </div>

          {/* -- Executive Summary (NEW) -- */}
          <ExecutiveSummary 
            tier={{
              tier: (data2 as any).benchmark?.tier || ((typeof data2.developer_tier === 'string') ? data2.developer_tier : 'Unknown'),
              tier_level: Math.ceil(((data2 as any).benchmark?.percentile || 50) / 20),
              tier_description: (data2 as any).benchmark?.tier_description || data2.verdict_explanation || "No description provided.",
              evidence: data2.strengths || [],
              signal_strength: data2.confidence_score || 50
            }} 
            docQuality={data2.documentation_quality || {
              grade: (data2 as any).system_design?.folder_maturity === "Production" ? "A" : (data2 as any).system_design?.folder_maturity === "Structured" ? "B" : "C",
              insight: "Based on repository structure and readme presence.",
              score: 0, repos_with_descriptions: 0, repos_with_topics: 0, repos_with_pages: 0, total_assessed: 0
            }} 
            score={score} 
          />

          {/* -- Verdict + Hiring -- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5 print:block print:space-y-5">
            <VerdictSection data={data2} />
            <HiringRecommendation data={data2} />
          </div>

          {/* -- Evidence Panel (Scoring Details) -- */}
          {(data2.feature_importance || data2.decision_trace) && (
            <EvidencePanel 
              features={data2.feature_importance} 
              decisionTrace={data2.decision_trace} 
            />
          )}

          {/* -- Authenticity + Commit Intelligence -- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5 print:block print:space-y-5">
            <AuthenticityScanner data={data2} />
            {data2.commit_analysis && <CommitAnalysis data={data2.commit_analysis} />}
          </div>

          {/* -- Streak + Community (NEW) -- */}
          {(data2.contribution_streak || data2.community_stats) && (
            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-5 mb-5 print:block print:space-y-5">
              {data2.contribution_streak && <ContributionStreak data={data2.contribution_streak} />}
              {data2.community_stats && <CommunityStats data={data2.community_stats} />}
            </div>
          )}

          {/* -- Multi-Source Verification -- */}
          {data2.verification_sources && <VerificationSources data={data2.verification_sources} />}

          {/* -- Language DNA -- */}
          {data2.language_breakdown && <LanguageBreakdown data={data2.language_breakdown} />}

          {/* -- Activity Timeline -- */}
          {data2.activity_heatmap && <ActivityHeatmap data={data2.activity_heatmap} />}

          {/* -- Coding Patterns (NEW) -- */}
          {data2.coding_patterns && <CodingPatterns data={data2.coding_patterns} />}

          {/* -- Strengths + Weaknesses -- */}
          <StrengthWeakness data={data2} />

          {/* -- Red Flags -- */}
          <RedFlags data={data2} />

          {/* -- Growth Roadmap -- */}
          {data2.improvements && <ImprovementPlan data={data2} />}

          {/* -- Interview Questions (NEW) -- */}
          {data2.interview_questions && data2.interview_questions.length > 0 && (
            <div className="mt-5 mb-5">
              <InterviewQuestions questions={data2.interview_questions} />
            </div>
          )}

          {/* -- Top Repositories -- */}
          {(data2.top_repos && data2.top_repos.length > 0) && <RepoEvidence data={data2} />}

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-white/[0.06] text-center">
            <p className="text-slate-600 text-[10px] tracking-[0.15em] uppercase font-medium">
              DevXray AI · Deep Intelligence Report · @{data2.username} · {data2.repos_deep_analyzed} repos deep-analyzed
            </p>
          </div>
      </main>
    </div>
  );
}

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  const percentage = (value / max) * max;
  return (
    <motion.div
      initial={{ width: 0 }}
      animate={{ width: `${percentage}%` }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
      className="h-full rounded-full"
      style={{ backgroundColor: color, minWidth: value > 0 ? "2px" : 0, filter: `drop-shadow(0 0 4px ${color}40)` }}
    />
  );
}
