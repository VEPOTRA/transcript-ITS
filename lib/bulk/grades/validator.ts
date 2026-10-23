/**
 * Grade bulk upload validator.
 *
 * ─── Pre-fetch strategy (critical for performance)
 *
 * Before any row is validated, four lookup structures are built
 * from four database queries:
 *
 *   1. studentMap    Map<upperIndexNumber, studentId>
 *   2. courseMap     Map<upperCourseCode, { id, creditHours, isScoring }>
 *   3. semesterMap   Map<`${year}-${FIRST|SECOND}`, semesterId>
 *   4. existingKeys  Set<`${studentId}|${courseId}|${semesterId}`>
 *
 * All lookups during row validation are O(1). Zero DB queries per row.
 *
 * ─── Validation sequence per row
 *
 *   Step 1  Field-level Zod  — type, format, enum membership
 *   Step 2  Entity lookup    — student, course, semester must exist
 *   Step 3  DB duplicate     — (student, course, semester) not in grades table
 *   Step 4  Batch duplicate  — same combination not seen in earlier rows
 *
 * All errors for a row are collected before returning, so users fix
 * everything in one pass rather than discovering errors one at a time.
 *
 * ─── Server-side computation
 *
 * gradePoint, creditHours, computedQualityPoints are resolved here
 * after all validation passes. They are attached to ValidGradeRow
 * and written directly to the DB. The CSV never contains these values.
 */

import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { students, courses, semesters, grades } from "@/db/schema";
import {
  GRADE_LETTERS,
  resolveGradePoint,
  computeQualityPoints,
  isGradeAllowedForCourse,
} from "@/lib/gpa/scale";
import { normaliseSemester, normaliseGrade } from "./parser";
import type { RawGradeRow, ValidGradeRow, GradeRowFailure } from "./types";

// ─── Field-level Zod schema ───────────────────────────────────────────────────

const currentYear = new Date().getFullYear();

const rawRowSchema = z.object({
  indexNumber: z
    .string({ required_error: "Index number is required" })
    .min(1, "Index number is required")
    .max(100, "Index number must be at most 100 characters")
    .trim(),

  courseCode: z
    .string({ required_error: "Course code is required" })
    .min(1, "Course code is required")
    .max(50, "Course code must be at most 50 characters")
    .trim()
    .toUpperCase(),
  courseCategory: z
    .string()
    .optional()
    .transform((value) => value?.trim().toUpperCase() || undefined),

  // Raw semester string — entity validation checks the normalised value
  semester: z
    .string({ required_error: "Semester is required" })
    .min(1, "Semester is required"),

  year: z
    .string({ required_error: "Year is required" })
    .min(1, "Year is required")
    .pipe(
      z.coerce
        .number({
          invalid_type_error: "Year must be a 4-digit number (e.g. 2021)",
        })
        .int()
        .min(1990, "Year must be 1990 or later")
        .max(currentYear + 1, `Year cannot be later than ${currentYear + 1}`),
    ),

  // Accept raw string — normalise and validate against scale below
  grade: z
    .string({ required_error: "Grade is required" })
    .min(1, "Grade is required")
    .transform(normaliseGrade),
  isResit: z
    .string()
    .optional()
    .transform((value, context) => {
      const normalised = value?.trim().toLowerCase();
      if (!normalised) return false;
      if (["true", "yes", "1"].includes(normalised)) return true;
      if (["false", "no", "0"].includes(normalised)) return false;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Resit must be true or false (yes/no is also accepted).",
      });
      return z.NEVER;
    }),
});

// ─── Pre-fetch lookup maps ────────────────────────────────────────────────────

type CourseInfo = {
  id: string;
  category: string;
  creditHours: number;
  isScoring: boolean | null;
};
type SemesterKey = `${number}-${"FIRST" | "SECOND"}`;

export type GradeValidationContext = {
  /** Map<UPPER_INDEX_NUMBER, studentId> */
  studentMap: Map<string, string>;
  /** Map<UPPER_COURSE_CODE|UPPER_CATEGORY, CourseInfo> */
  courseMap: Map<string, CourseInfo>;
  /** Map<UPPER_COURSE_CODE, Set<UPPER_CATEGORY>> */
  courseCategories: Map<string, Set<string>>;
  /** Course codes shared across categories require a courseCategory CSV value. */
  ambiguousCourseCodes: Set<string>;
  /** Map<`${year}-${FIRST|SECOND}`, semesterId> */
  semesterMap: Map<string, string>;
  /**
   * Set of composite keys for grades already in the DB.
   * Key format: `${studentId}|${courseId}|${semesterId}`
   */
  existingKeys: Set<string>;
  /** Keys seen in previous rows of this batch (within-batch dedup) */
  seenInBatch: Set<string>;
};

