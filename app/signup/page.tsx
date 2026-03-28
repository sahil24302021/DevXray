"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

const plans = [
  { id: "free", name: "Starter", desc: "Perfect to try DevXray", price: 0, color: "#555" },
  { id: "pro", name: "Pro", desc: "For serious hiring teams", price: 49, color: "#cdff00", popular: true },
  { id: "enterprise", name: "Enterprise", desc: "Unlimited for large teams", price: null, color: "#a78bfa" },
];

export default function SignupPage() {
  const [step, setStep] = useState<"plan" | "account">("account");
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [agreed, setAgreed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) return;
    setLoading(true);
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1400);
  };

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
  const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } } };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4 py-16" style={{ fontFamily: "var(--font-dm-sans)" }}>
      <div className="grain-overlay" />

      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, #cdff00, transparent 70%)" }} />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full opacity-[0.04]"
          style={{ background: "radial-gradient(circle, #a78bfa, transparent 70%)" }} />
      </div>

      <motion.div
        variants={stagger} initial="hidden" animate="show"
        className="relative w-full max-w-md z-10"
      >
        {/* Logo */}
        <motion.div variants={fadeUp} className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2.5 no-underline">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center pulse-glow" style={{ background: "#cdff00" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#050505" />
              </svg>
            </div>
            <span className="font-bold text-xl text-white" style={{ fontFamily: "var(--font-syne)" }}>
              Dev<span style={{ color: "#cdff00" }}>Xray</span>
            </span>
          </Link>
          <p className="text-[#555] text-sm mt-4">Create your account and start analyzing</p>
        </motion.div>

        {/* Card */}
        <motion.div variants={fadeUp} className="rounded-3xl p-8 border"
          style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>

          {/* Google SSO */}
          <button className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl border font-medium text-sm text-[#ccc] hover:text-white hover:border-white/20 transition-all duration-200 mb-6"
            style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            <span className="text-[11px] text-[#444] font-medium">or create with email</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-[11px] font-semibold text-[#666] mb-2 uppercase tracking-wider">Full Name</label>
              <input
                type="text" required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Sahil Kumar"
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] border outline-none transition-all duration-200 focus:border-[#cdff00]/50"
                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold text-[#666] mb-2 uppercase tracking-wider">Work Email</label>
              <input
                type="email" required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@company.com"
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] border outline-none transition-all duration-200 focus:border-[#cdff00]/50"
                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-semibold text-[#666] mb-2 uppercase tracking-wider">Password</label>
              <input
                type="password" required minLength={8}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min. 8 characters"
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] border outline-none transition-all duration-200 focus:border-[#cdff00]/50"
                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
              />
            </div>

            {/* Plan selector */}
            <div>
              <label className="block text-[11px] font-semibold text-[#666] mb-3 uppercase tracking-wider">Start With</label>
              <div className="grid grid-cols-3 gap-2">
                {plans.map(p => (
                  <button type="button" key={p.id} onClick={() => setSelectedPlan(p.id)}
                    className={`py-2.5 px-2 rounded-xl border text-center transition-all duration-200 ${selectedPlan === p.id ? "border-[#cdff00]/50 bg-[#cdff00]/5" : "border-white/[0.06] hover:border-white/10"}`}>
                    <div className="w-1.5 h-1.5 rounded-full mx-auto mb-1.5" style={{ background: p.color }} />
                    <span className="text-[10px] font-bold text-white block">{p.name}</span>
                    <span className="text-[9px] text-[#555]">{p.price === null ? "Custom" : p.price === 0 ? "Free" : `$${p.price}/mo`}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Terms */}
            <label className="flex items-start gap-3 cursor-pointer">
              <div className={`w-4 h-4 rounded border mt-0.5 shrink-0 flex items-center justify-center transition-all ${agreed ? "border-[#cdff00] bg-[#cdff00]" : "border-white/20"}`}
                onClick={() => setAgreed(!agreed)}>
                {agreed && (
                  <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                    <path d="M1 3.5L3.5 6L8 1" stroke="#050505" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-[12px] text-[#555] leading-relaxed">
                I agree to the{" "}
                <Link href="#" className="text-[#cdff00] hover:underline">Terms of Service</Link>
                {" "}and{" "}
                <Link href="#" className="text-[#cdff00] hover:underline">Privacy Policy</Link>
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !agreed}
              className="magnetic-btn w-full flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating account...
                </>
              ) : (
                <>
                  Create Account
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </motion.div>

        <motion.p variants={fadeUp} className="text-center text-[13px] text-[#555] mt-5">
          Already have an account?{" "}
          <Link href="/signin" className="text-[#cdff00] hover:underline font-medium">Sign in</Link>
        </motion.p>
      </motion.div>
    </div>
  );
}
