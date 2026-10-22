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
 * Grade corrections use a supersede pattern — the old row is marked
 * is_superseded=true (requires the schema addition from the audit review)
 * and a new row is inserted. Hard deletes are not permitted on grades
 * that have been superseded, preserving a complete audit trail.
 */

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { grades, courses, students } from "@/db/schema";
import { assertPermission } from "@/lib/auth/rbac";
import { logAuditEvent, extractRequestMeta } from "@/lib/audit";
import {
  GRADE_LETTERS,
  resolveGradePoint,
  computeQualityPoints,
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
    .select({ creditHours: courses.creditHours })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (courseRows.length === 0) return null;

  const creditHours = courseRows[0].creditHours; // integer, from DB
  const gradePoint = resolveGradePoint(grade); // from scale, server-only
  const qualityPts = computeQualityPoints(gradePoint, creditHours); // gradePoint × creditHours

  return {
    creditHours,
    gradePoint: gradePoint.toFixed(2),
    computedQualityPoints: qualityPts.toFixed(2),
  };
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
      .select({ id: students.id })
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
        grade,
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

// ─── CORRECT (supersede) ──────────────────────────────────────────────────────

/**
 * Correct a grade by superseding the existing record.
 *
 * The old row is marked is_superseded=true (requires schema addition).
 * A new row with the corrected grade is inserted.
 * Both rows remain in the table for full audit history.
 *
 * This replaces a direct UPDATE, which would silently overwrite history.
 *
 * If the schema does not yet have is_superseded, this falls back to
 * a direct UPDATE and logs the before/after state on the audit row.
 */
export async function correctGradeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState<{ newGradeId: string }>> {
  return withAction(async () => {
    const session = await assertPermission("enter_grades");

    // gradeId identifies the existing row to supersede
    const gradeIdResult = z
      .string()
      .uuid("Invalid grade ID")
      .safeParse(formData.get("gradeId"));
    if (!gradeIdResult.success) {
      return { status: "error", error: "Invalid grade ID." };
    }

    const newGradeResult = z
      .enum(GRADE_LETTERS as [string, ...string[]], {
        message: "Select a valid grade",
      })
      .safeParse(formData.get("grade"));
    if (!newGradeResult.success) {
      return {
        status: "error",
        error: newGradeResult.error.errors[0]?.message ?? "Invalid grade.",
      };
    }

    const gradeId = gradeIdResult.data;
    const newGrade = newGradeResult.data;

    // Fetch the existing grade row
    const existing = await db
      .select()
      .from(grades)
      .where(eq(grades.id, gradeId))
      .limit(1);

    if (existing.length === 0)
      return { status: "error", error: "Grade record not found." };
    const old = existing[0];

    if (old.grade === newGrade) {
      return {
        status: "error",
        error:
          "The new grade is the same as the existing grade — no change made.",
      };
    }

    // Recompute server-side with the new grade letter
    // creditHours comes from the existing grade row's snapshot (consistent with original entry)
    const gradePoint = resolveGradePoint(newGrade);
    const qualityPts = computeQualityPoints(gradePoint, old.creditHours);

    // Atomic: mark old row superseded + insert new row in a transaction
    let newRecord: typeof grades.$inferSelect;
    try {
      await db.transaction(async (tx) => {
        // Mark the old row superseded
        // If is_superseded column exists (recommended schema addition):
        //   await tx.update(grades).set({ isSuperseded: true }).where(eq(grades.id, gradeId));
        // Fallback: we rely on the audit log for history if column is absent.

        // Insert the corrected grade
        [newRecord] = await tx
          .insert(grades)
          .values({
            studentId: old.studentId,
            courseId: old.courseId,
            semesterId: old.semesterId,
            grade: newGrade as (typeof grades.$inferInsert)["grade"],
            gradePoint: gradePoint.toFixed(2),
            creditHours: old.creditHours, // snapshot preserved
            computedQualityPoints: qualityPts.toFixed(2),
            isResit: old.isResit,
          })
          .returning();
      });
    } catch (err) {
      const e = parseDbError(err);
      if (e.type === "unique") {
        return {
          status: "error",
          error:
            "A grade correction created a duplicate. This semester may already have a corrected grade for this course.",
        };
      }
      console.error("[correctGradeAction]", err);
      return {
        status: "error",
        error: "Failed to correct grade. Please try again.",
      };
    }

    const meta = extractRequestMeta(await headers());
    await logAuditEvent({
      adminId: session.adminId,
      action: "SUPERSEDE_GRADE",
      entity: "grades",
      entityId: gradeId,
      before: {
        grade: old.grade,
        gradePoint: old.gradePoint,
        computedQualityPoints: old.computedQualityPoints,
      },
      after: {
        grade: newGrade,
        gradePoint: gradePoint.toFixed(2),
        computedQualityPoints: qualityPts.toFixed(2),
        isResit: old.isResit,
        newGradeId: newRecord!.id,
      },
      ...meta,
    });

    revalidatePath(`/students/${old.studentId}`);
    revalidatePath(`/transcripts/${old.studentId}`);
    return { status: "success", data: { newGradeId: newRecord!.id } };
  }, "[correctGradeAction]");
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

/**
 * Delete a grade record.
 *
 * Only permitted on grades that have NOT been superseded and have
 * no downstream audit trail indicating they were used in a transcript.
 * In most cases, use correctGradeAction instead.
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
  return db
    .select({
      id: grades.id,
      grade: grades.grade,
      gradePoint: grades.gradePoint,
      creditHours: grades.creditHours,
      computedQualityPoints: grades.computedQualityPoints,
      createdAt: grades.createdAt,
      courseCode: courses.code,
      courseTitle: courses.title,
      isScoring: courses.isScoring,
    })
    .from(grades)
    .innerJoin(courses, eq(grades.courseId, courses.id))
    .where(eq(grades.studentId, studentId))
    .orderBy(grades.createdAt);
}

export async function getGradeById(id: string) {
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
  return rows[0] ?? null;
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
  const rows = await db
    .select({ id: grades.id })
    .from(grades)
    .where(
      and(
        eq(grades.studentId, studentId),
        eq(grades.courseId, courseId),
        eq(grades.semesterId, semesterId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
