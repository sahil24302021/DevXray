import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// ✅ These routes are PUBLIC — anyone can visit without being logged in
const isPublicRoute = createRouteMatcher([
  "/",                // Landing page
  "/signin(.*)",      // Custom sign-in page
  "/signup(.*)",      // Custom sign-up page
  "/about(.*)",
  "/pricing(.*)",
  "/api/health(.*)",
  // ⚠️ Remove the line below if you want reports to require login
  "/report/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // If route is NOT public → force login
  if (!isPublicRoute(req)) {
    // If no Clerk keys configured, allow all (dev mode)
    const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (!key || key.includes("your_") || key === "pk_test_your_key_here") {
      return NextResponse.next();
    }
    // Protect the route using Clerk's standard redirect logic
    // Clerk will redirect to NEXT_PUBLIC_CLERK_SIGN_IN_URL (/signin) NOT to clerk.com
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
