/**
 * Student bulk upload type definitions.
 *
 * These types flow through every layer of the pipeline:
 *   raw CSV text → RawRow → ValidatedRow → RowResult → BulkUploadResult
 *
 * Nothing here imports from DB, Next.js, or Zod — safe to import anywhere
 * including client components that display the result summary.
 */

// ─── CSV column contract ──────────────────────────────────────────────────────

/**
 * Exact column headers required in the CSV file.
 * These are the only columns the system reads; extras are ignored.
 * Order in the array matches the template column order.
 */
export const STUDENT_CSV_COLUMNS = [
  "indexNumber",
  "firstName",
  "middleName",
  "lastName",
  "dateOfBirth",
  "gender",
  "email",
  "phoneNumber",
  "programmeCode",
  "level",
  "entryYear",
  "graduationYear",
  "campusId",
] as const;

export type StudentCSVColumn = (typeof STUDENT_CSV_COLUMNS)[number];

// ─── Raw row (before any validation) ─────────────────────────────────────────

/**
 * Exactly what the CSV parser produces for each row.
 * Every value is a raw string (or undefined if the column was absent).
 * No coercion or trimming has happened yet.
 */
export type RawStudentRow = Record<StudentCSVColumn, string | undefined> & {
  /** 1-based row number in the CSV file (header = 0, data starts at 1) */
  rowNumber: number;
  /** The raw, un-parsed line for the error report */
  rawLine: string;
};

// ─── Validated row (after Zod) ────────────────────────────────────────────────

/**
 * A row that passed all field-level validation.
 * programmeId has been resolved from the programmeCode lookup.
 */
export type ValidStudentRow = {
  rowNumber: number;
  indexNumber: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  dateOfBirth: string | null; // ISO date string, or null if not provided
  gender: string | null; // "M", "F", "O", or null if not provided
  programmeId: string; // resolved UUID — not in the CSV
  programmeCode: string; // kept for the audit log
  email?: string | null;
  phoneNumber?: string | null;
  level: number;
  entryYear: string;
  graduationYear: string | null;
  campusId?: string | null;
};

// ─── Per-row result ───────────────────────────────────────────────────────────

export type RowSuccess = {
  status: "success";
  rowNumber: number;
  indexNumber: string;
  studentId: string; // the newly inserted UUID
};

export type RowFailure = {
  status: "error";
  rowNumber: number;
  /** The raw values as seen in the CSV */
  rawValues: Partial<Record<StudentCSVColumn, string>>;
  /** All validation or DB errors for this row */
  errors: string[];
};

export type RowResult = RowSuccess | RowFailure;

// ─── Batch result ─────────────────────────────────────────────────────────────

export type BulkUploadResult = {
  totalRows: number;
  successCount: number;
  failureCount: number;
  /** Only failed rows. Clients never receive success details beyond the count. */
  failures: RowFailure[];
  /** Wall-clock duration in milliseconds */
  durationMs: number;
};
