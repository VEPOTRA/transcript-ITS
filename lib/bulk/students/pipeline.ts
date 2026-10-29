// Student bulk insert pipeline.

import { db } from "@/db";
import { students } from "@/db/schema";
import { dbErrorMessage, parseDbError } from "@/actions/utils";
import type { ValidStudentRow, RowFailure, BulkUploadResult } from "./types";

const BATCH_SIZE = 100;

async function insertBatch(batch: ValidStudentRow[]): Promise<RowFailure[]> {
  try {
    await db.insert(students).values(
      batch.map((row) => ({
        indexNumber: row.indexNumber,
        firstName: row.firstName,
        middleName: row.middleName,
        lastName: row.lastName,
        dateOfBirth: row.dateOfBirth, // may be null
        gender: row.gender, // may be null
        programmeId: row.programmeId,
        level: row.level,
        entryYear: row.entryYear,
        graduationYear: row.graduationYear ?? null,
        email: row.email ?? null,
        phoneNumber: row.phoneNumber ?? null,
        status: "ACTIVE" as const,
        campusId: row.campusId ?? null,
      })),
    );
    return []; // no failures
  } catch {
    // Batch failed – fall back to row-by-row to identify problematic rows
    return insertBatchRowByRow(batch);
  }
}

async function insertBatchRowByRow(
  batch: ValidStudentRow[],
): Promise<RowFailure[]> {
  const failures: RowFailure[] = [];

  for (const row of batch) {
    try {
      await db.insert(students).values({
        indexNumber: row.indexNumber,
        firstName: row.firstName,
        middleName: row.middleName,
        lastName: row.lastName,
        dateOfBirth: row.dateOfBirth,
        gender: row.gender,
        programmeId: row.programmeId,
        level: row.level,
        entryYear: row.entryYear,
        graduationYear: row.graduationYear ?? null,
        email: row.email ?? null,
        phoneNumber: row.phoneNumber ?? null,
        status: "ACTIVE" as const,
      });
    } catch (err) {
      // console.error(`[Row ${row.rowNumber}] DB insert error:`, {
      //   code: (err as any)?.code,
      //   message: (err as any)?.message,
      //   detail: (err as any)?.detail,
      //   stack: (err as any)?.stack,
      // });
      const userMessage = dbErrorMessage(parseDbError(err), "student");
      failures.push({
        rowNumber: row.rowNumber,
        status: "error",
        rawValues: {
          indexNumber: row.indexNumber,
          firstName: row.firstName,
          lastName: row.lastName,
          programmeCode: row.programmeCode,
          level: String(row.level),
          entryYear: String(row.entryYear),
          graduationYear: row.graduationYear
            ? String(row.graduationYear)
            : undefined,
          dateOfBirth: row.dateOfBirth ?? "",
          gender: row.gender ?? "",
          email: row.email ?? "",
          phoneNumber: row.phoneNumber ?? "",
        },
        errors: [userMessage],
      });
    }
  }

  return failures;
}

export async function runStudentBulkInsertPipeline(
  validRows: ValidStudentRow[],
  validationFailures: RowFailure[],
  totalDataRows: number,
): Promise<BulkUploadResult> {
  const start = Date.now();

  // Start with failures from validation
  const allFailures: RowFailure[] = [...validationFailures];
  let successCount = 0;

  if (validRows.length > 0) {
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const batchFailures = await insertBatch(batch);
      const succeededInBatch = batch.length - batchFailures.length;
      successCount += succeededInBatch;
      allFailures.push(...batchFailures);
    }
  }

  return {
    totalRows: totalDataRows,
    successCount,
    failureCount: allFailures.length,
    failures: allFailures,
    durationMs: Date.now() - start,
  };
}
