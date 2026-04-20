"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useRef, useEffect, useState, useCallback } from "react";
import { getCurrentUser } from "@/lib/auth";
import Logo from "@/components/Logo";

/* ═══════════════════════════════════════════════════════════
   PARTICLE FIELD — Reusable canvas constellation
   ═══════════════════════════════════════════════════════════ */
function ParticleField({ count = 40 }: { count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number }[] = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.4 + 0.1,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.offsetWidth) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.offsetHeight) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(205, 255, 0, ${p.opacity})`;
        ctx.fill();
        for (const q of particles) {
          const dx = p.x - q.x, dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(205, 255, 0, ${0.04 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, [count]);

  return <canvas ref={canvasRef} className="particle-canvas" style={{ width: "100%", height: "100%" }} />;
}

export default function AboutPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    getCurrentUser().then(u => setIsLoggedIn(!!u));
  }, []);

  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } },
  };
  const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const } },
  };

  const pipelineSteps = [
    { icon: "DI", title: "Data Ingestion", desc: "Pull GitHub repos, commits, PRs, gists, StackOverflow, npm, LinkedIn — all in parallel under 10 seconds." },
    { icon: "CD", title: "Code DNA Analysis", desc: "LOC-weighted language profiling, dependency graph analysis, commit pattern forensics, and authorship verification." },
    { icon: "TE", title: "Truth Engine", desc: "Cross-reference resume claims against real code. Every skill, timeline, and project is validated with hard evidence." },
    { icon: "AD", title: "AI Detection", desc: "12-pattern deep scan to detect AI-generated code, bulk uploads, clone farms, and automated commit patterns." },
    { icon: "ST", title: "Scoring & Tiering", desc: "Multi-dimensional scoring across depth, ownership, activity, complexity, and language diversity. Deterministic algorithms — no guesswork." },
    { icon: "IR", title: "Intelligence Report", desc: "Executive summary, hiring recommendation, risk assessment, interview questions — all generated in one comprehensive document." },
  ];

  const techStack = [
    { name: "Python", desc: "Core analysis engine", color: "#3776AB" },
    { name: "Google Gemini", desc: "AI synthesis & insights", color: "#4285F4" },
    { name: "Next.js", desc: "Frontend framework", color: "#ffffff" },
    { name: "FastAPI", desc: "Backend API layer", color: "#009688" },
    { name: "GitHub API", desc: "Deep data ingestion", color: "#6e5494" },
    { name: "Framer Motion", desc: "Premium animations", color: "#FF0055" },
  ];

  return (
    <div ref={containerRef} className="min-h-screen bg-[#050505] text-[#fafafa] font-[family-name:var(--font-dm-sans)] relative overflow-hidden">
      <div className="grain-overlay" />

      {/* ═══ NAV ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-5 md:px-8">
        <div className="mx-auto max-w-[1200px] flex items-center justify-between py-4 mt-5 px-6 rounded-2xl"
          style={{ background: "rgba(5,5,5,0.85)", borderBottom: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(20px)" }}>
          <Link href="/" className="flex items-center gap-3 no-underline group">
            <Logo className="w-8 h-8 md:w-10 md:h-10 transition-transform duration-500 group-hover:scale-105" />
            <span className="font-[family-name:var(--font-syne)] font-bold text-[17px] tracking-tight text-white glitch-text">
              Dev<span style={{ color: "#cdff00" }}>Xray</span>
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/" className="text-[12px] font-[family-name:var(--font-space)] font-medium text-[#666] hover:text-[#cdff00] transition-colors no-underline tracking-widest uppercase animated-underline">Home</Link>
            <Link href="/pricing" className="text-[12px] font-[family-name:var(--font-space)] font-medium text-[#666] hover:text-[#cdff00] transition-colors no-underline tracking-widest uppercase animated-underline">Pricing</Link>
            <Link href={isLoggedIn ? "/dashboard" : "/signin"} className="magnetic-btn !py-2.5 !px-5 !text-[11px]">{isLoggedIn ? "Dashboard" : "Get Started"}</Link>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[70vh] flex items-center px-6 md:px-12 pt-32 pb-20 z-10">
        <ParticleField count={35} />
        <div className="absolute right-[-10%] top-[10%] w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(205,255,0,0.08)_0%,transparent_70%)] blur-[60px] animate-[blob-morph_10s_ease-in-out_infinite]" />

        <motion.div className="relative mx-auto max-w-[1200px] w-full" style={{ y: y1 }}>
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="section-tag mb-8">
            About the Technology
          </motion.div>

          <motion.h1
            className="font-[family-name:var(--font-syne)] font-extrabold tracking-[-0.04em] text-white leading-[0.9] mb-8"
            style={{ fontSize: "clamp(2.8rem, 7vw, 6rem)" }}
            initial="hidden" animate="show" variants={stagger}
          >
            <motion.span variants={fadeUp} className="block">The AI engine</motion.span>
            <motion.span variants={fadeUp} className="block" style={{ color: "#cdff00" }}>behind the signal.</motion.span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
            className="text-[#888] text-lg md:text-xl font-light max-w-2xl leading-relaxed"
          >
            DevXray&apos;s analysis pipeline processes GitHub repositories, resumes, and developer profiles through six forensic-grade modules to deliver hiring intelligence with 99.2% accuracy.
          </motion.p>
        </motion.div>
      </section>

      {/* ═══ PIPELINE ═══ */}
      <section className="relative py-32 px-6 md:px-12 z-10">
        <div className="mx-auto max-w-[1200px]">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-20">
            <span className="section-tag mb-5 block">Analysis Pipeline</span>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-white tracking-[-0.03em]" style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)" }}>
              Six modules.<br /><span style={{ color: "#cdff00" }}>Zero guesswork.</span>
            </h2>
          </motion.div>

          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pipelineSteps.map((step, i) => (
              <motion.div key={i} variants={fadeUp}
                className="tilt-card p-8 group">
                <div className="shimmer-layer" />
                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-xl mb-5 flex items-center justify-center text-[11px] font-[family-name:var(--font-space)] font-bold tracking-wider" style={{ background: 'rgba(205,255,0,0.08)', border: '1px solid rgba(205,255,0,0.15)', color: '#cdff00' }}>{step.icon}</div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-[9px] font-[family-name:var(--font-space)] font-bold tracking-[0.3em] uppercase px-2.5 py-1 rounded-full"
                      style={{ color: "#cdff00", background: "rgba(205,255,0,0.06)", border: "1px solid rgba(205,255,0,0.1)" }}>
                      0{i + 1}
                    </span>
                    <h3 className="font-[family-name:var(--font-syne)] font-bold text-lg text-white tracking-tight">{step.title}</h3>
                  </div>
                  <p className="text-[14px] text-[#777] leading-relaxed font-light">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ TECH STACK ═══ */}
      <section className="relative py-32 px-6 md:px-12 z-10 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        <div className="mx-auto max-w-[1200px]">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-20 text-center">
            <span className="section-tag mb-5 inline-flex">Built With</span>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-white tracking-[-0.03em] mt-4" style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>
              Enterprise-grade <span style={{ color: "#cdff00" }}>infrastructure.</span>
            </h2>
          </motion.div>

          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {techStack.map((tech, i) => (
              <motion.div key={i} variants={fadeUp}
                className="p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center hover:border-[#cdff00]/20 transition-all duration-500 group">
                <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: `${tech.color}15`, border: `1px solid ${tech.color}30` }}>
                  <span className="text-lg font-bold" style={{ color: tech.color }}>{tech.name[0]}</span>
                </div>
                <h4 className="text-sm font-bold text-white mb-1">{tech.name}</h4>
                <p className="text-[11px] text-[#555]">{tech.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ STATS ═══ */}
      <section className="relative py-24 px-6 md:px-12 z-10">
        <div className="mx-auto max-w-[1200px]">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: "50K+", label: "Profiles Analyzed" },
              { value: "99.2%", label: "Accuracy Rate" },
              { value: "<10s", label: "Analysis Time" },
              { value: "500+", label: "Teams Trust Us" },
            ].map((stat, i) => (
              <div key={i} className="text-center p-8 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                <div className="font-[family-name:var(--font-syne)] font-bold text-3xl md:text-4xl text-[#cdff00] mb-2">{stat.value}</div>
                <div className="text-[11px] text-[#555] font-[family-name:var(--font-space)] uppercase tracking-[0.15em]">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="relative py-24 px-6 md:px-12 z-10">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
          className="mx-auto max-w-[800px] text-center p-16 rounded-3xl border border-[#cdff00]/20"
          style={{ background: "linear-gradient(135deg, rgba(205,255,0,0.04), rgba(124,58,237,0.03))" }}>
          <h2 className="font-[family-name:var(--font-syne)] font-extrabold text-3xl md:text-4xl text-white mb-5 tracking-tight">
            Ready to see the <span style={{ color: "#cdff00" }}>signal?</span>
          </h2>
          <p className="text-[#777] text-base font-light mb-10 max-w-md mx-auto">
            Start analyzing developer profiles in seconds. No setup required.
          </p>
          <Link href={isLoggedIn ? "/dashboard" : "/signin"} className="magnetic-btn">
            Start Analyzing
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </motion.div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="relative py-12 px-6 z-10 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        <div className="mx-auto max-w-[1200px] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-[family-name:var(--font-syne)] font-semibold text-[#666]">
              Dev<span style={{ color: "#cdff00" }}>Xray</span>
            </span>
          </div>
          <p className="text-[11px] text-[#333] font-[family-name:var(--font-space)]">
            © {new Date().getFullYear()} DevXray Intelligence. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