/**
 * Fetch all lookup data needed for validation.
 * Four queries, all run in parallel. Zero queries during row validation.
 */
export async function buildValidationContext(
  campusIds?: string[],
): Promise<GradeValidationContext> {
  const [studentRows, courseRows, semesterRows, gradeRows] = await Promise.all([
    db
      .select({ id: students.id, indexNumber: students.indexNumber })
      .from(students)
      .where(
        campusIds === undefined
          ? undefined
          : inArray(students.campusId, campusIds),
      ),
    db
      .select({
        id: courses.id,
        code: courses.code,
        category: courses.category,
        creditHours: courses.creditHours,
        isScoring: courses.isScoring,
      })
      .from(courses)
      .where(eq(courses.isActive, true)),
    db
      .select({
        id: semesters.id,
        year: semesters.year,
        semester: semesters.semester,
      })
      .from(semesters),
    db
      .select({
        studentId: grades.studentId,
        courseId: grades.courseId,
        semesterId: grades.semesterId,
      })
      .from(grades)
      .where(eq(grades.isSuperseded, false)),
  ]);

  const studentMap = new Map(
    studentRows.map((r) => [r.indexNumber.toUpperCase(), r.id]),
  );
  const courseMap = new Map<string, CourseInfo>();
  const courseCategories = new Map<string, Set<string>>();
  for (const course of courseRows) {
    const code = course.code.toUpperCase();
    const category = course.category.toUpperCase();
    courseMap.set(`${code}|${category}`, {
      id: course.id,
      category: course.category,
      creditHours: course.creditHours,
      isScoring: course.isScoring,
    });
    const categories = courseCategories.get(code) ?? new Set<string>();
    categories.add(category);
    courseCategories.set(code, categories);
  }
  const ambiguousCourseCodes = new Set(
    [...courseCategories.entries()]
      .filter(([, categories]) => categories.size > 1)
      .map(([code]) => code),
  );
  const semesterMap = new Map(
    semesterRows.map((r) => [`${r.year}-${r.semester}` as SemesterKey, r.id]),
  );
  const existingKeys = new Set(
    gradeRows.map((r) => `${r.studentId}|${r.courseId}|${r.semesterId}`),
  );

  return {
    studentMap,
    courseMap,
    courseCategories,
    ambiguousCourseCodes,
    semesterMap,
    existingKeys,
    seenInBatch: new Set(),
  };
}

// ─── Single-row validation ────────────────────────────────────────────────────

type RowValidationResult =
  | { ok: true; row: ValidGradeRow }
  | { ok: false; errors: string[] };

