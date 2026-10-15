/**
 * app/(app)/students/page.tsx
 *
 * Search-on-demand: no DB query until the user submits a search.
 * Accepts ?q= URL param — populated by the search form in StudentsClient.
 */
import { requireAuth } from "@/lib/auth/rbac";
import { searchStudents } from "@/actions/crud/students";
import { getProgrammes } from "@/actions/crud/programmes";
import { getCampuses } from "@/actions/crud/campuses";
import { StudentsClient } from "./_components/students-client";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireAuth();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const campusIds = session.role === "SUPER_ADMIN"
    ? null
    : (session.campusIds ?? []);

  // Only run the student query when there is an actual search term
  const [students, programmes, campuses] = await Promise.all([
    query.length >= 2
      ? searchStudents(query, campusIds)
      : Promise.resolve([]),
    getProgrammes(),
    getCampuses(),
  ]);

  return (
    <StudentsClient
      initial={students}
      programmes={programmes}
      campuses={campuses}
      initialQuery={query}
    />
  );
}