// ═══════════════════════════════════════════
// DevXray — Backend API Client
// ═══════════════════════════════════════════

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Convert raw API errors into specific, user-friendly messages.
 * PDF Guide item: "Better error messages in the UI"
 */
function humanizeError(status: number, raw: string): string {
  const lower = raw.toLowerCase();
  if (status === 404 || lower.includes("404") || lower.includes("not found"))
    return "GitHub user not found — check the username spelling.";
  if (status === 429 || lower.includes("429") || lower.includes("rate") || lower.includes("quota"))
    return "Too many requests — please wait 60 seconds and try again.";
  if (status === 422 || lower.includes("422") || lower.includes("unprocessable"))
    return "Could not read this file — try a different PDF or DOCX.";
  if (status === 500 || lower.includes("500") || lower.includes("internal"))
    return "Analysis failed — the server may be overloaded. Try again in 30 seconds.";
  if (status === 503 || lower.includes("503") || lower.includes("unavailable"))
    return "Server is starting up (cold start). Please retry in 15–30 seconds.";
  if (lower.includes("timeout") || lower.includes("timed out"))
    return "Request timed out — the analysis is taking longer than expected. Try again.";
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("failed to fetch"))
    return "Network error — check your internet connection and try again.";
  return raw || `Request failed (${status}).`;
}

/**
 * Thrown when the server returns 402 (scan limit reached).
 * Callers can check `err instanceof ScanLimitError` or `err.code === "scan_limit_reached"`.
 */
export class ScanLimitError extends Error {
  code = "scan_limit_reached";
  plan: string;
  limit: number;
  constructor(plan: string, limit: number) {
    super(`Scan limit reached on ${plan} plan (${limit} scans). Upgrade for more.`);
    this.name = "ScanLimitError";
    this.plan = plan;
    this.limit = limit;
  }
}

export interface JobRequirements {
  job_title?: string;
  job_type?: string;
  required_skills?: string;
  experience_required?: string;
  job_description?: string;
  company_name?: string;
  additional_notes?: string;
  [key: string]: string | undefined;
}

// ─── Exported types consumed by report components ───

export interface ActivityMonth {
  month: string;   // "2024-01"
  count: number;
}

export interface FeatureImportance {
  component: string;
  weight: number;
  raw_score: number;
  contribution: number;
  impact_level: string;
}

export interface ScoreDimension {
  name: string;
  key?: string;
  label?: string;
  value: number;
  max: number;
  fullMark?: number;
  color?: string;
}

export interface LanguageBreakdownItem {
  language: string;
  bytes: number;
  percentage: number;
  color?: string;
}

export interface InterviewQuestion {
  question: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  focus_area?: string;
  suggested_answer?: string;
}

export interface CodingPatterns {
  day_hour_heatmap: Array<{
    day: string;
    hours: Record<string, number>;
  }>;
  most_active_day: string;
  weekend_ratio: number;
  avg_commits_per_active_day: number;
  coding_session: string;
  peak_hours?: Array<{ hour: number; count: number }>;
}

export interface CommitAnalysis {
  total_analyzed: number;
  quality_score: number;
  insight: string;
  conventional_ratio: number;
  lazy_commit_ratio: number;
}

export interface CommunityStats {
  prs_opened: number;
  issues_opened: number;
  review_events: number;
  comments: number;
  total_community_actions: number;
  collaboration_ratio: number;
  engagement_score: number;
}

export interface ContributionStreak {
  current_streak_weeks: number;
  longest_streak_weeks: number;
  total_active_days: number;
  best_day: string;
}

export interface DeveloperTier {
  tier: string;
  tier_level: number;
  tier_description: string;
  evidence: string[];
  signal_strength: number;
}

export interface DocumentationQuality {
  grade: string;
  insight: string;
  score: number;
  repos_with_descriptions: number;
  repos_with_topics: number;
  repos_with_pages: number;
  total_assessed: number;
}

export interface AnalysisResult {
  // ─── Profile ───
  basic_info?: {
    username: string;
    name: string;
    avatar_url: string;
    bio: string;
    company: string;
    location: string;
    public_repos: number;
    followers: number;
    following: number;
    created_at: string;
  };
  // Top-level profile fields (what generate_report() actually emits)
  username?: string;
  name?: string;
  avatar_url?: string;
  bio?: string;
  location?: string;
  followers?: number;
  following?: number;
  public_repos?: number;
  created_at?: string;

