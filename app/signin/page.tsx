"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

export default function SignInPage() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Auth → redirect to dashboard
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1200);
  };

  return (
    <main className="min-h-screen bg-[#050505] text-[#fafafa] font-[family-name:var(--font-dm-sans)] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Grain */}
      <div className="grain-overlay" />

      {/* Floating Blobs */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#cdff00]/[0.03] blur-[120px] rounded-full mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#cdff00]/[0.02] blur-[100px] rounded-full mix-blend-screen pointer-events-none" />

      {/* Back link */}
      <Link href="/" className="absolute top-8 left-8 text-[#888] hover:text-white transition-colors flex items-center gap-2 text-sm font-medium z-20">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Home
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-3 no-underline group mb-8">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 shadow-[0_0_20px_rgba(205,255,0,0.2)]"
              style={{ background: "#cdff00" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
                  fill="#050505"
                />
              </svg>
            </div>
          </Link>
          <h1 className="font-[family-name:var(--font-syne)] font-extrabold text-3xl md:text-4xl text-white tracking-tight mb-3">
            Welcome back
          </h1>
          <p className="text-[#888] font-light">
            Sign in to access your intelligence reports.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[11px] font-[family-name:var(--font-space)] text-[#888] uppercase tracking-widest pl-1">Work Email</label>
            <input
              type="email"
              required
              placeholder="name@company.com"
              className="w-full bg-[#0a0a0a] border border-[rgba(255,255,255,0.06)] focus:border-[rgba(205,255,0,0.4)] text-white rounded-xl px-5 py-4 outline-none transition-all placeholder:text-[#444]"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between pl-1 pt-2">
              <label className="text-[11px] font-[family-name:var(--font-space)] text-[#888] uppercase tracking-widest">Password</label>
              <a href="#" className="text-[11px] font-[family-name:var(--font-space)] text-[#cdff00] hover:text-white transition-colors">Forgot?</a>
            </div>
            <input
              type="password"
              required
              placeholder="••••••••"
              className="w-full bg-[#0a0a0a] border border-[rgba(255,255,255,0.06)] focus:border-[rgba(205,255,0,0.4)] text-white rounded-xl px-5 py-4 outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full relative group overflow-hidden rounded-xl bg-[#cdff00] text-[#050505] font-bold h-14 mt-6 flex items-center justify-center transition-all disabled:opacity-70"
          >
            {loading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-5 h-5 border-2 border-[#050505]/30 border-t-[#050505] rounded-full"
              />
            ) : (
              <span className="relative z-10 font-[family-name:var(--font-dm-sans)] text-[15px]">Sign In</span>
            )}
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          </button>
        </form>

        {/* Google SSO */}
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            <span className="text-[11px] text-[#444]">or continue with</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>
          <button className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl border font-medium text-sm text-[#ccc] hover:text-white hover:border-white/20 transition-all duration-200"
            style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </div>
        <div className="mt-6 text-center">
          <p className="text-[#666] text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-[#cdff00] hover:underline font-medium no-underline">Create account</Link>
          </p>
        </div>
      </motion.div>
    </main>
  );
}
