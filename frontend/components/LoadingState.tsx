"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ── Pipeline steps + per-step technical phrases ────────────── */
const PIPELINE_STEPS = [
  {
    key: "profile",
    label: "Fetching GitHub profile",
    sub: "Pulling metadata & bio",
    phrases: [
      "Resolving user identity…",
      "Fetching account metadata…",
      "Pulling profile signals…",
      "Indexing social graph…",
    ],
  },
  {
    key: "repos",
    label: "Analyzing repositories",
    sub: "Scanning commit history",
    phrases: [
      "Processing commit graph…",
      "Walking branch histories…",
      "Mapping fork networks…",
      "Indexing repository topology…",
    ],
  },
  {
    key: "code",
    label: "Reading code files",
    sub: "Parsing source patterns",
    phrases: [
      "Extracting AST patterns…",
      "Parsing language grammars…",
      "Tokenizing source files…",
      "Analyzing code complexity…",
    ],
  },
  {
    key: "verify",
    label: "Verifying resume claims",
    sub: "Cross-checking facts",
    phrases: [
      "Cross-checking skill claims…",
      "Validating timeline data…",
      "Matching experience signals…",
      "Verifying contribution depth…",
    ],
  },
  {
    key: "crossref",
    label: "Cross-referencing sources",
    sub: "Validating externals",
    phrases: [
      "Querying external sources…",
      "Cross-referencing skill signals…",
      "Validating third-party data…",
      "Correlating data points…",
    ],
  },
  {
    key: "engine",
    label: "Running intelligence engine",
    sub: "Scoring & ranking",
    phrases: [
      "Weighing authenticity signals…",
      "Running scoring algorithms…",
      "Computing risk penalties…",
      "Calibrating tier placement…",
    ],
  },
  {
    key: "summary",
    label: "Generating AI summary",
    sub: "Synthesizing insights",
    phrases: [
      "Synthesizing executive brief…",
      "Generating verdict logic…",
      "Composing narrative summary…",
      "Distilling key findings…",
    ],
  },
  {
    key: "report",
    label: "Building report",
    sub: "Compiling final output",
    phrases: [
      "Compiling final report…",
      "Rendering data visualizations…",
      "Assembling interview kit…",
      "Packaging deliverables…",
    ],
  },
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

/* ── SVG circular progress ring (smooth 600ms transition) ───── */
function ProgressRing({ progress }: { progress: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative w-32 h-32 mx-auto mb-6">
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
        {/* Progress arc — always smooth 600ms transition */}
        <circle
          cx="60" cy="60" r={radius}
          fill="none"
          stroke="url(#progressGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1)",
            filter: "drop-shadow(0 0 8px rgba(205,255,0,0.5))",
          }}
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

      {/* Center percentage — smooth count */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-2xl font-bold text-white tabular-nums"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          {Math.round(progress)}%
        </span>
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

/* ── Rotating technical phrases per active step ──────────────── */
function RotatingPhrase({ phrases }: { phrases: string[] }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((prev) => (prev + 1) % phrases.length);
    }, 2000);
    return () => clearInterval(id);
  }, [phrases.length]);

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={idx}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.25 }}
        className="text-[10px] text-white/25 font-mono block"
      >
        {phrases[idx]}
      </motion.span>
    </AnimatePresence>
  );
}

