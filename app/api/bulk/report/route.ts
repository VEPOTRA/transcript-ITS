/**
 * POST /api/bulk/report
 *
 * Accepts a BulkUploadResult JSON body and streams back a CSV error report.
 *
 * Why POST instead of storing the result server-side:
 *   The result is already in the client's memory (returned by /api/bulk/upload).
 *   Storing it server-side would require a job store (Redis/DB). Sending it
 *   back for report generation is simpler and has no state-management overhead.
 *   The payload is bounded — it contains only failed rows (max 5,000 rows × ~200 bytes).
 *
 * Auth: requires bulk_upload permission.
 */

import { type NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { COOKIE_NAME } from "@/lib/auth/config";
import { can } from "@/lib/auth/rbac";
import { generateErrorReportCSV } from "@/lib/bulk/students/report";
import type { RowFailure } from "@/lib/bulk/students/types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session, "bulk_upload"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { failures: RowFailure[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body?.failures)) {
    return NextResponse.json(
      { error: 'Body must contain a "failures" array.' },
      { status: 400 },
    );
  }

  // Limit to prevent abuse — max 5,000 failure rows × ~300 bytes each ≈ 1.5 MB
  if (body.failures.length > 5_000) {
    return NextResponse.json(
      { error: "Too many failure rows to report." },
      { status: 400 },
    );
  }

  const csv = generateErrorReportCSV(body.failures);

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `upload-errors-${timestamp}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
