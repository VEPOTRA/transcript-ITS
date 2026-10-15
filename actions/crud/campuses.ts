"use server";

/**
 * actions/crud/campuses.ts
 * Campus CRUD + admin-campus assignment (many-to-many).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { campuses, admins, adminCampuses } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { assertPermission } from "@/lib/auth/rbac";
import type { ActionState } from "@/types/auth";

export type Campus = typeof campuses.$inferSelect;

const campusSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(255),
  code: z.string().min(1, "Code is required").max(50),
  address: z.string().optional(),
});

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getCampuses(): Promise<Campus[]> {
  return db.select().from(campuses).orderBy(campuses.name);
}

export async function getCampusById(id: string): Promise<Campus | null> {
  const [row] = await db
    .select()
    .from(campuses)
    .where(eq(campuses.id, id))
    .limit(1);
  return row ?? null;
}

/** Returns all campus IDs assigned to a given admin (empty = SUPER_ADMIN) */
export async function getAdminCampusIds(adminId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ campusId: adminCampuses.campusId })
      .from(adminCampuses)
      .where(eq(adminCampuses.adminId, adminId));
    return rows.map((r) => r.campusId);
  } catch {
    // Table doesn't exist yet — run migration-admin-campuses.sql in Neon SQL Editor
    return [];
  }
}

/** Returns campuses with their assigned admin count */
export async function getCampusesWithStats() {
  const all = await db.select().from(campuses).orderBy(campuses.name);
  const assigns = await db.select().from(adminCampuses);
  const countMap = new Map<string, number>();
  for (const a of assigns) {
    countMap.set(a.campusId, (countMap.get(a.campusId) ?? 0) + 1);
  }
  return all.map((c) => ({ ...c, adminCount: countMap.get(c.id) ?? 0 }));
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createCampusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  await assertPermission("manage_institution");

  const parsed = campusSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    address: formData.get("address") || undefined,
  });
  if (!parsed.success)
    return { status: "error", error: parsed.error.issues[0].message };

  try {
    const [created] = await db
      .insert(campuses)
      .values({
        name: parsed.data.name,
        code: parsed.data.code.toUpperCase(),
        address: parsed.data.address ?? null,
        isActive: true,
      })
      .returning({ id: campuses.id });
    revalidatePath("/admin/campuses");
    return { status: "success", data: { id: created.id } };
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("unique") || msg.includes("duplicate"))
      return {
        status: "error",
        error: "A campus with that name or code already exists.",
      };
    return {
      status: "error",
      error: "Failed to create campus. Please try again.",
    };
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateCampusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertPermission("manage_institution");
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", error: "Missing campus ID." };

  const parsed = campusSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    address: formData.get("address") || undefined,
  });
  if (!parsed.success)
    return { status: "error", error: parsed.error.issues[0].message };

  await db
    .update(campuses)
    .set({
      name: parsed.data.name,
      code: parsed.data.code.toUpperCase(),
      address: parsed.data.address ?? null,
    })
    .where(eq(campuses.id, id));

  revalidatePath("/admin/campuses");
  return { status: "success" };
}

// ─── Toggle active ────────────────────────────────────────────────────────────

export async function toggleCampusActiveAction(
  id: string,
): Promise<ActionState> {
  await assertPermission("manage_institution");
  const [campus] = await db
    .select()
    .from(campuses)
    .where(eq(campuses.id, id))
    .limit(1);
  if (!campus) return { status: "error", error: "Campus not found." };
  await db
    .update(campuses)
    .set({ isActive: !campus.isActive })
    .where(eq(campuses.id, id));
  revalidatePath("/admin/campuses");
  return { status: "success" };
}

// ─── Assign campuses to admin (replaces all existing assignments) ─────────────

export async function setAdminCampusesAction(
  adminId: string,
  campusIds: string[],
): Promise<ActionState> {
  await assertPermission("manage_users");

  // Delete all existing assignments for this admin
  await db.delete(adminCampuses).where(eq(adminCampuses.adminId, adminId));

  // Insert new assignments (if any)
  if (campusIds.length > 0) {
    await db
      .insert(adminCampuses)
      .values(campusIds.map((campusId) => ({ adminId, campusId })));
  }

  revalidatePath("/admin/users");
  return { status: "success" };
}

// ─── Add a single campus to an admin ─────────────────────────────────────────

export async function addAdminCampusAction(
  adminId: string,
  campusId: string,
): Promise<ActionState> {
  await assertPermission("manage_users");
  try {
    await db.insert(adminCampuses).values({ adminId, campusId });
    revalidatePath("/admin/users");
    return { status: "success" };
  } catch {
    return { status: "error", error: "Campus already assigned to this admin." };
  }
}

// ─── Remove a single campus from an admin ────────────────────────────────────

export async function removeAdminCampusAction(
  adminId: string,
  campusId: string,
): Promise<ActionState> {
  await assertPermission("manage_users");
  await db.delete(adminCampuses).where(eq(adminCampuses.adminId, adminId));
  revalidatePath("/admin/users");
  return { status: "success" };
}

// ─── Assign student to campus ────────────────────────────────────────────────

export async function assignStudentCampusAction(
  studentId: string,
  campusId: string,
): Promise<ActionState> {
  await assertPermission("manage_students");
  const { students } = await import("@/db/schema");
  await db.update(students).set({ campusId }).where(eq(students.id, studentId));
  revalidatePath("/students");
  return { status: "success" };
}
