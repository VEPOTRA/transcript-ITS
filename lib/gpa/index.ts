/**
 * Public GPA API.
 *
 * Only two functions are exported as the primary interface:
 *
 *   calculateSemesterGPA(studentId, semesterId) → SemesterGPAResult | null
 *   calculateCGPA(studentId)                    → CGPAResult
 *
 * Both delegate all arithmetic to PostgreSQL via SQL aggregation.
 * JavaScript only parses the returned strings and derives the final
 * GPA value from the pre-summed totals.
 *
 * ─── What the DB does
 *
 *   • SUM(computed_quality_points)                   — actual course credit × grade point
 *   • SUM(credit_hours, doubled for resits)           — credits attempted
 *   • SUM(passed credit_hours, doubled for resits)    — credits earned
 *   • INNER JOIN courses WHERE is_scoring = true      — excludes non-scoring
 *   • GROUP BY semester_id                            — one row per semester
 *
 * ─── What JS does
 *
 *   • parseFloat() on the returned strings
 *   • totalQualityPoints / creditsAttempted → GPA (one division)
 *   • Σ semester rows → CGPA totals (O(semesters), not O(rows))
 */

import {
  querySemesterAggregate,
  queryCGPAAggregatesBySemester,
} from "./queries";
import {
  hydrateSemesterResult,
  sumSemesters,
  computeGPA,
  classifyGPA,
  formatGPA,
} from "./compute";
import type { SemesterGPAResult, CGPAResult } from "./types";

// Re-export types so callers import from one place
export type {
  SemesterGPAResult,
  CGPAResult,
  GradeClassification,
} from "./types";
export { formatGPA, formatSemesterLabel } from "./compute";
export { DEFAULT_GRADE_SCALE } from "./scale";

// ─── calculateSemesterGPA ─────────────────────────────────────────────────────

/**
 * Compute GPA for a single semester.
 *
 * Returns null when the student has no scoring grades recorded for that
 * semester (e.g. results not yet uploaded, or all courses are non-scoring).
 *
 * @example
 * const result = await calculateSemesterGPA(studentId, semesterId);
 * if (!result) {
 *   // No results yet for this semester
 * }
 * console.log(result.sgpa);             // 3.5
 * console.log(result.sgpaFormatted);    // "3.50"
 * console.log(result.creditsAttempted); // 18
 * console.log(result.creditsEarned);    // 15
 */
export async function calculateSemesterGPA(
  studentId: string,
  semesterId: string,
): Promise<SemesterGPAResult | null> {
  const row = await querySemesterAggregate(studentId, semesterId);
  if (!row) return null;
  return hydrateSemesterResult(row);
}

// ─── calculateCGPA ────────────────────────────────────────────────────────────

/**
 * Compute CGPA for a student across all semesters.
 *
 * Always returns a result. When the student has no grades, all numeric
 * fields are 0, classification is "No Results", and semesters is [].
 *
 * The per-semester breakdown is included so callers do not need a
 * separate query for the transcript or results page.
 *
 * @example
 * const result = await calculateCGPA(studentId);
 *
 * console.log(result.cgpa);                    // 3.42
 * console.log(result.cgpaFormatted);           // "3.42"
 * console.log(result.classification);          // "Second Class Upper"
 * console.log(result.totalCreditsAttempted);   // 120
 * console.log(result.totalCreditsEarned);      // 114
 *
 * for (const sem of result.semesters) {
 *   console.log(sem.label, sem.sgpaFormatted);
 * }
 */
export async function calculateCGPA(studentId: string): Promise<CGPAResult> {
  const aggregateRows = await queryCGPAAggregatesBySemester(studentId);

  // Hydrate each semester row (string → number, compute SGPA)
  const semesters: SemesterGPAResult[] = aggregateRows.map(
    hydrateSemesterResult,
  );

  // Sum semester-level totals to derive CGPA — O(semesters)
  const { totalCreditsAttempted, totalCreditsEarned, totalQualityPoints } =
    sumSemesters(semesters);

  const cgpa = computeGPA(totalQualityPoints, totalCreditsAttempted);
  const hasResults = semesters.length > 0;

  return {
    totalCreditsAttempted,
    totalCreditsEarned,
    totalQualityPoints,
    cgpa,
    cgpaFormatted: formatGPA(cgpa),
    classification: classifyGPA(cgpa, hasResults),
    semesters,
  };
}
