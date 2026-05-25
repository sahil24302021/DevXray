"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ── Pipeline steps ─────────────────────────────────────────── */
const PIPELINE_STEPS = [
  { key: "profile", label: "Fetching GitHub profile", sub: "Pulling metadata & bio" },
  { key: "repos", label: "Analyzing repositories", sub: "Scanning commit history" },
  { key: "code", label: "Reading code files", sub: "Parsing source patterns" },
  { key: "verify", label: "Verifying resume claims", sub: "Cross-checking facts" },
  { key: "crossref", label: "Cross-referencing sources", sub: "Validating externals" },
  { key: "engine", label: "Running intelligence engine", sub: "Scoring & ranking" },
  { key: "summary", label: "Generating AI summary", sub: "Synthesizing insights" },
  { key: "report", label: "Building report", sub: "Compiling final output" },
];

/* ── Floating particles (pure CSS, decorative) ──────────────── */
function Particles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {Array.from({ length: 18 }).map((_, i) => (
        <div
          key={i}
          className="loading-particle"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            width: `${2 + Math.random() * 3}px`,
            height: `${2 + Math.random() * 3}px`,
            animationDelay: `${Math.random() * 8}s`,
            animationDuration: `${6 + Math.random() * 8}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── SVG circular progress ring ─────────────────────────────── */
function ProgressRing({ progress }: { progress: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative w-32 h-32 mx-auto mb-8">
      {/* Outer glow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, rgba(205,255,0,${0.06 + progress * 0.002}) 0%, transparent 70%)`,
          filter: "blur(20px)",
          transform: "scale(1.5)",
        }}
      />

      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        {/* Track */}
        <circle
          cx="60" cy="60" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="3"
        />
        {/* Progress arc */}
        <motion.circle
          cx="60" cy="60" r={radius}
          fill="none"
          stroke="url(#progressGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ filter: "drop-shadow(0 0 8px rgba(205,255,0,0.5))" }}
        />
        {/* Gradient def */}
        <defs>
          <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#cdff00" />
            <stop offset="50%" stopColor="#a8e600" />
            <stop offset="100%" stopColor="#7acc00" />
          </linearGradient>
        </defs>
      </svg>

      {/* Center percentage */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          key={Math.round(progress)}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-white tabular-nums"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          {Math.round(progress)}%
        </motion.span>
      </div>
    </div>
  );
}

