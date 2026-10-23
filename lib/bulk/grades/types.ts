/**
 * Grade bulk upload type definitions.
 *
 * Mirrors the structure of lib/bulk/students/types.ts but scoped entirely to
 * the grades pipeline. Types do not share rawValues keys with the
 * student pipeline — they describe different CSV columns.
 *
 * Flow:
 *   raw CSV text
 *     → RawGradeRow         (strings, no validation)
 *     → ValidGradeRow       (resolved UUIDs + server-computed values)
 *     → GradeRowResult      (success | failure per row)
 *     → GradeBulkResult     (aggregate counts + all failures)
 */

// ─── CSV columns ──────────────────────────────────────────────────────────────

export const GRADE_CSV_COLUMNS = [
  "indexNumber",
  "courseCode",
  "courseCategory",
  "semester",
  "year",
  "grade",
  "isResit",
] as const;

export type GradeCSVColumn = (typeof GRADE_CSV_COLUMNS)[number];

// ─── Raw row ──────────────────────────────────────────────────────────────────

/**
 * What the CSV parser produces: every cell is a raw string.
 * No coercion, no validation, no entity lookup has happened yet.
 */
export type RawGradeRow = {
  rowNumber: number;
  rawLine: string;
  indexNumber: string | undefined;
  courseCode: string | undefined;
  courseCategory: string | undefined;
  semester: string | undefined; // raw string — may be "FIRST", "first", "1", etc.
  year: string | undefined;
  grade: string | undefined;
  isResit: string | undefined;
};

// ─── Valid row (after validation + entity resolution) ─────────────────────────

/**
 * A row that passed all validation layers.
 *
 * All three entity IDs (studentId, courseId, semesterId) are resolved
 * UUIDs from the database.
 *
 * gradePoint, creditHours, and computedQualityPoints are computed
 * entirely server-side — they are never sourced from the CSV.
 */
export type ValidGradeRow = {
  rowNumber: number;

  // Entity IDs resolved from CSV values
  studentId: string;
  courseId: string;
  semesterId: string;

  // Raw CSV values — kept for audit log and error recovery
  indexNumber: string;
  courseCode: string;
  courseCategory: string;
  semester: "FIRST" | "SECOND";
  year: number;
  grade: string; // the letter grade: "A", "B+", etc.
  isResit: boolean;

  // Server-computed — NEVER from the client / CSV
  gradePoint: string; // toFixed(2) string for DB numeric column
  creditHours: number; // fetched from courses.credit_hours
  computedQualityPoints: string; // toFixed(2) string for DB numeric column
};

// ─── Per-row results ──────────────────────────────────────────────────────────

export type GradeRowSuccess = {
  status: "success";
  rowNumber: number;
  gradeId: string;
  indexNumber: string;
  courseCode: string;
};

export type GradeRowFailure = {
  status: "error";
  rowNumber: number;
  rawValues: Partial<Record<GradeCSVColumn, string>>;
  errors: string[];
};

export type GradeRowResult = GradeRowSuccess | GradeRowFailure;

// ─── Batch result ─────────────────────────────────────────────────────────────

export type GradeBulkResult = {
  totalRows: number;
  successCount: number;
  failureCount: number;
  failures: GradeRowFailure[];
  durationMs: number;
};
