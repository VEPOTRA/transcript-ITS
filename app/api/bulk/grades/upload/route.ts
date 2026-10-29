/**
 * POST /api/bulk/grades/upload
 *
 * Parses and validates grade CSV rows, then inserts valid rows with
 * server-computed grade points and quality points.
 */

import { type NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { COOKIE_NAME } from "@/lib/auth/config";
import { can } from "@/lib/auth/rbac";
import { logAuditEvent, extractRequestMeta } from "@/lib/audit";
import { parseGradeCSV } from "@/lib/bulk/grades/parser";
import { validateGradeBatch } from "@/lib/bulk/grades/validator";
import { runGradeBulkInsertPipeline } from "@/lib/bulk/grades/pipeline";
import type { GradeBulkResult } from "@/lib/bulk/grades/types";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_ROW_COUNT = 5_000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(session, "bulk_upload")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.role !== "SUPER_ADMIN" && session.campusIds.length === 0) {
    return NextResponse.json(
      { error: "Your account is not assigned to a campus." },
      { status: 403 },
    );
  }

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

  const isCsv =
    ["text/csv", "application/vnd.ms-excel", "text/plain"].includes(
      file.type,
    ) || file.name.toLowerCase().endsWith(".csv");
  if (!isCsv) {
    return NextResponse.json(
      { error: "Only CSV files are accepted." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File exceeds the 5 MB upload limit." },
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
  if (!text.trim()) {
    return NextResponse.json(
      { error: "The uploaded file is empty." },
      { status: 400 },
    );
  }

  const { rows, missingHeaders, totalDataRows } = parseGradeCSV(text);
  if (missingHeaders.length > 0) {
    return NextResponse.json(
      {
        error:
          `Missing required columns: ${missingHeaders.join(", ")}. ` +
          "Download the grade template to see the expected format.",
      },
      { status: 400 },
    );
  }
  if (totalDataRows === 0) {
    return NextResponse.json(
      { error: "No data rows found in the uploaded file." },
      { status: 400 },
    );
  }
  if (totalDataRows > MAX_ROW_COUNT) {
    return NextResponse.json(
      {
        error: `File has ${totalDataRows.toLocaleString()} rows. The maximum is ${MAX_ROW_COUNT.toLocaleString()}.`,
      },
      { status: 400 },
    );
  }

  const metadata = extractRequestMeta(request.headers);
  await logAuditEvent({
    adminId: session.adminId,
    action: "BULK_UPLOAD_STARTED",
    entity: "grades",
    after: { fileName: file.name, fileSize: file.size, rowCount: totalDataRows },
    ...metadata,
  });

  try {
    const campusIds =
      session.role === "SUPER_ADMIN" ? undefined : session.campusIds;
    const { validRows, failedRows } = await validateGradeBatch(
      rows,
      campusIds,
    );
    const result: GradeBulkResult = await runGradeBulkInsertPipeline(
      validRows,
      failedRows,
      totalDataRows,
    );

    await logAuditEvent({
      adminId: session.adminId,
      action: "BULK_UPLOAD_COMPLETED",
      entity: "grades",
      after: {
        fileName: file.name,
        totalRows: result.totalRows,
        successCount: result.successCount,
        failureCount: result.failureCount,
        durationMs: result.durationMs,
      },
      ...metadata,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[POST /api/bulk/grades/upload] Import processing failed.", error);
    return NextResponse.json(
      { error: "Grade import processing failed. Please retry the upload." },
      { status: 500 },
    );
  }
}
