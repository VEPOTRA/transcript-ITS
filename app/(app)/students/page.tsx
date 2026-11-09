/**
 * app/(app)/students/page.tsx
 *
 * Search-on-demand: no DB query until the user submits a search.
 * Accepts ?q= URL param — populated by the search form in StudentsClient.
 */
import { can, requireAuth } from "@/lib/auth/rbac";
import { searchStudents } from "@/actions/crud/students";
import { getProgrammes } from "@/actions/crud/programmes";
import { getCampuses } from "@/actions/crud/campuses";
import type { StudentSearchFilters } from "@/actions/crud/students";
import { studentStatusEnum, studentTypeEnum } from "@/db/schema";
import { StudentsClient } from "./_components/students-client";

type SearchParams = {
  q?: string;
  indexNumber?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  programmeId?: string;
  campusId?: string;
  level?: string;
  entryYear?: string;
  graduationYear?: string;
  dateOfBirth?: string;
  studentType?: string;
  status?: string;
  gender?: string;
};

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireAuth();
  const params = await searchParams;
  const rawQuery = params.q?.trim() ?? "";
  const query = rawQuery.length >= 2 ? rawQuery : "";

  const campusIds = session.role === "SUPER_ADMIN"
    ? null
    : (session.campusIds ?? []);

  const levelValue = params.level?.trim() ?? "";
  const parsedLevel = /^\d{1,3}$/.test(levelValue) ? Number(levelValue) : undefined;
  const isUuid = (value: string | undefined) =>
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const status = studentStatusEnum.enumValues.find((value) => value === params.status);
  const studentType = studentTypeEnum.enumValues.find(
    (value) => value === params.studentType,
  );
  const filters: StudentSearchFilters = {
    indexNumber: params.indexNumber?.trim() || undefined,
    firstName: params.firstName?.trim() || undefined,
    middleName: params.middleName?.trim() || undefined,
    lastName: params.lastName?.trim() || undefined,
    email: params.email?.trim() || undefined,
    phoneNumber: params.phoneNumber?.trim() || undefined,
    programmeId: isUuid(params.programmeId) ? params.programmeId : undefined,
    campusId: isUuid(params.campusId) ? params.campusId : undefined,
    level: parsedLevel !== undefined && parsedLevel >= 100 && parsedLevel <= 900
      ? parsedLevel
      : undefined,
    entryYear: params.entryYear?.trim() || undefined,
    graduationYear: params.graduationYear?.trim() || undefined,
    dateOfBirth: /^\d{4}-\d{2}-\d{2}$/.test(params.dateOfBirth ?? "")
      ? params.dateOfBirth
      : undefined,
    studentType,
    status,
    gender: params.gender === "MALE" || params.gender === "FEMALE" || params.gender === "OTHER"
      ? params.gender
      : undefined,
  };
  const hasCriteria = Object.values(filters).some((value) => value !== undefined);
  const initialFilters = {
    indexNumber: filters.indexNumber ?? "",
    firstName: filters.firstName ?? "",
    middleName: filters.middleName ?? "",
    lastName: filters.lastName ?? "",
    email: filters.email ?? "",
    phoneNumber: filters.phoneNumber ?? "",
    programmeId: filters.programmeId ?? "",
    campusId: filters.campusId ?? "",
    level: filters.level?.toString() ?? "",
    entryYear: filters.entryYear ?? "",
    graduationYear: filters.graduationYear ?? "",
    dateOfBirth: filters.dateOfBirth ?? "",
    studentType: filters.studentType ?? "",
    status: filters.status ?? "",
    gender: filters.gender ?? "",
  };

  // Only run the student query when a search term or specific filter is supplied.
  const [students, programmes, allCampuses] = await Promise.all([
    (query.length >= 2 || hasCriteria)
      ? searchStudents(query.length >= 2 ? query : "", campusIds, filters)
      : Promise.resolve([]),
    getProgrammes(),
    getCampuses(),
  ]);
  const campuses = session.role === "SUPER_ADMIN"
    ? allCampuses
    : allCampuses.filter((campus) => session.campusIds.includes(campus.id));

  return (
    <StudentsClient
      initial={students}
      programmes={programmes}
      campuses={campuses}
      initialQuery={query}
      initialFilters={initialFilters}
      canCreateStudents={can(session, "manage_students")}
      canEditStudents={can(session, "manage_students")}
      canDeleteStudents={session.role === "SUPER_ADMIN"}
    />
  );
}