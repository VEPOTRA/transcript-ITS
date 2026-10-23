/**
 * POST /api/bulk/upload
 *
 * Accepts a multipart form upload with a single CSV file field ("file").
 * Runs the full pipeline:
 *   1. Parse CSV text
 *   2. Validate all rows (Zod + DB lookups)
 *   3. Insert valid rows (row-level error recovery)
 *   4. Return BulkUploadResult JSON
 *
 * This is an API route (not a server action) because:
 *   - It handles a binary multipart request body
 *   - It needs to return structured JSON for the client to render results
 *   - File uploads require streaming which server actions don't support well
 *
 * Auth: requires bulk_upload permission (ADMIN+).
 *
 * Max file size: 80 MB (enforced by Next.js config — see next.config.ts).
 * Max rows: 1,000,000 per upload (enforced here — larger batches should use
 *           background jobs).
 */

import { type NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { COOKIE_NAME } from "@/lib/auth/config";
import { can } from "@/lib/auth/rbac";
import { logAuditEvent, extractRequestMeta } from "@/lib/audit";
import { parseStudentCSV } from "@/lib/bulk/students/parser";
import { validateBatch } from "@/lib/bulk/students/validator";
import { runStudentBulkInsertPipeline } from "@/lib/bulk/students/pipeline";
import type { BulkUploadResult } from "@/lib/bulk/students/types";

const MAX_FILE_SIZE_BYTES = 80 * 1024 * 1024; // 80 MB
const MAX_ROW_COUNT = 1_000_000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Auth ────────────────────────────────────────────────────────────────

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!can(session, "bulk_upload")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── 2. Parse multipart body ────────────────────────────────────────────────

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid request — expected multipart/form-data." },
      { status: 400 },
    );
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'No file provided. Include a CSV as the "file" field.' },
      { status: 400 },
    );
  }

  // ── 3. File type and size guards ───────────────────────────────────────────

  const mimeOk =
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" ||
    file.type === "text/plain" ||
    file.name.toLowerCase().endsWith(".csv");

  if (!mimeOk) {
    return NextResponse.json(
      {
        error: `Invalid file type "${file.type}". Only CSV files are accepted.`,
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 80 MB.`,
      },
      { status: 400 },
    );
  }

  // ── 4. Read file content ───────────────────────────────────────────────────

  let text: string;
  try {
    text = await file.text();
  } catch {
    return NextResponse.json(
      {
        error:
          "Failed to read the uploaded file. Ensure it is a valid UTF-8 CSV.",
      },
      { status: 400 },
    );
  }

  if (text.trim().length === 0) {
    return NextResponse.json(
      { error: "The uploaded file is empty." },
      { status: 400 },
    );
  }

  // ── 5. Parse CSV ───────────────────────────────────────────────────────────

  const {
    rows: rawRows,
    missingHeaders,
    totalDataRows,
  } = parseStudentCSV(text);

  if (missingHeaders.length > 0) {
    return NextResponse.json(
      {
        error:
          `Missing required columns: ${missingHeaders.join(", ")}. ` +
          `Download the template to see the expected format.`,
      },
      { status: 400 },
    );
  }

  if (totalDataRows === 0) {
    return NextResponse.json(
      { error: "No data rows found. The file contains only a header row." },
      { status: 400 },
    );
  }

  if (totalDataRows > MAX_ROW_COUNT) {
    return NextResponse.json(
      {
        error:
          `File contains ${totalDataRows.toLocaleString()} rows. ` +
          `Maximum per upload is ${MAX_ROW_COUNT.toLocaleString()}. ` +
          `Split the file into smaller batches.`,
      },
      { status: 400 },
    );
  }

  // ── 6. Audit: upload started ───────────────────────────────────────────────

  const meta = extractRequestMeta(request.headers);

  await logAuditEvent({
    adminId: session.adminId,
    action: "BULK_UPLOAD_STARTED",
    entity: "students",
    after: {
      fileName: file.name,
      fileSize: file.size,
      rowCount: totalDataRows,
    },
    ...meta,
  });

  // ── 7. Validate all rows ───────────────────────────────────────────────────

  const { validRows, failedRows } = await validateBatch(rawRows);

  // ── 8. Insert valid rows (row-level error recovery) ────────────────────────

  const result: BulkUploadResult = await runStudentBulkInsertPipeline(
    validRows,
    failedRows,
    totalDataRows,
  );

  // ── 9. Audit: upload completed ─────────────────────────────────────────────

  await logAuditEvent({
    adminId: session.adminId,
    action: "BULK_UPLOAD_COMPLETED",
    entity: "students",
    after: {
      fileName: file.name,
      totalRows: result.totalRows,
      successCount: result.successCount,
      failureCount: result.failureCount,
      durationMs: result.durationMs,
    },
    ...meta,
  });

  // ── 10. Return result ──────────────────────────────────────────────────────

  return NextResponse.json(result, { status: 200 });
}
