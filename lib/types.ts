// ═══════════════════════════════════════════
// DevXray — Shared TypeScript Types
// ═══════════════════════════════════════════

export type UserPlan = "free" | "pro" | "enterprise";

export interface User {
  id: string;
  name: string;
  email: string;
  plan: UserPlan;
  avatar?: string;
  createdAt: string;
  usage: {
    scansUsed: number;
    scansLimit: number;
    bulkUploadsThisMonth: number;
  };
}

export type CandidateTier = "S-Tier" | "A-Tier" | "B-Tier" | "C-Tier" | "D-Tier";
export type RiskLevel = "Low" | "Medium" | "High";
export type HireRecommendation = "Strong Hire" | "Likely Hire" | "Conditional" | "Not Recommended";

export interface Candidate {
  id: string;
  username: string;
  name: string;
  avatarUrl?: string;
  score: number;
  tier: CandidateTier;
  riskLevel: RiskLevel;
  recommendation: HireRecommendation;
  scannedAt: string;
  topLanguages: string[];
  githubUrl?: string;
  resume?: string;
  breakdown?: ScoreBreakdown;
}

export interface ScoreBreakdown {
  codeQuality: number;
  skillDepth: number;
  authenticity: number;
  consistency: number;
  growth: number;
  truthScore: number;
}

export type UploadStatus = "queued" | "parsing" | "analyzing" | "done" | "error";

export interface UploadedResume {
  id: string;
  fileName: string;
  fileSize: number;
  status: UploadStatus;
  progress: number;
  candidate?: Candidate;
  error?: string;
}

export interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  pro?: boolean;
}
