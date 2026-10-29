/**
 * /transcripts/[studentId] — Transcript preview page.
 *
 * Renders the complete TranscriptObject as an official-looking document.
 * The document is printable directly from the browser — @media print rules
 * inside TranscriptPreview hide all app chrome and render just the paper.
 *
 * Sections:
 *   - TranscriptActionBar   (sticky, hidden on print)
 *   - TranscriptPreview     (the document itself — shown on print)
 *   - TranscriptHistoryPanel (prior generated PDFs — hidden on print)
 */

import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { requireAuth, can } from "@/lib/auth/rbac";
import { db } from "@/db";
import { students, transcripts } from "@/db/schema";
import { assembleTranscript } from "@/lib/transcript";
import { canAccessStudent } from "@/lib/auth/campus";
import {
  TranscriptPreview,
} from "@/components/transcript";

type PageProps = { params: Promise<{ studentId: string }> };

export async function generateMetadata({ params }: PageProps) {
  const session = await requireAuth();
  const { studentId } = await params;
  const [student] = await db
    .select({ campusId: students.campusId })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (!student || !canAccessStudent(session, student.campusId)) {
    return { title: "Transcript — TMS" };
  }
  const result = await assembleTranscript(studentId);
  if (!result.ok) return { title: "Transcript — TMS" };
  return { title: `${result.transcript.student.fullName} — Transcript — TMS` };
}

export default async function TranscriptDetailPage({ params }: PageProps) {
  const session = await requireAuth();
  const { studentId } = await params;

  const [student] = await db
    .select({ campusId: students.campusId })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (!student || !canAccessStudent(session, student.campusId)) notFound();

  const [assembleResult, rawRecords] = await Promise.all([
    assembleTranscript(studentId),
    db
      .select()
      .from(transcripts)
      .where(eq(transcripts.studentId, studentId))
      .orderBy(desc(transcripts.createdAt)),
  ]);

  if (!assembleResult.ok) {
    if (assembleResult.error.code === "STUDENT_NOT_FOUND") notFound();
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
        {assembleResult.error.message}
      </div>
    );
  }

  const { transcript } = assembleResult;
  const canGenerate = can(session, "generate_transcripts");
  const latestRecord = rawRecords[0] ?? null;

  // Stamp the transcript number from the latest generated record (if any)
  // so the preview shows the same ref as the stored PDF.
  const displayTranscript = latestRecord
    ? { ...transcript, transcriptNumber: latestRecord.transcriptNumber, generatedAt: latestRecord.createdAt.toISOString() }
    : { ...transcript, transcriptNumber: "PREVIEW", generatedAt: new Date().toISOString() };


  return (
    <div className="space-y-0">
      {/* The document itself */}
      {/* data-transcript-ref is read by the copy-ref button */}
      <div data-transcript-ref={displayTranscript.transcriptNumber}>
        <TranscriptPreview
          transcript={displayTranscript}
          latestRecordId={latestRecord?.id ?? null}
        />
      </div>

      {/* History of generated PDFs — hidden on print */}
      {/* <TranscriptHistoryPanel records={rawRecords} canDelete={canGenerate} /> */}
    </div>
  );
}