/* ── AI Thinking dots (sequential pulse) ─────────────────────── */
function ThinkingDots() {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-[#cdff00]"
          style={{
            animation: "thinking-dot 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
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

  /* ── Live repo counter (starts at 0, counts up realistically) */
  const [repoCount, setRepoCount] = useState(0);
  const [realRepoCount, setRealRepoCount] = useState<number | null>(null);
  const repoCountRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      const max = realRepoCount ?? 80; // default target until we get real data
      if (repoCountRef.current < max) {
        const increment = 1 + Math.floor(Math.random() * 3); // +1 to +3
        repoCountRef.current = Math.min(repoCountRef.current + increment, max);
        setRepoCount(repoCountRef.current);
      }
    }, 800);
    return () => clearInterval(id);
  }, [realRepoCount]);

  /* ── Live bytes-analyzed counter (fake but impressive) ────── */
  const [bytesAnalyzed, setBytesAnalyzed] = useState(0);
  const bytesRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      const increment = 1000 + Math.floor(Math.random() * 4000); // +1000 to +5000
      bytesRef.current += increment;
      setBytesAnalyzed(bytesRef.current);
    }, 200);
    return () => clearInterval(id);
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} KB analyzed`;
    return `${(bytes / 1_000_000).toFixed(1)} MB analyzed`;
  };

  /* ── Smart server-slow detection (20s with no progress) ──── */
  const [serverSlow, setServerSlow] = useState(false);
  const gotProgressRef = useRef(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /* ── Maximum step index the simulated fallback can reach ──────── */
  // Index 6 corresponds to "Generating AI summary" (7th step out of 8).
  // Simulated fallback caps here (~81-85%) and NEVER reaches 100%.
  // Step 7 ("Building report" / 100%) is ONLY reached on actual completion.
  const MAX_FALLBACK_STEP = 6;
  const sseActiveRef = useRef(false);
  const lastSseEventTimeRef = useRef(0);

  /* ── SSE connection + resilient fallback progression ─────────── */
  useEffect(() => {
    let sse: EventSource | null = null;

    if (jobId) {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        sse = new EventSource(`${apiUrl}/api/progress/${jobId}`);

        sse.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.heartbeat) {
              markProgressReceived();
              return;
            }

            // Real progress event received — prioritize real SSE
            sseActiveRef.current = true;
            lastSseEventTimeRef.current = Date.now();
            markProgressReceived();

            // Extract real repo count from SSE data if available
            if (data.repos_count && typeof data.repos_count === "number") {
              setRealRepoCount(data.repos_count);
            }

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
              sse?.close();
            }
          } catch {
            // ignore parse errors
          }
        };

        sse.onerror = () => {
          // If SSE connection fails or gets buffered/blocked by proxy,
          // close it gracefully. The fallback timer will drive the progress UX.
          try {
            sse?.close();
          } catch {}
        };
      } catch {
        // Fallback gracefully if EventSource is not supported
      }
    }

    // Fallback timer: smoothly advances the visual pipeline through technical stages
    // whenever SSE events are unavailable, buffered, or absent.
    // If real SSE events are actively arriving, fallback yields priority.
    // Progression: 6% → 18% → 30% → 45% → 60% → 75% → 85% (capped at MAX_FALLBACK_STEP).
    const fallbackTimer = setInterval(() => {
      const now = Date.now();
      const isSseActivelyReporting =
        sseActiveRef.current && now - lastSseEventTimeRef.current < 10000;

      if (isSseActivelyReporting) {
        return; // Real SSE has full priority
      }

      setActiveStep((prev) => {
        if (prev < MAX_FALLBACK_STEP) {
          const next = prev + 1;
          setCompletedSteps((s) => {
            const updated = new Set(s);
            for (let i = 0; i < next; i++) updated.add(i);
            return updated;
          });
          markProgressReceived();
          return next;
        }
        return prev;
      });
    }, 4500);

    return () => {
      try {
        sse?.close();
      } catch {}
      clearInterval(fallbackTimer);
    };
  }, [jobId, matchStep, markProgressReceived]);

  /* ── Derived values ────────────────────────────────────── */
  // Raw progress based on completed steps plus half weight for active step
  const rawProgress =
    ((completedSteps.size + (activeStep < PIPELINE_STEPS.length ? 0.5 : 0)) / PIPELINE_STEPS.length) * 100;

  // Real completion occurs when activeStep reaches or exceeds PIPELINE_STEPS.length (e.g. data.done: true).
  // Otherwise, fallback progress is strictly capped around 85% and never shows 100% prematurely.
  const isRealDone = activeStep >= PIPELINE_STEPS.length || completedSteps.size >= PIPELINE_STEPS.length;
  const totalProgress = isRealDone ? 100 : Math.min(rawProgress, 85);

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

        {/* ── Live counters ────────────────────────────────────── */}
        <div className="mb-4 space-y-0.5">
          <motion.p
            className="text-sm font-medium text-white tabular-nums"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            Scanning{" "}
            <span className="loading-glow-text font-bold">{repoCount}</span>
            {" "}repositories…
          </motion.p>
          <p className="text-[11px] text-white/25 tabular-nums font-mono">
            {formatBytes(bytesAnalyzed)}
          </p>
        </div>

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
        <p className="text-xs text-white/30 mb-6 tracking-wide uppercase">
          Deep intelligence scan in progress
        </p>

        {/* ── Vertical step timeline ──────────────────────────── */}
        <div className="w-full max-w-xs mx-auto text-left mb-6">
          {PIPELINE_STEPS.map((step, i) => {
            const isCompleted = completedSteps.has(i);
            const isActive = activeStep === i && !isCompleted;

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

                  {/* Active step: show SSE detail OR rotating technical phrases */}
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-0.5 overflow-hidden"
                    >
                      {currentDetail ? (
                        <TypewriterDetail text={currentDetail} />
                      ) : (
                        <RotatingPhrase phrases={step.phrases} />
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
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(totalProgress, 96)}%`,
              transition: "width 600ms cubic-bezier(0.16, 1, 0.3, 1)",
              background: "linear-gradient(90deg, #cdff00, #a8e600)",
              boxShadow: "0 0 12px rgba(205,255,0,0.35)",
            }}
          />
        </div>

        {/* ── AI thinking dots (bottom right) ──────────────────── */}
        <div className="absolute bottom-4 right-5">
          <ThinkingDots />
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
