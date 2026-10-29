/**
 * Student bulk upload row validation.
 *
 * Three layers of validation run in sequence for each row:
 *
 *   1. Field-level (Zod)         — type coercion, length, enum membership
 *   2. Reference lookup          — programmeCode must exist in the DB
 *   3. Uniqueness                — indexNumber must be unique in DB + within batch
 *
 * The programme lookup is pre-fetched once before processing any rows
 * (a single query, not one per row). The indexNumber uniqueness check
 * against the DB is done in a batch query, not per-row.
 *
 * This module has no side effects — it returns validation results only.
 * DB inserts happen in the pipeline.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { programmes, students } from "@/db/schema";
import type { RawStudentRow, ValidStudentRow, RowFailure } from "./types";

// ─── Field-level schema ───────────────────────────────────────────────────────

const VALID_LEVELS = [
  100, 200, 300, 400, 500, 600, 700, 701, 800, 801, 900, 901, 902,
] as const;
const currentYear = new Date().getFullYear();

const rowSchema = z.object({
  indexNumber: z
    .string({ required_error: "Index number is required" })
    .min(2, "Index number must be at least 2 characters")
    .max(100, "Index number must be at most 100 characters")
    .trim(),

  firstName: z
    .string({ required_error: "First name is required" })
    .min(1, "First name is required")
    .max(100, "First name must be at most 100 characters")
    .trim(),

  middleName: z
    .string()
    .max(100, "Middle name must be at most 100 characters")
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? null : v.trim())),

  lastName: z
    .string({ required_error: "Last name is required" })
    .min(1, "Last name is required")
    .max(100, "Last name must be at most 100 characters")
    .trim(),

  dateOfBirth: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined) return null;
      const t = v.trim();
      // treat the "zero date" and any 0000-00-00 variant as null
      if (t === "" || /^0{4}-0{2}-0{2}$/.test(t)) return null;
      return t;
    })
    .pipe(
      z.union([
        z.null(),
        z
          .string()
          .refine(
            (s) => !isNaN(Date.parse(s)),
            "Date of birth must be a valid date string (e.g. 1995-08-25)",
          ),
      ]),
    ),

  gender: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined) return null;
      const t = v.trim().toUpperCase();
      if (t === "") return null;
      if (t === "MALE" || t === "M") return "M";
      if (t === "FEMALE" || t === "F") return "F";
      if (t === "OTHER" || t === "O") return "O";
      return t; // falls through to the enum check → gives a proper message
    })
    .pipe(z.union([z.null(), z.enum(["M", "F", "O"])])),

  programmeCode: z
    .string({ required_error: "Programme code is required" })
    .min(1, "Programme code is required")
    .max(50, "Programme code must be at most 50 characters")
    .trim()
    .toUpperCase(),

  level: z
    .string({ required_error: "Level is required" })
    .min(1, "Level is required")
    .pipe(
      z.coerce
        .number({ invalid_type_error: "Level must be a number (e.g. 100)" })
        .int("Level must be a whole number")
        .refine((n) => (VALID_LEVELS as ReadonlyArray<number>).includes(n), {
          message: `Level must be one of: ${VALID_LEVELS.join(", ")}`,
        }),
    ),

  entryYear: z
    .string({ required_error: "Entry year is required" })
    .min(4, "Entry year must be 4 digits (e.g. 2023)"),

  graduationYear: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? null : v.trim())),
  campusId: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? null : v.trim()))
    .pipe(
      z.union([z.null(), z.string().uuid("Campus ID must be a valid UUID")]),
    ),
});

// ─── Pre-fetch lookup data ────────────────────────────────────────────────────

/**
 * Fetch all active programmes once before processing the batch.
 * Returns a Map from uppercase code → UUID for O(1) lookup per row.
 */
export async function fetchProgrammeCodeMap(): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: programmes.id, code: programmes.code })
    .from(programmes)
    .where(eq(programmes.isActive, true));

  return new Map(rows.map((r) => [r.code.toUpperCase(), r.id]));
}

/**
 * Fetch all existing index numbers from the DB as a Set.
 * Used for O(1) uniqueness checks without hitting the DB per row.
 *
 * For very large student tables this could be paginated, but is acceptable
 * up to ~500 k rows before the in-memory set becomes a concern.
 */
export async function fetchExistingIndexNumbers(): Promise<Set<string>> {
  const rows = await db
    .select({ indexNumber: students.indexNumber })
    .from(students);
  return new Set(rows.map((r) => r.indexNumber.toUpperCase()));
}

// ─── Row validation ───────────────────────────────────────────────────────────

