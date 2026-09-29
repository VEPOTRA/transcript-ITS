/**
 * Transcript domain types.
 *
 * TranscriptObject is the single authoritative output of the transcript
 * generation pipeline. Everything downstream — the PDF renderer, the
 * preview UI, the audit log, the checksum — works from this one shape.
 *
 * Design invariants:
 *
 *   1. semesters[] carries BOTH GPA stats AND per-course rows.
 *      GPA stats come from SQL aggregation (no runtime multiplication).
 *      Course rows come from the grade display query (for the course table).
 *      Both are fetched in a single parallel batch and merged in the assembler.
 *
 *   2. summary is the cumulative total, derived by summing semester stats.
 *      It is stored on the object — not recomputed from courses — so the
 *      PDF template never touches arithmetic.
 *
 *   3. Non-scoring courses appear in TranscriptSemester.courses with
 *      isScoring = false. They are shown in the per-course table but their
 *      credit hours and quality points are EXCLUDED from GPA stats because
 *      the SQL aggregation filters them at the JOIN level.
 *
 *   4. All numeric GPA values are pre-formatted to 2 d.p. strings
 *      (*Formatted fields). Raw numbers are also retained for any code
 *      that needs to do further arithmetic (e.g. ranking, what-if GPA).
 *
 * Nothing here imports from DB or Next.js — safe everywhere.
 */

import type { GradeClassification } from "@/lib/gpa/types";
import { GenderLabel } from "./gender";

// Re-export so callers only need one import path
export type { GradeClassification };

// ─── Course-level detail ──────────────────────────────────────────────────────

/**
 * One row in the per-course transcript table.
 * Maps 1-to-1 with a GradeDisplayRow from the DB, reformatted for display.
 */
export type TranscriptCourse = {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  creditHours: number;
  grade: string; // "A", "B+", etc.
  gradePoint: number; // parsed — 3.5, 3.0, etc.
  gradePointFormatted: string; // "3.50"
  qualityPoints: number; // parsed computedQualityPoints
  qualityPointsFormatted: string; // "10.50"
  /**
   * false = course does not count toward GPA.
   * Shown in the course table with a "non-scoring" badge; excluded from
   * all GPA arithmetic by the SQL aggregation query.
   */
  isScoring: boolean;
  /** true = resit attempt; credit hours counted double in GPA */
  isResit: boolean;
};

// ─── Semester-level record ────────────────────────────────────────────────────

/**
 * One academic semester on the transcript.
 * Contains both GPA statistics (from SQL aggregation) and the ordered
 * list of courses (from the grade display query).
 */
export type TranscriptSemester = {
  semesterId: string;
  year: number;
  term: "FIRST" | "SECOND";
  /** Display label, e.g. "2022/2023 – Academic Year First Semester" */
  label: string;

  // ── GPA statistics (from SQL aggregation, isScoring=true rows only) ──────
  /** Sum of credit hours for scoring courses (includes F grades) */
  creditsAttempted: number;
  /** Sum of credit hours for scoring courses where grade != F */
  creditsEarned: number;
  /** SUM(computedQualityPoints) for scoring courses */
  totalQualityPoints: number;
  sgpa: number;
  sgpaFormatted: string; // "3.50"
  /** Total scoring courses this semester */
  scoringCourseCount: number;

  // ── Course detail (all courses, including non-scoring) ────────────────────
  /** Ordered by course code ASC — matches the DB query ordering */
  courses: TranscriptCourse[];
};

// ─── Cumulative summary ───────────────────────────────────────────────────────

/**
 * Cumulative academic summary across all semesters.
 * Derived by summing TranscriptSemester GPA fields — never recomputed from
 * raw course rows.
 */
export type TranscriptSummary = {
  totalCreditsAttempted: number;
  totalCreditsEarned: number;
  totalQualityPoints: number;
  cgpa: number;
  cgpaFormatted: string; // "3.42"
  classification: GradeClassification | null;
};

// ─── Entity shapes ────────────────────────────────────────────────────────────

export type TranscriptStudent = {
  id: string;
  indexNumber: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  /** firstName + middleName? + lastName */
  fullName: string;
  studentType: string; // "UNDERGRADUATE" | "POSTGRADUATE"
  dateOfBirth: string | null;
  gender: GenderLabel | null;
  level: number;
  entryYear: string;
  graduationYear: string | null;
  status: string;
  programme: {
    id: string;
    name: string;
    code: string;
    type: string; // "DEGREE" | "DIPLOMA"
  };
};

export type TranscriptInstitution = {
  id: string;
  name: string;
  address: string | null;
  logoPath: string | null;
};

export type TranscriptRegistrar = {
  id: string;
  name: string;
  title: string;
  signaturePath: string | null;
};

// ─── Root transcript object ───────────────────────────────────────────────────

/**
 * The complete, authoritative transcript object.
 *
 * This is what generateTranscript() returns and what every downstream
 * consumer (PDF renderer, UI, audit log) works from.
 */
export type TranscriptObject = {
  // ── Document metadata ────────────────────────────────────────────────────
  transcriptNumber: string;
  /** ISO-8601 timestamp — frozen at generation time for the SHA-256 checksum */
  generatedAt: string;
  generatedByAdminId?: string;

  // ── Entities ─────────────────────────────────────────────────────────────
  student: TranscriptStudent;
  institution: TranscriptInstitution;
  /** null if no active registrar is configured */
  registrar: TranscriptRegistrar | null;

  // ── Academic history ──────────────────────────────────────────────────────
  /** Ordered chronologically: oldest semester first */
  semesters: TranscriptSemester[];

  // ── Cumulative totals ─────────────────────────────────────────────────────
  summary: TranscriptSummary;
};

// ─── Generation result ────────────────────────────────────────────────────────

/**
 * Returned by generateTranscript().
 * Contains the full transcript object plus the DB record's primary key.
 */
export type TranscriptGenerationResult = {
  transcript: TranscriptObject;
  /** Primary key of the row inserted into the transcripts table */
  transcriptRecordId: string;
  transcriptNumber: string;
};

// ─── Error variants ───────────────────────────────────────────────────────────

export type TranscriptGenerationError =
  | { code: "STUDENT_NOT_FOUND"; message: string }
  | { code: "INSTITUTION_NOT_FOUND"; message: string }
  | { code: "NO_GRADE_RECORDS"; message: string }
  | { code: "DB_ERROR"; message: string; cause?: unknown };
