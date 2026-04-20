"use client";

interface DataBasisBannerProps {
  dataBasis: string;
  confidenceLevel: string;
  needsMoreData: boolean;
  requestSignals: Array<{
    type: string;
    label: string;
    reason: string;
    impact: string;
  }>;
  githubSparseMode: boolean;
  username: string;
}

export default function DataBasisBanner({
  dataBasis,
  confidenceLevel,
  needsMoreData,
  requestSignals,
  githubSparseMode,
  username,
}: DataBasisBannerProps) {
  if (!githubSparseMode && !needsMoreData) return null;

  const confColor =
    confidenceLevel === "High"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : confidenceLevel === "Medium"
      ? "text-cyan-400 bg-cyan-500/10 border-cyan-500/20"
      : "text-amber-400 bg-amber-500/10 border-amber-500/20";

  return (
    <div
      className="rounded-xl border border-white/[0.06] p-4 mb-5 flex items-start gap-3"
      style={{ background: "rgba(255,255,255,0.02)" }}
    >
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
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-300 mb-1">
          Score based on: {dataBasis}
        </p>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          @{username} has limited public GitHub activity. This is common for
          developers at enterprises, banks, or those who work primarily in
          private repos.
          {requestSignals.length > 0 && (
            <span className="text-slate-400">
              {" "}
              To improve accuracy:{" "}
              {requestSignals.map((s) => s.label).join(", ")}.
            </span>
          )}
        </p>
      </div>
      <div className="shrink-0">
        <span
          className={`text-[10px] font-bold px-2 py-1 rounded-full border ${confColor}`}
        >
          {confidenceLevel}
        </span>
      </div>
    </div>
  );
}