export function validateGradeRow(
  raw: RawGradeRow,
  ctx: GradeValidationContext,
): RowValidationResult {
  const errors: string[] = [];

  // Step 1: field-level Zod
  const parsed = rawRowSchema.safeParse({
    indexNumber: raw.indexNumber,
    courseCode: raw.courseCode,
    courseCategory: raw.courseCategory,
    semester: raw.semester,
    year: raw.year,
    grade: raw.grade,
    isResit: raw.isResit,
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  }

  const {
    indexNumber,
    courseCode,
    courseCategory,
    year,
    grade,
    isResit,
  } = parsed.data;

  // Normalise semester from raw string → "FIRST" | "SECOND"
  const semesterTerm = normaliseSemester(parsed.data.semester);
  if (!semesterTerm) {
    errors.push(
      `"${parsed.data.semester}" is not a valid semester. Use FIRST or SECOND (or 1 / 2).`,
    );
  }

  // Validate grade is in the scale
  if (!(GRADE_LETTERS as string[]).includes(grade)) {
    errors.push(
      `"${grade}" is not a valid grade. Valid grades: ${GRADE_LETTERS.join(", ")}.`,
    );
  }

  // Early exit if basic field errors remain — entity lookups would be misleading
  if (errors.length > 0) return { ok: false, errors };

  const term = semesterTerm!;

  // Step 2a: student lookup
  const studentId = ctx.studentMap.get(indexNumber.toUpperCase());
  if (!studentId) {
    errors.push(`Student with index number "${indexNumber}" not found.`);
  }

  // Step 2b: course lookup
  const normalisedCourseCode = courseCode.toUpperCase();
  const ambiguousCourse = ctx.ambiguousCourseCodes.has(normalisedCourseCode);
  if (ambiguousCourse && !courseCategory) {
    errors.push(
      `Course code "${courseCode}" exists in multiple categories; add courseCategory to identify the intended course.`,
    );
  }
  const categories = ctx.courseCategories.get(normalisedCourseCode);
  const resolvedCategory =
    courseCategory ??
    (categories?.size === 1 ? categories.values().next().value : undefined);
  const courseInfo = resolvedCategory
    ? ctx.courseMap.get(`${normalisedCourseCode}|${resolvedCategory}`)
    : undefined;
  if ((!ambiguousCourse || courseCategory) && !courseInfo) {
    errors.push(`Course "${courseCode}" not found or is inactive.`);
  }
  if (courseInfo && !isGradeAllowedForCourse(grade, courseInfo.isScoring)) {
    errors.push(
      courseInfo.isScoring === false
        ? "Non-scoring courses accept only P or F."
        : "P is only valid for non-scoring courses.",
    );
  }

  // Step 2c: semester lookup
  const semKey = `${year}-${term}` as SemesterKey;
  const semesterId = ctx.semesterMap.get(semKey);
  if (!semesterId) {
    errors.push(
      `Semester "${term === "FIRST" ? "First" : "Second"} Semester ${year}/${year + 1}" does not exist. ` +
        `Create the semester before uploading grades for it.`,
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  // All entities found — narrow types
  const resolvedStudentId = studentId!;
  const resolvedCourseInfo = courseInfo!;
  const resolvedSemesterId = semesterId!;

  // Step 3: DB duplicate check
  const compositeKey = `${resolvedStudentId}|${resolvedCourseInfo.id}|${resolvedSemesterId}`;
  if (ctx.existingKeys.has(compositeKey)) {
    errors.push(
      `A grade for "${indexNumber}" in "${courseCode}" ` +
        `(${term === "FIRST" ? "First" : "Second"} Semester ${year}/${year + 1}) already exists.`,
    );
  }

  // Step 4: within-batch duplicate check
  if (ctx.seenInBatch.has(compositeKey)) {
    errors.push(
      `This file contains duplicate entries for "${indexNumber}" in "${courseCode}" ` +
        `(${term === "FIRST" ? "First" : "Second"} Semester ${year}/${year + 1}).`,
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  // Mark seen so later rows in the batch detect the conflict
  ctx.seenInBatch.add(compositeKey);

  // Step 5: server-side computation — NEVER from client/CSV
  const gradePoint = resolveGradePoint(grade);
  const creditHours = resolvedCourseInfo.creditHours;
  const qualityPts = computeQualityPoints(gradePoint, creditHours);

  return {
    ok: true,
    row: {
      rowNumber: raw.rowNumber,
      studentId: resolvedStudentId,
      courseId: resolvedCourseInfo.id,
      semesterId: resolvedSemesterId,
      indexNumber,
      courseCode,
      courseCategory: resolvedCourseInfo.category,
      semester: term,
      year,
      grade,
      isResit,
      gradePoint: gradePoint.toFixed(2),
      creditHours,
      computedQualityPoints: qualityPts.toFixed(2),
    },
  };
}

// ─── Batch validation ─────────────────────────────────────────────────────────

export async function validateGradeBatch(
  rawRows: RawGradeRow[],
  campusIds?: string[],
): Promise<{
  validRows: ValidGradeRow[];
  failedRows: GradeRowFailure[];
}> {
  const ctx = await buildValidationContext(campusIds);

  const validRows: ValidGradeRow[] = [];
  const failedRows: GradeRowFailure[] = [];

  for (const raw of rawRows) {
    const result = validateGradeRow(raw, ctx);

    if (result.ok) {
      validRows.push(result.row);
    } else {
      failedRows.push({
        status: "error",
        rowNumber: raw.rowNumber,
        rawValues: {
          indexNumber: raw.indexNumber,
          courseCode: raw.courseCode,
          courseCategory: raw.courseCategory,
          semester: raw.semester,
          year: raw.year,
          grade: raw.grade,
          isResit: raw.isResit,
        },
        errors: result.errors,
      });
    }
  }

  return { validRows, failedRows };
}
