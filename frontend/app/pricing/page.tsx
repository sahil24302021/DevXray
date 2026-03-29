"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState, useRef, useCallback, useEffect } from "react";
import { getCurrentUser } from "@/lib/auth";

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
    const particles: { x: number; y: number; vx: number; vy: number; s: number; o: number }[] = [];
    const resize = () => { canvas.width = canvas.offsetWidth * 2; canvas.height = canvas.offsetHeight * 2; ctx.scale(2, 2); };
    resize();
    window.addEventListener("resize", resize);
    for (let i = 0; i < 30; i++) particles.push({ x: Math.random() * canvas.offsetWidth, y: Math.random() * canvas.offsetHeight, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2, s: Math.random() + 0.5, o: Math.random() * 0.3 + 0.1 });
    const draw = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      for (const p of particles) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > canvas.offsetWidth) p.vx *= -1; if (p.y < 0 || p.y > canvas.offsetHeight) p.vy *= -1; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fillStyle = `rgba(205,255,0,${p.o})`; ctx.fill(); }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} className="particle-canvas" style={{ width: "100%", height: "100%" }} />;
}

/* ═══════════════════════════════════════════════════════════
   FAQ ACCORDION
   ═══════════════════════════════════════════════════════════ */
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.06]">
      <button onClick={() => setOpen(!open)}
        className="w-full text-left py-6 flex items-center justify-between gap-4 group">
        <span className="font-[family-name:var(--font-syne)] font-bold text-base md:text-lg text-white group-hover:text-[#cdff00] transition-colors">{q}</span>
        <motion.span animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.3 }}
          className="text-[#cdff00] text-xl font-light shrink-0">+</motion.span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="overflow-hidden"
      >
        <p className="text-[#777] text-sm leading-relaxed pb-6 font-light">{a}</p>
      </motion.div>
    </div>
  );
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    getCurrentUser().then(u => setIsLoggedIn(!!u));
  }, []);

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } };
  const fadeUp = { hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const } } };

  const plans = [
    {
      name: "Starter",
      price: annual ? 0 : 0,
      period: "Free forever",
      desc: "Perfect for individual recruiters and small teams getting started.",
      features: ["5 GitHub analyses / month", "Basic code intelligence", "Risk assessment", "24hr report delivery", "Community support"],
      cta: "Start Free",
      popular: false,
    },
    {
      name: "Pro",
      price: annual ? 49 : 59,
      period: annual ? "/mo billed annually" : "/mo",
      desc: "For hiring teams that need deep forensic intelligence at scale.",
      features: ["Unlimited GitHub analyses", "Resume + GitHub cross-referencing", "Truth Engine verification", "AI-generated code detection", "Custom job requirement matching", "Real-time streaming reports", "PDF export", "Priority support"],
      cta: "Start Pro Trial",
      popular: true,
    },
    {
      name: "Enterprise",
      price: null,
      period: "Custom pricing",
      desc: "For organizations with high-volume hiring and compliance needs.",
      features: ["Everything in Pro", "Batch analysis API", "Custom scoring models", "SSO & SAML", "Dedicated success manager", "SLA & compliance reports", "White-label reports", "On-premise deployment"],
      cta: "Contact Sales",
      popular: false,
    },
  ];

  const faqs = [
    { q: "What is DevXray?", a: "DevXray is an AI-powered developer intelligence platform that analyzes GitHub profiles and resumes to provide forensic-grade hiring insights. We verify coding skills, detect AI-generated code, and cross-reference claims with real evidence." },
    { q: "How accurate is the analysis?", a: "Our analysis achieves 99.2% accuracy through deterministic algorithms and multi-source verification. Every claim is validated against real GitHub data, commit patterns, and code forensics." },
    { q: "How long does an analysis take?", a: "Most analyses complete in under 10 seconds. Our pipeline processes repos, commits, PRs, and external sources in parallel for maximum speed." },
    { q: "Can I analyze resumes too?", a: "Yes! Upload a resume (PDF) and we'll extract claims, match them against GitHub data, verify skills, detect exaggerations, and generate a comprehensive truth report with interview focus areas." },
    { q: "Is there a free trial?", a: "The Starter plan is free forever with 5 analyses per month. Pro plan comes with a 14-day free trial — no credit card required." },
    { q: "Do you store candidate data?", a: "We process data in real-time and don't permanently store candidate profiles. Analysis results are cached for 10 minutes for performance, then purged. Enterprise plans offer custom data retention policies." },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-[#fafafa] font-[family-name:var(--font-dm-sans)] relative overflow-hidden">
      <div className="grain-overlay" />

      {/* ═══ NAV ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-5 md:px-8">
        <div className="mx-auto max-w-[1200px] flex items-center justify-between py-4 mt-5 px-6 rounded-2xl"
          style={{ background: "rgba(5,5,5,0.85)", borderBottom: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(20px)" }}>
          <Link href="/" className="flex items-center gap-3 no-underline group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center pulse-glow" style={{ background: "#cdff00" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#050505" />
              </svg>
            </div>
            <span className="font-[family-name:var(--font-syne)] font-bold text-[17px] tracking-tight text-white glitch-text">
              Dev<span style={{ color: "#cdff00" }}>Xray</span>
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/" className="text-[12px] font-[family-name:var(--font-space)] font-medium text-[#666] hover:text-[#cdff00] transition-colors no-underline tracking-widest uppercase animated-underline">Home</Link>
            <Link href="/about" className="text-[12px] font-[family-name:var(--font-space)] font-medium text-[#666] hover:text-[#cdff00] transition-colors no-underline tracking-widest uppercase animated-underline">About</Link>
            <Link href={isLoggedIn ? "/dashboard" : "/signin"} className="magnetic-btn !py-2.5 !px-5 !text-[11px]">{isLoggedIn ? "Dashboard" : "Get Started"}</Link>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="relative pt-40 pb-20 px-6 md:px-12 z-10 text-center">
        <ParticleField />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="relative z-10">
          <span className="section-tag mb-6 inline-flex">Pricing</span>
          <h1 className="font-[family-name:var(--font-syne)] font-extrabold tracking-[-0.04em] text-white leading-[0.9] mb-6"
            style={{ fontSize: "clamp(2.8rem, 7vw, 5.5rem)" }}>
            Simple, transparent<br /><span style={{ color: "#cdff00" }}>pricing.</span>
          </h1>
          <p className="text-[#888] text-lg font-light max-w-xl mx-auto mb-10">
            Start free. Scale as you grow. No hidden fees.
          </p>

          {/* Toggle */}
          <div className="inline-flex items-center gap-3 p-1.5 bg-white/[0.03] border border-white/[0.05] rounded-full">
            <button onClick={() => setAnnual(true)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${annual ? "bg-[#cdff00] text-[#050505] shadow-[0_0_15px_rgba(205,255,0,0.3)]" : "text-slate-400 hover:text-white"}`}>
              Annual <span className="text-[10px] opacity-70">Save 17%</span>
            </button>
            <button onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${!annual ? "bg-[#cdff00] text-[#050505] shadow-[0_0_15px_rgba(205,255,0,0.3)]" : "text-slate-400 hover:text-white"}`}>
              Monthly
            </button>
          </div>
        </motion.div>
      </section>

      {/* ═══ PRICING CARDS ═══ */}
      <section className="relative pb-32 px-6 md:px-12 z-10">
        <motion.div variants={stagger} initial="hidden" animate="show"
          className="mx-auto max-w-[1200px] grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan, i) => (
            <motion.div key={plan.name} variants={fadeUp}
              className={`relative rounded-3xl p-8 md:p-10 border transition-all duration-500 ${
                plan.popular 
                  ? "border-[#cdff00]/30 bg-[#cdff00]/[0.02] shadow-[0_0_60px_rgba(205,255,0,0.06)]" 
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
              }`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1 bg-[#cdff00] text-[#050505] text-[10px] font-[family-name:var(--font-space)] font-bold uppercase tracking-[0.2em] rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <h3 className="font-[family-name:var(--font-syne)] font-bold text-xl text-white mb-2">{plan.name}</h3>
              <p className="text-[#666] text-sm font-light mb-6">{plan.desc}</p>

              <div className="mb-8">
                {plan.price !== null ? (
                  <div className="flex items-baseline gap-1">
                    <span className="font-[family-name:var(--font-syne)] font-extrabold text-5xl text-white">${plan.price}</span>
                    <span className="text-[#666] text-sm">{plan.period}</span>
                  </div>
                ) : (
                  <span className="font-[family-name:var(--font-syne)] font-bold text-2xl text-white">{plan.period}</span>
                )}
              </div>

              <ul className="space-y-3 mb-10">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm text-[#999]">
                    <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 16 16" fill="none">
                      <path d="M13.3 4L6 11.3 2.7 8" stroke={plan.popular ? "#cdff00" : "#555"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <Link href="/signin"
                className={`block w-full text-center py-4 rounded-xl font-bold text-sm transition-all duration-300 no-underline ${
                  plan.popular
                    ? "bg-[#cdff00] text-[#050505] hover:shadow-[0_0_30px_rgba(205,255,0,0.3)] hover:-translate-y-0.5"
                    : "bg-white/[0.05] text-white border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.15]"
                }`}>
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className="relative py-32 px-6 md:px-12 z-10 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        <div className="mx-auto max-w-[800px]">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <span className="section-tag mb-5 inline-flex">FAQ</span>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-white tracking-[-0.03em] mt-4" style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>
              Frequently asked<br /><span style={{ color: "#cdff00" }}>questions.</span>
            </h2>
          </motion.div>

          <div>
            {faqs.map((faq, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                <FAQItem q={faq.q} a={faq.a} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="relative py-12 px-6 z-10 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        <div className="mx-auto max-w-[1200px] flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm font-[family-name:var(--font-syne)] font-semibold text-[#666]">
            Dev<span style={{ color: "#cdff00" }}>Xray</span>
          </span>
          <p className="text-[11px] text-[#333] font-[family-name:var(--font-space)]">
            © {new Date().getFullYear()} DevXray Intelligence. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
