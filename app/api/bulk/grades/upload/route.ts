/**
 * POST /api/bulk/upload — Student bulk upload with smart campus handling.
 *
 * Campus logic:
 *   - Campus ADMIN / VIEWER: campus assigned automatically from session.
 *     No campus_code column needed in CSV.
 *   - SUPER_ADMIN: campus_code column required in CSV.
 *     Accepts campus code (WIN) or full campus name (case-insensitive).
 */

import { type NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { COOKIE_NAME } from "@/lib/auth/config";
import { can } from "@/lib/auth/rbac";
import { logAuditEvent, extractRequestMeta } from "@/lib/audit";
import { parseStudentCSV } from "@/lib/bulk/parser";
import { validateBatch } from "@/lib/bulk/validator";
import { runStudentBulkInsertPipeline } from "@/lib/bulk/pipeline";
import type { BulkUploadResult } from "@/lib/bulk/types";
import { db } from "@/db";
import { campuses } from "@/db/schema";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_ROW_COUNT = 5_000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session, "bulk_upload"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const mimeOk =
    ["text/csv", "application/vnd.ms-excel", "text/plain"].includes(
      file.type,
    ) || file.name.toLowerCase().endsWith(".csv");
  if (!mimeOk)
    return NextResponse.json(
      { error: `Only CSV files are accepted.` },
      { status: 400 },
    );
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`,
      },
      { status: 400 },
    );
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return NextResponse.json(
      { error: "Failed to read the file. Make sure it is a valid UTF-8 CSV." },
      { status: 400 },
    );
  }

  if (!text.trim())
    return NextResponse.json(
      { error: "The uploaded file is empty." },
      { status: 400 },
    );

  // ── 3. Strip comment rows ──────────────────────────────────────────────────
  const stripped = text
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");

  // ── 4. Resolve campus ──────────────────────────────────────────────────────
  // Load all campuses once for lookup
  const allCampuses = await db
    .select({ id: campuses.id, code: campuses.code, name: campuses.name })
    .from(campuses);

  const byCode = new Map(allCampuses.map((c) => [c.code.toLowerCase(), c]));
  const byName = new Map(allCampuses.map((c) => [c.name.toLowerCase(), c]));

  let sessionCampusId: string | null = null;
  let isSuperAdmin = session.role === "SUPER_ADMIN";

  if (!isSuperAdmin) {
    // Campus ADMIN / VIEWER — use their campus from session
    sessionCampusId = session.campusIds?.[0] ?? null;
    if (!sessionCampusId) {
      return NextResponse.json(
        {
          error:
            "Your account is not assigned to a campus. Contact the Super Admin to assign you to a campus before uploading students.",
        },
        { status: 403 },
      );
    }
  }

  // ── 5. Parse CSV ───────────────────────────────────────────────────────────
  const {
    rows: rawRows,
    missingHeaders: parsedMissingHeaders,
    totalDataRows,
  } = parseStudentCSV(stripped);
  const missingHeaders: string[] = parsedMissingHeaders;

  // For SUPER_ADMIN, campus_code column must be present
  if (isSuperAdmin && missingHeaders.includes("campus_code")) {
    return NextResponse.json(
      {
        error:
          "Missing required column: campus_code. " +
          "As SUPER_ADMIN you must include a campus_code column so each student is assigned to the correct campus. " +
          "Use campus codes like WIN, KSI, MMP, or AMC.",
      },
      { status: 400 },
    );
  }

  // Remove campus_code from missingHeaders for non-SUPER_ADMIN
  const filteredMissingHeaders = isSuperAdmin
    ? missingHeaders
    : missingHeaders.filter((h) => h !== "campus_code");

  if (filteredMissingHeaders.length > 0) {
    return NextResponse.json(
      {
        error:
          `Missing required columns: ${filteredMissingHeaders.join(", ")}. ` +
          `Download the template to see the expected format.`,
      },
      { status: 400 },
    );
  }

  if (totalDataRows === 0)
    return NextResponse.json({ error: "No data rows found." }, { status: 400 });
  if (totalDataRows > MAX_ROW_COUNT) {
    return NextResponse.json(
      {
        error: `File has ${totalDataRows.toLocaleString()} rows. Maximum is ${MAX_ROW_COUNT.toLocaleString()}. Split into smaller batches.`,
      },
      { status: 400 },
    );
  }

  // ── 6. Inject/resolve campusId into every raw row ─────────────────────────
  //
  // For campus ADMIN: set campusId from session on every row (ignore CSV campus_code).
  // For SUPER_ADMIN:  look up campus_code from each row and attach campusId.
  //
  // This way validateBatch and runBulkInsertPipeline don't need to know about
  // campus lookup — the campusId is already resolved on each row.

  const rowsWithCampus = rawRows.map((row, i) => {
    if (!isSuperAdmin) {
      // Campus admin — auto-assign their campus
      // For campus admin with multiple campuses, use first campus as default
      return { ...row, resolvedCampusId: sessionCampusId };
    }

    // SUPER_ADMIN — look up from campus_code column
    const raw = (row as any).campus_code?.trim() ?? "";
    const campus =
      byCode.get(raw.toLowerCase()) ?? byName.get(raw.toLowerCase());

    if (!campus) {
      // Attach error marker so validateBatch can report it
      return {
        ...row,
        resolvedCampusId: null,
        campusLookupError: raw
          ? `Campus "${raw}" not found. Use a campus code (e.g. WIN, KSI, MMP, AMC) or the exact campus name.`
          : `campus_code is empty on row ${i + 2}. Every row must have a campus code when uploading as SUPER_ADMIN.`,
      };
    }

    return { ...row, resolvedCampusId: campus.id };
  });

  // ── 7. Audit: upload started ───────────────────────────────────────────────
  const meta = extractRequestMeta(request.headers);
  await logAuditEvent({
    adminId: session.adminId,
    action: "BULK_UPLOAD_STARTED",
    entity: "students",
    after: {
      fileName: file.name,
      fileSize: file.size,
      rowCount: totalDataRows,
      campusId: sessionCampusId,
    },
    ...meta,
  });

  // ── 8. Validate all rows ───────────────────────────────────────────────────
  const { validRows, failedRows } = await validateBatch(rowsWithCampus as any);

  // ── 9. Insert valid rows ───────────────────────────────────────────────────
  const result: BulkUploadResult = await runStudentBulkInsertPipeline(
    validRows,
    failedRows,
    totalDataRows,
  );

  // ── 10. Audit: completed ───────────────────────────────────────────────────
  await logAuditEvent({
    adminId: session.adminId,
    action: "BULK_UPLOAD_COMPLETED",
    entity: "students",
    after: {
      fileName: file.name,
      totalRows: result.totalRows,
      successCount: result.successCount,
      failureCount: result.failureCount,
    },
    ...meta,
  });

  return NextResponse.json(result, { status: 200 });
}
