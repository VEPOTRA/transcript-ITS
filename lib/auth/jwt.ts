/**
 * JWT utilities using `jose`.
 *
 * `jose` is the ONLY JWT library that works on the Next.js Edge Runtime
 * used by middleware. Do NOT replace this with `jsonwebtoken` — that package
 * uses Node.js crypto APIs unavailable in the Edge Runtime.
 *
 * These functions are pure (no Next.js context) so they're safe to import
 * in both middleware and server components/actions.
 */

import { SignJWT, jwtVerify } from "jose";
import { JWT_SECRET, TOKEN_EXPIRY, REFRESH_THRESHOLD_MS } from "./config";
import type { AuthenticatedAdmin, SessionPayload } from "@/types/auth";

// Encode the secret once. The TextEncoder is available on all runtimes.
function getEncodedSecret(): Uint8Array {
  if (JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long.");
  }
  return new TextEncoder().encode(JWT_SECRET);
}

/**
 * Sign a JWT containing the session payload.
 * The token is HS256 signed with JWT_SECRET.
 */
export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    adminId: payload.adminId,
    email: payload.email,
    role: payload.role,
    campusIds: JSON.stringify(
      Array.isArray(payload.campusIds) ? payload.campusIds : [],
    ),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.adminId)
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getEncodedSecret());
}

/**
 * Verify and decode a JWT.
 *
 * Returns null for any invalid token (expired, tampered, wrong algorithm)
 * rather than throwing, so callers don't need try/catch.
 */
export async function verifyToken(
  token: string,
): Promise<AuthenticatedAdmin | null> {
  try {
    const { payload } = await jwtVerify(token, getEncodedSecret(), {
      algorithms: ["HS256"],
    });

    // Narrow the payload to our expected shape.
    // jwtVerify already validates exp, nbf, etc.
    if (
      typeof payload.adminId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }

    return {
      adminId: payload.adminId,
      email: payload.email,
      role: payload.role as AuthenticatedAdmin["role"],
      campusIds: (() => {
        if (typeof payload.campusIds !== "string") return "[]";
        try {
          const campusIds: unknown = JSON.parse(payload.campusIds);
          return JSON.stringify(
            Array.isArray(campusIds) &&
              campusIds.every((id): id is string => typeof id === "string")
              ? campusIds
              : [],
          );
        } catch {
          return "[]";
        }
      })(),
      iat: payload.iat!,
      exp: payload.exp!,
    };
  } catch {
    // Covers: JWTExpired, JWTInvalid, JWSSignatureVerificationFailed, etc.
    return null;
  }
}

/**
 * Returns true if the token will expire within REFRESH_THRESHOLD_MS.
 * Used by middleware to silently refresh sessions.
 */
export function isTokenExpiringSoon(exp: number): boolean {
  const msRemaining = exp * 1000 - Date.now();
  return msRemaining < REFRESH_THRESHOLD_MS;
}
