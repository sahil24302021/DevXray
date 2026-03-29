"use client";

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmail, signInWithGoogle, getCurrentUser } from "@/lib/auth";

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Redirect if already signed in
  useEffect(() => {
    getCurrentUser().then((user) => {
      if (user) router.replace(redirect);
    });
  }, [router, redirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: authError } = await signInWithEmail(email, password);

    if (authError) {
      setError(authError);
      setLoading(false);
      return;
    }

    router.push(redirect);
  };

  const handleGoogle = async () => {
    setLoading(true);
    const { error: authError } = await signInWithGoogle();
    if (authError) {
      setError(authError);
      setLoading(false);
    }
    // Google redirects automatically
  };

  return (
    <main className="min-h-screen bg-[#050505] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="grain-overlay" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#cdff00]/[0.03] blur-[120px] rounded-full mix-blend-screen pointer-events-none" />

      {/* Logo + back link */}
      <div className="absolute top-6 left-8">
        <Link href="/" className="flex items-center gap-2 text-[#cdff00] hover:opacity-80 transition-opacity">
          <div className="w-7 h-7 rounded-lg bg-[#cdff00] flex items-center justify-center">
            <span className="text-[#050505] font-black text-sm">D</span>
          </div>
          <span className="font-bold text-white text-sm font-[family-name:var(--font-syne)]">DevXray</span>
        </Link>
      </div>

      <div className="relative z-10 w-full max-w-sm px-4">
        <div className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-[family-name:var(--font-syne)] font-bold text-white mb-2">
              Welcome back
            </h1>
            <p className="text-[#666] text-sm">Sign in to your DevXray account</p>
          </div>

          {/* Google sign-in */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white/[0.05] border border-[#333] rounded-xl px-4 py-3 text-white hover:bg-white/[0.08] transition-colors mb-6 disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#222]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#0a0a0a] px-3 text-[#555]">or continue with email</span>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-[#888] uppercase tracking-wider mb-1.5 font-[family-name:var(--font-space)]">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="dev@example.com"
                className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-3 text-white placeholder-[#444] focus:outline-none focus:border-[#cdff00]/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs text-[#888] uppercase tracking-wider mb-1.5 font-[family-name:var(--font-space)]">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-3 text-white placeholder-[#444] focus:outline-none focus:border-[#cdff00]/50 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#cdff00] text-[#050505] font-bold rounded-xl px-4 py-3 hover:bg-[#b0e600] transition-colors mt-2 disabled:opacity-50 font-[family-name:var(--font-space)]"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="text-center text-[#555] text-sm mt-6">
            No account?{" "}
            <Link href="/signup" className="text-[#cdff00] hover:underline">
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050505]" />}>
      <SignInContent />
    </Suspense>
  );
}
