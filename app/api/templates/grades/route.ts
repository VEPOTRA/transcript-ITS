/**
 * GET /api/templates/grades
 * Generates a downloadable CSV template that matches the grade importer.
 */
import { type NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { COOKIE_NAME } from "@/lib/auth/config";
import { can } from "@/lib/auth/permissions";
import { generateGradesTemplate } from "@/lib/templates";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session, "bulk_upload"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return new NextResponse(generateGradesTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="grade-upload-template.csv"',
      "Cache-Control": "private, max-age=3600",
    },
  });
}
