"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { getCurrentUser } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import Script from "next/script";
import { useProfile } from "@/lib/useProfile";
import PaywallModal from "@/components/PaywallModal";
import Logo from "@/components/Logo";

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
        className="w-full text-left py-6 flex items-center justify-between gap-4 group cursor-pointer">
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

/* ═══════════════════════════════════════════════════════════
   COMPARISON TABLE DATA
   ═══════════════════════════════════════════════════════════ */
const COMPARISON_ROWS = [
  { label: "GitHub scans / month", free: "2", starter: "20", pro: "100", enterprise: "Unlimited" },
  { label: "Resume scans / month", free: "2", starter: "20", pro: "100", enterprise: "Unlimited" },
  { label: "Skill verification matrix", free: "Basic", starter: "Full", pro: "Full", enterprise: "Full" },
  { label: "AI Interview Kit", free: "✗", starter: "✓", pro: "✓", enterprise: "✓" },
  { label: "Claim-by-claim forensics", free: "✗", starter: "✓", pro: "✓", enterprise: "✓" },
  { label: "LinkedIn cross-reference", free: "✗", starter: "✓", pro: "✓", enterprise: "✓" },
  { label: "Bulk CSV upload", free: "✗", starter: "✗", pro: "50 candidates", enterprise: "Unlimited" },
  { label: "Candidate comparison view", free: "✗", starter: "✗", pro: "✓", enterprise: "✓" },
  { label: "Team seats", free: "1", starter: "1", pro: "5", enterprise: "Unlimited" },
  { label: "ATS-ready PDF reports", free: "✗", starter: "✓", pro: "✓", enterprise: "✓" },
  { label: "Webhook integrations", free: "✗", starter: "✗", pro: "✓", enterprise: "✓" },
  { label: "SSO / SAML", free: "✗", starter: "✗", pro: "✗", enterprise: "✓" },
  { label: "Custom AI fine-tuning", free: "✗", starter: "✗", pro: "✗", enterprise: "✓" },
  { label: "SLA guarantee", free: "✗", starter: "✗", pro: "✗", enterprise: "99.9%" },
  { label: "Support", free: "Email", starter: "Priority email", pro: "Slack", enterprise: "Dedicated manager" },
];

const FAQS = [
  {
    q: "How is DevXray different from just reading a resume?",
    a: "DevXray forensically cross-references every resume claim against actual GitHub code. We scan 155+ files, detect fake skills, AI-generated code, skill inflation, and timeline inconsistencies — in under 60 seconds. Manual resume screening takes 30+ minutes and misses 70% of red flags.",
  },
  {
    q: "What counts as one scan?",
    a: "One GitHub scan = analyzing one GitHub username. One resume scan = uploading and cross-referencing one PDF resume (optionally with a GitHub username). Scans reset on the 1st of each month.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts, no lock-in. Cancel from your dashboard at any time. Your plan stays active until the end of your paid period.",
  },
  {
    q: "Do you support Indian billing?",
    a: "Yes — all plans are priced in INR. Payments are processed via Razorpay, which supports UPI, NetBanking, credit/debit cards, and EMI. GST invoices are generated automatically.",
  },
  {
    q: "Is the candidate's data private?",
    a: "DevXray only analyzes publicly available GitHub data and the resume you upload. We do not share candidate data with third parties. Reports are private to your account.",
  },
  {
    q: "What if GitHub rate limits hit during a scan?",
    a: "DevXray queues retries automatically using a smart cache layer. Cold-start delays are flagged visually so you always know the analysis is in progress.",
  },
];

const SOCIAL_PROOF = [
  { name: "Priya S.", role: "Tech Recruiter, Bangalore", quote: "Caught 3 resume frauds in our first week. Saved us from bad hires that would have cost us months of onboarding loss.", avatar: "PS" },
  { name: "Rahul M.", role: "CTO, SaaS Startup Mumbai", quote: "We now screen every engineering candidate through DevXray before the first call. Our hiring quality has gone up dramatically.", avatar: "RM" },
  { name: "Anjali T.", role: "HR Head, IT Services Company", quote: "The AI Interview Kit alone is worth the subscription. It generates role-specific questions I'd never have thought to ask.", avatar: "AT" },
];

/* ═══════════════════════════════════════════════════════════
   MAIN PRICING PAGE
   ═══════════════════════════════════════════════════════════ */