  // ─── Score aliases (report page uses data.score, backend emits data.final_score) ───
  score?: number;                 // alias set by report page: data.final_score ?? 0
  account_age_years?: number;     // computed in report page from created_at
  total_repos?: number;
  total_stars?: number;

  // ─── Real backend scoring fields ───
  final_score?: number;
  score_breakdown?: {
    final_score: number;
    raw_total_before_penalty: number;
    breakdown: {
      code_quality: number;
      skill_depth: number;
      authenticity: number;
      consistency: number;
      growth: number;
      truth: number;
    };
    feature_importance?: FeatureImportance[];
    risk_penalty?: number;
    decision_trace?: string[];
  };
  developer_tier?: string;
  risk_level?: string;
  risk_assessment?: string;   // alias for risk_level (added by fix)
  verdict?: string;         // AI overall verdict ("Strong Hire", "Conditional", etc.)
  summary?: string;         // Executive summary paragraph
  verdict_explanation?: string;
  top_languages?: string[];
  verified_skills?: string[];
  strengths?: string[];
  weaknesses?: string[];

  // ─── Hiring Intelligence ───
  hiring_recommendation?: {
    summary: string;
    recommendation: Record<string, string>;
    reasoning: string[];
  } | string;

  // ─── Legacy scoring shape (kept for fallback) ───
  scoring?: {
    final_score: number;
    code_quality_score: number;
    skill_depth_score: number;
    authenticity_score: number;
    consistency_score: number;
    growth_score: number;
    truth_score?: number;
  };

  // ─── Code reviews ───
  pinned_code_reviews?: Array<{
    repo_name: string;
    overall_grade: string;
    strengths: string[];
    concerns: string[];
  }>;

  // ─── Skills — array of verified skill objects (NOT a dict with .languages) ───
  skills?: Array<{
    skill_name: string;
    skill_score: number;
    category: string;
    evidence?: string[];
  }> | Record<string, unknown>;   // union to be safe with legacy data

  // ─── Proof ───
  proof_list?: Array<{ claim: string; evidence: string; verified: boolean }>;

  // ─── Multi-source ───
  verification_sources?: Array<{
    name: string;
    status: string;
    detail: string;
  }>;

  // ─── Warnings ───
  warning?: string;
  confidence_score?: number;
  is_low_confidence?: boolean;

  // ─── AI detection ───
  authenticity?: {
    ai_detection?: {
      overall_probability: string;
      confidence: string;
      patterns_detected: Array<{ pattern: string; score: number; evidence: string }>;
    };
    authenticity_score?: number;
  };

  // ─── Authenticity convenience field ───
  authenticity_score?: number;
  organic_commits_percentage?: number;

  // ─── Resume-specific ───
  resume_data?: Record<string, unknown>;
  claims_validation?: Record<string, unknown>;
  github_report?: Record<string, unknown>;

  // ─── New structured fields ───
  activity_heatmap?: ActivityMonth[];
  feature_importance?: FeatureImportance[];
  decision_trace?: string[];
  score_dimensions?: ScoreDimension[];
  language_breakdown?: LanguageBreakdownItem[];
  interview_questions?: InterviewQuestion[];
  coding_patterns?: CodingPatterns;
  commit_analysis?: CommitAnalysis;
  community_stats?: CommunityStats;
  contribution_streak?: ContributionStreak;
  documentation_quality?: DocumentationQuality;
  improvements?: string[];
  red_flags?: string[];
  top_repos?: Array<Record<string, unknown>>;
  repos_deep_analyzed?: number;

  [key: string]: unknown;
}

/**
 * Analyze a GitHub username via the backend.
 */
