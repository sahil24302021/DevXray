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
import { hasGuestScansRemaining, incrementGuestScan } from "@/lib/scan-gate";
import { getCurrentUser } from "@/lib/auth";
import PaywallModal from "@/components/PaywallModal";
import Logo from "@/components/Logo";

/* ═══════════════════════════════════════════════════════════
   GRAIN OVERLAY
   ═══════════════════════════════════════════════════════════ */
function GrainOverlay() {
  return <div className="grain-overlay" />;
}

/* ═══════════════════════════════════════════════════════════
   CURSOR GLOW — desktop only
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
      className="cursor-glow hidden md:block"
      style={{ left: x, top: y }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════
   GRID BEAMS
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
   ROTATING TEXT
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
   PARTICLE FIELD
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
    const PARTICLE_COUNT = 40; // reduced on mobile for perf
    const CONNECTION_DIST = 100;

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
   MAGNETIC BUTTON — desktop only effect
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
   TILT CARD — disabled on touch devices
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
   ANIMATED COUNTER
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
   MOBILE NAV — hamburger menu
   ═══════════════════════════════════════════════════════════ */
function MobileMenu({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden flex flex-col gap-1.5 p-2 rounded-lg hover:bg-white/[0.05] transition-colors"
        aria-label="Toggle menu"
      >
        <span
          className="block w-5 h-px bg-white transition-all duration-300"
          style={{
            transform: open ? "translateY(4px) rotate(45deg)" : "none",
          }}
        />
        <span
          className="block w-5 h-px bg-white transition-all duration-300"
          style={{ opacity: open ? 0 : 1 }}
        />
        <span
          className="block w-5 h-px bg-white transition-all duration-300"
          style={{
            transform: open ? "translateY(-4px) rotate(-45deg)" : "none",
          }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-4 right-4 mt-2 rounded-2xl border p-5 flex flex-col gap-4 z-50"
            style={{
              background: "rgba(10,10,10,0.97)",
              borderColor: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(20px)",
            }}
          >
            {["Features", "Process", "Pricing"].map((item) => (
              <a
                key={item}
                href={item === "Pricing" ? `/pricing` : `#${item.toLowerCase()}`}
                onClick={() => setOpen(false)}
                className="text-[12px] font-[family-name:var(--font-space)] font-medium text-[#666] hover:text-[#cdff00] transition-colors tracking-widest uppercase"
              >
                {item}
              </a>
            ))}
            <div className="border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              {isLoggedIn ? (
                <div className="flex gap-3">
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="text-[11px] px-3 py-2 rounded-full border border-white/[0.08] text-[#cdff00] font-[family-name:var(--font-space)] tracking-widest uppercase"
                  >
                    Dashboard
                  </Link>
                </div>
              ) : (
                <div className="flex gap-3">
                  <Link
                    href="/signin"
                    onClick={() => setOpen(false)}
                    className="text-[12px] px-4 py-2 rounded-full border border-white/[0.1] text-[#888] font-[family-name:var(--font-space)] tracking-widest uppercase"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setOpen(false)}
                    className="text-[12px] px-4 py-2 rounded-full bg-[#cdff00] text-[#050505] font-[family-name:var(--font-space)] font-bold tracking-widest uppercase"
                  >
                    Get Started
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
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
  const [showSignupGate, setShowSignupGate] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);
  const [jobReqs, setJobReqs] = useState<JobRequirements>({});
  const [jobId, setJobId] = useState("");
  const [linkedinText, setLinkedinText] = useState("");
  const { scrollYProgress } = useScroll();
  const [navSolid, setNavSolid] = useState(false);

  useEffect(() => {
    getCurrentUser().then((u) => setIsLoggedIn(!!u));
  }, []);

  useEffect(() => {
    return scrollYProgress.on("change", (v) => setNavSolid(v > 0.02));
  }, [scrollYProgress]);

  // Paywall state
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallTrigger, setPaywallTrigger] = useState<"github" | "resume">("github");
  const [paywallUserId, setPaywallUserId] = useState("");
  const [paywallUserEmail, setPaywallUserEmail] = useState("");
  const [paywallUserName, setPaywallUserName] = useState("");

  // Helper: get or create profile directly from Supabase (no React state dependency)
  const getOrCreateProfile = async (userId: string, userEmail: string, userName: string) => {
    const { supabase, isSupabaseAvailable } = await import("@/lib/db");
    if (!isSupabaseAvailable || !supabase) return null;

    let { data } = await supabase.from("profiles").select("*").eq("id", userId).single();

    if (!data) {
      const { data: inserted } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          email: userEmail,
          full_name: userName,
          plan: "free",
          github_scans_used: 0,
          resume_scans_used: 0,
          subscription_status: "inactive",
        })
        .select()
        .single();
      data = inserted;
    }
    return data;
  };

  // Helper: increment scan count directly in Supabase
  const directIncrementScan = async (userId: string, type: "github" | "resume", currentCount: number) => {
    const { supabase, isSupabaseAvailable } = await import("@/lib/db");
    if (!isSupabaseAvailable || !supabase) return;
    const field = type === "github" ? "github_scans_used" : "resume_scans_used";
    await supabase.from("profiles").update({ [field]: currentCount + 1 }).eq("id", userId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = extractUsername(input);
    if (!username || username === "unknown") return;

    const user = await getCurrentUser();

    // Logged-in user: check plan limits directly from Supabase
    if (user) {
      const profile = await getOrCreateProfile(user.id, user.email, user.fullName);
      if (profile) {
        const plan = profile.plan || "free";
        const used = profile.github_scans_used || 0;
        const limit = plan === "free" ? 2 : plan === "starter" ? 20 : plan === "pro" ? 100 : Infinity;

        if (used >= limit) {
          setPaywallTrigger("github");
          setPaywallUserId(user.id);
          setPaywallUserEmail(user.email);
          setPaywallUserName(user.fullName);
          setShowPaywall(true);
          return;
        }
        // Increment scan count BEFORE navigating
        await directIncrementScan(user.id, "github", used);
      }
    }

    // Guest: check guest scan limit
    if (!user && !hasGuestScansRemaining()) {
      setShowSignupGate(true);
      return;
    }
    if (!user) incrementGuestScan();

    setLoading(true);
    router.push(`/report/${username}`);
  };

  const updateJobReq = (field: keyof JobRequirements, value: string) => {
    setJobReqs((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileDrop = async (file: File) => {
    const user = await getCurrentUser();

    // Logged-in user: check plan limits directly from Supabase
    if (user) {
      const profile = await getOrCreateProfile(user.id, user.email, user.fullName);
      if (profile) {
        const plan = profile.plan || "free";
        const used = profile.resume_scans_used || 0;
        const limit = plan === "free" ? 2 : plan === "starter" ? 20 : plan === "pro" ? 100 : Infinity;

        if (used >= limit) {
          setPaywallTrigger("resume");
          setPaywallUserId(user.id);
          setPaywallUserEmail(user.email);
          setPaywallUserName(user.fullName);
          setShowPaywall(true);
          return;
        }
      }
    }

    // Guest: check guest scan limit
    if (!user && !hasGuestScansRemaining()) {
      setShowSignupGate(true);
      return;
    }

    setLoading(true);
    const newJobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setJobId(newJobId);

    try {
      const hasReqs = Object.values(jobReqs).some((v) => typeof v === "string" && v.trim());
      const result = await analyzeResume(file, {
        jobId: newJobId,
        ...(hasReqs
          ? {
              jobTitle: jobReqs.job_title,
              requiredSkills: jobReqs.required_skills,
              jobDescription: jobReqs.job_description,
            }
          : {}),
        ...(linkedinText.trim() ? { linkedinText: linkedinText.trim() } : {}),
      });
      sessionStorage.setItem("resume_report_data", JSON.stringify(result));

      if (!user) incrementGuestScan();
      if (user) {
        const profile = await getOrCreateProfile(user.id, user.email, user.fullName);
        if (profile) await directIncrementScan(user.id, "resume", profile.resume_scans_used || 0);
      }
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
          NAVIGATION — Floating Glass with Mobile Menu
          ═══════════════════════════════════════════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-5 md:px-8">
        <motion.div
          className="relative mx-auto max-w-[1200px] flex items-center justify-between py-3 md:py-4 mt-3 md:mt-5 px-4 md:px-6 rounded-xl md:rounded-2xl transition-all duration-500"
          style={{
            background: navSolid ? "rgba(5,5,5,0.92)" : "rgba(5,5,5,0.4)",
            borderBottom: navSolid ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
            backdropFilter: "blur(20px) saturate(150%)",
            WebkitBackdropFilter: "blur(20px) saturate(150%)",
          }}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 sm:gap-3 no-underline group flex-shrink-0">
            <Logo className="w-8 h-8 md:w-10 md:h-10 transition-transform duration-500 group-hover:scale-105" />
            <span className="font-[family-name:var(--font-syne)] font-bold text-[15px] md:text-[17px] tracking-tight text-white glitch-text scan-line">
              Dev<span style={{ color: "#cdff00" }}>Xray</span>
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-8">
            {["Features", "Process", "Pricing"].map((item) => (
              <a
                key={item}
                href={item === "Pricing" ? `/pricing` : `#${item.toLowerCase()}`}
                className="text-[12px] font-[family-name:var(--font-space)] font-medium text-[#666] hover:text-[#cdff00] transition-colors duration-300 no-underline tracking-widest uppercase animated-underline"
              >
                {item}
              </a>
            ))}
          </div>

          {/* Desktop auth buttons */}
          <div className="hidden md:flex items-center gap-4">
            <NavAuthButtons />
          </div>

          {/* Mobile: show auth + hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <NavAuthButtons />
            <MobileMenu isLoggedIn={isLoggedIn} />
          </div>
        </motion.div>
      </nav>

      {/* ═══════════════════════════════════════════════
          HERO
          ═══════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center px-5 sm:px-6 md:px-12 pt-28 sm:pt-32 pb-16 md:pb-20 z-10">
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
          {/* Ghost watermark — hide on mobile */}
          <div
            className="hidden sm:block absolute -top-16 -left-4 select-none pointer-events-none"
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

          {/* Content grid */}
          <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-10 lg:gap-16 items-end">
            <div>
              {/* Section tag */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="section-tag mb-6 md:mb-10"
              >
                GitHub Intelligence Platform
              </motion.div>

              {/* Headline */}
              <motion.h1
                className="font-[family-name:var(--font-syne)] font-extrabold tracking-[-0.04em] text-white leading-[0.9]"
                style={{ fontSize: "clamp(2.6rem, 8vw, 7rem)" }}
                initial="hidden"
                animate="show"
                variants={stagger}
              >
                <motion.span variants={fadeUp} className="block">X-ray</motion.span>
                <motion.span variants={fadeUp} className="block">developer</motion.span>
                <motion.span variants={fadeUp} className="block" style={{ color: "#cdff00" }}>
                  <RotatingText words={["truth.", "code.", "signal.", "DNA."]} />
                </motion.span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.7 }}
                className="text-[#888] text-base sm:text-lg md:text-xl font-light mt-6 md:mt-8 max-w-lg leading-relaxed"
              >
                Forensic GitHub analysis + resume verification.{" "}
                Every claim checked against real code —{" "}
                <span className="text-[#ccc] font-normal">in 60 seconds.</span>
              </motion.p>

              {/* Social proof bar */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.85 }}
                className="flex items-center gap-3 sm:gap-5 text-xs text-[#555] mt-5 flex-wrap"
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  37 skills verified
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  155+ files per scan
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  AI-powered
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  60s results
                </span>
              </motion.div>

              {/* Welcome banner for logged-in users */}
              {isLoggedIn && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.9 }}
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-[family-name:var(--font-space)] tracking-wide"
                  style={{
                    background: "rgba(205,255,0,0.06)",
                    border: "1px solid rgba(205,255,0,0.15)",
                    color: "#cdff00",
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#cdff00] animate-pulse" />
                  Ready to analyze — pick a mode below
                </motion.div>
              )}

              {/* Floating Tech Badges — desktop only */}
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

              {/* Mobile badges — compact version */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 1 }}
                className="flex lg:hidden flex-wrap gap-2 mt-5"
              >
                {["AI Detection", "Code Forensics", "GitHub Intel"].map((badge) => (
                  <span key={badge} className="floating-badge text-[10px] px-2 py-1">
                    <span className="w-1 h-1 rounded-full bg-[#cdff00]/60" />
                    {badge}
                  </span>
                ))}
              </motion.div>

              {/* Mode Toggle */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.8 }}
                className="flex items-center gap-2 mt-8 md:mt-10 bg-white/[0.03] p-1.5 rounded-full max-w-fit border border-white/[0.05]"
              >
                <button
                  onClick={() => setMode("github")}
                  className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-300 ${
                    mode === "github"
                      ? "bg-[#cdff00] text-[#050505] shadow-[0_0_15px_rgba(205,255,0,0.3)]"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  GitHub Profile
                </button>
                <button
                  onClick={() => setMode("resume")}
                  className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-300 ${
                    mode === "resume"
                      ? "bg-[#cdff00] text-[#050505] shadow-[0_0_15px_rgba(205,255,0,0.3)]"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Upload Resume
                </button>
              </motion.div>

              {/* GitHub Search / Resume Dropzone */}
              {mode === "github" ? (
                <motion.form
                  key="github-form"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  onSubmit={handleSubmit}
                  className="relative mt-6 md:mt-8 w-full max-w-lg"
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

                  {/* Try examples */}
                  <div className="flex flex-wrap items-center gap-2 mt-4 md:mt-5">
                    <span className="text-[11px] text-[#444] font-[family-name:var(--font-space)] tracking-wider uppercase">
                      Try
                    </span>
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
                  <p className="text-[#444] text-xs mt-3">
                    ✓ 2 free scans included — no credit card needed
                  </p>
                </motion.form>
              ) : (
                <motion.div
                  key="resume-dropzone"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="mt-6 md:mt-8 w-full max-w-lg"
                >
                  <Dropzone onFileSelect={handleFileDrop} isLoading={loading} />

                  {/* Job Requirements — Collapsible */}
                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => setShowRequirements(!showRequirements)}
                      className="flex items-center gap-2 text-[13px] font-[family-name:var(--font-space)] text-[#888] hover:text-[#cdff00] transition-colors duration-300 group"
                    >
                      <svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                        className={`transition-transform duration-300 ${showRequirements ? "rotate-90" : ""}`}
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                      <span className="tracking-wide uppercase">Add Job Requirements</span>
                      <span className="text-[10px] text-[#555] font-normal normal-case tracking-normal hidden sm:inline">
                        (optional)
                      </span>
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
                          <div className="mt-4 p-4 sm:p-5 rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-[family-name:var(--font-space)] text-[#666] uppercase tracking-widest mb-1.5">
                                  Job Title
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Senior Frontend Engineer"
                                  value={jobReqs.job_title || ""}
                                  onChange={(e) => updateJobReq("job_title", e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/30 transition-colors"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-[family-name:var(--font-space)] text-[#666] uppercase tracking-widest mb-1.5">
                                  Job Type
                                </label>
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-[family-name:var(--font-space)] text-[#666] uppercase tracking-widest mb-1.5">
                                  Required Skills
                                </label>
                                <input
                                  type="text"
                                  placeholder="React, TypeScript, Node.js..."
                                  value={jobReqs.required_skills || ""}
                                  onChange={(e) => updateJobReq("required_skills", e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/30 transition-colors"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-[family-name:var(--font-space)] text-[#666] uppercase tracking-widest mb-1.5">
                                  Experience
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. 3-5 years"
                                  value={jobReqs.experience_required || ""}
                                  onChange={(e) => updateJobReq("experience_required", e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/30 transition-colors"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-[family-name:var(--font-space)] text-[#666] uppercase tracking-widest mb-1.5">
                                Company Name
                              </label>
                              <input
                                type="text"
                                placeholder="Your company name"
                                value={jobReqs.company_name || ""}
                                onChange={(e) => updateJobReq("company_name", e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/30 transition-colors"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-[family-name:var(--font-space)] text-[#666] uppercase tracking-widest mb-1.5">
                                Job Description
                              </label>
                              <textarea
                                placeholder="Paste the full job description here..."
                                value={jobReqs.job_description || ""}
                                onChange={(e) => updateJobReq("job_description", e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/30 transition-colors resize-none"
                              />
                            </div>
                            {/* LinkedIn Paste-Text Field — PDF Guide item */}
                            <div>
                              <label className="block text-[10px] font-[family-name:var(--font-space)] text-[#666] uppercase tracking-widest mb-1.5">
                                LinkedIn Profile Text <span className="text-[#444] normal-case lowercase tracking-normal">(paste from their profile page)</span>
                              </label>
                              <textarea
                                placeholder="Paste LinkedIn 'About' section or full profile text here. This helps us verify claims and cross-reference employment history..."
                                value={linkedinText}
                                onChange={(e) => setLinkedinText(e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/30 transition-colors resize-none"
                              />
                              {linkedinText.trim() && (
                                <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
                                  LinkedIn text will be cross-referenced with resume claims
                                </p>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Right side — Stats column (desktop only) */}
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
                  <div className="text-[10px] text-[#444] font-[family-name:var(--font-space)] font-medium mt-2 uppercase tracking-[0.2em] whitespace-pre-line text-right">
                    {stat.label}
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Mobile stats row — shown below hero content on small screens */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="flex lg:hidden justify-between mt-10 pt-8 border-t border-white/[0.05]"
          >
            {[
              { value: 50000, suffix: "+", label: "Profiles" },
              { value: 500, suffix: "+", label: "Teams" },
              { value: 99, suffix: ".2%", label: "Accuracy" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-[family-name:var(--font-syne)] font-bold text-2xl sm:text-3xl text-white tabular-nums">
                  <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-[10px] text-[#444] font-[family-name:var(--font-space)] font-medium mt-1 uppercase tracking-widest">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════
          MARQUEE
          ═══════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="relative py-6 md:py-8 border-y overflow-hidden z-10"
        style={{ borderColor: "rgba(255,255,255,0.04)" }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-r from-[#050505] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-l from-[#050505] to-transparent z-10 pointer-events-none" />
        <div className="marquee-track">
          {[...Array(2)].flatMap((_, setIdx) =>
            [
              "50K+ PROFILES ANALYZED", "◆",
              "TRUSTED BY 500+ TEAMS", "◆",
              "99.2% ACCURACY", "◆",
              "FORENSIC-GRADE AI", "◆",
              "REAL-TIME ANALYSIS", "◆",
              "ZERO GUESSWORK", "◆",
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
          HOW IT WORKS — 3 steps
          ═══════════════════════════════════════════════ */}
      <section className="relative py-16 md:py-24 px-5 sm:px-6 md:px-12 z-10">
        <div className="mx-auto max-w-[1000px]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <span className="section-tag mb-5 inline-flex">How It Works</span>
            <h2
              className="font-[family-name:var(--font-syne)] font-bold text-white tracking-[-0.03em] mt-4"
              style={{ fontSize: "clamp(1.6rem, 4vw, 2.8rem)" }}
            >
              Three steps to{" "}
              <span style={{ color: "#cdff00" }}>verified truth.</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Paste GitHub or upload resume", desc: "Drop a GitHub username or PDF resume. DevXray starts scanning immediately." },
              { step: "02", title: "AI forensic analysis runs", desc: "155+ files read. Every claim verified. Commit patterns analyzed. Skills depth-tested." },
              { step: "03", title: "Get a hiring verdict", desc: "Score, tier, red flags, verified strengths, and a ready-to-use interview kit. In 60 seconds." },
            ].map(({ step, title, desc }) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: parseInt(step) * 0.1 }}
                className="relative"
              >
                <span
                  className="font-[family-name:var(--font-syne)] font-black absolute -top-4 -left-2"
                  style={{ fontSize: "48px", color: "rgba(255,255,255,0.04)" }}
                >
                  {step}
                </span>
                <div className="relative z-10">
                  <h3 className="font-[family-name:var(--font-syne)] font-bold text-white mb-2 text-lg">{title}</h3>
                  <p className="text-sm text-[#888] leading-relaxed">{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* VS Comparison Block */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-white/[0.06] p-6 md:p-8 mt-16 max-w-3xl mx-auto"
            style={{ background: "rgba(255,255,255,0.02)" }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
              <div>
                <p className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-4">Traditional resume screening</p>
                {["30+ minutes per candidate", "Trusts unverified claims", "Misses 70% of red flags", "Generic questions from Google", "No code verification"].map(item => (
                  <div key={item} className="flex items-center gap-2 text-sm text-[#666] mb-3">
                    <svg className="w-4 h-4 text-rose-400/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {item}
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-bold text-[#cdff00] uppercase tracking-wider mb-4">DevXray</p>
                {["60 seconds per candidate", "Every claim verified against code", "Forensic red flag detection", "Interview questions from their actual code", "155+ files deep-analyzed"].map(item => (
                  <div key={item} className="flex items-center gap-2 text-sm text-[#ccc] mb-3">
                    <svg className="w-4 h-4 text-[#cdff00] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          FEATURES
          ═══════════════════════════════════════════════ */}
      <section id="features" className="relative py-20 md:py-32 px-5 sm:px-6 md:px-12 z-10">
        <div className="mx-auto max-w-[1200px]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="mb-14 md:mb-24"
          >
            <span className="section-tag mb-5 block">Capabilities</span>
            <h2
              className="font-[family-name:var(--font-syne)] font-bold text-white tracking-[-0.03em]"
              style={{ fontSize: "clamp(1.8rem, 5vw, 3.5rem)" }}
            >
              Six modules.
              <br />
              <span style={{ color: "#cdff00" }}>Zero blind spots.</span>
            </h2>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5"
          >
            {features.map((feature, idx) => (
              <motion.div key={feature.num} variants={fadeUp}>
                <TiltCard
                  className={`p-6 md:p-8 lg:p-10 ${idx === 0 ? "lg:col-span-2 lg:row-span-1" : ""} ${idx === 5 ? "lg:col-span-2" : ""}`}
                >
                  <div className="relative z-10">
                    <div className="ghost-number absolute -top-4 -right-2 opacity-100" style={{ fontSize: "clamp(50px, 8vw, 120px)" }}>
                      {feature.num}
                    </div>
                    <div className="relative">
                      <span
                        className="inline-block text-[9px] font-[family-name:var(--font-space)] font-bold tracking-[0.3em] uppercase px-3 py-1.5 rounded-full mb-4 md:mb-6"
                        style={{
                          color: "#cdff00",
                          background: "rgba(205,255,0,0.06)",
                          border: "1px solid rgba(205,255,0,0.1)",
                        }}
                      >
                        {feature.tag}
                      </span>
                      <h3 className="font-[family-name:var(--font-syne)] font-bold text-lg md:text-xl lg:text-2xl text-white mb-3 tracking-tight">
                        {feature.title}
                      </h3>
                      <p className="text-[14px] md:text-[15px] text-[#777] leading-relaxed font-light">
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
          PROCESS
          ═══════════════════════════════════════════════ */}
      <section id="process" className="relative py-20 md:py-32 px-5 sm:px-6 md:px-12 z-10">
        <div className="mx-auto max-w-[1200px]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="mb-14 md:mb-24 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 md:gap-8 items-end"
          >
            <div>
              <span className="section-tag mb-5 block">Process</span>
              <h2
                className="font-[family-name:var(--font-syne)] font-bold text-white tracking-[-0.03em]"
                style={{ fontSize: "clamp(1.8rem, 5vw, 3.5rem)" }}
              >
                Three steps.
                <br />
                <span style={{ color: "#cdff00" }}>One truth.</span>
              </h2>
            </div>
            <p className="text-[#666] text-base md:text-lg font-light leading-relaxed lg:text-right">
              No setup. No integration. No waiting.
              <br className="hidden md:block" />
              From username to intelligence report in seconds.
            </p>
          </motion.div>

          <div className="relative pl-12 sm:pl-16 md:pl-20">
            <div className="timeline-line" />
            <div className="timeline-pulse" />
            <div className="space-y-12 md:space-y-16 lg:space-y-20">
              {steps.map((step, idx) => (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.2, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  className="relative flex items-start gap-6 md:gap-12"
                >
                  <div className="timeline-node absolute top-0" style={{ left: "0px" }}>
                    <span className="text-[11px] font-[family-name:var(--font-space)] font-bold" style={{ color: "#cdff00" }}>
                      {step.num}
                    </span>
                  </div>
                  <div className="pt-1 ml-8 md:ml-12">
                    <h3 className="font-[family-name:var(--font-syne)] font-bold text-xl sm:text-2xl md:text-3xl text-white mb-2 md:mb-3 tracking-tight">
                      {step.title}
                    </h3>
                    <p className="text-[#777] text-sm md:text-base lg:text-lg font-light leading-relaxed max-w-lg">
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
          CTA — Split Design
          ═══════════════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="relative z-10"
      >
        <div className="cta-split">
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
                style={{ fontSize: "clamp(2rem, 5vw, 4rem)", color: "#050505" }}
              >
                Stop
                <br />
                guessing.
              </h2>
            </motion.div>
          </div>

          <div className="cta-right">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="max-w-sm w-full"
            >
              <h3 className="font-[family-name:var(--font-syne)] font-bold text-2xl md:text-3xl lg:text-4xl text-white mb-4 md:mb-5 tracking-tight">
                Start <span style={{ color: "#cdff00" }}>knowing.</span>
              </h3>
              <p className="text-[#777] text-sm md:text-base font-light leading-relaxed mb-8 md:mb-10">
                Join hundreds of engineering teams who use DevXray to make better hiring decisions, faster.
              </p>
              <div className="flex flex-wrap gap-3 md:gap-4">
                {/* When logged in, CTA scrolls back up to the hero input */}
                {isLoggedIn ? (
                  <button
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    className="magnetic-btn"
                  >
                    Analyze a Profile
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                ) : (
                  <MagneticButton href="/signin">
                    Analyze a Profile
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </MagneticButton>
                )}
                <Link href="/report/torvalds" className="btn-ghost">
                  View Demo
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* ═══════════════════════════════════════════════
          FOOTER
          ═══════════════════════════════════════════════ */}
      <footer className="relative py-12 md:py-16 px-5 sm:px-6 md:px-12 z-10 overflow-hidden">
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 select-none pointer-events-none hidden sm:block"
          style={{
            fontFamily: "var(--font-syne)",
            fontWeight: 800,
            fontSize: "clamp(60px, 15vw, 200px)",
            lineHeight: 0.75,
            color: "rgba(255,255,255,0.015)",
            letterSpacing: "-0.04em",
            whiteSpace: "nowrap",
          }}
        >
          DEVXRAY
        </div>

        <div className="relative mx-auto max-w-[1200px]">
          <div
            className="flex flex-col sm:flex-row items-center justify-between gap-5 md:gap-6 border-t pt-8 md:pt-10"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center gap-3">
              <Logo className="w-6 h-6 flex-shrink-0" />
              <span className="text-sm font-[family-name:var(--font-syne)] font-semibold text-[#666]">
                Dev<span style={{ color: "#cdff00" }}>Xray</span>
              </span>
            </div>

            <p className="text-[11px] text-[#333] font-[family-name:var(--font-space)]">
              © {new Date().getFullYear()} DevXray Intelligence. All rights reserved.
            </p>

            <div className="flex items-center gap-5 md:gap-8">
              {[{ label: "About", href: "/about" }, { label: "Contact", href: "/contact" }, { label: "Pricing", href: "/pricing" }].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  className="text-[11px] text-[#444] hover:text-[#cdff00] transition-colors duration-300 no-underline font-[family-name:var(--font-space)] tracking-wider uppercase"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* ═══════════════════════════════════════════════
          SIGNUP GATE MODAL
          ═══════════════════════════════════════════════ */}
      {showSignupGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-6 sm:p-8 max-w-sm w-full text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#cdff00]/10 border border-[#cdff00]/20 flex items-center justify-center mx-auto mb-5">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#cdff00" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2 font-[family-name:var(--font-syne)]">
              You&apos;ve used your free scan
            </h3>
            <p className="text-[#666] text-sm mb-6">
              Create a free account to analyze unlimited GitHub profiles and resumes.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href="/signup"
                className="w-full bg-[#cdff00] text-[#050505] font-bold rounded-xl px-4 py-3 hover:bg-[#b0e600] transition-colors font-[family-name:var(--font-space)]"
              >
                Create Free Account
              </Link>
              <Link
                href="/signin"
                className="w-full bg-white/[0.04] border border-[#333] text-white rounded-xl px-4 py-3 hover:bg-white/[0.08] transition-colors text-sm"
              >
                I already have an account
              </Link>
              <button
                onClick={() => setShowSignupGate(false)}
                className="text-[#555] text-sm hover:text-white transition-colors"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          PAYWALL MODAL (for logged-in users who hit plan limits)
          ═══════════════════════════════════════════════════ */}
      {showPaywall && (
        <PaywallModal
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          userId={paywallUserId}
          userEmail={paywallUserEmail}
          userName={paywallUserName}
          trigger={paywallTrigger}
        />
      )}
    </main>
  );
}