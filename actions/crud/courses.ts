"use server";

/**
 * Courses CRUD server actions.
 *
 * Permissions: manage_courses (ADMIN+)
 *
 * isScoring controls whether a course counts toward GPA.
 * isActive controls whether the course appears in new grade-entry dropdowns.
 * Both flags can be toggled independently without deleting.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { courses, grades } from "@/db/schema";
import { assertPermission } from "@/lib/auth/rbac";
import { logAuditEvent, extractRequestMeta } from "@/lib/audit";
import { parseDbError, dbErrorMessage, withAction } from "@/lib/actions/utils";
import type { ActionState } from "@/types/auth";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const courseSchema = z.object({
  code: z
    .string({ required_error: "Course code is required" })
    .trim()
    .min(2, "Code must be at least 2 characters")
    .max(50, "Code must be at most 50 characters")
    .toUpperCase(),
  title: z
    .string({ required_error: "Title is required" })
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(255, "Title must be at most 255 characters"),
  creditHours: z.coerce
    .number({ invalid_type_error: "Credit hours must be a number" })
    .int("Credit hours must be a whole number")
    .min(1, "Minimum credit hours is 1")
    .max(6, "Maximum credit hours is 6"),
  isScoring: z
    .string()
    .optional()
    .transform((v) => v !== "false"), // defaults true; "false" string → false
});

const courseUpdateSchema = courseSchema.partial().extend({
  id: z.string().uuid("Invalid course ID"),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Course = typeof courses.$inferSelect;

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function createCourseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return withAction(async () => {
    const session = await assertPermission("manage_courses");

    const parsed = courseSchema.safeParse({
      code: formData.get("code"),
      title: formData.get("title"),
      creditHours: formData.get("creditHours"),
      isScoring: formData.get("isScoring"),
    });

    if (!parsed.success) {
      return {
        status: "error",
        error: "Please correct the errors below.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    let record: Course;
    try {
      [record] = await db
        .insert(courses)
        .values({ ...parsed.data, sourceCourseId: 0 })
        .returning();
    } catch (err) {
      const e = parseDbError(err);
      if (e.type === "unique") {
        return {
          status: "error",
          error: "A course with this code already exists.",
          fieldErrors: { code: ["Course code already in use"] },
        };
      }
      return { status: "error", error: dbErrorMessage(e, "courses") };
    }

    const meta = extractRequestMeta(await headers());
    await logAuditEvent({
      adminId: session.adminId,
      action: "CREATE_COURSE",
      entity: "courses",
      entityId: record.id,
      after: record as Record<string, unknown>,
      ...meta,
    });

    revalidatePath("/courses");
    return { status: "success", data: { id: record.id } };
  }, "[createCourseAction]");
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

/**
 * Update course fields.
 *
 * Changing creditHours on a course that already has grade records is
 * safe because each grade row stores a creditHours snapshot at write time.
 * Existing GPA computations are unaffected. Future grades will use the
 * new value (fetched server-side at grade-entry time).
 */
export async function updateCourseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAction(async () => {
    const session = await assertPermission("manage_courses");

    const parsed = courseUpdateSchema.safeParse({
      id: formData.get("id"),
      code: formData.get("code"),
      title: formData.get("title"),
      creditHours: formData.get("creditHours"),
      isScoring: formData.get("isScoring"),
    });

    if (!parsed.success) {
      return {
        status: "error",
        error: "Please correct the errors below.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const { id, ...fields } = parsed.data;

    const existing = await db
      .select()
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1);
    if (existing.length === 0)
      return { status: "error", error: "Course not found." };

    let updated: Course;
    try {
      [updated] = await db
        .update(courses)
        .set(fields)
        .where(eq(courses.id, id))
        .returning();
    } catch (err) {
      const e = parseDbError(err);
      if (e.type === "unique") {
        return {
          status: "error",
          error: "A course with this code already exists.",
          fieldErrors: { code: ["Course code already in use"] },
        };
      }
      return { status: "error", error: dbErrorMessage(e, "courses") };
    }

    const meta = extractRequestMeta(await headers());
    await logAuditEvent({
      adminId: session.adminId,
      action: "UPDATE_COURSE",
      entity: "courses",
      entityId: id,
      before: existing[0] as Record<string, unknown>,
      after: updated as Record<string, unknown>,
      ...meta,
    });

    revalidatePath("/courses");
    revalidatePath(`/courses/${id}`);
    return { status: "success" };
  }, "[updateCourseAction]");
}