export async function analyzeGitHub(
  username: string,
  jobId?: string,
  jobContext?: { title?: string; skills?: string; description?: string },
  selfReported?: { privateRepos?: boolean; workCoder?: boolean },
): Promise<AnalysisResult> {
  const params = new URLSearchParams({ username });
  if (jobId) params.set("job_id", jobId);
  if (jobContext?.title) params.set("job_title", jobContext.title);
  if (jobContext?.skills) params.set("required_skills", jobContext.skills);
  if (jobContext?.description) params.set("job_description", jobContext.description);
  if (selfReported?.privateRepos != null) params.set("private_repos", String(selfReported.privateRepos));
  if (selfReported?.workCoder != null) params.set("work_coder", String(selfReported.workCoder));

  // SECURITY: Send JWT token for server-side auth verification + user ID as fallback
  const headers: Record<string, string> = {};
  try {
    const { getCurrentUser, getSessionToken } = await import("./auth");
    const [user, token] = await Promise.all([getCurrentUser(), getSessionToken()]);
    if (user?.id) headers["X-User-Id"] = user.id;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } catch {}

  const fetchWithRetry = async (retryCount = 0): Promise<AnalysisResult> => {
    try {
      const res = await fetch(`${API_BASE}/analyze?${params}`, { headers });

      // Handle 402 (scan limit reached) — throw ScanLimitError so UI can show paywall
      if (res.status === 402) {
        const body = await res.json().catch(() => ({ detail: {} }));
        const detail = typeof body.detail === "object" ? body.detail : {};
        throw new ScanLimitError(detail.plan || "free", detail.limit || 2);
      }

      if (!res.ok) {
        // If it's a 500 error or Render starting up, wait 2s and retry once
        if ((res.status === 500 || res.status === 503) && retryCount < 1) {
          console.warn("[API] 500/503 error on analyzeGitHub, waiting 2s and retrying...");
          await new Promise(r => setTimeout(r, 2000));
          return fetchWithRetry(retryCount + 1);
        }
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(humanizeError(res.status, err.detail || ""));
      }
      return res.json();
    } catch (error: any) {
      if ((error.message?.includes("fetch") || error.message?.includes("network")) && retryCount < 1) {
        console.warn("[API] Network error on analyzeGitHub, waiting 2s and retrying...");
        await new Promise(r => setTimeout(r, 2000));
        return fetchWithRetry(retryCount + 1);
      }
      throw error;
    }
  };

  return fetchWithRetry();
}

/**
 * Alias for backward compatibility (report page uses this name).
 */
export const analyzeProfile = analyzeGitHub;

/**
 * Analyze a resume PDF via the backend.
 */
export async function analyzeResume(
  file: File,
  opts?: {
    jobId?: string;
    jobTitle?: string;
    requiredSkills?: string;
    jobDescription?: string;
    linkedinText?: string;
  }
): Promise<AnalysisResult> {
  const form = new FormData();
  form.append("file", file);
  if (opts?.jobId) form.append("job_id", opts.jobId);
  if (opts?.jobTitle) form.append("job_title", opts.jobTitle);
  if (opts?.requiredSkills) form.append("required_skills", opts.requiredSkills);
  if (opts?.jobDescription) form.append("job_description", opts.jobDescription);
  if (opts?.linkedinText) form.append("linkedin_text", opts.linkedinText);

  // SECURITY: Send JWT token for server-side auth verification + user ID as fallback
  const headers: Record<string, string> = {};
  try {
    const { getCurrentUser, getSessionToken } = await import("./auth");
    const [user, token] = await Promise.all([getCurrentUser(), getSessionToken()]);
    if (user?.id) headers["X-User-Id"] = user.id;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } catch {}

  const fetchWithRetry = async (retryCount = 0): Promise<AnalysisResult> => {
    try {
      const res = await fetch(`${API_BASE}/analyze-resume`, { method: "POST", body: form, headers });

      // Handle 402 (scan limit reached)
      if (res.status === 402) {
        const body = await res.json().catch(() => ({ detail: {} }));
        const detail = typeof body.detail === "object" ? body.detail : {};
        throw new ScanLimitError(detail.plan || "free", detail.limit || 2);
      }

      if (!res.ok) {
        if ((res.status === 500 || res.status === 503) && retryCount < 1) {
          console.warn("[API] 500/503 error on analyzeResume, waiting 2s and retrying...");
          await new Promise(r => setTimeout(r, 2000));
          return fetchWithRetry(retryCount + 1);
        }
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(humanizeError(res.status, err.detail || ""));
      }
      return res.json();
    } catch (error: any) {
      if ((error.message?.includes("fetch") || error.message?.includes("network")) && retryCount < 1) {
        console.warn("[API] Network error on analyzeResume, waiting 2s and retrying...");
        await new Promise(r => setTimeout(r, 2000));
        return fetchWithRetry(retryCount + 1);
      }
      throw error;
    }
  };

  return fetchWithRetry();
}

/**
 * Batch analyze multiple resumes.
 */
