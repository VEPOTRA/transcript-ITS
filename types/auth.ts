/**
 * types/auth.ts — Shared auth types.
 *
 * Do not widen or redefine these elsewhere in the codebase.
 */

export type Role = "SUPER_ADMIN" | "ADMIN" | "VIEWER";

/**
 * The minimal payload signed into the JWT.
 * Keep this small — it lives in every request cookie.
 */
export type SessionPayload = {
  adminId: string;
  email: string;
  role: Role;
  campusIds: string[]; // empty array = SUPER_ADMIN (unrestricted); 1+ = campus-restricted
};

/**
 * The decoded, verified session including standard JWT claims.
 * Returned by verifyToken and getSession.
 */
export type AuthenticatedAdmin = SessionPayload & {
  iat: number;
  exp: number;
};

/**
 * Shape returned by server actions.
 * Compatible with React 19 useActionState.
 */
export type ActionState<T = unknown> =
  | { status: "idle" }
  | {
      status: "error";
      error: string;
      fieldErrors?: Partial<Record<string, string[]>>;
    }
  | { status: "success"; data?: T };
