/**
 * Next.js Edge Middleware — route protection and session refresh.
 *
 * Runs on the Edge Runtime (V8 isolates, not Node.js).
 * Only import Edge-compatible modules here:
 *  ✅ jose           — JWT verify
 *  ✅ lib/auth/jwt   — signToken, verifyToken (uses jose)
 *  ✅ lib/auth/config — plain constants
 *  ❌ bcryptjs       — uses Node.js crypto APIs
 *  ❌ lib/auth/session — imports next/headers (Node.js only)
 *  ❌ drizzle / db   — database connections are not edge-compatible
 *
 * Route guard order:
 *  1. Auth route + authenticated → redirect to /dashboard
 *  2. Protected route + unauthenticated → redirect to /login?callbackUrl=...
 *  3. SUPER_ADMIN route + insufficient role → redirect to /unauthorized
 *  4. Authenticated + token expiring soon → silently refresh token
 */

import { type NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  COOKIE_OPTIONS,
  AUTH_ROUTES,
  PROTECTED_PREFIXES,
  SUPER_ADMIN_PREFIXES,
} from "@/lib/auth/config";
import { verifyToken, signToken, isTokenExpiringSoon } from "@/lib/auth/jwt";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ─── Classify the route ──────────────────────────────────────────────────

  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  const isProtectedRoute = PROTECTED_PREFIXES.some((r) =>
    pathname.startsWith(r),
  );
  const isSuperAdminRoute = SUPER_ADMIN_PREFIXES.some((r) =>
    pathname.startsWith(r),
  );

  // ─── Resolve session ─────────────────────────────────────────────────────

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  const isAuthenticated = session !== null;

  // ─── Guard: redirect authenticated users away from /login ────────────────

  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ─── Guard: redirect unauthenticated users to /login ─────────────────────

  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the intended destination so we can redirect back after login.
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ─── Guard: SUPER_ADMIN only routes ──────────────────────────────────────

  if (isSuperAdminRoute && isAuthenticated && session.role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  // ─── Pass through for unauthenticated public routes ───────────────────────

  if (!isAuthenticated) {
    return NextResponse.next();
  }

  // ─── Silent token refresh ─────────────────────────────────────────────────
  //
  // If the token is valid but expiring within REFRESH_THRESHOLD_MS,
  // issue a fresh token and set it on the response.
  // The user never sees a session expiry mid-task.

  const response = NextResponse.next({
    request: {
      headers: new Headers({
        ...Object.fromEntries(request.headers.entries()),
        "x-invoke-path": pathname,
      }),
    },
  });

  if (isTokenExpiringSoon(session.exp)) {
    try {
      const freshToken = await signToken({
        adminId: session.adminId,
        email: session.email,
        role: session.role,
        campusIds: session.campusIds ?? [],
      });
      response.cookies.set(COOKIE_NAME, freshToken, COOKIE_OPTIONS);
    } catch (err) {
      // Refresh failure is non-fatal — the user will be logged out
      // when the original token expires naturally.
      console.error("[middleware] Token refresh failed:", err);
    }
  }

  return response;
}

/**
 * Matcher: run middleware on all routes except Next.js internals
 * and static file serving.
 *
 * Excluded:
 *  - _next/static  — JS/CSS bundles
 *  - _next/image   — image optimisation responses
 *  - favicon.ico   — browser default request
 *  - public/       — static assets (images, fonts, etc.)
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
