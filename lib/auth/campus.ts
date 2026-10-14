/**
 * lib/auth/campus.ts — campus-aware query helpers.
 *
 * Use these wherever you need to enforce campus isolation.
 * SUPER_ADMIN (campusId = null) always gets unrestricted access.
 */

import { eq, and, type SQL } from "drizzle-orm";
import { students } from "@/db/schema";
import type { AuthenticatedAdmin } from "@/types/auth";

/**
 * Returns a Drizzle `where` condition that restricts a students query
 * to the admin's campus. Returns `undefined` for SUPER_ADMIN (no restriction).
 */
export function studentCampusFilter(
  session: AuthenticatedAdmin,
): SQL | undefined {
  if (session.role === "SUPER_ADMIN" || !session.campusIds) return undefined;
  return eq(students.campusId, session.campusIds);
}

/**
 * Returns true if this admin can access the given student's campus.
 */
export function canAccessStudent(
  session: AuthenticatedAdmin,
  studentCampusId: string | null,
): boolean {
  if (session.role === "SUPER_ADMIN") return true;
  if (!session.campusIds) return true; // shouldn't happen but fail open
  return session.campusIds === studentCampusId;
}

/**
 * Throws if the admin cannot access the student's campus.
 * Use in server actions that operate on a specific student.
 */
export function assertCampusAccess(
  session: AuthenticatedAdmin,
  studentCampusId: string | null,
  studentIndex?: string,
): void {
  if (!canAccessStudent(session, studentCampusId)) {
    throw new Error(
      studentIndex
        ? `You do not have access to student ${studentIndex} — they belong to a different campus.`
        : "You do not have access to this student's records.",
    );
  }
}
