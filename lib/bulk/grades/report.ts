/**
 * Grade bulk upload error report generator.
 *
 * Produces a downloadable CSV listing every failed row with its original
 * values and all error messages. Users fix rows in their spreadsheet and
 * re-upload. The report is intentionally machine-readable (no merge cells,
 * no formatting) so it can be filtered and sorted in any spreadsheet tool.
 *
 * No DB access. Pure transformation of GradeRowFailure[].
 */

import type { GradeRowFailure } from "./types";

// ─── CSV error report ─────────────────────────────────────────────────────────

function quoteCSVField(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generate the CSV error report.
 * Returns a UTF-8 string ready to stream as a file download.
 */
export function generateGradeErrorReportCSV(
  failures: GradeRowFailure[],
): string {
  const headers = [
    "row",
    "indexNumber",
    "courseCode",
    "courseCategory",
    "semester",
    "year",
    "grade",
    "errors",
  ];

  const rows = failures.map((f) => [
    String(f.rowNumber),
    f.rawValues.indexNumber ?? "",
    f.rawValues.courseCode ?? "",
    f.rawValues.courseCategory ?? "",
    f.rawValues.semester ?? "",
    f.rawValues.year ?? "",
    f.rawValues.grade ?? "",
    f.errors.join(" | "),
  ]);

  return [headers, ...rows]
    .map((row) => row.map(quoteCSVField).join(","))
    .join("\n");
}

// ─── Summary text ─────────────────────────────────────────────────────────────

export function formatGradeUploadSummary(
  successCount: number,
  failureCount: number,
): string {
  const parts: string[] = [];

  if (successCount > 0) {
    parts.push(
      `${successCount} grade${successCount === 1 ? "" : "s"} imported successfully.`,
    );
  }
  if (failureCount > 0) {
    parts.push(
      `${failureCount} row${failureCount === 1 ? "" : "s"} failed — download the error report to review.`,
    );
  }
  if (successCount === 0 && failureCount === 0) {
    return "No data rows were found in the file.";
  }

  return parts.join(" ");
}
