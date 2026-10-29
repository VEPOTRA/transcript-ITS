"use server";

/**
 * Grades CRUD server actions.
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  SECURITY CONTRACT — read before modifying this file            ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  1. creditHours   is NEVER accepted from the client.            ║
 * ║     It is always fetched from courses.credit_hours in the DB.   ║
 * ║                                                                  ║
 * ║  2. gradePoint    is NEVER accepted from the client.            ║
 * ║     It is always resolved from the server-side grade scale.     ║
 * ║                                                                  ║
 * ║  3. computedQualityPoints is NEVER accepted from the client.    ║
 * ║     It is always computed as gradePoint × creditHours here.     ║
 * ║                                                                  ║
 * ║  Client: studentId, courseId, semesterId, grade, isResit.       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Grade updates modify the selected row in place and capture before/after
 * values in the audit log. Hard deletes are not permitted on superseded grades.
 */

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { grades, courses, students, semesters } from "@/db/schema";
import { assertPermission } from "@/lib/auth/rbac";
import { logAuditEvent, extractRequestMeta } from "@/lib/audit";
import {
  GRADE_LETTERS,
  resolveGradePoint,
  computeQualityPoints,
  isGradeAllowedForCourse,
} from "@/lib/gpa/scale";
import { parseDbError, withAction } from "@/lib/actions/utils";
import type { ActionState } from "@/types/auth";

// ─── Schemas ──────────────────────────────────────────────────────────────────
// Client-supplied GPA values are absent by design; isResit is the sole
// additional grade-entry option persisted from the form.

const gradeInputSchema = z.object({
  studentId: z
    .string({ required_error: "Student is required" })
    .uuid("Invalid student"),
  courseId: z
    .string({ required_error: "Course is required" })
    .uuid("Invalid course"),
  semesterId: z
    .string({ required_error: "Semester is required" })
    .uuid("Invalid semester"),
  grade: z.enum(GRADE_LETTERS as [string, ...string[]], {
    required_error: "Grade is required",
    invalid_type_error: "Grade is required",
    message: `Grade must be one of: ${GRADE_LETTERS.join(", ")}`,
  }),
  isResit: z.boolean(),
});

// ─── Internal: fetch and compute server-side values ───────────────────────────

type ServerComputedValues = {
  creditHours: number;
  isScoring: boolean | null;
  gradePoint: string; // toFixed(2) string for numeric column
  computedQualityPoints: string; // toFixed(2) string for numeric column
};

/**
 * Fetch credit hours from the database and compute grade point and quality
 * points entirely server-side.
 *
 * Returns null if the course does not exist (caller should surface an error).
 * Throws if the grade letter is not in the scale (should not happen after Zod
 * validation, but is an explicit guard against future scale changes).
 */
async function resolveServerValues(
  courseId: string,
  grade: string,
): Promise<ServerComputedValues | null> {
  // Fetch credit hours from the authoritative source — the courses table
  const courseRows = await db
    .select({
      creditHours: courses.creditHours,
      isActive: courses.isActive,
      isScoring: courses.isScoring,
    })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (courseRows.length === 0 || !courseRows[0].isActive) return null;

  const creditHours = courseRows[0].creditHours; // integer, from DB
  const gradePoint = resolveGradePoint(grade); // from scale, server-only
  const qualityPts = computeQualityPoints(gradePoint, creditHours); // gradePoint × creditHours

  return {
    creditHours,
    isScoring: courseRows[0].isScoring,
    gradePoint: gradePoint.toFixed(2),
    computedQualityPoints: qualityPts.toFixed(2),
  };
}

