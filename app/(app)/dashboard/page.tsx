/**
 * /dashboard — Main admin dashboard.
 *
 * Fetches real stat counts in parallel.
 */

import { requireAuth } from "@/lib/auth/rbac";
import { db } from "@/db";
import { students, courses, programmes, semesters, grades, transcripts } from "@/db/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import { DashboardClient } from "./_components/dashboard-client";

export default async function DashboardPage() {
  const session = await requireAuth();
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Accra",
  }).format(now);
  const campusFilter =
    session.role === "SUPER_ADMIN"
      ? undefined
      : inArray(students.campusId, session.campusIds);

  const [
    [{ studentCount }],
    [{ courseCount }],
    [{ programmeCount }],
    [{ semesterCount }],
    [{ gradeCount }],
    [{ transcriptCount }],
    [{ activeStudentCount }],
  ] = await Promise.all([
    db.select({ studentCount: count() }).from(students).where(campusFilter),
    db.select({ courseCount: count() }).from(courses),
    db.select({ programmeCount: count() }).from(programmes),
    db.select({ semesterCount: count() }).from(semesters),
    db
      .select({ gradeCount: count() })
      .from(grades)
      .innerJoin(students, eq(grades.studentId, students.id))
      .where(campusFilter),
    db
      .select({ transcriptCount: count() })
      .from(transcripts)
      .innerJoin(students, eq(transcripts.studentId, students.id))
      .where(campusFilter),
    db
      .select({ activeStudentCount: count() })
      .from(students)
      .where(and(eq(students.status, "ACTIVE"), campusFilter)),
  ]);

  return (
    <DashboardClient
      session={session}
      dateLabel={dateLabel}
      stats={{
        students: studentCount,
        activeStudents: activeStudentCount,
        courses: courseCount,
        programmes: programmeCount,
        semesters: semesterCount,
        grades: gradeCount,
        transcripts: transcriptCount,
      }}
    />
  );
}
