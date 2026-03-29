import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicRoutes = ['/', '/signin', '/signup', '/about', '/pricing'];
const isPublicRoute = (path: string) => {
  if (publicRoutes.includes(path)) return true;
  if (path.startsWith('/report/')) return true; // Keep report public if desired, or make it protected? User said "put a a github profile... click enter... open login or create page". Let's protect /report.
  return false;
};

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith('/signin') || path.startsWith('/signup');
  const hasSession = request.cookies.has('user_session');

  // If hitting the root or generic public pages
  if (path === '/' || path === '/about' || path === '/pricing') {
    return NextResponse.next();
  }

  // Redirect to dashboard if logged in and trying to access auth pages
  if (isAuthPage && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Require auth for anything not explicitly public or auth page
  if (!isAuthPage && !hasSession) {
    // User requested analyzing github/resume should go to auth
    return NextResponse.redirect(new URL('/signin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};