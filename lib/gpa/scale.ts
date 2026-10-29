/**
 * Grade-to-grade-point scale.
 *
 * The DEFAULT_GRADE_SCALE is the fallback when no institution-level
 * custom scale is configured. For multi-institution support, fetch
 * institutions.grading_scale (JSONB) and pass it to resolveGradePoint.
 *
 * This file is intentionally separate from compute.ts so the grade entry
 * form can import just the scale without pulling in GPA math.
 */

/** Default grade point values on the 4.0 scale. */
/** UEW Bachelor of Education scale (grade E = fail; F kept for legacy rows). */
export const DEFAULT_GRADE_SCALE: Readonly<Record<string, number>> = {
  A: 4.0,
  "B+": 3.5,
  B: 3.0,
  "C+": 2.5,
  C: 2.0,
  "D+": 1.5,
  D: 1.0,
  E: 0.0,
  F: 0.0,
  IC: 0.0,
  P: 0.0,
};

/** Ordered list of valid grade letters (descending quality). */
export const GRADE_LETTERS = Object.keys(DEFAULT_GRADE_SCALE) as Array<
  keyof typeof DEFAULT_GRADE_SCALE
>;

export const NON_SCORING_GRADE_LETTERS = ["P", "F"] as const;

export function isGradeAllowedForCourse(
  grade: string,
  isScoring: boolean | null,
): boolean {
  return isScoring === false
    ? NON_SCORING_GRADE_LETTERS.some((letter) => letter === grade)
    : grade !== "P";
}

/**
 * Resolve the grade point for a letter grade.
 * Accepts an optional custom scale from institutions.grading_scale.
 *
 * Throws on unknown grade letters — fail fast rather than silently
 * storing 0 quality points for an unrecognised grade.
 */
export function resolveGradePoint(
  grade: string,
  customScale?: Record<string, number>,
): number {
  const scale = customScale ?? DEFAULT_GRADE_SCALE;
  const point = scale[grade];

  if (point === undefined) {
    throw new Error(
      `Unknown grade letter "${grade}". Valid values: ${Object.keys(scale).join(", ")}`,
    );
  }

  return point;
}

/**
 * Compute quality points at grade-entry time.
 * This is the value stored in grades.computed_quality_points.
 *
 * Called once when a grade is submitted. Never called again for GPA reads.
 */
export function computeQualityPoints(
  gradePoint: number,
  creditHours: number,
): number {
  return Math.round(gradePoint * creditHours * 100) / 100;
}
