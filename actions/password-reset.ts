"use server";

/**
 * actions/password-reset.ts
 *
 * requestPasswordResetAction — validates email, creates token, sends email
 * resetPasswordAction        — validates token, updates password, deletes token
 */

import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { admins, passwordResetTokens } from "@/db/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/passwords";
import { sendEmail, passwordResetEmailHTML } from "@/lib/email";
import type { ActionState } from "@/types/auth";

const EXPIRY_MINUTES = 60; // token valid for 60 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateToken(): string {
  return randomBytes(48).toString("hex"); // 96 char hex = 384 bits entropy
}

// ─── Request reset ────────────────────────────────────────────────────────────

const requestSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
});

export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = requestSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { status: "error", error: parsed.error.issues[0].message };
  }

  const email = parsed.data.email.toLowerCase().trim();

  // ── Find admin ─────────────────────────────────────────────────────────────
  // Always return success even if email not found — prevents email enumeration
  let admin: { id: string; email: string; isActive: boolean } | undefined;
  try {
    [admin] = await db
      .select({
        id: admins.id,
        email: admins.email,
        isActive: admins.isActive,
      })
      .from(admins)
      .where(eq(admins.email, email))
      .limit(1);
  } catch (err) {
    console.error("[requestPasswordReset] Admin lookup failed:", err);
    return {
      status: "error",
      error:
        "Password reset is temporarily unavailable because the account database could not be reached. Please contact your administrator.",
    };
  }

  // If no admin found or inactive — still return success (security: don't reveal if email exists)
  if (!admin || !admin.isActive) {
    return {
      status: "success",
      // Generic message — same as the real success so you can't distinguish
    };
  }

  // ── Delete any existing unused tokens for this admin ─────────────────────
  await db
    .delete(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.adminId, admin.id),
        isNull(passwordResetTokens.usedAt),
      ),
    );

  // ── Generate and store new token ──────────────────────────────────────────
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);

  await db.insert(passwordResetTokens).values({
    adminId: admin.id,
    tokenHash,
    expiresAt,
  });

  // ── Send email ────────────────────────────────────────────────────────────
  const appUrl =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  const resetUrl = new URL(
    `/reset-password/${rawToken}`,
    appUrl.endsWith("/") ? appUrl : `${appUrl}/`,
  ).toString();
  const institution =
    process.env.INSTITUTION_NAME ?? "University of Education, Winneba";

  const { html, text } = passwordResetEmailHTML({
    recipientEmail: admin.email,
    resetUrl,
    expiryMinutes: EXPIRY_MINUTES,
    institutionName: institution,
  });

  try {
    await sendEmail({
      to: admin.email,
      subject: `TMS — Password Reset Request`,
      html,
      text,
    });
  } catch (err) {
    console.error("[requestPasswordReset] Email send failed:", err);
    // Clean up the token since we couldn't deliver it
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
    return {
      status: "error",
      error:
        "Failed to send the reset email. Please check your email configuration or contact your administrator.",
    };
  }

  return { status: "success" };
}

// ─── Validate token (used to check before showing reset form) ─────────────────

export async function validateResetToken(
  rawToken: string,
): Promise<
  | { valid: true; adminId: string; email: string }
  | { valid: false; reason: "expired" | "used" | "not_found" }
> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const [record] = await db
    .select({
      id: passwordResetTokens.id,
      adminId: passwordResetTokens.adminId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!record) return { valid: false, reason: "not_found" };
  if (record.usedAt) return { valid: false, reason: "used" };
  if (record.expiresAt < now) return { valid: false, reason: "expired" };

  const [admin] = await db
    .select({ id: admins.id, email: admins.email })
    .from(admins)
    .where(eq(admins.id, record.adminId))
    .limit(1);

  if (!admin) return { valid: false, reason: "not_found" };

  return { valid: true, adminId: admin.id, email: admin.email };
}

// ─── Reset password ───────────────────────────────────────────────────────────

const resetSchema = z
  .object({
    token: z.string().min(1, "Reset token is missing."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      error: parsed.error.issues[0].message,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { token: rawToken, password } = parsed.data;
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  // ── Find valid token ───────────────────────────────────────────────────────
  const [record] = await db
    .select({
      id: passwordResetTokens.id,
      adminId: passwordResetTokens.adminId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!record) {
    return {
      status: "error",
      error:
        "This password reset link is invalid or has expired. Please request a new one.",
    };
  }

  // ── Hash new password ──────────────────────────────────────────────────────
  let hashed: string;
  try {
    hashed = await hashPassword(password);
  } catch {
    return {
      status: "error",
      error: "Password processing failed. Please try again.",
    };
  }

  // ── Update password and mark token as used ────────────────────────────────
  await db
    .update(admins)
    .set({ password: hashed })
    .where(eq(admins.id, record.adminId));

  await db
    .update(passwordResetTokens)
    .set({ usedAt: now })
    .where(eq(passwordResetTokens.id, record.id));

  // ── Clean up all other tokens for this admin ──────────────────────────────
  await db
    .delete(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.adminId, record.adminId),
        isNull(passwordResetTokens.usedAt),
      ),
    );

  return { status: "success" };
}
