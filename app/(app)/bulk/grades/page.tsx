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
    <div className="mx-auto w-full max-w-6xl space-y-7">
      {/* Header */}
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700 dark:text-indigo-300">
          Records administration
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
          Bulk grade import
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
          Import grades for multiple students from a CSV file. Partial success
          is supported — valid rows are inserted even when others fail.
          Grade points and quality points are computed server-side from the
          grade letter; they are never read from the CSV.
        </p>
      </header>

      <div className="grid items-stretch gap-6 lg:grid-cols-2">
      <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-700 dark:text-indigo-300">
              Step 1
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">Prepare your CSV</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400">
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
        <div className="mt-5 flex-1 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                {["Column", "Required", "Format / Notes"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {[
                ["indexNumber", true, "Must match an existing student index number"],
                ["courseCode", true, "Must match an existing active course code"],
                ["courseCategory", false, "Required when the course code exists in multiple categories"],
                ["semester", true, "FIRST or SECOND (also accepts 1 / 2 / first / second)"],
                ["year", true, "4-digit academic year, e.g. 2021 for 2021/2022"],
                ["grade", true, `One of: ${GRADE_LETTERS.join(", ")}. P/F only for non-scoring courses`],
              ].map(([col, req, note]) => (
                <tr key={col as string}>
                  <td className="px-3 py-2 font-mono font-medium text-slate-800 dark:text-slate-200">{col as string}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${req ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                      {req ? "Required" : "Optional"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{note as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Available semesters */}
        {allSemesters.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Available semesters (year + semester combinations that exist):</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allSemesters.map((s) => (
                <span key={s.id} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
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

        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Max file size: 5 MB · Max rows per upload: 5,000 · CSV format only
        </p>
      </section>

      <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-700 dark:text-indigo-300">
          Step 2
        </p>
        <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">Upload grade records</h2>
        <p className="mb-5 mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400">
          Select the prepared file and review the results before continuing.
        </p>
        <div className="mb-5 rounded-lg border border-indigo-100 bg-indigo-50/70 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950/30">
          <p className="text-xs leading-5 text-indigo-950 dark:text-indigo-100">
            Grade points, credit hours and quality points are computed from the grade letter and course record. Do not add these values to the CSV.
          </p>
        </div>
        <GradeUploadForm />
      </section>
      </div>
    </div>
  );
}