export default function PricingPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { profile: userProfile } = useProfile();
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    getCurrentUser().then(u => setIsLoggedIn(!!u));
  }, []);

  // Universal handler for all plan CTA buttons
  const handlePlanClick = async (planKey: string) => {
    // Re-check auth at click time (avoids race condition)
    const user = await getCurrentUser();
    if (user) {
      // User is logged in → show Razorpay paywall modal
      setShowPaywall(true);
    } else {
      // Guest → send to signup
      window.location.href = `/signup?plan=${planKey}`;
    }
  };

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } };
  const fadeUp = { hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const } } };

  return (
    <div className="min-h-screen bg-[#050505] text-[#fafafa] font-[family-name:var(--font-dm-sans)] relative overflow-hidden">
      <div className="grain-overlay" />
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />

      {/* ═══ NAV ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-5 md:px-8">
        <div className="mx-auto max-w-[1200px] flex items-center justify-between py-4 mt-5 px-6 rounded-2xl"
          style={{ background: "rgba(5,5,5,0.85)", borderBottom: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(20px)" }}>
          <Link href="/" className="flex items-center gap-3 no-underline group">
            <Logo className="w-8 h-8 md:w-10 md:h-10 transition-transform duration-500 group-hover:scale-105" />
            <span className="font-[family-name:var(--font-syne)] font-bold text-[17px] tracking-tight text-white">
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#cdff00]/20 bg-[#cdff00]/5 text-[#cdff00] text-xs font-semibold mb-6">
            TRUSTED BY 200+ HIRING TEAMS ACROSS INDIA
          </div>
          <h1 className="font-[family-name:var(--font-syne)] font-extrabold tracking-[-0.04em] text-white leading-[0.9] mb-6"
            style={{ fontSize: "clamp(2.8rem, 7vw, 5.5rem)" }}>
            Stop guessing.<br /><span style={{ color: "#cdff00" }}>Start knowing.</span>
          </h1>
          <p className="text-[#666] text-lg max-w-2xl mx-auto mb-8 font-light">
            Every fake skill, every inflated claim, every AI-generated repo — DevXray finds it in 60 seconds.
            One bad hire costs ₹8–15 lakhs. Our Pro plan costs ₹2,499/month.
          </p>
          <div className="flex items-center justify-center gap-6 text-sm text-[#555] flex-wrap">
            <span>✓ No credit card for free tier</span>
            <span>✓ Cancel anytime</span>
            <span>✓ INR billing + GST</span>
          </div>
        </motion.div>
      </section>

      {/* ═══ PRICING CARDS ═══ */}
      <section className="relative pb-24 px-4 md:px-12 z-10">
        <motion.div variants={stagger} initial="hidden" animate="show"
          className="mx-auto max-w-6xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(["free", "starter", "pro", "enterprise"] as const).map((key, i) => {
            const plan = PLANS[key];
            const isPro = key === "pro";
            return (
              <motion.div
                key={key}
                variants={fadeUp}
                className={`rounded-3xl p-6 md:p-8 flex flex-col relative overflow-visible border transition-all duration-500 ${
                  isPro
                    ? "border-[#cdff00]/30 bg-[#cdff00]/[0.02] shadow-[0_0_60px_rgba(205,255,0,0.06)]"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                }`}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1 bg-[#cdff00] text-[#050505] text-[10px] font-[family-name:var(--font-space)] font-bold uppercase tracking-[0.2em] rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                <div className={`text-sm font-semibold mb-1 ${isPro ? "text-[#cdff00]" : "text-[#888]"}`}>
                  {plan.name.toUpperCase()}
                </div>
                <div className="text-4xl font-black text-white mb-1" style={{ fontFamily: "var(--font-syne)" }}>
                  {plan.price === null ? "Custom" : plan.price === 0 ? "Free" : `₹${plan.price.toLocaleString()}`}
                </div>
                {plan.price !== null && plan.price > 0 && (
                  <div className="text-[#555] text-xs mb-6">per month, billed monthly</div>
                )}
                {plan.price === 0 && <div className="text-[#555] text-xs mb-6">forever free</div>}
                {plan.price === null && <div className="text-[#555] text-xs mb-6">tailored to your scale</div>}

                <ul className="space-y-2.5 flex-1 mb-8">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs text-[#999]">
                      <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" viewBox="0 0 16 16" fill="none">
                        <path d="M13.3 4L6 11.3 2.7 8" stroke={isPro ? "#cdff00" : "#555"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {key === "free" && (
                  <button
                    onClick={() => handlePlanClick("free")}
                    className="block w-full py-3.5 text-center rounded-xl bg-white/[0.05] text-white border border-white/[0.08] hover:bg-white/[0.08] text-sm font-bold transition-all cursor-pointer"
                  >
                    Start Free
                  </button>
                )}
                {key === "starter" && (
                  <button
                    onClick={() => handlePlanClick("starter")}
                    className="block w-full py-3.5 text-center rounded-xl border border-[#cdff00]/40 text-[#cdff00] text-sm font-bold hover:bg-[#cdff00]/5 transition-all cursor-pointer"
                  >
                    Get Starter →
                  </button>
                )}
                {key === "pro" && (
                  <button
                    onClick={() => handlePlanClick("pro")}
                    className="block w-full py-3.5 text-center rounded-xl bg-[#cdff00] text-[#050505] text-sm font-black hover:shadow-[0_0_30px_rgba(205,255,0,0.3)] hover:-translate-y-0.5 transition-all cursor-pointer"
                  >
                    Upgrade to Pro →
                  </button>
                )}
                {key === "enterprise" && (
                  <a href="/contact" className="block w-full py-3.5 text-center rounded-xl bg-white/[0.05] text-white border border-white/[0.08] hover:bg-white/[0.08] text-sm font-bold transition-all no-underline">
                    Contact Sales →
                  </a>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* ═══ ROI BANNER ═══ */}
      <section className="px-4 py-16 max-w-4xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="rounded-3xl border border-[#cdff00]/20 bg-[#cdff00]/[0.03] p-10 text-center"
        >
          <div className="text-[#cdff00] font-black text-5xl mb-2" style={{ fontFamily: "var(--font-syne)" }}>₹8,00,000</div>
          <div className="text-white font-bold text-xl mb-4">Average cost of one bad engineering hire in India</div>
          <p className="text-[#555] text-sm max-w-lg mx-auto mb-8">
            Recruitment fees, onboarding, lost productivity, re-hiring costs. DevXray Pro at ₹2,499/month pays for itself the moment it prevents a single bad hire.
          </p>
          <div className="grid grid-cols-3 gap-8 text-center">
            {[
              { val: "60s", label: "Average scan time" },
              { val: "93%", label: "False claim detection rate" },
              { val: "17+", label: "Skills verified per report" },
            ].map(({ val, label }) => (
              <div key={label}>
                <div className="text-3xl font-black text-[#cdff00] mb-1" style={{ fontFamily: "var(--font-syne)" }}>{val}</div>
                <div className="text-[#555] text-xs">{label}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ═══ FULL COMPARISON TABLE ═══ */}
      <section className="px-4 pb-20 max-w-5xl mx-auto relative z-10">
        <motion.h2
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="font-[family-name:var(--font-syne)] font-black text-3xl text-white text-center mb-10"
        >
          Full Feature <span style={{ color: "#cdff00" }}>Comparison</span>
        </motion.h2>
        <div className="rounded-2xl border border-white/[0.07] overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="grid grid-cols-5 text-xs font-bold text-center border-b border-white/[0.07]">
              <div className="p-4 text-left text-[#555]">Feature</div>
              {["Free", "Starter", "Pro", "Enterprise"].map((p, i) => (
                <div key={p} className={`p-4 ${i === 2 ? "text-[#cdff00]" : "text-white"}`}>{p}</div>
              ))}
            </div>
            {COMPARISON_ROWS.map((row, i) => (
              <div key={row.label} className={`grid grid-cols-5 text-xs text-center border-b border-white/[0.04] ${i % 2 === 0 ? "bg-white/[0.01]" : ""}`}>
                <div className="p-4 text-left text-[#777]">{row.label}</div>
                {[row.free, row.starter, row.pro, row.enterprise].map((val, j) => (
                  <div key={j} className={`p-4 ${val === "✗" ? "text-[#333]" : val === "✓" ? "text-[#cdff00]" : "text-[#aaa]"}`}>
                    {val}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SOCIAL PROOF ═══ */}
      <section className="px-4 pb-20 max-w-5xl mx-auto relative z-10">
        <motion.h2
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="font-[family-name:var(--font-syne)] font-black text-3xl text-white text-center mb-10"
        >
          What hiring teams <span style={{ color: "#cdff00" }}>say</span>
        </motion.h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SOCIAL_PROOF.map(({ name, role, quote, avatar }) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="rounded-2xl border border-white/[0.07] p-6 bg-white/[0.02]"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#cdff00]/10 border border-[#cdff00]/20 flex items-center justify-center text-[#cdff00] font-bold text-sm">
                  {avatar}
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">{name}</div>
                  <div className="text-[#555] text-xs">{role}</div>
                </div>
              </div>
              <p className="text-[#888] text-sm leading-relaxed">&ldquo;{quote}&rdquo;</p>
              <div className="mt-4 flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-3.5 h-3.5 text-[#cdff00]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className="relative py-20 px-6 md:px-12 z-10 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        <div className="mx-auto max-w-[800px]">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <span className="section-tag mb-5 inline-flex">FAQ</span>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-white tracking-[-0.03em] mt-4" style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>
              Frequently asked<br /><span style={{ color: "#cdff00" }}>questions.</span>
            </h2>
          </motion.div>
          <div>
            {FAQS.map((faq, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                <FAQItem q={faq.q} a={faq.a} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="px-4 pb-24 text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="max-w-2xl mx-auto rounded-3xl border border-[#cdff00]/20 bg-[#cdff00]/[0.03] p-12"
        >
          <h2 className="font-[family-name:var(--font-syne)] font-black text-4xl text-white mb-4">
            Your next great hire is one scan away.
          </h2>
          <p className="text-[#555] mb-8">
            Start free. No credit card required. Upgrade only when you&apos;re convinced.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={() => handlePlanClick("free")}
              className="px-8 py-4 rounded-xl bg-[#cdff00] text-black font-black hover:bg-[#b8e600] transition-all text-sm cursor-pointer"
            >
              Start for Free →
            </button>
            <button
              onClick={() => handlePlanClick("pro")}
              className="px-8 py-4 rounded-xl border border-white/20 text-white font-semibold hover:bg-white/5 transition-all text-sm cursor-pointer"
            >
              Get Pro — ₹2,499/mo
            </button>
          </div>
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

      {showPaywall && (
        <PaywallModal
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          userId={userProfile?.id || ""}
          userEmail={userProfile?.email || ""}
          userName={userProfile?.full_name || ""}
          trigger="pricing"
        />
      )}
    </div>
  );
}
