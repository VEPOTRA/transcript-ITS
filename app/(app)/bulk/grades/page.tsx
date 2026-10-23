/**
 * /bulk/grades — Grade bulk upload page.
 *
 * ADMIN+ only. Shows:
 *   - Template download link
 *   - Column reference with valid grade values
 *   - Active semesters so users know what (year, semester) combinations exist
 *   - The upload form component
 */

import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/rbac";
import { GradeUploadForm } from "./_components/grade-upload-form";
import { GRADE_LETTERS } from "@/lib/gpa/scale";
import { db } from "@/db";
import { TemplateDownloadButton } from "@/components/templates/template-download-button";
import { semesters } from "@/db/schema";

export const metadata: Metadata = {
  title: "Grade bulk upload — Transcript Management System",
};

export default async function GradeBulkUploadPage() {
  await requirePermission("bulk_upload");

  const allSemesters = await db
    .select()
    .from(semesters)
    .orderBy(semesters.year, semesters.semester);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Grade bulk upload</h1>
        <p className="mt-1 text-sm text-gray-500">
          Import grades for multiple students from a CSV file. Partial success
          is supported — valid rows are inserted even when others fail.
          Grade points and quality points are computed server-side from the
          grade letter; they are never read from the CSV.
        </p>
      </div>

      {/* Instructions */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Prepare your file</h2>
            <p className="mt-1 text-sm text-gray-500">
              Download the template, fill in your data, then upload.
            </p>
          </div>
          <TemplateDownloadButton
            endpoint="/api/templates/grades"
            filename="grade-upload-template.csv"
            label="Download template"
            size="sm"
          />
        </div>

        {/* Column reference */}
        <div className="mt-5 overflow-hidden rounded-lg border border-gray-100">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                {["Column", "Required", "Format / Notes"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {[
                ["indexNumber", true, "Must match an existing student index number"],
                ["courseCode", true, "Must match an existing active course code"],
                ["courseCategory", false, "Required when the course code exists in multiple categories"],
                ["semester", true, "FIRST or SECOND (also accepts 1 / 2 / first / second)"],
                ["year", true, "4-digit academic year, e.g. 2021 for 2021/2022"],
                ["grade", true, `One of: ${GRADE_LETTERS.join(", ")}. P/F only for non-scoring courses`],
              ].map(([col, req, note]) => (
                <tr key={col as string}>
                  <td className="px-3 py-2 font-mono font-medium text-gray-800">{col as string}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${req ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                      {req ? "Required" : "Optional"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{note as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Available semesters */}
        {allSemesters.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-600">Available semesters (year + semester combinations that exist):</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allSemesters.map((s) => (
                <span key={s.id} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-700">
                  {s.year} · {s.semester === "FIRST" ? "First" : "Second"}
                </span>
              ))}
            </div>
            {allSemesters.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">
                No semesters found. Create at least one semester before uploading grades.
              </p>
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-gray-400">
          Max file size: 5 MB · Max rows per upload: 5,000 · CSV format only
        </p>
      </section>

      {/* Computed values note */}
      <section className="rounded-xl border border-amber-100 bg-amber-50 p-4">
        <p className="text-xs font-medium text-amber-800">
          Grade points, credit hours, and quality points are never read from the file.
          They are computed server-side from the grade letter and the course record
          after the upload. Do not add these columns to your CSV.
        </p>
      </section>

      {/* Upload form */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">Upload file</h2>
        <GradeUploadForm />
      </section>
    </div>
  );
}
