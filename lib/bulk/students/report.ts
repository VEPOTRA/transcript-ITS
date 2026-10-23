/**
 * Student upload error report generator.
 *
 * Produces a CSV file listing every failed row with:
 *   - The original row number (so users can find it in their source file)
 *   - All original cell values
 *   - All error messages joined by " | "
 *
 * The report is machine-readable (CSV) so users can filter and fix rows
 * in their spreadsheet tool, then re-upload.
 *
 * No DB access. Pure transformation of RowFailure[].
 */

import type { RowFailure } from "./types";

/**
 * Generate a CSV error report from an array of failed rows.
 * Returns the CSV as a UTF-8 string ready to write to a response body.
 */
export function generateErrorReportCSV(failures: RowFailure[]): string {
  const headers = [
    "row",
    "indexNumber",
    "firstName",
    "lastName",
    "programmeCode",
    "level",
    "entryYear",
    "graduationYear",
    "errors",
  ];

  const rows = failures.map((f) => [
    String(f.rowNumber),
    f.rawValues.indexNumber ?? "",
    f.rawValues.firstName ?? "",
    f.rawValues.lastName ?? "",
    f.rawValues.programmeCode ?? "",
    f.rawValues.level ?? "",
    f.rawValues.entryYear ?? "",
    f.rawValues.graduationYear ?? "",
    f.errors.join(" | "),
  ]);

  return [headers, ...rows]
    .map((row) =>
      row
        .map((field) => {
          // Quote fields that contain commas, newlines, or double-quotes
          const str = String(field);
          if (str.includes(",") || str.includes("\n") || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(","),
    )
    .join("\n");
}

/**
 * Produce a short human-readable summary line for audit logs and toast messages.
 * e.g. "47 students imported successfully. 3 rows failed."
 */
export function formatUploadSummary(
  successCount: number,
  failureCount: number,
): string {
  const parts: string[] = [];

  if (successCount > 0) {
    parts.push(
      `${successCount} student${successCount === 1 ? "" : "s"} imported successfully.`,
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