/* ── Typewriter-animated detail text ─────────────────────────── */
function TypewriterDetail({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  const prevText = useRef("");

  useEffect(() => {
    if (text === prevText.current) return;
    prevText.current = text;
    setDisplayed("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 25);
    return () => clearInterval(id);
  }, [text]);

  return (
    <span className="text-[11px] text-[#cdff00]/60 font-mono">
      {displayed}
      <span className="animate-pulse">▍</span>
    </span>
  );
}

/* ── Icons ───────────────────────────────────────────────────── */
function CheckIcon() {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className="w-5 h-5 rounded-full bg-[#cdff00]/15 flex items-center justify-center"
    >
      <svg className="w-3 h-3 text-[#cdff00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </motion.div>
  );
}

function ActiveDot() {
  return (
    <div className="w-5 h-5 flex items-center justify-center">
      <div className="relative w-2.5 h-2.5">
        <div className="absolute inset-0 rounded-full bg-[#cdff00] animate-ping opacity-40" />
        <div className="absolute inset-0 rounded-full bg-[#cdff00]" style={{ boxShadow: "0 0 10px rgba(205,255,0,0.6)" }} />
      </div>
    </div>
  );
}

function PendingDot() {
  return (
    <div className="w-5 h-5 flex items-center justify-center">
      <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ██  MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function LoadingState({ username, jobId }: { username?: string; jobId?: string }) {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [activeStep, setActiveStep] = useState(0);
  const [currentDetail, setCurrentDetail] = useState("");

  /* ── Smart server-slow detection (20s with no progress) ──── */
  const [serverSlow, setServerSlow] = useState(false);
  const gotProgressRef = useRef(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start 20s timer on mount; clear if we get any progress update
  useEffect(() => {
    slowTimerRef.current = setTimeout(() => {
      if (!gotProgressRef.current) {
        setServerSlow(true);
      }
    }, 20_000);

    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, []);

  // Called whenever we receive a real progress update
  const markProgressReceived = useCallback(() => {
    gotProgressRef.current = true;
    setServerSlow(false);
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
  }, []);

  /* ── Map SSE step text → pipeline index ────────────────── */
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

  /* ── SSE / polling + fallback progression ──────────────── */
  useEffect(() => {
    if (!jobId) {
      // Fallback: auto-advance for demo / no-SSE mode
      const timer = setInterval(() => {
        setActiveStep((prev) => {
          if (prev < PIPELINE_STEPS.length - 1) {
            setCompletedSteps((s) => new Set([...s, prev]));
            markProgressReceived();
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

        // Any real data → mark progress received
        markProgressReceived();

        if (data.step) {
          const stepIdx = matchStep(data.step);
          if (stepIdx >= 0) {
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
          setCompletedSteps(new Set(PIPELINE_STEPS.map((_, i) => i)));
          setActiveStep(PIPELINE_STEPS.length);
          sse.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    // Keep-alive fallback (no real advancement, just keeps connection context)
    const timer = setInterval(() => {
      setActiveStep((prev) => prev);
    }, 5000);

    return () => {
      sse.close();
      clearInterval(timer);
    };
  }, [jobId, matchStep, markProgressReceived]);

  /* ── Derived values ────────────────────────────────────── */
  const totalProgress =
    ((completedSteps.size + (activeStep < PIPELINE_STEPS.length ? 0.5 : 0)) / PIPELINE_STEPS.length) * 100;

  const activeSubLabel = activeStep < PIPELINE_STEPS.length ? PIPELINE_STEPS[activeStep].sub : "Finalizing…";

  /* ── Render ────────────────────────────────────────────── */
  return (
    <div className="loading-screen fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Animated gradient background */}
      <div className="loading-bg" />

      {/* Floating particles */}
      <Particles />

      {/* Grain overlay (shared with rest of app) */}
      <div className="grain-overlay" />

      {/* ── Main glassmorphism card ─────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="loading-card"
      >
        {/* Inner glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, rgba(205,255,0,0.08) 0%, transparent 70%)",
            filter: "blur(30px)",
          }}
        />

        {/* Progress ring */}
        <ProgressRing progress={totalProgress} />

        {/* Username */}
        <h2
          className="font-bold text-xl text-white mb-0.5 tracking-tight"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          Analyzing{" "}
          <span className="loading-glow-text">
            {username ? `@${username}` : "profile"}
          </span>
        </h2>
        <p className="text-xs text-white/30 mb-8 tracking-wide uppercase">
          Deep intelligence scan in progress
        </p>

        {/* ── Vertical step timeline ──────────────────────────── */}
        <div className="w-full max-w-xs mx-auto text-left mb-6">
          {PIPELINE_STEPS.map((step, i) => {
            const isCompleted = completedSteps.has(i);
            const isActive = activeStep === i && !isCompleted;
            const isPending = !isCompleted && !isActive;

            return (
              <div key={step.key} className="flex items-start gap-3 relative">
                {/* Vertical connector line */}
                {i < PIPELINE_STEPS.length - 1 && (
                  <div
                    className="absolute left-[9px] top-[22px] w-px h-[calc(100%-4px)]"
                    style={{
                      background: isCompleted
                        ? "rgba(205,255,0,0.15)"
                        : "rgba(255,255,255,0.04)",
                    }}
                  />
                )}

                {/* Icon */}
                <div className="shrink-0 pt-0.5">
                  {isCompleted ? <CheckIcon /> : isActive ? <ActiveDot /> : <PendingDot />}
                </div>

                {/* Label + sub */}
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  className={`pb-3 min-w-0 ${isActive ? "pt-0" : ""}`}
                >
                  <span
                    className={`text-[13px] block transition-colors duration-300 ${
                      isCompleted
                        ? "text-white/35"
                        : isActive
                        ? "text-white font-medium"
                        : "text-white/15"
                    }`}
                  >
                    {step.label}
                  </span>

                  {/* Active step detail line */}
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-0.5 overflow-hidden"
                    >
                      {currentDetail ? (
                        <TypewriterDetail text={currentDetail} />
                      ) : (
                        <span className="text-[11px] text-white/20 italic">{step.sub}</span>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* ── Thin progress bar at the bottom ─────────────────── */}
        <div className="w-full bg-white/[0.04] rounded-full h-1 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: `${Math.min(totalProgress, 96)}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
              background: "linear-gradient(90deg, #cdff00, #a8e600)",
              boxShadow: "0 0 12px rgba(205,255,0,0.35)",
            }}
          />
        </div>

        {/* ── Server slow notice (subtle muted inline text) ──── */}
        <AnimatePresence>
          {serverSlow && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4 text-[11px] text-white/25 text-center leading-relaxed"
            >
              Taking longer than usual — server may be waking up…
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
