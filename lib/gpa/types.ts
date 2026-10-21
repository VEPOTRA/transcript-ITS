/**
 * GPA module types.
 *
 * All shapes flow from the SQL aggregation results upward.
 * Nothing here depends on DB or Next.js — safe to import anywhere.
 */

// ─── SQL aggregate row shapes ─────────────────────────────────────────────────
// These mirror exactly what the DB returns. Numeric columns come back
// as strings from pg/Drizzle — we parse them explicitly at the boundary.

/**
 * Raw row produced by the SGPA aggregation query.
 * One row per student+semester combination.
 */
export type SemesterAggregateRow = {
  semesterId: string;
  semesterYear: number;
  semesterTerm: "FIRST" | "SECOND";
  /** SUM(computed_quality_points) — string because PostgreSQL numeric → JS string */
  totalQualityPoints: string;
  /** Scoring credits attempted; resit credits count double. */
  creditsAttempted: string;
  /**
   * Scoring credits earned where grade is not E/IC; resit credits count
   * double. Computed via CASE WHEN inside the SUM — single query pass.
   */
  creditsEarned: string;
  /** COUNT(*) of scoring courses — useful for validation / display */
  courseCount: string;
};

// ─── Computed result types ────────────────────────────────────────────────────

/** Result of calculateSemesterGPA */
export type SemesterGPAResult = {
  semesterId: string;
  semesterYear: number;
  semesterTerm: "FIRST" | "SECOND";
  /** e.g. "2022/2023 – First Semester" */
  label: string;
  creditsAttempted: number;
  creditsEarned: number;
  totalQualityPoints: number;
  sgpa: number;
  /** Human-readable SGPA: always 2 decimal places */
  sgpaFormatted: string;
  courseCount: number;
};

/** Full result of calculateCGPA */
export type CGPAResult = {
  totalCreditsAttempted: number;
  totalCreditsEarned: number;
  totalQualityPoints: number;
  cgpa: number;
  /** Human-readable CGPA: always 2 decimal places */
  cgpaFormatted: string;
  classification: GradeClassification | null;
  /** Per-semester breakdown, ordered chronologically (oldest first) */
  semesters: SemesterGPAResult[];
};

/**
 * CGPA band classification.
 *
 * Degree scale (standard 4.0):
 *   First Class (≥3.60) · Second Class Upper (≥3.00) ·
 *   Second Class Lower (≥2.50) · Third Class (≥2.00) · Pass (≥1.00) · Fail
 *
 * Diploma scale:
 *   Distinction (≥3.50) · Credit (≥2.50) · Pass (≥1.00) · Fail
 */
export type GradeClassification =
  | "First Class"
  | "Second Class Upper"
  | "Second Class Lower"
  | "Third Class"
  | "Distinction"
  | "Credit"
  | "Pass"
  | "Fail"
  | "Postgraduate"
  | "No Results";

/** Programme type determines which classification scale is used. */
export type ProgrammeType = "DEGREE" | "DIPLOMA";
