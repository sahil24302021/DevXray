// lib/plans.ts
// Plan definitions and limit-checking utilities for the DevXray freemium model.

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    currency: "INR",
    priceLabel: "Free",
    github_scans: 2,
    resume_scans: 2,
    features: [
      "2 GitHub scans/month",
      "2 Resume scans/month",
      "Basic skill matrix",
      "Hiring recommendation",
      "Email support",
    ],
    cta: "Start Free",
    highlight: false,
  },
  starter: {
    name: "Starter",
    price: 999,
    currency: "INR",
    priceLabel: "₹999/mo",
    razorpay_plan_id: "plan_SdZ8GWfqZP0515",
    github_scans: 20,
    resume_scans: 20,
    features: [
      "20 GitHub scans/month",
      "20 Resume scans/month",
      "Full skill verification matrix",
      "AI-powered interview kit",
      "Claim-by-claim forensic report",
      "LinkedIn cross-reference",
      "CSV export",
      "Priority email support",
    ],
    cta: "Start Hiring Smarter",
    highlight: false,
  },
  pro: {
    name: "Pro",
    price: 2499,
    currency: "INR",
    priceLabel: "₹2,499/mo",
    razorpay_plan_id: "plan_SdZ1a3Rto80pfA",
    github_scans: 100,
    resume_scans: 100,
    features: [
      "100 GitHub scans/month",
      "100 Resume scans/month",
      "Everything in Starter",
      "Bulk CSV upload (up to 50 candidates)",
      "Side-by-side candidate comparison",
      "Team dashboard (up to 5 seats)",
      "ATS-ready PDF reports",
      "Webhook integrations",
      "Dedicated Slack support",
    ],
    cta: "Upgrade to Pro",
    highlight: true,
  },
  enterprise: {
    name: "Enterprise",
    price: null as number | null,
    currency: "INR",
    priceLabel: "Custom",
    github_scans: Infinity,
    resume_scans: Infinity,
    features: [
      "Unlimited scans",
      "Everything in Pro",
      "Unlimited team seats",
      "Custom AI model fine-tuning",
      "SSO / SAML login",
      "SLA guarantee (99.9% uptime)",
      "Dedicated account manager",
      "On-premise deployment option",
      "Custom integrations (Workday, Greenhouse, Lever)",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
} as const;

export type PlanKey = keyof typeof PLANS;

export function canScan(
  plan: PlanKey,
  githubUsed: number,
  resumeUsed: number,
  type: "github" | "resume"
): boolean {
  const limit =
    type === "github"
      ? PLANS[plan].github_scans
      : PLANS[plan].resume_scans;
  const used = type === "github" ? githubUsed : resumeUsed;
  return used < limit;
}

export function scansRemaining(
  plan: PlanKey,
  githubUsed: number,
  resumeUsed: number
) {
  return {
    github: Math.max(0, PLANS[plan].github_scans - githubUsed),
    resume: Math.max(0, PLANS[plan].resume_scans - resumeUsed),
  };
}

export function getScansLimit(plan: PlanKey, type: "github" | "resume"): number {
  return type === "github"
    ? PLANS[plan].github_scans
    : PLANS[plan].resume_scans;
}
