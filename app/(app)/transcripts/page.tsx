/**
 * app/(app)/transcripts/page.tsx  — SERVER COMPONENT
 *
 * No onClick, no window.*, no useState — those stay in child client components.
 * Server component fetches data, renders static JSX and client islands.
 */

import type { Metadata } from "next";
import { requireAuth, can } from "@/lib/auth/rbac";
import { db } from "@/db";
import { students, transcripts, programmes } from "@/db/schema";
import { and, eq, ilike, or, desc } from "drizzle-orm";
import { assembleTranscript } from "@/lib/transcript";
import { TranscriptPreview } from "@/components/transcript/preview";
import { TranscriptActionBar } from "@/components/transcript/action-bar";
import { PrintButton, TranscriptHistoryRow } from "@/components/transcript/search-controls";

export const metadata: Metadata = { title: "Transcripts — TMS" };

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function TranscriptsPage({ searchParams }: PageProps) {
  const session = await requireAuth();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const canGen = can(session, "generate_transcripts");

  // ── Search ────────────────────────────────────────────────────────────────
  type StudentRow = {
    id: string; indexNumber: string;
    firstName: string; middleName: string | null; lastName: string;
    programmeName: string | null;
  };

  let matched: StudentRow[] = [];
  if (query) {
    // Build campus-aware search filter
    const searchCondition = or(
      ilike(students.indexNumber, `%${query}%`),
      ilike(students.firstName, `%${query}%`),
      ilike(students.lastName, `%${query}%`),
    );

    // SUPER_ADMIN searches all campuses; others only their campus
    const campusCondition = session.role !== "SUPER_ADMIN" && session.campusIds
      ? eq(students.campusId, session.campusIds)
      : undefined;

    matched = await db
      .select({
        id: students.id,
        indexNumber: students.indexNumber,
        firstName: students.firstName,
        middleName: students.middleName,
        lastName: students.lastName,
        programmeName: programmes.name,
      })
      .from(students)
      .leftJoin(programmes, eq(students.programmeId, programmes.id))
      .where(campusCondition ? and(searchCondition, campusCondition) : searchCondition)
      .limit(10);
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
  const recent = !query ? await db
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
    .innerJoin(programmes, eq(students.programmeId, programmes.id))
    .orderBy(desc(transcripts.createdAt))
    .limit(20) : [];

  // ── Render inline transcript ──────────────────────────────────────────────
  if (inlineResult?.ok) {
    const { transcript } = inlineResult;
    const display = latestRecord
      ? { ...transcript, transcriptNumber: latestRecord.transcriptNumber, generatedAt: latestRecord.createdAt.toISOString() }
      : { ...transcript, transcriptNumber: "PREVIEW", generatedAt: new Date().toISOString() };

    return (
      <div>
        {/* Search bar — plain form, no JS needed */}
        <div className="print:hidden mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          data-print-hide>
          <SearchForm query={query} />
          {/* Print button lives in a client island */}
          <PrintButton />
        </div>

        <TranscriptActionBar
          studentId={matched[0].id}
          studentName={transcript.student.fullName}
          canGenerate={canGen}
          latestRecordId={latestRecord?.id ?? null}
        />

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
        <SearchForm query={query} />
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

      {/* Multiple matches — plain anchor links, no onClick */}
      {query && matched.length > 1 && (
        <section>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {matched.length} students found for &ldquo;{query}&rdquo; — select one:
          </p>
          <div className="space-y-2">
            {matched.map((s) => (
              <a key={s.id}
                href={`/transcripts?q=${encodeURIComponent(s.indexNumber)}`}
                className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 transition-all hover:border-indigo-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-indigo-700">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {[s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")}
                  </p>
                  <p className="font-mono text-xs text-gray-500 dark:text-gray-400">{s.indexNumber}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-600">{s.programmeName}</p>
                </div>
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </a>
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

function SearchForm({ query, autoFocus }: { query: string; autoFocus?: boolean }) {
  return (
    <form method="GET" className="flex gap-3 max-w-lg">
      <input name="q" type="search" defaultValue={query} autoFocus={autoFocus}
        placeholder="Index number or student name…"
        className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm placeholder:text-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
      <button type="submit"
        className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 shadow-sm shadow-indigo-100 dark:shadow-none">
        Search
      </button>
    </form>
  );
}

// ── Client island for print button only ──────────────────────────────────────