export async function batchAnalyzeResumes(
  files: File[],
  opts?: {
    jobTitle?: string;
    requiredSkills?: string;
    jobDescription?: string;
  }
): Promise<{
  batch_size: number;
  job_context: string;
  ranking: Array<{
    rank: number;
    candidate: string;
    score: number;
    tier?: string;
    recommendation?: string;
  }>;
}> {
  const form = new FormData();
  files.forEach(f => form.append("files", f));
  if (opts?.jobTitle) form.append("job_title", opts.jobTitle);
  if (opts?.requiredSkills) form.append("required_skills", opts.requiredSkills);
  if (opts?.jobDescription) form.append("job_description", opts.jobDescription);

  const res = await fetch(`${API_BASE}/api/v1/batch-analyze-resumes`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(humanizeError(res.status, err.detail || ""));
  }
  return res.json();
}

/**
 * Subscribe to SSE progress stream for a job.
 */
export function subscribeProgress(
  jobId: string,
  onStep: (step: string) => void,
  onDone: () => void
): () => void {
  const es = new EventSource(`${API_BASE}/api/progress/${jobId}`);
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.heartbeat) return;
      if (data.step) onStep(data.step);
      if (data.done) {
        onDone();
        es.close();
      }
    } catch {}
  };
  es.onerror = () => {
    es.close();
  };
  return () => es.close();
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Warm up backend to prevent cold start delays on Render's free tier.
 */
export async function warmupBackend(): Promise<void> {
  try {
    await fetch(`${API_BASE}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000)
    });
    console.log("[API] Warmup request sent successfully");
  } catch {
    // Silent — warmup is best-effort
  }
}

/**
 * Keep-alive: ping the backend every 40 seconds to prevent Render free tier from sleeping.
 * Render sleeps after 15min of inactivity — this keeps it warm while any user has the site open.
 * Returns a cleanup function to stop the interval.
 */
export function startKeepAlive(): () => void {
  const interval = setInterval(async () => {
    try {
      await fetch(`${API_BASE}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      });
    } catch {
      // Silent — keep-alive is best-effort
    }
  }, 40000); // 40 seconds
  return () => clearInterval(interval);
}

/**
 * FIX BUG 2: Extract scoring breakdown from analysis result.
 * Primary path: score_breakdown.breakdown (what backend actually sends).
 * Fallback path: legacy result.scoring shape.
 */
export function extractScoring(result: AnalysisResult) {
  // Primary: score_breakdown.breakdown is what generate_report() actually emits
  const bd = (result.score_breakdown as any)?.breakdown || {};

  // Fallback: legacy result.scoring shape (for older API responses)
  const legacy = (result.scoring || {}) as Record<string, number>;

  return {
    finalScore: Math.round(
      Number(result.final_score || legacy.final_score || 0)
    ),
    codeQuality: Math.round(
      Number(bd.code_quality || legacy.code_quality_score || 0)
    ),
    skillDepth: Math.round(
      Number(bd.skill_depth || legacy.skill_depth_score || 0)
    ),
    authenticity: Math.round(
      Number(bd.authenticity || legacy.authenticity_score || 0)
    ),
    consistency: Math.round(
      Number(bd.consistency || legacy.consistency_score || 0)
    ),
    growth: Math.round(
      Number(bd.growth || legacy.growth_score || 0)
    ),
    truthScore: Math.round(
      Number(bd.truth || legacy.truth_score || 0)
    ),
  };
}

/**
 * FIX BUG 5: Convert backend benchmark tier names to frontend display tiers.
 * Backend emits: "Elite (FAANG-level)", "Senior", "Mid-Tier", "Junior", "Beginner"
 * Frontend TIER_COLORS map expects: "S-Tier", "A-Tier", "B-Tier", "C-Tier", "D-Tier"
 */
export function normalizeTier(backendTier: string): string {
  const map: Record<string, string> = {
    "Elite (FAANG-level)": "S-Tier",
    "Elite": "S-Tier",
    "Senior": "A-Tier",
    "Mid-Tier": "B-Tier",
    "Junior": "C-Tier",
    "Beginner": "D-Tier",
  };
  return map[backendTier] || backendTier;
}

export function scoreToTier(score: number): string {
  if (score >= 88) return "S-Tier";
  if (score >= 75) return "A-Tier";
  if (score >= 60) return "B-Tier";
  if (score >= 45) return "C-Tier";
  return "D-Tier";
}

