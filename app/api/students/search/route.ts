/**
 * GET /api/students/search?q=<query>&limit=10
 *
 * Lightweight student search used by the grade entry form and
 * other client components that need on-demand student lookup.
 * Respects campus access control from the session.
 */
import { type NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { COOKIE_NAME } from "@/lib/auth/config";
import { db } from "@/db";
import { students, programmes, campuses } from "@/db/schema";
import { eq, ilike, or, and, inArray, sql } from "drizzle-orm";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Parse query ─────────────────────────────────────────────────────────────
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") ?? 10),
    50,
  );

  if (q.length < 2) return NextResponse.json([]);

  const pattern = `%${q}%`;

  // ── Campus filter ────────────────────────────────────────────────────────────
  const campusIds =
    session.role === "SUPER_ADMIN"
      ? null
      : session.campusIds
        ? [session.campusIds]
        : [];

  // ── Search ───────────────────────────────────────────────────────────────────
  const searchWhere = or(
    ilike(students.indexNumber, pattern),
    ilike(students.firstName, pattern),
    ilike(students.lastName, pattern),
    ilike(sql`COALESCE(${students.middleName}, '')`, pattern),
  );

  const where =
    campusIds && campusIds.length > 0
      ? and(searchWhere, inArray(students.campusId, campusIds))
      : searchWhere;

  const rows = await db
    .select({
      id: students.id,
      indexNumber: students.indexNumber,
      firstName: students.firstName,
      middleName: students.middleName,
      lastName: students.lastName,
      studentType: students.studentType,
      campusId: students.campusId,
      programmeId: students.programmeId,
      programmeName: programmes.name,
      level: students.level,
      status: students.status,
    })
    .from(students)
    .leftJoin(programmes, eq(students.programmeId, programmes.id))
    .where(where)
    .orderBy(students.indexNumber)
    .limit(limit);

  return NextResponse.json(rows);
}
