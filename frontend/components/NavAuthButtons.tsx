"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function NavAuthButtons() {
  const [userName, setUserName] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const matchName = document.cookie.match(/(^| )user_name=([^;]+)/);
    const matchSession = document.cookie.match(/(^| )user_session=([^;]+)/);
    
    if (matchSession && matchSession[2]) {
      setHasSession(true);
      setUserName(matchName && matchName[2] ? decodeURIComponent(matchName[2]) : "Developer");
    }
  }, []);

  if (hasSession) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm font-[family-name:var(--font-space)] text-[#888]">
          Welcome, {userName}
        </span>
        <Link 
          href="/dashboard"
          className="text-[12px] px-4 py-2 rounded-full border border-[rgba(255,255,255,0.06)] bg-white/[0.02] text-white hover:text-[#cdff00] hover:border-[rgba(205,255,0,0.3)] transition-all duration-300 font-[family-name:var(--font-space)] font-medium tracking-widest uppercase"
        >
          Dashboard
        </Link>
        <form action="/api/auth/logout" method="POST">
          <button 
            type="submit"
            className="text-[12px] px-4 py-2 rounded-full border border-transparent hover:bg-white/[0.05] text-[#666] hover:text-white transition-all duration-300 font-[family-name:var(--font-space)] font-medium tracking-widest uppercase"
          >
            Sign Out
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <Link
        href="/signin"
        className="text-[12px] px-4 py-2 rounded-full border border-transparent hover:bg-white/[0.05] text-[#888] hover:text-white transition-colors duration-300 font-[family-name:var(--font-space)] font-medium tracking-widest uppercase"
      >
        Sign in
      </Link>
      <Link
        href="/signup"
        className="text-[12px] px-4 py-2 rounded-full bg-[#cdff00] text-[#050505] hover:bg-[#b0e600] hover:shadow-[0_0_15px_rgba(205,255,0,0.3)] transition-all duration-300 font-[family-name:var(--font-space)] font-bold tracking-widest uppercase"
      >
        Get Started
      </Link>
    </div>
  );
}
