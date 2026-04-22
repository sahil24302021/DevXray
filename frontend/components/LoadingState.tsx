"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const PIPELINE_STEPS = [
  { key: "profile", label: "Fetching GitHub profile" },
  { key: "repos", label: "Analyzing repositories" },
  { key: "code", label: "Reading code files" },
  { key: "verify", label: "Verifying resume claims" },
  { key: "crossref", label: "Cross-referencing sources" },
  { key: "engine", label: "Running intelligence engine" },
  { key: "summary", label: "Generating AI summary" },
  { key: "report", label: "Building report" },
];

function CheckIcon() {
  return (
    <motion.svg
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className="w-4 h-4 text-[#cdff00]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </motion.svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="w-4 h-4 text-[#cdff00] animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PendingIcon() {
  return (
    <div className="w-4 h-4 rounded-full border-2 border-white/10" />
  );
}

export default function LoadingState({ username, jobId }: { username?: string; jobId?: string }) {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [activeStep, setActiveStep] = useState(0);
  const [currentDetail, setCurrentDetail] = useState("");

  // Map SSE step text to our pipeline step index
  const matchStep = useCallback((stepText: string): number => {
    const lower = stepText.toLowerCase();
    if (lower.includes("profile") || lower.includes("initializ")) return 0;
    if (lower.includes("repositor") || lower.includes("dna")) return 1;
    if (lower.includes("code") || lower.includes("reading")) return 2;
    if (lower.includes("resum") || lower.includes("verif") || lower.includes("claim")) return 3;
    if (lower.includes("cross") || lower.includes("external") || lower.includes("source")) return 4;
    if (lower.includes("orchestr") || lower.includes("intelligence") || lower.includes("engine") || lower.includes("core")) return 5;
    if (lower.includes("summar") || lower.includes("synthesiz") || lower.includes("executive")) return 6;
    if (lower.includes("report") || lower.includes("complet") || lower.includes("building")) return 7;
    return -1;
  }, []);

  useEffect(() => {
    if (!jobId) {
      // Fallback: auto-advance steps for demo / no-SSE mode
      const timer = setInterval(() => {
        setActiveStep((prev) => {
          if (prev < PIPELINE_STEPS.length - 1) {
            setCompletedSteps((s) => new Set([...s, prev]));
            return prev + 1;
          }
          return prev;
        });
      }, 3000);
      return () => clearInterval(timer);
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const sse = new EventSource(`${apiUrl}/api/progress/${jobId}`);

    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.heartbeat) return;

        if (data.step) {
          const stepIdx = matchStep(data.step);
          if (stepIdx >= 0) {
            // Mark all previous steps as completed
            setCompletedSteps((prev) => {
              const next = new Set(prev);
              for (let i = 0; i < stepIdx; i++) next.add(i);
              return next;
            });
            setActiveStep(stepIdx);
          }
          if (data.detail) {
            setCurrentDetail(data.detail);
          }
        }
        if (data.done) {
          // Mark all steps as complete
          setCompletedSteps(new Set(PIPELINE_STEPS.map((_, i) => i)));
          setActiveStep(PIPELINE_STEPS.length);
          sse.close();
        }
      } catch {
        // ignore
      }
    };

    // Fallback progression if SSE is sparse
    const timer = setInterval(() => {
      setActiveStep((prev) => {
        if (prev < PIPELINE_STEPS.length - 1) {
          return prev;
        }
        return prev;
      });
    }, 5000);

    return () => {
      sse.close();
      clearInterval(timer);
    };
  }, [jobId, matchStep]);

  const totalProgress = ((completedSteps.size + (activeStep < PIPELINE_STEPS.length ? 0.5 : 0)) / PIPELINE_STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden z-[100] fixed inset-0">
      <div className="grain-overlay" />
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#cdff00]/[0.04] blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-[#cdff00]/[0.02] blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-3xl border border-white/[0.06] p-8 sm:p-10 text-center relative overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {/* Inner glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[#cdff00]/10 blur-[60px] rounded-full pointer-events-none" />

        {/* Spinning ring + star */}
        <div className="relative w-20 h-20 mx-auto mb-6">
          <svg className="w-full h-full animate-[spin_4s_linear_infinite]" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
            <circle
              cx="50" cy="50" r="46"
              fill="none"
              stroke="#cdff00"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="100 200"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#cdff00" />
            </svg>
          </div>
        </div>

        <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg text-white mb-1">
          Analyzing {username ? `@${username}` : "Candidate Profile"}
        </h2>
        <p className="text-xs text-slate-500 mb-6">Deep intelligence scan in progress</p>

        {/* Step Checklist */}
        <div className="text-left space-y-1 relative mb-6">
          {PIPELINE_STEPS.map((step, i) => {
            const isCompleted = completedSteps.has(i);
            const isActive = activeStep === i && !isCompleted;
            const isPending = !isCompleted && !isActive;

            return (
              <motion.div
                key={step.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3 }}
                className={`flex items-center gap-3 py-1.5 px-3 rounded-lg transition-all duration-300 ${
                  isActive
                    ? "bg-[#cdff00]/[0.06] border border-[#cdff00]/10"
                    : isCompleted
                    ? "bg-white/[0.02]"
                    : ""
                }`}
              >
                {/* Icon */}
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  {isCompleted ? <CheckIcon /> : isActive ? <SpinnerIcon /> : <PendingIcon />}
                </div>

                {/* Label */}
                <span
                  className={`text-sm transition-colors duration-300 ${
                    isCompleted
                      ? "text-slate-400"
                      : isActive
                      ? "text-white font-medium"
                      : "text-slate-600"
                  }`}
                >
                  {step.label}
                </span>

                {/* Detail (only for active step) */}
                {isActive && currentDetail && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="ml-auto text-[10px] text-[#cdff00]/70 font-medium tabular-nums shrink-0"
                  >
                    {currentDetail}
                  </motion.span>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
          <motion.div
            className="h-full bg-[#cdff00] rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: `${Math.min(totalProgress, 95)}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{ filter: "drop-shadow(0 0 6px rgba(205,255,0,0.4))" }}
          />
        </div>
      </motion.div>
    </div>
  );
}
