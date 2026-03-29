import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// ✅ These routes are PUBLIC — anyone can visit without being logged in
const isPublicRoute = createRouteMatcher([
  "/",                // Landing page
  "/signin(.*)",      // Custom sign-in page
  "/signup(.*)",      // Custom sign-up page
  "/about(.*)",
  "/pricing(.*)",
  // ⚠️ Remove the line below if you want reports to require login
  "/report/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // If route is NOT public → force login
  // Clerk will redirect to NEXT_PUBLIC_CLERK_SIGN_IN_URL (/signin) NOT to clerk.com
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