type ValidationContext = {
  /** Map from uppercase programmeCode → programmeId UUID */
  programmeCodeMap: Map<string, string>;
  /** All indexNumbers already in the database */
  existingIndexNumbers: Set<string>;
  /** indexNumbers seen in earlier rows of this batch (within-batch dedup) */
  seenInBatch: Set<string>;
};

type RowValidationResult =
  | { ok: true; row: ValidStudentRow }
  | { ok: false; errors: string[] };

/**
 * Validate a single raw CSV row.
 *
 * Order of checks:
 *   1. Field-level Zod validation (type, length, enum)
 *   2. Programme code lookup (must exist in DB)
 *   3. Index number uniqueness (DB + within batch)
 *
 * Returns all errors for the row, not just the first one,
 * so the user can fix everything in one pass.
 */
export function validateRow(
  raw: RawStudentRow,
  ctx: ValidationContext,
): RowValidationResult {
  const errors: string[] = [];

  // Step 1: field-level validation
  const parsed = rowSchema.safeParse({
    indexNumber: raw.indexNumber,
    firstName: raw.firstName,
    middleName: raw.middleName,
    lastName: raw.lastName,
    dateOfBirth: raw.dateOfBirth,
    gender: raw.gender,
    programmeCode: raw.programmeCode,
    level: raw.level,
    entryYear: raw.entryYear,
    graduationYear: raw.graduationYear,
    campusId: raw.campusId,
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(issue.message);
    }
    // Field errors are terminal — skip reference checks on malformed data
    return { ok: false, errors };
  }

  const data = parsed.data;

  // Step 2: programme code lookup
  const programmeId = ctx.programmeCodeMap.get(
    data.programmeCode.toUpperCase(),
  );
  if (!programmeId) {
    errors.push(
      `Programme code "${data.programmeCode}" does not exist or is inactive. ` +
        `Valid codes: ${[...ctx.programmeCodeMap.keys()].slice(0, 10).join(", ")}${ctx.programmeCodeMap.size > 10 ? "…" : ""}`,
    );
  }

  // Step 3: uniqueness — DB
  const upperIndex = data.indexNumber.toUpperCase();
  if (ctx.existingIndexNumbers.has(upperIndex)) {
    errors.push(
      `Index number "${data.indexNumber}" is already registered in the system.`,
    );
  }

  // Step 4: uniqueness — within this batch
  if (ctx.seenInBatch.has(upperIndex)) {
    errors.push(
      `Index number "${data.indexNumber}" appears more than once in this file.`,
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Mark as seen so subsequent rows in the batch can detect duplicates
  ctx.seenInBatch.add(upperIndex);

  return {
    ok: true,
    row: {
      rowNumber: raw.rowNumber,
      indexNumber: data.indexNumber,
      firstName: data.firstName,
      middleName: data.middleName ?? null,
      lastName: data.lastName,
      dateOfBirth: data.dateOfBirth ?? null,
      gender: data.gender ?? null,
      programmeId: programmeId!,
      programmeCode: data.programmeCode,
      level: data.level,
      entryYear: data.entryYear,
      graduationYear: data.graduationYear ?? null,
      campusId: data.campusId ?? null,
    },
  };
}

/**
 * Validate all rows in a batch.
 * Returns validated rows (for insert) and failures (for the error report) separately.
 */
export async function validateBatch(rawRows: RawStudentRow[]): Promise<{
  validRows: ValidStudentRow[];
  failedRows: RowFailure[];
}> {
  // Pre-fetch lookup data — one DB roundtrip each, before processing any rows
  const [programmeCodeMap, existingIndexNumbers] = await Promise.all([
    fetchProgrammeCodeMap(),
    fetchExistingIndexNumbers(),
  ]);

  const ctx: ValidationContext = {
    programmeCodeMap,
    existingIndexNumbers,
    seenInBatch: new Set<string>(),
  };

  const validRows: ValidStudentRow[] = [];
  const failedRows: RowFailure[] = [];

  for (const raw of rawRows) {
    const result = validateRow(raw, ctx);

    if (result.ok) {
      validRows.push(result.row);
    } else {
      failedRows.push({
        status: "error",
        rowNumber: raw.rowNumber,
        rawValues: {
          indexNumber: raw.indexNumber,
          firstName: raw.firstName,
          lastName: raw.lastName,
          programmeCode: raw.programmeCode,
          level: raw.level,
          entryYear: raw.entryYear,
          graduationYear: raw.graduationYear,
          campusId: raw.campusId,
        },
        errors: result.errors,
      });
    }
  }

  return { validRows, failedRows };
}
