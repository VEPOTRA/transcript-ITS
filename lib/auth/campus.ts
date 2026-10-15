/**
 * lib/auth/campus.ts — campus-aware query helpers.
 *
 * Uses campusIds: string[] (array) — empty = SUPER_ADMIN (unrestricted).
 * Import these wherever you need to enforce campus isolation.
 */

import { inArray, and, type SQL } from "drizzle-orm";
import { students } from "@/db/schema";
import type { AuthenticatedAdmin } from "@/types/auth";

/**
 * Returns a Drizzle WHERE condition that restricts a students query
 * to the admin's campuses. Returns undefined for SUPER_ADMIN (no restriction).
 */
export function studentCampusFilter(
  session: AuthenticatedAdmin,
): SQL | undefined {
  if (session.role === "SUPER_ADMIN") return undefined;
  if (!session.campusIds || session.campusIds.length === 0) return undefined;
  return inArray(students.campusId, session.campusIds);
}

/**
 * Returns true if this admin can access a student on the given campus.
 */
export function canAccessStudent(
  session: AuthenticatedAdmin,
  studentCampusId: string | null,
): boolean {
  if (session.role === "SUPER_ADMIN") return true;
  if (!session.campusIds || session.campusIds.length === 0) return true;
  if (!studentCampusId) return false;
  return session.campusIds.includes(studentCampusId);
}

/**
 * Throws if the admin cannot access the given student's campus.
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

/**
 * Convenience helper: returns the campusIds array from the session,
 * or null if SUPER_ADMIN (null means no filter — all campuses).
 */
export function sessionCampusIds(session: AuthenticatedAdmin): string[] | null {
  if (session.role === "SUPER_ADMIN") return null;
  if (!session.campusIds || session.campusIds.length === 0) return null;
  return session.campusIds;
}
