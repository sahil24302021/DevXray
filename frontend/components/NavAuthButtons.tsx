"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, signOut, onAuthStateChange, type AuthUser } from "@/lib/auth";

export default function NavAuthButtons() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    getCurrentUser().then((u) => {
      setUser(u);
      setLoading(false);
    });

    const unsubscribe = onAuthStateChange((u) => {
      setUser(u);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    router.push("/");
    router.refresh();
  };

  if (loading) {
    return <div className="w-32 h-8 bg-white/[0.04] rounded-full animate-pulse" />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Greeting — hidden on very small screens */}
        <span className="hidden sm:block text-sm font-[family-name:var(--font-space)] text-[#888]">
          Hi, <span className="text-white">{user.firstName}</span>
        </span>

        {/* Dashboard — subtle ghost link */}
        <Link
          href="/dashboard"
          className="hidden sm:inline-flex text-[11px] px-3 py-1.5 rounded-full border border-white/[0.08] text-[#666] hover:text-[#cdff00] hover:border-[#cdff00]/30 transition-all duration-300 font-[family-name:var(--font-space)] tracking-widest uppercase whitespace-nowrap"
        >
          Dashboard
        </Link>

        {/* Sign Out */}
        <button
          onClick={handleSignOut}
          className="hidden sm:block text-[11px] px-3 py-1.5 rounded-full border border-transparent hover:bg-white/[0.05] text-[#555] hover:text-white transition-all duration-300 font-[family-name:var(--font-space)] tracking-widest uppercase whitespace-nowrap"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-3">
      <Link
        href="/signin"
        className="hidden sm:inline-block text-[12px] px-3 sm:px-4 py-2 rounded-full border border-transparent hover:bg-white/[0.05] text-[#888] hover:text-white transition-colors duration-300 font-[family-name:var(--font-space)] font-medium tracking-widest uppercase whitespace-nowrap"
      >
        Sign In
      </Link>
      <Link
        href="/signup"
        className="text-[10px] sm:text-[12px] px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-[#cdff00] text-[#050505] hover:bg-[#b0e600] hover:shadow-[0_0_15px_rgba(205,255,0,0.3)] transition-all duration-300 font-[family-name:var(--font-space)] font-bold tracking-widest uppercase whitespace-nowrap"
      >
        Get Started
      </Link>
    </div>
  );
}