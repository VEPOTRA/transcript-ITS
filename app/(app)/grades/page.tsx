/**
 * app/(app)/grades/page.tsx
 *
 * Fixed: no longer pre-loads all students (was causing blank page).
 * Students are searched on-demand inside the grade entry form.
 * This page only loads semesters and courses — both are small sets.
 */
import { requireAuth } from "@/lib/auth/rbac";
import { getSemesters } from "@/actions/crud/semesters";
import { getActiveCourses } from "@/actions/crud/courses";
import { GradesClient } from "./_components/grades-client";

export default async function GradesPage() {
  await requireAuth();

  // Only load the small reference tables — NOT all students
  const [semesters, courses] = await Promise.all([
    getSemesters(),
    getActiveCourses(),
  ]);

  return (
    <GradesClient
      students={[]}
      semesters={semesters}
      courses={courses}
    />
  );
}