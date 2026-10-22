/**
 * GPA SQL aggregation queries.
 *
 * Both functions push all arithmetic into PostgreSQL.
 * JavaScript sees only one or a handful of pre-aggregated rows —
 * never the raw grade rows.
 *
 * ─── Why SUM(computed_quality_points) and not SUM(grade_point × credit_hours)?
 *
 * computed_quality_points is written at grade-entry time and already holds
 * gradePoint × creditHours. Reading it is O(1) per row with no arithmetic.
 * Computing gradePoint × creditHours at query time forces the DB to cast
 * two numeric columns, multiply, and discard the result on every read.
 * At 10 k rows it is immeasurable; at 1 M rows it is not.
 *
 * ─── Credits earned vs credits attempted
 *
 * attempted = all scoring credits (resit credits count double)
 * earned    = passed scoring credits (resit credits count double)
 * quality points use the actual course credit, including for resits
 *
 * Both are computed in a single pass using CASE WHEN inside SUM —
 * no second query, no subquery, no application-level filtering.
 *
 * ─── Non-scoring courses
 *
 * Excluded via INNER JOIN courses + WHERE courses.is_scoring = true.
 * They appear on the transcript (fetched separately) but never enter
 * the quality-points or credit-hours aggregates.
 */

import { sql, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { grades, courses, semesters } from "@/db/schema";
import type { SemesterAggregateRow } from "./types";

// ─── Shared SQL expressions ───────────────────────────────────────────────────
//
// Defined once, reused in both queries.
// sql<string> because PostgreSQL numeric/bigint aggregates arrive as strings.

const sumQualityPoints = sql<string>`
  CAST(SUM(${grades.computedQualityPoints}) AS TEXT)
`.as("total_quality_points");

const sumCreditsAttempted = sql<string>`
  CAST(
    SUM(CASE WHEN ${grades.isResit} THEN ${grades.creditHours} * 2 ELSE ${grades.creditHours} END)
  AS TEXT)
`.as("credits_attempted");

/**
 * Credits earned: sum credit hours only where the grade is not E/IC.
 * Resit attempts count double credits, but quality points remain based on
 * the actual course credit stored in computed_quality_points.
 * CASE WHEN evaluated row-by-row inside a single SUM pass — no extra scan.
 */
const sumCreditsEarned = sql<string>`
  CAST(
    SUM(
      CASE WHEN ${grades.grade} NOT IN ('E', 'IC')
        THEN CASE WHEN ${grades.isResit} THEN ${grades.creditHours} * 2 ELSE ${grades.creditHours} END
        ELSE 0
      END
    )
  AS TEXT)
`.as("credits_earned");

const countCourses = sql<string>`
  CAST(COUNT(*) AS TEXT)
`.as("course_count");

// ─── Semester GPA query ───────────────────────────────────────────────────────

/**
 * Aggregate all scoring grade rows for one student + one semester into a
 * single summary row.
 *
 * Returns null when the student has no scoring grades in that semester.
 *
 * SQL produced (simplified):
 *
 *   SELECT
 *     g.semester_id,
 *     s.year AS semester_year,
 *     s.semester AS semester_term,
 *     CAST(SUM(g.computed_quality_points) AS TEXT) AS total_quality_points,
 *     CAST(SUM(CASE WHEN g.is_resit THEN g.credit_hours * 2
 *                   ELSE g.credit_hours END) AS TEXT) AS credits_attempted,
 *     CAST(SUM(CASE WHEN g.grade NOT IN ('E', 'IC')
 *               THEN CASE WHEN g.is_resit THEN g.credit_hours * 2
 *                         ELSE g.credit_hours END
 *               ELSE 0 END) AS TEXT) AS credits_earned,
 *     CAST(COUNT(*) AS TEXT) AS course_count
 *   FROM grades g
 *   INNER JOIN courses  c ON g.course_id  = c.id  AND c.is_scoring = true
 *   INNER JOIN semesters s ON g.semester_id = s.id
 *   WHERE g.student_id  = $1
 *     AND g.semester_id = $2
 *   GROUP BY g.semester_id, s.year, s.semester
 */
export async function querySemesterAggregate(
  studentId: string,
  semesterId: string,
): Promise<SemesterAggregateRow | null> {
  const rows = await db
    .select({
      semesterId: grades.semesterId,
      semesterYear: semesters.year,
      semesterTerm: semesters.semester,
      totalQualityPoints: sumQualityPoints,
      creditsAttempted: sumCreditsAttempted,
      creditsEarned: sumCreditsEarned,
      courseCount: countCourses,
    })
    .from(grades)
    .innerJoin(
      courses,
      and(
        eq(grades.courseId, courses.id),
        eq(courses.isScoring, true), // ← non-scoring excluded at JOIN
      ),
    )
    .innerJoin(semesters, eq(grades.semesterId, semesters.id))
    .where(
      and(eq(grades.studentId, studentId), eq(grades.semesterId, semesterId)),
    )
    .groupBy(grades.semesterId, semesters.year, semesters.semester);

  return rows.length > 0 ? (rows[0] as SemesterAggregateRow) : null;
}

// ─── CGPA query ───────────────────────────────────────────────────────────────

/**
 * Aggregate all scoring grade rows for one student, grouped by semester.
 *
 * Returns one row per semester that has at least one scoring grade,
 * ordered chronologically (year ASC, FIRST before SECOND).
 *
 * The caller sums the semester rows to derive CGPA — that summation is
 * O(number of semesters), not O(number of grade rows).
 *
 * SQL produced (simplified):
 *
 *   SELECT
 *     g.semester_id,
 *     s.year                                                AS semester_year,
 *     s.semester                                            AS semester_term,
 *     CAST(SUM(g.computed_quality_points) AS TEXT)          AS total_quality_points,
 *     CAST(SUM(CASE WHEN g.is_resit THEN g.credit_hours * 2
 *                   ELSE g.credit_hours END) AS TEXT)       AS credits_attempted,
 *     CAST(SUM(CASE WHEN g.grade NOT IN ('E', 'IC')
 *               THEN CASE WHEN g.is_resit THEN g.credit_hours * 2
 *                         ELSE g.credit_hours END
 *               ELSE 0 END) AS TEXT)                        AS credits_earned,
 *     CAST(COUNT(*) AS TEXT)                                AS course_count
 *   FROM grades g
 *   INNER JOIN courses  c ON g.course_id  = c.id  AND c.is_scoring = true
 *   INNER JOIN semesters s ON g.semester_id = s.id
 *   WHERE g.student_id = $1
 *   GROUP BY g.semester_id, s.year, s.semester
 *   ORDER BY s.year ASC,
 *            CASE s.semester WHEN 'FIRST' THEN 1 ELSE 2 END ASC
 */
export async function queryCGPAAggregatesBySemester(
  studentId: string,
): Promise<SemesterAggregateRow[]> {
  const rows = await db
    .select({
      semesterId: grades.semesterId,
      semesterYear: semesters.year,
      semesterTerm: semesters.semester,
      totalQualityPoints: sumQualityPoints,
      creditsAttempted: sumCreditsAttempted,
      creditsEarned: sumCreditsEarned,
      courseCount: countCourses,
    })
    .from(grades)
    .innerJoin(
      courses,
      and(
        eq(grades.courseId, courses.id),
        eq(courses.isScoring, true), // ← non-scoring excluded at JOIN
      ),
    )
    .innerJoin(semesters, eq(grades.semesterId, semesters.id))
    .where(eq(grades.studentId, studentId))
    .groupBy(grades.semesterId, semesters.year, semesters.semester)
    .orderBy(
      semesters.year,
      // FIRST (1) before SECOND (2) within the same year
      sql`CASE ${semesters.semester} WHEN 'FIRST' THEN 1 ELSE 2 END`,
    );

  return rows as SemesterAggregateRow[];
}
