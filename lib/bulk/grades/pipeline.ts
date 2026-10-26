/**
 * Grade bulk insert pipeline — batched for performance.
 *
 * Grade insertions are more sensitive than student inserts because each row
 * has server-computed values (gradePoint, creditHours, computedQualityPoints)
 * that must be correct. Constraint failures are isolated by splitting only
 * the affected batch, avoiding a slow sequential insert for every row.
 */

import { db } from "@/db";
import { grades } from "@/db/schema";
import { dbErrorMessage, parseDbError } from "@/actions/utils";
import type { ValidGradeRow, GradeRowFailure, GradeBulkResult } from "./types";

const BATCH_SIZE = 500;

type BatchResult = {
  succeeded: number;
  failures: GradeRowFailure[];
};

async function insertBatch(batch: ValidGradeRow[]): Promise<BatchResult> {
  try {
    const inserted = await db
      .insert(grades)
      .values(
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
      )
      .onConflictDoNothing()
      .returning({
        studentId: grades.studentId,
        courseId: grades.courseId,
        semesterId: grades.semesterId,
      });
    const insertedKeys = new Set(
      inserted.map(
        (row) => `${row.studentId}|${row.courseId}|${row.semesterId}`,
      ),
    );
    const conflicts = batch.filter(
      (row) =>
        !insertedKeys.has(`${row.studentId}|${row.courseId}|${row.semesterId}`),
    );
    return {
      succeeded: inserted.length,
      failures: conflicts.map((row) => ({
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
        errors: [
          `A grade for "${row.indexNumber}" in "${row.courseCode}" already exists for this semester.`,
        ],
      })),
    };
  } catch (err) {
    const parsedError = parseDbError(err);
    const rowLevelConstraint =
      parsedError.type === "not_null" ||
      parsedError.type === "foreign_key" ||
      parsedError.type === "check";
    if (!rowLevelConstraint) throw err;

    if (batch.length === 1) {
      const [row] = batch;
      console.error(`[Grade insert row ${row.rowNumber}]`, err);
      return {
        succeeded: 0,
        failures: [{
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
          errors: [dbErrorMessage(parsedError, "grades")],
        }],
      };
    }

    const midpoint = Math.floor(batch.length / 2);
    const [left, right] = await Promise.all([
      insertBatch(batch.slice(0, midpoint)),
      insertBatch(batch.slice(midpoint)),
    ]);
    return {
      succeeded: left.succeeded + right.succeeded,
      failures: [...left.failures, ...right.failures],
    };
  }
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