// ─── TOGGLE FLAGS ─────────────────────────────────────────────────────────────

export async function toggleCourseActiveAction(
  id: string,
): Promise<ActionState> {
  return withAction(async () => {
    const session = await assertPermission("manage_courses");

    const existing = await db
      .select()
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1);
    if (existing.length === 0)
      return { status: "error", error: "Course not found." };

    const [updated] = await db
      .update(courses)
      .set({ isActive: !existing[0].isActive })
      .where(eq(courses.id, id))
      .returning();

    const meta = extractRequestMeta(await headers());
    await logAuditEvent({
      adminId: session.adminId,
      action: "UPDATE_COURSE",
      entity: "courses",
      entityId: id,
      before: { isActive: existing[0].isActive },
      after: { isActive: updated.isActive },
      ...meta,
    });

    revalidatePath("/courses");
    return { status: "success" };
  }, "[toggleCourseActiveAction]");
}

export async function toggleCourseScoringAction(
  id: string,
): Promise<ActionState> {
  return withAction(async () => {
    const session = await assertPermission("manage_courses");

    const existing = await db
      .select()
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1);
    if (existing.length === 0)
      return { status: "error", error: "Course not found." };

    const [updated] = await db
      .update(courses)
      .set({ isScoring: !existing[0].isScoring })
      .where(eq(courses.id, id))
      .returning();

    const meta = extractRequestMeta(await headers());
    await logAuditEvent({
      adminId: session.adminId,
      action: "UPDATE_COURSE",
      entity: "courses",
      entityId: id,
      before: { isScoring: existing[0].isScoring },
      after: { isScoring: updated.isScoring },
      ...meta,
    });

    revalidatePath("/courses");
    return { status: "success" };
  }, "[toggleCourseScoringAction]");
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function deleteCourseAction(id: string): Promise<ActionState> {
  return withAction(async () => {
    const session = await assertPermission("manage_courses");

    const existing = await db
      .select()
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1);
    if (existing.length === 0)
      return { status: "error", error: "Course not found." };

    // Guard: refuse deletion if grades reference this course
    const hasGrades = await db
      .select({ id: grades.id })
      .from(grades)
      .where(eq(grades.courseId, id))
      .limit(1);
    if (hasGrades.length > 0) {
      return {
        status: "error",
        error:
          "Cannot delete this course — it has grade records. Deactivate it instead.",
      };
    }

    try {
      await db.delete(courses).where(eq(courses.id, id));
    } catch (err) {
      const e = parseDbError(err);
      if (e.type === "foreign_key")
        return {
          status: "error",
          error:
            "Cannot delete this course — it is referenced by other records.",
        };
      return { status: "error", error: dbErrorMessage(e, "courses") };
    }

    const meta = extractRequestMeta(await headers());
    await logAuditEvent({
      adminId: session.adminId,
      action: "DELETE_COURSE",
      entity: "courses",
      entityId: id,
      before: existing[0] as Record<string, unknown>,
      ...meta,
    });

    revalidatePath("/courses");
    return { status: "success" };
  }, "[deleteCourseAction]");
}

// ─── READ HELPERS ─────────────────────────────────────────────────────────────

export async function getCourses() {
  return db.select().from(courses).orderBy(courses.code);
}

export async function getActiveCourses() {
  return db
    .select()
    .from(courses)
    .where(eq(courses.isActive, true))
    .orderBy(courses.code);
}

export async function getCourseById(id: string): Promise<Course | null> {
  const rows = await db
    .select()
    .from(courses)
    .where(eq(courses.id, id))
    .limit(1);
  return rows[0] ?? null;
}
