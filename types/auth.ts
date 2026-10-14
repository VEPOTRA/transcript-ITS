/**
 * Shared auth types.
 * Derived from the roleEnum in the Drizzle schema — kept in sync manually.
 * Do not widen or redefine this type elsewhere in the codebase.
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
  campusIds: string | null;
};

/**
 * The decoded, verified session including standard JWT claims.
 * Returned by verifyToken and getSession.
 */
export type AuthenticatedAdmin = SessionPayload & {
  iat: number;
  exp: number;
  campusIds: string | null;
};

/**
 * Shape returned by server actions that can fail with validation errors.
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
