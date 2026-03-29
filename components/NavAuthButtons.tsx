"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// Graceful Clerk import — won't crash if Clerk not configured
let _useAuth: (() => { isSignedIn: boolean | undefined; isLoaded: boolean }) | null = null;
let _useUser: (() => { user: any; isLoaded: boolean }) | null = null;
let UserButton: any = null;
try {
  const clerk = require("@clerk/nextjs");
  _useAuth = clerk.useAuth;
  _useUser = clerk.useUser;
  UserButton = clerk.UserButton;
} catch {}

/**
 * Drop this component into the landing page nav to get:
 * - Not logged in: "Sign in" link + "Get Started" button → /signin
 * - Logged in: User's name/avatar + "Dashboard" button → /dashboard
 *
 * USAGE in app/page.tsx nav section:
 *   Replace the existing <div className="flex items-center gap-4"> block with:
 *   <NavAuthButtons />
 */
export default function NavAuthButtons() {
  const router = useRouter();

  // Try to use Clerk — fallback to "not signed in"
  let isSignedIn = false;
  let isLoaded = true;
  let user: any = null;

  try {
    if (_useAuth) {
      const auth = _useAuth();
      isSignedIn = auth.isSignedIn ?? false;
      isLoaded = auth.isLoaded;
    }
    if (_useUser) {
      const u = _useUser();
      user = u.user;
    }
  } catch {}

  // Show nothing until Clerk loads — prevents flash of wrong state
  if (!isLoaded) return null;

  if (isSignedIn && user) {
    // ── Logged-in state ──
    const firstName = user?.firstName || user?.fullName?.split(" ")[0] || "Dashboard";
    return (
      <div className="flex items-center gap-4">
        <span className="hidden sm:inline text-[12px] font-[family-name:var(--font-space)] font-medium text-[#cdff00] tracking-wide">
          Hey, {firstName} 👋
        </span>
        <button
          onClick={() => router.push("/dashboard")}
          className="btn-primary !py-2.5 !px-5 !text-[11px]"
        >
          Dashboard
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  // ── Logged-out state ──
  return (
    <div className="flex items-center gap-4">
      <Link
        href="/signin"
        className="hidden sm:inline text-[12px] font-[family-name:var(--font-space)] font-medium text-[#666] hover:text-white transition-colors duration-300 no-underline tracking-wide"
      >
        Sign in
      </Link>
      <Link
        href="/signup"
        className="btn-primary !py-2.5 !px-5 !text-[11px]"
      >
        Get Started
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}
