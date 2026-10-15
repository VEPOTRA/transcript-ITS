/**
 * Central auth configuration — production-ready.
 *
 * All cookie names, expiry values, route lists, and bcrypt settings live here.
 * Change once, applies everywhere.
 */

if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error(
    "JWT_SECRET environment variable is required in production. " +
      "Generate one with: openssl rand -base64 64",
  );
}

// ─── Token ────────────────────────────────────────────────────────────────────

export const JWT_SECRET =
  process.env.JWT_SECRET ?? "dev-secret-do-not-use-in-production-min-32chars!!";
export const TOKEN_EXPIRY = "8h" as const;
export const TOKEN_EXPIRY_MS = 8 * 60 * 60 * 1000;
export const REFRESH_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// ─── Cookie ───────────────────────────────────────────────────────────────────

export const COOKIE_NAME = "tms_session" as const;

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: TOKEN_EXPIRY_MS / 1000,
} as const;

// ─── Bcrypt ───────────────────────────────────────────────────────────────────

export const BCRYPT_ROUNDS = 12;

// ─── Routes ───────────────────────────────────────────────────────────────────

export const AUTH_ROUTES = [
  "/login",
  "/forgot-password",
  "/reset-password",
] as const;

export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/students",
  "/grades",
  "/transcripts",
  "/bulk",
  "/admin",
  "/audit",
  "/programmes",
  "/courses",
  "/semesters",
  "/templates",
  "/profile", // ← password change page
] as const;

export const SUPER_ADMIN_PREFIXES = ["/admin"] as const;
