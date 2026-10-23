/**
 * Grade bulk insert pipeline — batched for performance.
 *
 * Grade insertions are more sensitive than student inserts because each row
 * has server-computed values (gradePoint, creditHours, computedQualityPoints)
 * that must be correct. The batch strategy is the same: try 100 at a time,
 * fall back to per-row on constraint failure.
 */

import { db } from "@/db";
import { grades } from "@/db/schema";
import { dbErrorMessage, parseDbError } from "@/actions/utils";
import type { ValidGradeRow, GradeRowFailure, GradeBulkResult } from "./types";

const BATCH_SIZE = 100;

type BatchResult = {
  succeeded: number;
  failures: GradeRowFailure[];
};

async function insertBatch(batch: ValidGradeRow[]): Promise<BatchResult> {
  try {
    await db.insert(grades).values(
      batch.map((row) => ({
        studentId: row.studentId,
        courseId: row.courseId,
        semesterId: row.semesterId,
        grade: row.grade as
          | "A"
          | "B+"
          | "B"
          | "C+"
          | "C"
          | "D+"
          | "D"
          | "E"
          | "F"
          | "IC"
          | "P",
        gradePoint: Number(row.gradePoint).toFixed(2),
        creditHours: row.creditHours,
        computedQualityPoints: Number(row.computedQualityPoints).toFixed(2),
        isResit: row.isResit,
        isSuperseded: false,
      })),
    );
    return { succeeded: batch.length, failures: [] };
  } catch (err) {
    console.warn(
      "[runGradeBulkInsertPipeline] Batch insert failed; retrying rows individually.",
      err,
    );
    return insertBatchRowByRow(batch);
  }
}

async function insertBatchRowByRow(
  batch: ValidGradeRow[],
): Promise<BatchResult> {
  let succeeded = 0;
  const failures: GradeRowFailure[] = [];

  for (const row of batch) {
    try {
      await db.insert(grades).values({
        studentId: row.studentId,
        courseId: row.courseId,
        semesterId: row.semesterId,
        grade: row.grade as
          | "A"
          | "B+"
          | "B"
          | "C+"
          | "C"
          | "D+"
          | "D"
          | "E"
          | "F"
          | "IC"
          | "P",
        gradePoint: Number(row.gradePoint).toFixed(2),
        creditHours: row.creditHours,
        computedQualityPoints: Number(row.computedQualityPoints).toFixed(2),
        isResit: row.isResit,
        isSuperseded: false,
      });
      succeeded++;
    } catch (err) {
      // Log the full error for debugging
      console.error(`[Grade insert row ${row.rowNumber}]`, err);
      const parsedError = parseDbError(err);
      const message = dbErrorMessage(parsedError, "grade");
      failures.push({
        rowNumber: row.rowNumber,
        status: "error",
        rawValues: {
          indexNumber: row.indexNumber,
          courseCode: row.courseCode,
          courseCategory: row.courseCategory,
          semester: row.semester,
          year: String(row.year),
          grade: row.grade,
          isResit: String(row.isResit),
        },
        errors: [message],
      });
    }
  }

  return { succeeded, failures };
}

export async function runGradeBulkInsertPipeline(
  validRows: ValidGradeRow[],
  failedRows: GradeRowFailure[],
  totalDataRows: number,
): Promise<GradeBulkResult> {
  const startedAt = Date.now();
  const allFailures: GradeRowFailure[] = [...failedRows];
  let totalSucceeded = 0;

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE);
    const result = await insertBatch(batch);
    totalSucceeded += result.succeeded;
    allFailures.push(...result.failures);
  }

  return {
    totalRows: totalDataRows,
    successCount: totalSucceeded,
    failureCount: allFailures.length,
    failures: allFailures,
    durationMs: Date.now() - startedAt,
  };
}
