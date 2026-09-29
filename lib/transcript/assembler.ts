/**
 * Transcript data assembler.
 *
 * Produces a complete TranscriptObject from four parallel DB queries.
 * All arithmetic is already done — the assembler only groups, merges,
 * and parses strings.
 *
 * ─── Query strategy (4 queries, all parallel)
 *
 *   1. Student + programme row         (1 row)
 *   2. Institution row                 (1 row)
 *   3. Active registrar row            (0–1 rows)
 *   4a. GPA aggregates by semester     (N semester rows)  ← from lib/gpa/queries
 *   4b. Grade display rows             (M course rows)    ← from lib/queries/grades
 *
 *   Queries 1, 2, 3, 4a, and 4b all fire in Promise.all — single roundtrip.
 *
 * ─── Merge strategy (pure JS, O(M + N))
 *
 *   a. Group display rows into Map<semesterId, GradeDisplayRow[]>
 *   b. For each semester aggregate row, look up its display rows
 *   c. Build TranscriptSemester[] with GPA stats + course array
 *   d. Sum semester stats → TranscriptSummary
 *
 * ─── Non-scoring courses
 *
 *   The GPA aggregate query uses INNER JOIN courses WHERE is_scoring = true,
 *   so non-scoring courses never enter creditsAttempted / totalQualityPoints.
 *   The display query fetches ALL courses (scoring + non-scoring) so they
 *   appear in the course table with an isScoring=false flag.
 *
 *   A semester that has ONLY non-scoring courses will have no GPA aggregate
 *   row. In that case we still build a TranscriptSemester for it from the
 *   display rows alone, with all GPA fields set to 0.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { students, programmes, institution, registrar } from "@/db/schema";
import { queryCGPAAggregatesBySemester } from "@/lib/gpa/queries";
import {
  hydrateSemesterResult,
  sumSemesters,
  computeGPA,
  classifyGPA,
  formatGPA,
  formatSemesterLabel,
} from "@/lib/gpa/compute";
import { fetchStudentGradeRows } from "@/lib/grades/queries";
import type { GradeDisplayRow } from "@/lib/grades/queries";
import type { SemesterAggregateRow } from "@/lib/gpa/types";
import type {
  TranscriptObject,
  TranscriptStudent,
  TranscriptInstitution,
  TranscriptRegistrar,
  TranscriptSemester,
  TranscriptCourse,
  TranscriptSummary,
  TranscriptGenerationError,
} from "./types";
import { toGenderLabel } from "./gender";
// ─── Result type ──────────────────────────────────────────────────────────────

type AssembleResult =
  | {
      ok: true;
      transcript: Omit<
        TranscriptObject,
        "transcriptNumber" | "generatedAt" | "generatedByAdminId"
      >;
    }
  | { ok: false; error: TranscriptGenerationError };

// ─── Main assembler ───────────────────────────────────────────────────────────

/**
 * Fetch and assemble all data for a transcript.
 *
 * Returns the assembled data without the metadata fields (transcriptNumber,
 * generatedAt, generatedByAdminId) — the generator applies those.
 *
 * Returns an error variant if the student, institution, or grade data
 * is missing or inconsistent.
 */
