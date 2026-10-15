"use server";

/**
 * setupAdminAction — creates the first SUPER_ADMIN.
 *
 * Security:
 *   - Aborts immediately if any admin already exists.
 *     This means even if someone finds the /setup URL after setup,
 *     they cannot create additional admins through it.
 *   - Password is bcrypt-hashed (12 rounds) before storage.
 *   - Field-level validation via Zod.
 */

// import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { hashPassword } from "@/lib/auth/passwords";
import type { ActionState } from "@/types/auth";

const schema = z
  .object({
    name: z.string().min(1, "Full name is required"),
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    campusId: z.string().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function setupAdminAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // ── Hard lock: abort if any admin already exists ──────────────────────────
  const existing = await db.select({ id: admins.id }).from(admins).limit(1);
  if (existing.length > 0) {
    return {
      status: "error",
      error:
        "Setup is locked — an admin account already exists. Go to /login to sign in.",
    };
  }

  // ── Validate inputs ───────────────────────────────────────────────────────
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    campusId: formData.get("campusId") || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { email, password } = parsed.data;

  // ── Hash password ─────────────────────────────────────────────────────────
  let hashed: string;
  try {
    hashed = await hashPassword(password);
  } catch {
    return {
      status: "error",
      error: "Password hashing failed. Please try again.",
    };
  }

  // ── Insert admin ──────────────────────────────────────────────────────────
  try {
    await db.insert(admins).values({
      email: email.toLowerCase().trim(),
      password: hashed,
      role: "SUPER_ADMIN",
      isActive: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return {
        status: "error",
        error: "An account with this email already exists.",
      };
    }
    return {
      status: "error",
      error: "Failed to create account. Check your database connection.",
    };
  }

  return { status: "success" };
}
