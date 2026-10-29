"use server";

/**
 * actions/auth.ts — Authentication server actions.
 *
 * loginAction         — validates credentials, enforces rate limiting, creates session
 * logoutAction        — clears session cookie, logs to audit
 * changePasswordAction — lets admins change their own password
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  comparePassword,
  hashPassword,
  DUMMY_HASH,
} from "@/lib/auth/passwords";
import { createSession, clearSession, getSession } from "@/lib/auth/session";
import { logAuditEvent, extractRequestMeta } from "@/lib/audit";
import { rateLimit, clearRateLimit, loginRateLimitKey } from "@/lib/rate-limit";
import type { ActionState } from "@/types/auth";

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { status: "error", error: "Email and password are required." };
  }

  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    "unknown";

  // ── Rate limit: 5 attempts per 15 minutes per IP ──────────────────────────
  const limit = await rateLimit(loginRateLimitKey(ip), {
    max: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!limit.allowed) {
    return {
      status: "error",
      error: `Too many login attempts. Please wait ${limit.retryAfterSeconds} seconds before trying again.`,
    };
  }

  // ── Fetch admin ───────────────────────────────────────────────────────────
  let admin: typeof admins.$inferSelect | undefined;
  try {
    const rows = await db
      .select()
      .from(admins)
      .where(eq(admins.email, email))
      .limit(1);
    admin = rows[0];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Give a helpful message for common DB errors
    if (
      msg.includes("ECONNREFUSED") ||
      String(err).includes("AggregateError")
    ) {
      return {
        status: "error",
        error:
          "Cannot connect to the database. Check that PostgreSQL is running and DATABASE_URL is correct.",
      };
    }
    return {
      status: "error",
      error: "A database error occurred. Please try again.",
    };
  }

  // Timing-safe: always run bcrypt even when no user found
  const hashToCompare = admin?.password ?? DUMMY_HASH;
  const passwordMatch = await comparePassword(password, hashToCompare);

  if (!admin || !passwordMatch) {
    return { status: "error", error: "Invalid email or password." };
  }

  if (!admin.isActive) {
    return {
      status: "error",
      error: "This account has been disabled. Contact a system administrator.",
    };
  }

  // ── Success — clear rate limit and create session ─────────────────────────
  await clearRateLimit(loginRateLimitKey(ip));

  // Load campus IDs from the junction table — dynamic import so a missing
  // table or un-updated schema.ts never prevents login.
  let campusIds: string[] = [];
  try {
    const { adminCampuses } = await import("@/db/schema");
    if (adminCampuses) {
      const campusRows = await db
        .select({ campusId: adminCampuses.campusId })
        .from(adminCampuses)
        .where(eq(adminCampuses.adminId, admin.id));
      campusIds = campusRows.map((r) => r.campusId);
    }
  } catch {
    if (admin.role !== "SUPER_ADMIN") {
      console.error(
        "[login] admin_campuses is unavailable; refusing unrestricted login for a campus-scoped account.",
      );
      return {
        status: "error",
        error: "Campus access is not configured. Contact a Super Admin.",
      };
    }
  }

  await createSession({
    adminId: admin.id,
    email: admin.email,
    role: admin.role,
    campusIds,
  });

  await logAuditEvent({
    adminId: admin.id,
    action: "LOGIN",
    entity: "admins",
    entityId: admin.id,
    after: { email: admin.email, role: admin.role },
    ...extractRequestMeta(headerStore),
  });

  redirect("/dashboard");
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    const headerStore = await headers();
    await logAuditEvent({
      adminId: session.adminId,
      action: "LOGOUT",
      entity: "admins",
      entityId: session.adminId,
      ...extractRequestMeta(headerStore),
    }).catch(() => {}); // Non-fatal
  }
  await clearSession();
  redirect("/login");
}

// ─── Change password ──────────────────────────────────────────────────────────

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "New password must be different from your current password",
    path: ["newPassword"],
  });

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { status: "error", error: "Not authenticated." };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      error: parsed.error.issues[0].message,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { currentPassword, newPassword } = parsed.data;

  // Fetch and verify current password
  const [admin] = await db
    .select({ id: admins.id, password: admins.password })
    .from(admins)
    .where(eq(admins.id, session.adminId))
    .limit(1);

  if (!admin) return { status: "error", error: "Account not found." };

  const valid = await comparePassword(currentPassword, admin.password);
  if (!valid)
    return { status: "error", error: "Current password is incorrect." };

  const hashed = await hashPassword(newPassword);
  await db
    .update(admins)
    .set({ password: hashed })
    .where(eq(admins.id, session.adminId));

  const headerStore = await headers();
  await logAuditEvent({
    adminId: session.adminId,
    action: "UPDATE_ADMIN",
    entity: "admins",
    entityId: session.adminId,
    after: { passwordChanged: true },
    ...extractRequestMeta(headerStore),
  });

  return { status: "success" };
}
