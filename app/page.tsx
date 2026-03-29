"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  motion,
  useScroll,
  useTransform,
  AnimatePresence,
  useMotionValue,
} from "framer-motion";
import Link from "next/link";
import { extractUsername } from "@/lib/utils";
import Dropzone from "@/components/Dropzone";
import { analyzeResume, JobRequirements } from "@/lib/api";
import LoadingState from "@/components/LoadingState";
import NavAuthButtons from "@/components/NavAuthButtons";

/* ═══════════════════════════════════════════════════════════
   GRAIN OVERLAY — Film grain for tactile depth
   ═══════════════════════════════════════════════════════════ */
function GrainOverlay() {
  return <div className="grain-overlay" />;
}

/* ═══════════════════════════════════════════════════════════
   CURSOR GLOW — Ambient spotlight that follows cursor
   ═══════════════════════════════════════════════════════════ */
function CursorGlow() {
  const x = useMotionValue(-200);
  const y = useMotionValue(-200);

  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener("mousemove", handleMouse);
    return () => window.removeEventListener("mousemove", handleMouse);
  }, [x, y]);

  return (
    <motion.div
      className="cursor-glow"
      style={{ left: x, top: y }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════
   GRID BEAMS — Light streams traveling through the grid
   ═══════════════════════════════════════════════════════════ */
function GridBeams() {
  const [mounted, setMounted] = useState(false);
  const [beams] = useState(() =>
    Array.from({ length: 6 }, (_, i) => ({
      id: i,
      left: 10 + Math.random() * 80,
      delay: Math.random() * 6,
      duration: 4 + Math.random() * 4,
    }))
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      {beams.map((b) => (
        <div
          key={b.id}
          className="grid-beam"
          style={{
            left: `${b.left}%`,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.duration}s`,
          }}
        />
      ))}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   ROTATING TEXT — Typewriter-style cycling words
   ═══════════════════════════════════════════════════════════ */
function RotatingText({ words }: { words: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % words.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [words.length]);

  return (
    <span className="block relative overflow-hidden" style={{ height: "1.15em" }}>
      <AnimatePresence mode="wait">
        <motion.span
          key={words[index]}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="block"
          style={{ color: "#cdff00" }}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   PARTICLE FIELD — Canvas constellation background
   ═══════════════════════════════════════════════════════════ */
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number }[] = [];
    const PARTICLE_COUNT = 60;
    const CONNECTION_DIST = 120;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(205, 255, 0, ${p.opacity})`;
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DIST) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(205, 255, 0, ${0.06 * (1 - dist / CONNECTION_DIST)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-canvas" style={{ width: "100%", height: "100%" }} />;
}

/* ═══════════════════════════════════════════════════════════
   MAGNETIC BUTTON — Follows cursor on hover
   ═══════════════════════════════════════════════════════════ */
function MagneticButton({
  children,
  className = "",
  href,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);

  const handleMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) * 0.15;
    const y = (e.clientY - rect.top - rect.height / 2) * 0.15;
    ref.current.style.transform = `translate(${x}px, ${y}px)`;
  }, []);

  const handleLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = "translate(0, 0)";
  }, []);

  const props = {
    ref: ref as any,
    onMouseMove: handleMove,
    onMouseLeave: handleLeave,
    onClick,
    className: `magnetic-btn ${className}`,
  };

  if (href) {
    return <a {...props} href={href}>{children}</a>;
  }
  return <button {...props}>{children}</button>;
}

/* ═══════════════════════════════════════════════════════════
   TILT CARD — 3D perspective + shimmer + spotlight
   ═══════════════════════════════════════════════════════════ */
function TiltCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: "50%", y: "50%" });
  const [hovering, setHovering] = useState(false);

  const handleMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -4;
    const rotateY = ((x - centerX) / centerX) * 4;
    ref.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
    setPos({ x: `${x}px`, y: `${y}px` });
  }, []);

  const handleLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)";
    setHovering(false);
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={handleLeave}
      className={`tilt-card ${className}`}
      style={
        {
          "--spotlight-x": pos.x,
          "--spotlight-y": pos.y,
          "--spotlight-opacity": hovering ? 1 : 0,
        } as React.CSSProperties
      }
    >
      <div className="shimmer-layer" />
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ANIMATED COUNTER — Counts up when in view
   ═══════════════════════════════════════════════════════════ */
