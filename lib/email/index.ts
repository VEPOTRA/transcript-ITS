/**
 * lib/email/index.ts — Email sending utility.
 *
 * Supports two providers (auto-detected from env):
 *   1. Resend  — set RESEND_API_KEY  (recommended for production)
 *   2. SMTP    — set SMTP_HOST + SMTP_USER + SMTP_PASS (Gmail, Outlook, etc.)
 *
 * .env.local examples:
 *
 *   # Option A — Resend (production)
 *   RESEND_API_KEY=re_xxxxxxxxxxxx
 *   EMAIL_FROM=TMS <noreply@yourdomain.com>
 *
 *   # Option B — Gmail SMTP
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_USER=your@gmail.com
 *   SMTP_PASS=your-app-password   # Google App Password (not your login password)
 *   EMAIL_FROM=TMS <your@gmail.com>
 *
 *   # Option C — Outlook / Office 365
 *   SMTP_HOST=smtp.office365.com
 *   SMTP_PORT=587
 *   SMTP_USER=your@institution.edu.gh
 *   SMTP_PASS=your-password
 *   EMAIL_FROM=TMS <your@institution.edu.gh>
 *
 *   # Required for both options
 *   APP_URL=https://your-app.netlify.app
 */

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const hasResend = !!process.env.RESEND_API_KEY;
  const hasSMTP = !!process.env.SMTP_HOST && !!process.env.SMTP_USER;

  if (!hasResend && !hasSMTP) {
    throw new Error(
      "No email provider configured.\n" +
        "Set RESEND_API_KEY for Resend, or SMTP_HOST + SMTP_USER + SMTP_PASS for SMTP.\n" +
        "See lib/email/index.ts for setup instructions.",
    );
  }

  if (hasResend) {
    return sendViaResend(payload);
  }
  return sendViaSMTP(payload);
}

// ─── Resend ───────────────────────────────────────────────────────────────────

async function sendViaResend(payload: EmailPayload): Promise<void> {
  const from = process.env.EMAIL_FROM;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

// ─── SMTP (nodemailer) ────────────────────────────────────────────────────────

async function sendViaSMTP(payload: EmailPayload): Promise<void> {
  // Lazy import so nodemailer is only loaded when needed
  const nodemailer = await import("nodemailer");

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false }, // allow self-signed certs for local mail servers
  });

  const from = process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? "TMS";

  await transport.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
}

// ─── Email templates ──────────────────────────────────────────────────────────

export function passwordResetEmailHTML(opts: {
  recipientEmail: string;
  resetUrl: string;
  expiryMinutes: number;
  institutionName: string;
}): { html: string; text: string } {
  const { recipientEmail, resetUrl, expiryMinutes, institutionName } = opts;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password Reset</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
        style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#1e3a5f;padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.05em;">
              📋 TMS
            </p>
            <p style="margin:6px 0 0;font-size:12px;color:#93c5fd;">
              ${institutionName}
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:#111827;">
              Password Reset Request
            </h1>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              We received a request to reset the password for the account associated with
              <strong>${recipientEmail}</strong>.
            </p>

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 32px;">
                  <a href="${resetUrl}"
                    style="display:inline-block;background:#4f46e5;color:#ffffff;
                           font-size:15px;font-weight:600;padding:14px 32px;
                           border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
                    Reset my password
                  </a>
                </td>
              </tr>
            </table>

            <!-- Warning -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;
                           padding:14px 18px;">
                  <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
                    ⏱ This link expires in <strong>${expiryMinutes} minutes</strong>.
                    If you did not request a password reset, please ignore this email —
                    your password will not change.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Fallback URL -->
            <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
              If the button doesn't work, copy and paste this link into your browser:<br />
              <a href="${resetUrl}" style="color:#4f46e5;word-break:break-all;">${resetUrl}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #f3f4f6;
                     padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">
              This email was sent by the Transcript Management System.<br />
              All access is logged and monitored. Do not share this link.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim();

  const text = [
    `Password Reset — ${institutionName}`,
    "",
    `A password reset was requested for ${recipientEmail}.`,
    "",
    `Reset link (expires in ${expiryMinutes} minutes):`,
    resetUrl,
    "",
    "If you did not request this, ignore this email — your password will not change.",
  ].join("\n");

  return { html, text };
}
