/**
 * app/(app)/transcripts/page.tsx  — SERVER COMPONENT
 *
 * No onClick, no window.*, no useState — those stay in child client components.
 * Server component fetches data, renders static JSX and client islands.
 */

import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/rbac";
import { db } from "@/db";
import { students, transcripts, programmes, campuses } from "@/db/schema";
import { and, eq, ilike, or, desc, inArray, sql } from "drizzle-orm";
import { assembleTranscript } from "@/lib/transcript";
import { TranscriptPreview } from "@/components/transcript/preview";
import { PrintButton } from "@/components/transcript/search-controls";

export const metadata: Metadata = { title: "Transcripts — UEW-TMS" };

type PageProps = { searchParams: Promise<{ q?: string }> };

type StudentRow = {
  id: string;
  indexNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  programmeName: string | null;
  level: number;
  entryYear: string;
  graduationYear: string | null;
  email: string | null;
  phoneNumber: string | null;
  status: string;
  campusName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  studentType: string;
};

export default async function TranscriptsPage({ searchParams }: PageProps) {
  const session = await requireAuth();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  // ── Search ────────────────────────────────────────────────────────────────
  let matched: StudentRow[] = [];
  if (
    query &&
    (session.role === "SUPER_ADMIN" || session.campusIds.length > 0)
  ) {
    // Build campus-aware search filter
    const searchCondition = or(
      ilike(students.indexNumber, `%${query}%`),
      ilike(sql`concat_ws(' ', ${students.firstName}, ${students.middleName}, ${students.lastName})`, `%${query}%`),
      ilike(sql`COALESCE(${students.email}, '')`, `%${query}%`),
      ilike(sql`COALESCE(${students.phoneNumber}, '')`, `%${query}%`),
    );

    // SUPER_ADMIN searches all campuses; others only their campus
    const campusCampusIds = session.campusIds ?? [];
    const campusCondition = session.role !== "SUPER_ADMIN"
      ? inArray(students.campusId, campusCampusIds)
      : undefined;

    matched = await db
      .select({
        id: students.id,
        indexNumber: students.indexNumber,
        firstName: students.firstName,
        middleName: students.middleName,
        lastName: students.lastName,
        programmeName: programmes.name,
        level: students.level,
        entryYear: students.entryYear,
        graduationYear: students.graduationYear,
        email: students.email,
        phoneNumber: students.phoneNumber,
        status: students.status,
        campusName: campuses.name,
        dateOfBirth: students.dateOfBirth,
        gender: students.gender,
        studentType: students.studentType,
      })
      .from(students)
      .leftJoin(programmes, eq(students.programmeId, programmes.id))
      .leftJoin(campuses, eq(students.campusId, campuses.id))
      .where(campusCondition ? and(searchCondition, campusCondition) : searchCondition)
      .orderBy(students.lastName, students.firstName)
      .limit(20);
  }

  // ── Inline transcript when exactly one match ──────────────────────────────
  type AssembleResult = Awaited<ReturnType<typeof assembleTranscript>>;
  let inlineResult: AssembleResult | null = null;
  let latestRecord: { id: string; transcriptNumber: string; createdAt: Date } | null = null;

  if (matched.length === 1) {
    const sid = matched[0].id;
    const [assembled, records] = await Promise.all([
      assembleTranscript(sid),
      db
        .select({ id: transcripts.id, transcriptNumber: transcripts.transcriptNumber, createdAt: transcripts.createdAt })
        .from(transcripts)
        .where(eq(transcripts.studentId, sid))
        .orderBy(desc(transcripts.createdAt))
        .limit(1),
    ]);
    inlineResult = assembled;
    latestRecord = records[0] ?? null;
  }

  // ── Recent history (no onClick — each row is a plain link) ───────────────
  let recent: {
    id: string;
    transcriptNumber: string;
    createdAt: Date;
    idx: string;
    first: string;
    last: string;
    prog: string | null;
  }[] = [];
  let recentLoadError = false;
  if (!query && (session.role === "SUPER_ADMIN" || session.campusIds.length > 0)) {
    const recentQuery = db
      .select({
        id: transcripts.id,
        transcriptNumber: transcripts.transcriptNumber,
        createdAt: transcripts.createdAt,
        idx: students.indexNumber,
        first: students.firstName,
        last: students.lastName,
        prog: programmes.name,
      })
      .from(transcripts)
      .innerJoin(students, eq(transcripts.studentId, students.id))
      .innerJoin(programmes, eq(students.programmeId, programmes.id));

    try {
      recent = session.role === "SUPER_ADMIN"
        ? await recentQuery.orderBy(desc(transcripts.createdAt)).limit(20)
        : await recentQuery
            .where(inArray(students.campusId, session.campusIds))
            .orderBy(desc(transcripts.createdAt))
            .limit(20);
    } catch (error) {
      console.error("[TranscriptsPage] Failed to load recent transcripts:", error);
      recentLoadError = true;
    }
  }

  // ── Render inline transcript ──────────────────────────────────────────────
  if (inlineResult?.ok) {
    const { transcript } = inlineResult;
    const display = latestRecord
      ? { ...transcript, transcriptNumber: latestRecord.transcriptNumber, generatedAt: latestRecord.createdAt.toISOString() }
      : { ...transcript, transcriptNumber: "PREVIEW", generatedAt: new Date().toISOString() };

    return (
      <div>
        <StudentBioOverview student={matched[0]} query={query} />
        {/* Transcript preview — no interactivity, just static JSX */}
        <div data-transcript-ref={display.transcriptNumber}>
          <TranscriptPreview transcript={display} latestRecordId={latestRecord?.id ?? null} />
        </div>
      </div>
    );
  }

  // ── Assembly error ────────────────────────────────────────────────────────
  if (inlineResult && !inlineResult.ok) {
    return (
      <div className="space-y-6">
        {matched.length === 1
          ? <StudentBioOverview student={matched[0]} query={query} showPrint={false} />
          : <SearchForm query={query} />}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {inlineResult.error.message}
        </div>
      </div>
    );
  }

  // ── Default view ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Transcripts</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Search by name or index number — the transcript loads instantly on this page.
        </p>
      </div>

      <SearchForm query={query} autoFocus />

      {recentLoadError && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
        >
          Recent transcript history is temporarily unavailable.
        </p>
      )}

      {/* Multiple matches — student overview cards with plain anchor links */}
      {query && matched.length > 1 && (
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-indigo-950 dark:text-white">Choose a student</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Showing {matched.length} matches for &ldquo;{query}&rdquo;. Select a student to open their transcript.
              </p>
            </div>
            {matched.length === 20 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">Refine your search to narrow these results.</p>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {matched.map((student) => (
              <StudentOverviewCard key={student.id} student={student} />
            ))}
          </div>
        </section>
      )}

      {/* No results */}
      {query && matched.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 py-12 text-center dark:border-gray-700 dark:bg-gray-900/30">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No students found</p>
          <p className="mt-1 text-xs text-gray-500">No results for &ldquo;{query}&rdquo;</p>
        </div>
      )}

      {/* Recent transcripts — anchor links, no onClick */}
      {recent.length > 0 && (
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">
            Recent transcripts
          </h2>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  {["Reference", "Student", "Programme", "Date"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {recent.map((t) => (
                  /* Anchor wrapping the whole row — no JS event handlers */
                  <tr key={t.id} className="group">
                    <td className="px-0 py-0" colSpan={4}>
                      <a href={`/transcripts?q=${encodeURIComponent(t.idx)}`}
                        className="grid grid-cols-4 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-colors">
                        <span className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{t.transcriptNumber}</span>
                        <span className="px-4 py-3">
                          <span className="block font-medium text-gray-900 dark:text-gray-100">{t.first} {t.last}</span>
                          <span className="font-mono text-xs text-gray-400">{t.idx}</span>
                        </span>
                        <span className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.prog}</span>
                        <span className="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-gray-400">
                          {new Date(t.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Pure server sub-components (no interactivity) ─────────────────────────────

function SearchForm({
  query,
  autoFocus,
  wide = false,
}: {
  query: string;
  autoFocus?: boolean;
  wide?: boolean;
}) {
  return (
    <form method="GET" className={`flex w-full min-w-0 gap-3 ${wide ? "flex-1" : "max-w-2xl"}`}>
      <input name="q" type="search" defaultValue={query} autoFocus={autoFocus}
        placeholder="Search index number, name, email or phone…"
        className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm placeholder:text-slate-400 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
      <button type="submit"
        className="rounded-xl bg-blue-600 px-7 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
        Search 
      </button>
      {query && (
        <a href="/transcripts"
          className="inline-flex items-center rounded-xl border border-slate-300 px-7 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          Clear
        </a>
      )}
    </form>
  );
}

function StudentOverviewCard({ student }: { student: StudentRow }) {
  const fullName = [student.firstName, student.middleName, student.lastName]
    .filter(Boolean)
    .join(" ");
  const initials = [student.firstName, student.lastName]
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
  const active = student.status === "ACTIVE";

  return (
    <a
      href={`/transcripts?q=${encodeURIComponent(student.indexNumber)}`}
      className="group flex min-h-44 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-800 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
    >
      <div className="flex items-start gap-3">
        <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-900 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-800">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-semibold text-slate-950 group-hover:text-indigo-900 dark:text-white dark:group-hover:text-indigo-200">
              {fullName}
            </h3>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${active ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
              {student.status.toLowerCase()}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs font-medium text-slate-600 dark:text-slate-400">
            {student.indexNumber}
          </p>
        </div>
      </div>

      <p className="mt-4 line-clamp-2 text-xs font-medium leading-5 text-slate-700 dark:text-slate-300">
        {student.programmeName ?? "Programme not assigned"}
      </p>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span>Level {student.level}</span>
        <span>Entry {student.entryYear}</span>
        {student.graduationYear && <span>Graduation {student.graduationYear}</span>}
        {student.campusName && <span>{student.campusName}</span>}
      </div>

      {(student.email || student.phoneNumber) && (
        <p className="mt-3 truncate border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {student.email ?? student.phoneNumber}
        </p>
      )}

      <span className="mt-auto flex items-center justify-end gap-1 pt-4 text-xs font-semibold text-indigo-800 group-hover:text-red-800 dark:text-indigo-300 dark:group-hover:text-red-300">
        View transcript
        <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </span>
    </a>
  );
}

function StudentBioOverview({
  student,
  query,
  showPrint = true,
}: {
  student: StudentRow;
  query: string;
  showPrint?: boolean;
}) {
  const fullName = [student.firstName, student.middleName, student.lastName]
    .filter(Boolean)
    .join(" ");
  const initials = [student.firstName, student.lastName]
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
  const gender = student.gender?.trim().toUpperCase();
  const genderLabel =
    gender === "F" || gender === "FEMALE"
      ? "Female"
      : gender === "M" || gender === "MALE"
        ? "Male"
        : student.gender || "Not recorded";
  const birthDate = student.dateOfBirth
    ? new Date(`${student.dateOfBirth}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Not recorded";
  const active = student.status === "ACTIVE";

  return (
    <section
      aria-label="Selected student details"
      className="print:hidden mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="h-1 bg-red-700" />
      <div className="bg-blue-600 px-5 py-5 text-white sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-white/80 bg-white p-1 shadow-sm">
              <span className="flex h-full w-full items-center justify-center rounded-full bg-indigo-50 text-lg font-bold text-indigo-950">
                {initials}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-200">
                University of Education, Winneba · Transcript services
              </p>
              <h2 className="mt-1 text-lg font-semibold leading-snug sm:text-xl">{fullName}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-indigo-100">
                <span className="font-mono font-medium">{student.indexNumber}</span>
                <span aria-hidden="true">·</span>
                <span>{student.programmeName ?? "Programme not assigned"}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-indigo-100">
                <span>Entry {student.entryYear}</span>
                <span aria-hidden="true">·</span>
                <span>Level {student.level}</span>
                {student.graduationYear && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Graduation {student.graduationYear}</span>
                  </>
                )}
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${active ? "bg-emerald-300/15 text-emerald-100 ring-1 ring-inset ring-emerald-200/30" : "bg-white/10 text-white/80 ring-1 ring-inset ring-white/20"}`}>
                  {student.status.toLowerCase()}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-x-6 gap-y-3 border-t border-white/15 pt-4 sm:grid-cols-2 lg:min-w-[17rem] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <BioField label="Email" value={student.email ?? "Not recorded"} />
            <BioField label="Phone" value={student.phoneNumber ?? "Not recorded"} />
            <BioField label="Date of birth" value={birthDate} />
            <BioField label="Gender" value={genderLabel} />
            <BioField label="Student type" value={student.studentType.replaceAll("_", " ")} />
            {student.campusName && <BioField label="Campus" value={student.campusName} />}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:p-5 lg:flex-row lg:items-center dark:border-slate-700 dark:bg-slate-800/60">
        <SearchForm query={query} wide />
        {showPrint && (
          <div className="flex shrink-0 lg:ml-auto">
            <PrintButton />
          </div>
        )}
      </div>
    </section>
  );
}

function BioField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-200/80">
        {label}
      </p>
      <p className="mt-0.5 break-words text-xs font-medium text-white">{value}</p>
    </div>
  );
}

// ── Client island for print button only ──────────────────────────────────────