async function isStudentInScope(
  studentId: string,
  session: Awaited<ReturnType<typeof assertPermission>>,
): Promise<boolean> {
  if (session.role === "SUPER_ADMIN") return true;
  if (session.campusIds.length === 0) return false;

  const [student] = await db
    .select({ campusId: students.campusId })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);

  return Boolean(student?.campusId && session.campusIds.includes(student.campusId));
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function createGradeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return withAction(async () => {
    const session = await assertPermission("enter_grades");

    // Step 1: validate the grade fields and resit toggle
    const parsed = gradeInputSchema.safeParse({
      studentId: formData.get("studentId"),
      courseId: formData.get("courseId"),
      semesterId: formData.get("semesterId"),
      grade: formData.get("grade"),
      isResit: formData.get("isResit") === "true",
    });

    if (!parsed.success) {
      return {
        status: "error",
        error: "Please correct the errors below.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const { studentId, courseId, semesterId, grade, isResit } = parsed.data;

    // Step 2: verify student exists
    const student = await db
      .select({ id: students.id, campusId: students.campusId })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    if (student.length === 0) {
      return {
        status: "error",
        error: "Student not found.",
        fieldErrors: { studentId: ["Student does not exist"] },
      };
    }
    if (
      session.role !== "SUPER_ADMIN" &&
      (!student[0].campusId || !session.campusIds.includes(student[0].campusId))
    ) {
      return {
        status: "error",
        error: "You do not have access to enter grades for this student.",
      };
    }

    // Step 3: fetch creditHours from DB + compute gradePoint and qualityPoints
    //         — client-supplied values for these fields are NEVER used
    const computed = await resolveServerValues(courseId, grade);
    if (!computed) {
      return {
        status: "error",
        error: "Course not found.",
        fieldErrors: { courseId: ["Course does not exist"] },
      };
    }
    if (!isGradeAllowedForCourse(grade, computed.isScoring)) {
      return {
        status: "error",
        error:
          computed.isScoring === false
            ? "Non-scoring courses accept only P or F."
            : "P is only valid for non-scoring courses.",
      };
    }

    // Step 4: insert
    let record: typeof grades.$inferSelect;
    try {
      [record] = await db
        .insert(grades)
        .values({
          studentId,
          courseId,
          semesterId,
          grade: grade as (typeof grades.$inferInsert)["grade"],
          gradePoint: computed.gradePoint,
          creditHours: computed.creditHours,
          computedQualityPoints: computed.computedQualityPoints,
          isResit,
        })
        .returning();
    } catch (err) {
      const e = parseDbError(err);
      if (e.type === "unique") {
        return {
          status: "error",
          error:
            "A grade for this student, course, and semester already exists. Use the correct-grade flow to update it.",
          fieldErrors: { grade: ["Duplicate grade — use correction flow"] },
        };
      }
      if (e.type === "foreign_key") {
        return {
          status: "error",
          error:
            "One of the referenced records (student, course, or semester) does not exist.",
        };
      }
      console.error("[createGradeAction]", err);
      return {
        status: "error",
        error: "Failed to save grade. Please try again.",
      };
    }

    // Step 5: audit
    const meta = extractRequestMeta(await headers());
    await logAuditEvent({
      adminId: session.adminId,
      action: "CREATE_GRADE",
      entity: "grades",
      entityId: record.id,
      after: {
        studentId,
        courseId,
        semesterId,
        grade: grade as (typeof grades.$inferInsert)["grade"],
        gradePoint: computed.gradePoint,
        creditHours: computed.creditHours,
        computedQualityPoints: computed.computedQualityPoints,
        isResit,
      },
      ...meta,
    });

    revalidatePath(`/students/${studentId}`);
    revalidatePath(`/transcripts/${studentId}`);
    return { status: "success", data: { id: record.id } };
  }, "[createGradeAction]");
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

/**
 * Update an active grade record in place, keeping an audit snapshot of changes.
 */
export async function updateGradeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return withAction(async () => {
    const session = await assertPermission("enter_grades");

    const gradeIdResult = z
      .string()
      .uuid("Invalid grade ID")
      .safeParse(formData.get("gradeId"));
    const courseIdResult = z
      .string()
      .uuid("Select a valid course")
      .safeParse(formData.get("courseId"));
    const semesterIdResult = z
      .string()
      .uuid("Select a valid semester")
      .safeParse(formData.get("semesterId"));
    const gradeResult = z
      .enum(GRADE_LETTERS as [string, ...string[]], {
        message: "Select a valid grade",
      })
      .safeParse(formData.get("grade"));
    if (
      !gradeIdResult.success ||
      !courseIdResult.success ||
      !semesterIdResult.success ||
      !gradeResult.success
    ) {
      return {
        status: "error",
        error: "Select a valid course, semester, and grade.",
      };
    }

    const gradeId = gradeIdResult.data;
    const courseId = courseIdResult.data;
    const semesterId = semesterIdResult.data;
    const grade = gradeResult.data;
    const isResit = formData.getAll("isResit").includes("true");

    const existing = await db
      .select()
      .from(grades)
      .where(eq(grades.id, gradeId))
      .limit(1);

    if (existing.length === 0)
      return { status: "error", error: "Grade record not found." };
    const old = existing[0];
    if (!(await isStudentInScope(old.studentId, session))) {
      return {
        status: "error",
        error: "You do not have access to update this student's grade.",
      };
    }
    if (old.isSuperseded) {
      return {
        status: "error",
        error: "This grade has already been corrected. Update the current grade instead.",
      };
    }

    if (
      old.grade === grade &&
      old.isResit === isResit &&
      old.courseId === courseId &&
      old.semesterId === semesterId
    ) {
      return {
        status: "error",
        error: "No changes were made to this grade.",
      };
    }

    const [semester] = await db
      .select({ id: semesters.id })
      .from(semesters)
      .where(eq(semesters.id, semesterId))
      .limit(1);
    if (!semester) {
      return {
        status: "error",
        error: "Semester not found.",
      };
    }

    const [course] = await db
      .select({
        creditHours: courses.creditHours,
        isActive: courses.isActive,
        isScoring: courses.isScoring,
      })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    if (!course || (!course.isActive && courseId !== old.courseId)) {
      return { status: "error", error: "Course not found or inactive." };
    }
    if (!isGradeAllowedForCourse(grade, course.isScoring)) {
      return {
        status: "error",
        error:
          course.isScoring === false
            ? "Non-scoring courses accept only P or F."
            : "P is only valid for non-scoring courses.",
      };
    }

    const gradePoint = resolveGradePoint(grade);
    const computed = {
      creditHours: course.creditHours,
      gradePoint: gradePoint.toFixed(2),
      computedQualityPoints: computeQualityPoints(
        gradePoint,
        course.creditHours,
      ).toFixed(2),
    };

    let updated: typeof grades.$inferSelect | null = null;
    try {
      [updated] = await db
        .update(grades)
        .set({
          courseId,
          semesterId,
          grade: grade as (typeof grades.$inferInsert)["grade"],
          gradePoint: computed.gradePoint,
          creditHours: computed.creditHours,
          computedQualityPoints: computed.computedQualityPoints,
          isResit,
        })
        .where(
          and(
            eq(grades.id, gradeId),
            eq(grades.isSuperseded, false),
          )
        )
        .returning();
      if (!updated) {
        return {
          status: "error",
          error: "This grade is no longer active. Refresh and try again.",
        };
      }
    } catch (err) {
      const e = parseDbError(err);
      if (e.type === "unique") {
        return {
          status: "error",
          error: "This student already has a grade for that course and semester.",
        };
      }
      console.error("[updateGradeAction]", err);
      return {
        status: "error",
        error: "Failed to update grade. Please try again.",
      };
    }

    const meta = extractRequestMeta(await headers());
    await logAuditEvent({
      adminId: session.adminId,
      action: "UPDATE_GRADE",
      entity: "grades",
      entityId: gradeId,
      before: old as Record<string, unknown>,
      after: updated as Record<string, unknown>,
      ...meta,
    });

    revalidatePath(`/students/${old.studentId}`);
    revalidatePath(`/transcripts/${old.studentId}`);
    return { status: "success", data: { id: updated.id } };
  }, "[updateGradeAction]");
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

/**
 * Delete a grade record.
 *
 * Only permitted on grades that have NOT been superseded and have
 * no downstream audit trail indicating they were used in a transcript.
 * In most cases, update the grade instead to preserve the record.
 */
export async function deleteGradeAction(id: string): Promise<ActionState> {
  return withAction(async () => {
    const session = await assertPermission("enter_grades");

    const existing = await db
      .select()
      .from(grades)
      .where(eq(grades.id, id))
      .limit(1);
    if (existing.length === 0)
      return { status: "error", error: "Grade record not found." };

    const old = existing[0];
    if (!(await isStudentInScope(old.studentId, session))) {
      return {
        status: "error",
        error: "You do not have access to delete this student's grade.",
      };
    }
    if (old.isSuperseded) {
      return {
        status: "error",
        error: "This grade is part of the correction history and cannot be deleted.",
      };
    }

    try {
      await db.delete(grades).where(eq(grades.id, id));
    } catch (err) {
      const e = parseDbError(err);
      if (e.type === "foreign_key")
        return {
          status: "error",
          error:
            "Cannot delete this grade — it is referenced by other records.",
        };
      console.error("[deleteGradeAction]", err);
      return {
        status: "error",
        error: "Failed to delete grade. Please try again.",
      };
    }

    const meta = extractRequestMeta(await headers());
    await logAuditEvent({
      adminId: session.adminId,
      action: "DELETE_GRADE",
      entity: "grades",
      entityId: id,
      before: old as Record<string, unknown>,
      ...meta,
    });

    revalidatePath(`/students/${old.studentId}`);
    revalidatePath(`/transcripts/${old.studentId}`);
    return { status: "success" };
  }, "[deleteGradeAction]");
}

// ─── READ HELPERS ─────────────────────────────────────────────────────────────

export async function getGradesForStudent(studentId: string) {
  const session = await assertPermission("view_grades");
  if (!(await isStudentInScope(studentId, session))) return [];

  return db
    .select({
      id: grades.id,
      courseId: grades.courseId,
      semesterId: grades.semesterId,
      grade: grades.grade,
      gradePoint: grades.gradePoint,
      creditHours: grades.creditHours,
      computedQualityPoints: grades.computedQualityPoints,
      isResit: grades.isResit,
      createdAt: grades.createdAt,
      courseCode: courses.code,
      courseTitle: courses.title,
      isScoring: courses.isScoring,
      semesterYear: semesters.year,
      semesterTerm: semesters.semester,
    })
    .from(grades)
    .innerJoin(courses, eq(grades.courseId, courses.id))
    .innerJoin(semesters, eq(grades.semesterId, semesters.id))
    .where(and(eq(grades.studentId, studentId), eq(grades.isSuperseded, false)))
    .orderBy(semesters.year, semesters.semester, courses.code);
}

export async function getGradeById(id: string) {
  const session = await assertPermission("view_grades");
  const rows = await db
    .select({
      id: grades.id,
      studentId: grades.studentId,
      courseId: grades.courseId,
      semesterId: grades.semesterId,
      grade: grades.grade,
      gradePoint: grades.gradePoint,
      creditHours: grades.creditHours,
      computedQualityPoints: grades.computedQualityPoints,
      createdAt: grades.createdAt,
      courseCode: courses.code,
      courseTitle: courses.title,
    })
    .from(grades)
    .innerJoin(courses, eq(grades.courseId, courses.id))
    .where(eq(grades.id, id))
    .limit(1);
  const grade = rows[0];
  if (!grade || !(await isStudentInScope(grade.studentId, session))) return null;
  return grade;
}

/**
 * Verify that a (student, course, semester) combination does not already
 * have a grade. Used by form pre-validation before submission.
 */
export async function gradeExists(
  studentId: string,
  courseId: string,
  semesterId: string,
): Promise<boolean> {
  const session = await assertPermission("enter_grades");
  if (!(await isStudentInScope(studentId, session))) return false;

  const rows = await db
    .select({ id: grades.id })
    .from(grades)
    .where(
      and(
        eq(grades.studentId, studentId),
        eq(grades.courseId, courseId),
        eq(grades.semesterId, semesterId),
        eq(grades.isSuperseded, false),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