/**
 * FIX BUG 7: Match backend _score_to_risk_level() thresholds exactly.
 * Backend: >= 70 → Low, >= 50 → Medium, else → High
 */
export function scoreToRisk(score: number): string {
  if (score >= 70) return "Low";
  if (score >= 45) return "Medium";
  return "High";
}

export function scoreToRecommendation(score: number): string {
  if (score >= 88) return "Strong Hire";
  if (score >= 72) return "Likely Hire";
  if (score >= 50) return "Conditional";
  return "Not Recommended";
}

/**
 * FIX BUG 1: Safely extract a readable string from hiring_recommendation.
 * Backend previously returned a dict; now returns { summary, recommendation, reasoning }.
 * This handles all shapes (string, dict with summary, legacy dict, undefined).
 */
/**
 * BUG 3 FIX: Extract languages from result robustly.
 * result.skills can be an ARRAY of skill objects or a dict with .languages.
 * result.top_languages is a fallback array of skill name strings.
 */
export function extractLanguages(result: AnalysisResult): string[] {
  // Try top_languages first (what report_generator emits)
  const topLangs = (result.top_languages || []) as string[];
  if (topLangs.length > 0) return topLangs.slice(0, 6);

  // Try skills array (each has skill_name)
  const skillsArr = Array.isArray(result.skills)
    ? (result.skills as Array<Record<string, unknown>>)
    : [];
  const skillLangs = skillsArr
    .filter(s => ["frontend", "backend", "ml", "mobile", "language", "devops"].includes(String(s.category || "")))
    .map(s => String(s.skill_name || ""))
    .filter(Boolean);
  if (skillLangs.length > 0) return skillLangs.slice(0, 6);

  // Try skills.languages (legacy dict shape)
  if (result.skills && !Array.isArray(result.skills)) {
    const dict = result.skills as Record<string, unknown>;
    const langs = dict.languages;
    if (Array.isArray(langs)) {
      return langs.map((l: unknown) => {
        if (typeof l === "string") return l;
        if (l && typeof l === "object") return String((l as Record<string, unknown>).name || "");
        return "";
      }).filter(Boolean).slice(0, 6);
    }
  }

  // Try verified_skills
  const verified = (result.verified_skills || []) as string[];
  if (verified.length > 0) return verified.slice(0, 6);

  return [];
}

/**
 * BUG 4 FIX: Extract backend-computed strengths with fallback to code reviews.
 */
export function extractStrengths(result: AnalysisResult): string[] {
  const strengths: string[] = [...((result.strengths || []) as string[])];
  if (strengths.length > 0) return strengths.slice(0, 8);

  // Fallback: pinned code reviews
  const reviews = (result.pinned_code_reviews || []) as Array<Record<string, unknown>>;
  reviews.forEach(r => {
    ((r.strengths || []) as string[]).slice(0, 2).forEach(s => strengths.push(s));
  });
  if (strengths.length > 0) return strengths;
  return ["Profile analyzed — run detailed scan for specific strengths"];
}

/**
 * BUG 4 FIX: Extract backend-computed concerns/weaknesses with fallback.
 */
export function extractConcerns(result: AnalysisResult): string[] {
  const concerns: string[] = [...((result.weaknesses || []) as string[])];
  if (concerns.length > 0) return concerns.slice(0, 6);

  // Fallback: pinned code reviews
  const reviews = (result.pinned_code_reviews || []) as Array<Record<string, unknown>>;
  reviews.forEach(r => {
    ((r.concerns || []) as string[]).slice(0, 2).forEach(c => concerns.push(c));
  });
  if (concerns.length > 0) return concerns;
  return ["No major concerns identified"];
}

export function getHiringRecommendationSummary(data: AnalysisResult): string {
  const hr = data.hiring_recommendation;
  if (!hr) return scoreToRecommendation(data.final_score || 0);
  if (typeof hr === "string") return hr;
  // Structured object from backend fix
  if (hr.summary) return hr.summary;
  // Last resort: derive from role dict
  const roles = hr.recommendation || {};
  const yesRoles = Object.entries(roles)
    .filter(([, v]) => v === "YES")
    .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));
  if (yesRoles.length > 0) return `Hire for ${yesRoles.join("/")} role(s)`;
  return scoreToRecommendation(data.final_score || 0);
}
