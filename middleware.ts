import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/signin(.*)",
  "/signup(.*)",
  "/about(.*)",
  "/pricing(.*)",
  "/api/health(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    // If no Clerk keys configured, allow all (dev mode)
    const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (!key || key.includes("your_") || key === "pk_test_your_key_here") {
      return NextResponse.next();
    }
    try {
      await auth.protect();
    } catch {
      // If Clerk auth fails (e.g., misconfigured), allow through in dev
      if (process.env.NODE_ENV === "development") {
        return NextResponse.next();
      }
      throw new Error("Unauthorized");
    }
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
