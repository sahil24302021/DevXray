"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

// Clerk imports — graceful fallback if not installed or configured
// We use a wrapper hook because useUser() throws during SSG when
// ClerkProvider is missing (build-time static generation).
let _clerkUseUser: (() => { user: any; isLoaded: boolean }) | null = null;
let SignOutButton: any = null;
try {
  const clerk = require("@clerk/nextjs");
  _clerkUseUser = clerk.useUser;
  SignOutButton = clerk.SignOutButton;
} catch {}

function useSafeUser(): { user: any; isLoaded: boolean } {
  try {
    if (_clerkUseUser) return _clerkUseUser();
  } catch {
    // ClerkProvider not mounted (SSG / dev without keys)
  }
  return { user: null, isLoaded: true };
}

// ── Icons ──────────────────────────────────
const Icon = {
  Grid: () => (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  Upload: () => (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Users: () => (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" />
    </svg>
  ),
  Compare: () => (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M12 8v8M8 12h8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Info: () => (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
    </svg>
  ),
  Settings: () => (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Logout: () => (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Menu: () => (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
    </svg>
  ),
  X: () => (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  ),
  Lightning: () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="#050505">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
};

const navItems = [
  { label: "Overview", href: "/dashboard", icon: <Icon.Grid /> },
  { label: "Bulk Upload", href: "/bulk-upload", icon: <Icon.Upload />, badge: "NEW", pro: false },
  { label: "Candidates", href: "/candidates", icon: <Icon.Users /> },
  { label: "Compare", href: "/compare", icon: <Icon.Compare /> },
  { label: "How We Score", href: "/how-we-score", icon: <Icon.Info /> },
  { label: "Settings", href: "/settings", icon: <Icon.Settings /> },
];

const PLAN_COLORS: Record<string, string> = {
  free: "#555",
  pro: "#cdff00",
  enterprise: "#a78bfa",
};

interface SidebarProps {
  plan?: "free" | "pro" | "enterprise";
  userName?: string;
  userEmail?: string;
  scansUsed?: number;
  scansLimit?: number;
}

export default function DashboardSidebar({
  plan = "pro",
  userName: defaultName = "Developer",
  userEmail: defaultEmail = "",
  scansUsed: propScansUsed,
  scansLimit = 100,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Clerk user info (graceful fallback)
  const { user, isLoaded } = useSafeUser();
  const displayName = user?.fullName || user?.firstName || defaultName;
  const displayEmail = user?.primaryEmailAddress?.emailAddress || defaultEmail;

  // Real scan counter from localStorage
  const [scansUsed, setScansUsed] = useState(propScansUsed ?? 0);
  useEffect(() => {
    if (propScansUsed !== undefined) return; // prop overrides
    const stored = parseInt(localStorage.getItem("devxray_scans_used") || "0", 10);
    setScansUsed(stored);
    // Listen for storage changes from other tabs
    const handler = () => {
      setScansUsed(parseInt(localStorage.getItem("devxray_scans_used") || "0", 10));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [propScansUsed]);

  const usedPct = Math.round((scansUsed / scansLimit) * 100);


  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`px-4 py-5 flex items-center gap-3 border-b border-white/[0.05] ${collapsed ? "justify-center" : ""}`}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#cdff00" }}>
          <Icon.Lightning />
        </div>
        {!collapsed && (
          <span className="font-bold text-[15px] text-white tracking-tight" style={{ fontFamily: "var(--font-syne)" }}>
            Dev<span style={{ color: "#cdff00" }}>Xray</span>
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto text-[#555] hover:text-[#cdff00] transition-colors hidden lg:flex"
        >
          <Icon.Menu />
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {!collapsed && (
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#333] px-3 pt-3 pb-2">
            Main Menu
          </p>
        )}
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group no-underline ${
                active
                  ? "bg-[#cdff00]/10 text-[#cdff00] border border-[#cdff00]/20"
                  : "text-[#666] hover:text-[#aaa] hover:bg-white/[0.03]"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <span className={`shrink-0 transition-colors ${active ? "text-[#cdff00]" : "group-hover:text-[#888]"}`}>
                {item.icon}
              </span>
              {!collapsed && (
                <span className="text-[13px] font-medium flex-1">{item.label}</span>
              )}
              {!collapsed && item.badge && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(205,255,0,0.15)", color: "#cdff00" }}>
                  {item.badge}
                </span>
              )}
              {!collapsed && item.pro && plan === "free" && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
                  PRO
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Usage quota */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-white/[0.05]">
          <div className="rounded-xl p-3" style={{ background: "rgba(205,255,0,0.04)", border: "1px solid rgba(205,255,0,0.1)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-[#666]">Monthly Scans</span>
              <span className="text-[11px] font-bold" style={{ color: usedPct > 80 ? "#fb7185" : "#cdff00" }}>
                {scansUsed}/{scansLimit}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${usedPct}%`,
                  background: usedPct > 80 ? "#fb7185" : "#cdff00",
                }}
              />
            </div>
            {usedPct > 70 && plan === "free" && (
              <Link href="/pricing" className="mt-2 text-[10px] no-underline font-semibold block text-center py-1.5 rounded-lg transition-all"
                style={{ background: "rgba(205,255,0,0.1)", color: "#cdff00" }}>
                Upgrade to Pro
              </Link>
            )}
          </div>
        </div>
      )}

      {/* User footer */}
      <div className={`px-4 py-4 border-t border-white/[0.05] flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
        <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-bold text-[11px] text-[#050505]"
          style={{ background: PLAN_COLORS[plan] || "#cdff00" }}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-white truncate">{displayName}</p>
            <p className="text-[10px] text-[#555] truncate">{displayEmail || "devxray.ai"}</p>
          </div>
        )}
        {!collapsed && (
          SignOutButton && user ? (
            <SignOutButton>
              <button className="text-[#444] hover:text-[#fb7185] transition-colors">
                <Icon.Logout />
              </button>
            </SignOutButton>
          ) : (
            <Link href="/signin" className="text-[#444] hover:text-[#fb7185] transition-colors no-underline">
              <Icon.Logout />
            </Link>
          )
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 w-9 h-9 rounded-xl flex items-center justify-center border"
        style={{ background: "rgba(5,5,5,0.9)", borderColor: "rgba(255,255,255,0.08) " }}>
        <Icon.Menu />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
          <div
            className="w-64 h-full"
            style={{ background: "#0a0a0a", borderRight: "1px solid rgba(255,255,255,0.06)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 text-[#555] hover:text-white">
              <Icon.X />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col h-screen sticky top-0 shrink-0 transition-all duration-300"
        style={{
          width: collapsed ? "64px" : "220px",
          background: "#0a0a0a",
          borderRight: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