function AnimatedCounter({
  target,
  suffix = "",
  duration = 2,
}: {
  target: number;
  suffix?: string;
  duration?: number;
}) {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const start = performance.now();
          const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / (duration * 1000), 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration, hasAnimated]);

  return (
    <span ref={ref}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   ███ MAIN PAGE ███
   ═══════════════════════════════════════════════════════════ */

export default function Home() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [mode, setMode] = useState<"github" | "resume">("github");
  const [showRequirements, setShowRequirements] = useState(false);
  const [jobReqs, setJobReqs] = useState<JobRequirements>({});
  const [jobId, setJobId] = useState("");
  const { scrollYProgress } = useScroll();
  const [navSolid, setNavSolid] = useState(false);

  useEffect(() => {
    return scrollYProgress.on("change", (v) => setNavSolid(v > 0.02));
  }, [scrollYProgress]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const username = extractUsername(input);
    if (!username || username === "unknown") return;
    setLoading(true);
    router.push(`/report/${username}`);
  };

  const updateJobReq = (field: keyof JobRequirements, value: string) => {
    setJobReqs((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileDrop = async (file: File) => {
    setLoading(true);
    const newJobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setJobId(newJobId);
    
    try {
      // Pass job requirements if any were filled in
      const hasReqs = Object.values(jobReqs).some((v) => typeof v === "string" && v.trim());
      const result = await analyzeResume(file, {
        jobId: newJobId,
        ...(hasReqs ? { jobTitle: jobReqs.job_title, requiredSkills: jobReqs.required_skills, jobDescription: jobReqs.job_description } : {}),
      });
      sessionStorage.setItem("resume_report_data", JSON.stringify(result));
      router.push("/report/resume");
    } catch (e: any) {
      alert(e.message || "Failed to analyze resume");
      setLoading(false);
      setJobId("");
    }
  };
  /* --- Animation Variants --- */
  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 40 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const },
    },
  };

  const features = [
    {
      num: "01",
      title: "Code Authenticity",
      desc: "Detect AI-generated code dumps, bulk uploads, and automated commit patterns. We trace the origin of every contribution with forensic-grade analysis.",
      tag: "FORENSICS",
    },
    {
      num: "02",
      title: "Truth Engine",
      desc: "Cross-reference resume claims against verified GitHub data. Instantly validate coding experience, skill depth, and timeline plausibility with hard evidence.",
      tag: "VALIDATION",
    },
    {
      num: "03",
      title: "Role Fit & Match",
      desc: "Deep LOC-weighted analysis mapped against your custom Job Requirements to compute a granular alignment score and developer tier.",
      tag: "INTELLIGENCE",
    },
    {
      num: "04",
      title: "Commit Intelligence",
      desc: "Message quality scoring, automated pattern detection, and PR workflow analysis. Understand exactly how a candidate thinks and collaborates.",
      tag: "PATTERNS",
    },
    {
      num: "05",
      title: "Risk Assessment",
      desc: "Multi-signal red flag detection with severity classification. Surface hidden concerns—from codebase duplication to clone farms—before hiring.",
      tag: "RISK",
    },
    {
      num: "06",
      title: "Hiring Verdict",
      desc: "Decision-ready recommendation backed by deterministic algorithms. From Strong Hire to Not Recommended—with dynamically generated interview questions.",
      tag: "DECISION",
    },
  ];

  const steps = [
    {
      num: "01",
      title: "Input Candidate Data",
      desc: "Paste a GitHub username, or drop their resume with a targeted job description. That's all we need.",
    },
    {
      num: "02",
      title: "Deep Analysis Runs",
      desc: "Our V3 pipeline runs Code Intelligence, Skill Verification, Truth Engine, and Authenticity evaluations in seconds.",
    },
    {
      num: "03",
      title: "Get the Signal",
      desc: "Receive a forensic intelligence report with an AI-synthesized executive summary, truth score, and hiring recommendation.",
    },
  ];

  /* --- Hero parallax --- */
  const heroTextY = useTransform(scrollYProgress, [0, 0.3], [0, -80]);
  const heroBlobY = useTransform(scrollYProgress, [0, 0.3], [0, 60]);
  const heroBlobScale = useTransform(scrollYProgress, [0, 0.3], [1, 1.2]);

  if (loading && jobId) {
    return <LoadingState jobId={jobId} />;
  }

  return (
    <main className="min-h-screen bg-[#050505] text-[#fafafa] font-[family-name:var(--font-dm-sans)] overflow-hidden">
      <GrainOverlay />
      <CursorGlow />

      {/* ═══════════════════════════════════════════════
          NAVIGATION — Minimal Floating Glass
          ═══════════════════════════════════════════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-5 md:px-8">
        <motion.div
          className="mx-auto max-w-[1200px] flex items-center justify-between py-4 mt-5 px-6 rounded-2xl transition-all duration-500"
          style={{
            background: navSolid ? "rgba(5,5,5,0.85)" : "rgba(5,5,5,0.4)",
            borderBottom: navSolid ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
            backdropFilter: "blur(20px) saturate(150%)",
            WebkitBackdropFilter: "blur(20px) saturate(150%)",
          }}
        >
          <Link href="/" className="flex items-center gap-3 no-underline group">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(205,255,0,0.3)] pulse-glow"
              style={{ background: "#cdff00" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
                  fill="#050505"
                />
              </svg>
            </div>
            <span className="font-[family-name:var(--font-syne)] font-bold text-[17px] tracking-tight text-white glitch-text scan-line">
              Dev<span style={{ color: "#cdff00" }}>Xray</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link
              href="/compare"
              className="text-[12px] font-[family-name:var(--font-space)] font-medium text-[#cdff00] hover:text-white transition-colors duration-300 no-underline tracking-widest uppercase"
            >
              Compare
            </Link>
            {["Features", "Process", "About", "Pricing"].map((item) => (
              <a
                key={item}
                href={item === "About" || item === "Pricing" ? `/${item.toLowerCase()}` : `#${item.toLowerCase()}`}
                className="text-[12px] font-[family-name:var(--font-space)] font-medium text-[#666] hover:text-[#cdff00] transition-colors duration-300 no-underline tracking-widest uppercase animated-underline"
              >
                {item}
              </a>
            ))}
          </div>

          <NavAuthButtons />
        </motion.div>
      </nav>

      {/* ═══════════════════════════════════════════════
          HERO — Asymmetric, Giant Typography, Alive
          ═══════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center px-6 md:px-12 pt-32 pb-20 z-10">
        {/* Background layers */}
        <div className="hero-grid">
          <GridBeams />
        </div>
        <ParticleField />
        <motion.div
          className="hero-blob absolute right-[-10%] top-[10%]"
          style={{ y: heroBlobY, scale: heroBlobScale }}
        />
        <motion.div
          className="hero-blob absolute left-[-15%] bottom-[5%]"
          style={{
            y: heroBlobY,
            scale: heroBlobScale,
            animationDelay: "-5s",
            opacity: 0.5,
            background: "radial-gradient(circle at 60% 60%, rgba(124,58,237,0.1) 0%, transparent 70%)",
          }}
        />

        <motion.div
          className="relative mx-auto max-w-[1200px] w-full"
          style={{ y: heroTextY }}
        >
          {/* Ghost watermark */}
          <div
            className="absolute -top-16 -left-4 select-none pointer-events-none"
            style={{
              fontFamily: "var(--font-syne)",
              fontWeight: 800,
              fontSize: "clamp(100px, 18vw, 260px)",
              lineHeight: 0.85,
              color: "rgba(255,255,255,0.015)",
              letterSpacing: "-0.04em",
            }}
          >
            XRAY
          </div>

          {/* Content */}
          <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-16 items-end">
            <div>
              {/* Section tag */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="section-tag mb-10"
              >
                GitHub Intelligence Platform
              </motion.div>

              {/* Headline — editorial split */}
              <motion.h1
                className="font-[family-name:var(--font-syne)] font-extrabold tracking-[-0.04em] text-white leading-[0.9]"
                style={{ fontSize: "clamp(3.2rem, 8vw, 7rem)" }}
                initial="hidden"
                animate="show"
                variants={stagger}
              >
                <motion.span variants={fadeUp} className="block">
                  Decode
                </motion.span>
                <motion.span variants={fadeUp} className="block">
                  developer
                </motion.span>
                <motion.span
                  variants={fadeUp}
                  className="block"
                  style={{ color: "#cdff00" }}
                >
                  <RotatingText words={["talent.", "truth.", "signal.", "DNA."]} />
                </motion.span>
              </motion.h1>

              {/* Subheadline */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.7 }}
                className="text-[#888] text-lg md:text-xl font-light mt-8 max-w-lg leading-relaxed"
              >
                Deep forensic analysis of resumes and developer profiles.
                <br className="hidden sm:block" />
                Skills verification, authenticity, and coding DNA —{" "}
                <span className="text-[#ccc] font-normal">everything revealed.</span>
              </motion.p>

              {/* Floating Tech Badges */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 1 }}
                className="hidden lg:flex flex-wrap gap-3 mt-6 max-w-lg"
              >
                {["AI Detection", "Code Forensics", "GitHub Intel", "Resume X-Ray", "Truth Engine"].map((badge) => (
                  <span key={badge} className="floating-badge">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#cdff00]/60" />
                    {badge}
                  </span>
                ))}
              </motion.div>

              {/* Mode Toggle */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.8 }}
                className="flex items-center gap-2 mt-10 bg-white/[0.03] p-1.5 rounded-full max-w-fit border border-white/[0.05]"
              >
                <button
                  onClick={() => setMode("github")}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    mode === "github" 
                      ? "bg-[#cdff00] text-[#050505] shadow-[0_0_15px_rgba(205,255,0,0.3)]" 
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  GitHub Profile
                </button>
                <button
                  onClick={() => setMode("resume")}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    mode === "resume" 
                      ? "bg-[#cdff00] text-[#050505] shadow-[0_0_15px_rgba(205,255,0,0.3)]" 
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Upload Resume
                </button>
              </motion.div>

              {/* --- Search Bar / Dropzone --- */}
              {mode === "github" ? (
                <motion.form
                  key="github-form"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  onSubmit={handleSubmit}
                  className="relative mt-8 max-w-lg"
                >
                  <input
                    type="text"
                    placeholder="Enter GitHub username or URL"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    disabled={loading}
                    className="search-input"
                  />
                  <div
                    className="search-line-glow"
                    style={{ width: searchFocused ? "100%" : "0%" }}
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="search-submit"
                  >
                    {loading ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="w-4 h-4 border-2 border-[#050505]/30 border-t-[#050505] rounded-full"
                      />
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>

                  <div className="flex items-center gap-2 mt-5">
                    <span className="text-[11px] text-[#444] font-[family-name:var(--font-space)] tracking-wider uppercase">Try</span>
                    {["torvalds", "gaearon", "sindresorhus"].map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setInput(name);
                          setLoading(true);
                          router.push(`/report/${name}`);
                        }}
                        disabled={loading}
                        className="px-3 py-1.5 rounded-full text-[11px] font-[family-name:var(--font-space)] font-medium text-[#666] bg-transparent border border-[rgba(255,255,255,0.06)] hover:border-[rgba(205,255,0,0.3)] hover:text-[#cdff00] transition-all duration-300 disabled:opacity-50"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </motion.form>
              ) : (
                <motion.div
                  key="resume-dropzone"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="mt-8"
                >
                  <Dropzone onFileSelect={handleFileDrop} isLoading={loading} />

                  {/* HR Job Requirements — Collapsible */}
                  <div className="mt-6 max-w-lg">
                    <button
                      type="button"
                      onClick={() => setShowRequirements(!showRequirements)}
                      className="flex items-center gap-2 text-[13px] font-[family-name:var(--font-space)] text-[#888] hover:text-[#cdff00] transition-colors duration-300 group"
                    >
                      <svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                        className={`transition-transform duration-300 ${showRequirements ? 'rotate-90' : ''}`}
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                      <span className="tracking-wide uppercase">Add Job Requirements</span>
                      <span className="text-[10px] text-[#555] font-normal normal-case tracking-normal">(optional — for targeted analysis)</span>
                    </button>

                    <AnimatePresence>
                      {showRequirements && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 p-5 rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm space-y-4">
                            {/* Row 1: Job Title + Job Type */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-[family-name:var(--font-space)] text-[#666] uppercase tracking-widest mb-1.5">Job Title</label>
                                <input
                                  type="text"
                                  placeholder="e.g. Senior Frontend Engineer"
                                  value={jobReqs.job_title || ""}
                                  onChange={(e) => updateJobReq("job_title", e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/30 transition-colors"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-[family-name:var(--font-space)] text-[#666] uppercase tracking-widest mb-1.5">Job Type</label>
                                <select
                                  value={jobReqs.job_type || ""}
                                  onChange={(e) => updateJobReq("job_type", e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-[#cdff00]/30 transition-colors appearance-none cursor-pointer"
                                >
                                  <option value="" className="bg-[#111]">Select type...</option>
                                  <option value="intern" className="bg-[#111]">Intern</option>
                                  <option value="full_time" className="bg-[#111]">Full-Time</option>
                                  <option value="part_time" className="bg-[#111]">Part-Time</option>
                                  <option value="contract" className="bg-[#111]">Contract</option>
                                  <option value="freelance" className="bg-[#111]">Freelance</option>
                                </select>
                              </div>
                            </div>

                            {/* Row 2: Required Skills + Experience */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-[family-name:var(--font-space)] text-[#666] uppercase tracking-widest mb-1.5">Required Skills</label>
                                <input
                                  type="text"
                                  placeholder="React, TypeScript, Node.js..."
                                  value={jobReqs.required_skills || ""}
                                  onChange={(e) => updateJobReq("required_skills", e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/30 transition-colors"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-[family-name:var(--font-space)] text-[#666] uppercase tracking-widest mb-1.5">Experience Required</label>
                                <input
                                  type="text"
                                  placeholder="e.g. 3-5 years"
                                  value={jobReqs.experience_required || ""}
                                  onChange={(e) => updateJobReq("experience_required", e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/30 transition-colors"
                                />
                              </div>
                            </div>

                            {/* Row 3: Company Name */}
                            <div>
                              <label className="block text-[10px] font-[family-name:var(--font-space)] text-[#666] uppercase tracking-widest mb-1.5">Company Name</label>
                              <input
                                type="text"
                                placeholder="Your company name"
                                value={jobReqs.company_name || ""}
                                onChange={(e) => updateJobReq("company_name", e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/30 transition-colors"
                              />
                            </div>

                            {/* Row 4: Job Description */}
                            <div>
                              <label className="block text-[10px] font-[family-name:var(--font-space)] text-[#666] uppercase tracking-widest mb-1.5">Job Description</label>
                              <textarea
                                placeholder="Paste the full job description here for the most targeted analysis..."
                                value={jobReqs.job_description || ""}
                                onChange={(e) => updateJobReq("job_description", e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/30 transition-colors resize-none"
                              />
                            </div>

                            {/* Hint */}
                            <p className="text-[10px] text-[#555] leading-relaxed">
                              💡 Providing job requirements helps the AI evaluate the candidate specifically for your role — skill gap analysis, role fit score, and targeted interview questions.
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Right side — Stats column */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1, duration: 0.8 }}
              className="hidden lg:flex flex-col items-end gap-12 pb-8"
            >
              {[
                { value: 50000, suffix: "+", label: "Profiles\nanalyzed" },
                { value: 500, suffix: "+", label: "Engineering\nteams" },
                { value: 99, suffix: ".2%", label: "Accuracy\nrate" },
              ].map((stat) => (
                <div key={stat.label} className="text-right">
                  <div
                    className="font-[family-name:var(--font-syne)] font-bold text-4xl text-white tabular-nums"
                    style={{ lineHeight: 1 }}
                  >
                    <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                  </div>
                  <div
                    className="text-[10px] text-[#444] font-[family-name:var(--font-space)] font-medium mt-2 uppercase tracking-[0.2em] whitespace-pre-line text-right"
                  >
                    {stat.label}
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════
          MARQUEE — Infinite Social Proof Ticker
          ═══════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="relative py-8 border-y overflow-hidden z-10"
        style={{ borderColor: "rgba(255,255,255,0.04)" }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#050505] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#050505] to-transparent z-10 pointer-events-none" />
        <div className="marquee-track">
          {[...Array(2)].flatMap((_, setIdx) =>
            [
              "50K+ PROFILES ANALYZED",
              "◆",
              "TRUSTED BY 500+ TEAMS",
              "◆",
              "99.2% ACCURACY",
              "◆",
              "FORENSIC-GRADE AI",
              "◆",
              "REAL-TIME ANALYSIS",
              "◆",
              "ZERO GUESSWORK",
              "◆",
            ].map((text, i) => (
              <span key={`${setIdx}-${i}`} className="marquee-item">
                {text === "◆" ? (
                  <span style={{ color: "#cdff00", fontSize: "8px" }}>◆</span>
                ) : (
                  text
                )}
              </span>
            ))
          )}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════
          FEATURES — Editorial Magazine Layout
          ═══════════════════════════════════════════════ */}
      <section id="features" className="relative py-32 px-6 md:px-12 z-10">
        <div className="mx-auto max-w-[1200px]">
          {/* Section header — left-aligned, not centered */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="mb-24"
          >
            <span className="section-tag mb-5 block">Capabilities</span>
            <h2
              className="font-[family-name:var(--font-syne)] font-bold text-white tracking-[-0.03em]"
              style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)" }}
            >
              Six modules.
              <br />
              <span style={{ color: "#cdff00" }}>Zero blind spots.</span>
            </h2>
          </motion.div>

          {/* Feature grid — editorial asymmetric layout */}
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {features.map((feature, idx) => (
              <motion.div key={feature.num} variants={fadeUp}>
                <TiltCard
                  className={`p-8 md:p-10 ${
                    idx === 0 ? "lg:col-span-2 lg:row-span-1" : ""
                  } ${idx === 5 ? "lg:col-span-2" : ""}`}
                >
                  <div className="relative z-10">
                    {/* Ghost number */}
                    <div className="ghost-number absolute -top-4 -right-2 opacity-100" style={{ fontSize: "clamp(60px, 10vw, 120px)" }}>
                      {feature.num}
                    </div>

                    <div className="relative">
                      {/* Tag */}
                      <span
                        className="inline-block text-[9px] font-[family-name:var(--font-space)] font-bold tracking-[0.3em] uppercase px-3 py-1.5 rounded-full mb-6"
                        style={{
                          color: "#cdff00",
                          background: "rgba(205,255,0,0.06)",
                          border: "1px solid rgba(205,255,0,0.1)",
                        }}
                      >
                        {feature.tag}
                      </span>

                      <h3 className="font-[family-name:var(--font-syne)] font-bold text-xl md:text-2xl text-white mb-3 tracking-tight">
                        {feature.title}
                      </h3>
                      <p className="text-[15px] text-[#777] leading-relaxed font-light max-w-md">
                        {feature.desc}
                      </p>
                    </div>
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          PROCESS — Vertical Timeline, Not Typical Cards
          ═══════════════════════════════════════════════ */}
      <section id="process" className="relative py-32 px-6 md:px-12 z-10">
        <div className="mx-auto max-w-[1200px]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="mb-24 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-8 items-end"
          >
            <div>
              <span className="section-tag mb-5 block">Process</span>
              <h2
                className="font-[family-name:var(--font-syne)] font-bold text-white tracking-[-0.03em]"
                style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)" }}
              >
                Three steps.
                <br />
                <span style={{ color: "#cdff00" }}>One truth.</span>
              </h2>
            </div>
            <p className="text-[#666] text-lg font-light leading-relaxed lg:text-right">
              No setup. No integration. No waiting.
              <br className="hidden md:block" />
              From username to intelligence report in seconds.
            </p>
          </motion.div>

          {/* Timeline */}
          <div className="relative pl-16 md:pl-20">
            {/* Vertical line */}
            <div className="timeline-line" />
            <div className="timeline-pulse" />

            <div className="space-y-16 md:space-y-20">
              {steps.map((step, idx) => (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    delay: idx * 0.2,
                    duration: 0.7,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="relative flex items-start gap-8 md:gap-12"
                >
                  {/* Node */}
                  <div
                    className="timeline-node absolute -left-16 md:-left-20 top-0"
                    style={{ left: "0px" }}
                  >
                    <span
                      className="text-[11px] font-[family-name:var(--font-space)] font-bold"
                      style={{ color: "#cdff00" }}
                    >
                      {step.num}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="pt-1 ml-10 md:ml-12">
                    <h3 className="font-[family-name:var(--font-syne)] font-bold text-2xl md:text-3xl text-white mb-3 tracking-tight">
                      {step.title}
                    </h3>
                    <p className="text-[#777] text-base md:text-lg font-light leading-relaxed max-w-lg">
                      {step.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          CTA — Split Design: Bold Lime + Dark
          ═══════════════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="relative z-10"
      >
        <div className="cta-split">
          {/* Left: Lime panel */}
          <div className="cta-left">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative z-10"
            >
              <h2
                className="font-[family-name:var(--font-syne)] font-extrabold tracking-[-0.04em] leading-[0.9]"
                style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", color: "#050505" }}
              >
                Stop
                <br />
                guessing.
              </h2>
            </motion.div>
          </div>

          {/* Right: Dark panel */}
          <div className="cta-right">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="max-w-sm"
            >
              <h3
                className="font-[family-name:var(--font-syne)] font-bold text-3xl md:text-4xl text-white mb-5 tracking-tight"
              >
                Start <span style={{ color: "#cdff00" }}>knowing.</span>
              </h3>
              <p className="text-[#777] text-base font-light leading-relaxed mb-10">
                Join hundreds of engineering teams who use DevXray to make
                better hiring decisions, faster.
              </p>
              <div className="flex flex-wrap gap-4">
                <MagneticButton href="/signin">
                  Analyze a Profile
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </MagneticButton>
                <Link href="/report/torvalds" className="btn-ghost">
                  View Demo
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* ═══════════════════════════════════════════════
          FOOTER — Minimal with Watermark
          ═══════════════════════════════════════════════ */}
      <footer className="relative py-16 px-6 md:px-12 z-10 overflow-hidden">
        {/* Large watermark */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 select-none pointer-events-none"
          style={{
            fontFamily: "var(--font-syne)",
            fontWeight: 800,
            fontSize: "clamp(80px, 15vw, 200px)",
            lineHeight: 0.75,
            color: "rgba(255,255,255,0.015)",
            letterSpacing: "-0.04em",
            whiteSpace: "nowrap",
          }}
        >
          DEVXRAY
        </div>

        <div className="relative mx-auto max-w-[1200px]">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 border-t pt-10"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center"
                style={{ background: "#cdff00" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
                    fill="#050505"
                  />
                </svg>
              </div>
              <span className="text-sm font-[family-name:var(--font-syne)] font-semibold text-[#666]">
                Dev<span style={{ color: "#cdff00" }}>Xray</span>
              </span>
            </div>

            <p className="text-[11px] text-[#333] font-[family-name:var(--font-space)]">
              © {new Date().getFullYear()} DevXray Intelligence. All rights reserved.
            </p>

            <div className="flex items-center gap-8">
              {["Privacy", "Terms", "Contact"].map((link) => (
                <a
                  key={link}
                  href="#"
                  className="text-[11px] text-[#444] hover:text-[#cdff00] transition-colors duration-300 no-underline font-[family-name:var(--font-space)] tracking-wider uppercase"
                >
                  {link}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