export async function assembleTranscript(
  studentId: string,
): Promise<AssembleResult> {
  // ── Parallel fetch ─────────────────────────────────────────────────────────

  const [
    studentRows,
    institutionRows,
    registrarRows,
    semesterAggregates,
    gradeDisplayRows,
  ] = await Promise.all([
    // 1. Student + programme
    db
      .select({
        id: students.id,
        indexNumber: students.indexNumber,
        firstName: students.firstName,
        middleName: students.middleName,
        lastName: students.lastName,
        level: students.level,
        gender: students.gender,
        dateOfBirth: students.dateOfBirth,
        entryYear: students.entryYear,
        graduationYear: students.graduationYear,
        status: students.status,
        programmeId: programmes.id,
        programmeName: programmes.name,
        programmeCode: programmes.code,
        programmeType: programmes.programmeType,
        studentType: students.studentType,
      })
      .from(students)
      .innerJoin(programmes, eq(students.programmeId, programmes.id))
      .where(eq(students.id, studentId))
      .limit(1),

    // 2. Institution
    db.select().from(institution).limit(1),

    // 3. Active registrar
    db.select().from(registrar).where(eq(registrar.isActive, true)).limit(1),

    // 4a. GPA aggregates: one row per semester (scoring courses only)
    queryCGPAAggregatesBySemester(studentId),

    // 4b. Grade display rows: all courses (for the transcript course table)
    fetchStudentGradeRows(studentId),
  ]);

  // ── Validation ─────────────────────────────────────────────────────────────

  if (studentRows.length === 0) {
    return {
      ok: false,
      error: {
        code: "STUDENT_NOT_FOUND",
        message: `Student ${studentId} not found.`,
      },
    };
  }

  if (institutionRows.length === 0) {
    return {
      ok: false,
      error: {
        code: "INSTITUTION_NOT_FOUND",
        message:
          "Institution not configured. Add an institution record before generating transcripts.",
      },
    };
  }

  const s = studentRows[0];
  const inst = institutionRows[0];
  const reg = registrarRows[0] ?? null;

  // ── Group display rows by semesterId (O(M)) ────────────────────────────────

  const rowsBySemester = new Map<string, GradeDisplayRow[]>();

  for (const row of gradeDisplayRows) {
    const existing = rowsBySemester.get(row.semesterId) ?? [];
    existing.push(row);
    rowsBySemester.set(row.semesterId, existing);
  }

  // ── Build a lookup from semesterId → aggregate row (O(N)) ─────────────────

  const aggregateMap = new Map<string, SemesterAggregateRow>(
    semesterAggregates.map((agg) => [agg.semesterId, agg]),
  );

  // ── Determine the full set of semester IDs (union of both sources) ─────────
  // A semester with only non-scoring courses has display rows but no aggregate.

  const allSemesterIds = new Set<string>([
    ...semesterAggregates.map((a) => a.semesterId),
    ...gradeDisplayRows.map((r) => r.semesterId),
  ]);

  // ── Build TranscriptSemester[] ────────────────────────────────────────────

  const semesters: TranscriptSemester[] = [];

  for (const semId of allSemesterIds) {
    const agg = aggregateMap.get(semId);
    const courses = rowsBySemester.get(semId) ?? [];

    // Use the aggregate for GPA stats; fall back to display rows for metadata
    // when there is no aggregate (non-scoring-only semester).
    const yearValue = agg?.semesterYear ?? courses[0]?.semesterYear ?? 0;
    const termValue = agg?.semesterTerm ?? courses[0]?.semesterTerm ?? "FIRST";

    let creditsAttempted = 0;
    let creditsEarned = 0;
    let totalQualityPoints = 0;
    let sgpa = 0;
    let scoringCourseCount = 0;

    if (agg) {
      const hydrated = hydrateSemesterResult(agg);
      creditsAttempted = hydrated.creditsAttempted;
      creditsEarned = hydrated.creditsEarned;
      totalQualityPoints = hydrated.totalQualityPoints;
      sgpa = hydrated.sgpa;
      scoringCourseCount = hydrated.courseCount;
    }

    // ── Resit adjustment ───────────────────────────────────────────────────
    // Resit attempts count double: credit_hours × 2 in the denominator,
    // computed_quality_points × 2 in the numerator.
    // The SQL aggregate already counted them once; here we add the extra.
    const resitCourses = courses.filter(
      (r) => r.isResit && r.isScoring !== false,
    );
    for (const rc of resitCourses) {
      const extraQP = parseFloat(rc.computedQualityPoints);
      const extraCH = rc.creditHours;
      if (Number.isFinite(extraQP) && extraCH > 0) {
        totalQualityPoints += extraQP; // double quality points
        creditsAttempted += extraCH; // double credits attempted
        if (rc.grade !== "E") creditsEarned += extraCH; // double credits earned (pass only)
      }
    }
    // Recompute SGPA after resit adjustment
    if (resitCourses.length > 0) {
      sgpa = computeGPA(totalQualityPoints, creditsAttempted);
    }

    // Build typed course rows — course codes ordered by the DB query (ASC)
    const transcriptCourses: TranscriptCourse[] = courses.map((row) => {
      const gp = parseFloat(row.gradePoint);
      const qp = parseFloat(row.computedQualityPoints);

      return {
        courseId: row.courseId,
        courseCode: row.courseCode,
        courseTitle: row.courseTitle,
        creditHours: row.creditHours,
        grade: row.grade,
        gradePoint: Number.isFinite(gp) ? gp : 0,
        gradePointFormatted: Number.isFinite(gp) ? gp.toFixed(2) : "0.00",
        qualityPoints: Number.isFinite(qp) ? qp : 0,
        qualityPointsFormatted: Number.isFinite(qp) ? qp.toFixed(2) : "0.00",
        isScoring: row.isScoring !== false, // null treated as true
        isResit: row.isResit === true,
      };
    });

    semesters.push({
      semesterId: semId,
      year: yearValue,
      term: termValue,
      label: formatSemesterLabel(yearValue, termValue),
      creditsAttempted,
      creditsEarned,
      totalQualityPoints,
      sgpa,
      sgpaFormatted: formatGPA(sgpa),
      scoringCourseCount,
      courses: transcriptCourses,
    });
  }

  // Sort chronologically: year ASC, FIRST before SECOND
  semesters.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.term === "FIRST" ? -1 : 1;
  });

  // ── Derive cumulative summary (O(semesters)) ──────────────────────────────

  const { totalCreditsAttempted, totalCreditsEarned, totalQualityPoints } =
    sumSemesters(
      semesters.map((sem) => ({
        ...sem,
        // sumSemesters only needs these fields
        semesterYear: sem.year,
        semesterTerm: sem.term,
        label: sem.label,
        sgpaFormatted: sem.sgpaFormatted,
        courseCount: sem.scoringCourseCount,
      })),
    );

  const cgpa = computeGPA(totalQualityPoints, totalCreditsAttempted);
  const hasResults = semesters.some((s) => s.scoringCourseCount > 0);

  const summary: TranscriptSummary = {
    totalCreditsAttempted,
    totalCreditsEarned,
    totalQualityPoints,
    cgpa,
    cgpaFormatted: formatGPA(cgpa),
    classification: classifyGPA(
      cgpa,
      hasResults,
      ((s as any).programmeType ?? "DEGREE") as "DEGREE" | "DIPLOMA",
      ((s as any).studentType ?? "UNDERGRADUATE") as
        | "UNDERGRADUATE"
        | "POSTGRADUATE",
    ),
  };

  // ── Shape the entity types ─────────────────────────────────────────────────

  const student: TranscriptStudent = {
    id: s.id,
    indexNumber: s.indexNumber,
    firstName: s.firstName,
    lastName: s.lastName,
    fullName: [s.firstName, s.middleName, s.lastName]
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .join(" "),
    middleName: s.middleName?.trim() || null,
    studentType: s.studentType ?? "UNDERGRADUATE",
    dateOfBirth: s.dateOfBirth ?? null,
    gender: toGenderLabel(s.gender), // ← M/F/O → Male/Female/Other
    level: s.level,
    entryYear: s.entryYear,
    graduationYear: s.graduationYear,
    status: s.status,
    programme: {
      id: s.programmeId,
      name: s.programmeName,
      code: s.programmeCode,
      type: s.programmeType ?? "DEGREE",
    },
  };

  const institutionTyped: TranscriptInstitution = {
    id: inst.id,
    name: inst.name,
    address: inst.address,
    logoPath: inst.logoPath,
  };

  const registrarTyped: TranscriptRegistrar | null = reg
    ? {
        id: reg.id,
        name: reg.name,
        title: reg.title,
        signaturePath: reg.signaturePath,
      }
    : null;

  return {
    ok: true,
    transcript: {
      student: student,
      institution: institutionTyped,
      registrar: registrarTyped,
      semesters,
      summary,
    },
  };
}
