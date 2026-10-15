/**
 * GPA arithmetic and classification.
 *
 * Pure functions — no DB, no Next.js.
 * Input: parsed (numeric) aggregate values.
 * Output: GPA values and classification strings.
 */

import type {
  GradeClassification,
  SemesterAggregateRow,
  SemesterGPAResult,
} from "./types";

// ─── Numeric parsing ──────────────────────────────────────────────────────────

/**
 * Parse a PostgreSQL numeric/bigint value returned as a string.
 * Guards against null (no rows in aggregate) and NaN.
 */
export function parseAggregateNumeric(
  value: string | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

// ─── SGPA computation ─────────────────────────────────────────────────────────

/**
 * Compute SGPA from parsed credit and quality-point totals.
 * Returns 0 when no credits were attempted (avoids division by zero).
 */
export function computeGPA(
  totalQualityPoints: number,
  creditsAttempted: number,
): number {
  if (creditsAttempted === 0) return 0;
  return round2dp(totalQualityPoints / creditsAttempted);
}

// ─── Aggregate row → result ───────────────────────────────────────────────────

/**
 * Convert a raw SQL aggregate row (strings) into a typed, numeric SemesterGPAResult.
 * This is the only place string→number parsing happens for GPA data.
 */
export function hydrateSemesterResult(
  row: SemesterAggregateRow,
): SemesterGPAResult {
  const totalQualityPoints = parseAggregateNumeric(row.totalQualityPoints);
  const creditsAttempted = parseAggregateNumeric(row.creditsAttempted);
  const creditsEarned = parseAggregateNumeric(row.creditsEarned);
  const courseCount = parseAggregateNumeric(row.courseCount);
  const sgpa = computeGPA(totalQualityPoints, creditsAttempted);

  return {
    semesterId: row.semesterId,
    semesterYear: row.semesterYear,
    semesterTerm: row.semesterTerm,
    label: formatSemesterLabel(row.semesterYear, row.semesterTerm),
    creditsAttempted,
    creditsEarned,
    totalQualityPoints: round2dp(totalQualityPoints),
    sgpa,
    sgpaFormatted: formatGPA(sgpa),
    courseCount,
  };
}

// ─── CGPA derivation ──────────────────────────────────────────────────────────

/**
 * Sum already-hydrated semester results to produce CGPA totals.
 * O(semesters) — the expensive work happened in SQL.
 */
export function sumSemesters(semesters: SemesterGPAResult[]): {
  totalCreditsAttempted: number;
  totalCreditsEarned: number;
  totalQualityPoints: number;
} {
  let totalCreditsAttempted = 0;
  let totalCreditsEarned = 0;
  let totalQualityPoints = 0;

  for (const s of semesters) {
    totalCreditsAttempted += s.creditsAttempted;
    totalCreditsEarned += s.creditsEarned;
    totalQualityPoints += s.totalQualityPoints;
  }

  return {
    totalCreditsAttempted,
    totalCreditsEarned,
    totalQualityPoints: round2dp(totalQualityPoints),
  };
}

// ─── Classification ───────────────────────────────────────────────────────────

/**
 * Classify a CGPA into a degree class.
 *
 * Thresholds follow the standard 4.0-scale convention used by most West
 * African universities. Adjust per institution policy if needed.
 *
 * cgpa >= 3.50  → First Class
 * cgpa >= 3.00  → Second Class Upper
 * cgpa >= 2.50  → Second Class Lower
 * cgpa >= 2.00  → Third Class
 * cgpa >= 1.00  → Pass
 * cgpa  < 1.00  → Fail
 * no results    → "No Results"
 */
export function classifyGPA(
  cgpa: number,
  hasResults: boolean,
  programmeType: import("./types").ProgrammeType = "DEGREE",
  studentType: "UNDERGRADUATE" | "POSTGRADUATE" = "UNDERGRADUATE",
): GradeClassification {
  // Postgraduate programmes carry no class designation
  if (studentType === "POSTGRADUATE") return "Postgraduate";

  if (!hasResults) return "No Results";

  if (programmeType === "DIPLOMA") {
    // Diploma classification scale
    if (cgpa >= 3.5) return "Distinction";
    if (cgpa >= 2.5) return "Credit";
    if (cgpa >= 1.0) return "Pass";
    return "Fail";
  }

  // Degree classification scale (default)
  if (cgpa >= 3.5) return "First Class";
  if (cgpa >= 3.0) return "Second Class Upper";
  if (cgpa >= 2.5) return "Second Class Lower";
  if (cgpa >= 2.0) return "Third Class";
  if (cgpa >= 1.0) return "Pass";
  return "Fail";
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Always 2 decimal places. 3.5 → "3.50", 4.0 → "4.00" */
export function formatGPA(gpa: number): string {
  return gpa.toFixed(2);
}

/**
 * Human-readable semester label.
 * (2022, "FIRST") → "2022/2023 – First Semester"
 */
export function formatSemesterLabel(
  year: number,
  term: "FIRST" | "SECOND",
): string {
  const termLabel = term === "FIRST" ? "First Semester" : "Second Semester";
  return `${year}/${year + 1} – ${termLabel}`;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function round2dp(n: number): number {
  return Math.round(n * 100) / 100;
}
