/**
 * /bulk/upload — Bulk student upload page.
 *
 * ADMIN+ only. Provides:
 *   - Template CSV download link
 *   - Column format instructions
 *   - The upload form component
 */

import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/rbac";
import { BulkUploadForm } from "./_components/upload-form";
import { getProgrammes } from "@/actions/crud/programmes";
import { TemplateDownloadButton } from "@/components/templates/template-download-button";

export const metadata: Metadata = {
  title: "Bulk upload — Transcript Management System",
};

export default async function BulkUploadPage() {
  await requirePermission("bulk_upload");

  // Show available programme codes so users know what values to use
  const programmes = await getProgrammes();
  const activeCodes = programmes
    .filter((p) => p.isActive)
    .map((p) => p.code)
    .slice(0, 20); // cap at 20 for display

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7">
      {/* Header */}
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700 dark:text-indigo-300">
          Records administration
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
          Bulk student import
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
          Import multiple students from a CSV file. Valid rows are imported
          immediately; failed rows are reported with specific error messages.
          The upload does not stop on partial errors.
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
              Download the template, fill in your data, and upload the CSV.
            </p>
          </div>
          <TemplateDownloadButton
            endpoint="/api/templates/students"
            filename="student-upload-template.csv"
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
                  <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {[
                ["indexNumber", true, "Unique student identifier, e.g. CS/2021/001"],
                ["firstName", true, "Student's first name"],
                ["lastName", true, "Student's last (family) name"],
                ["programmeCode", true, `Must match an active programme: ${activeCodes.join(", ")}${activeCodes.length < programmes.filter(p => p.isActive).length ? "…" : ""}`],
                ["level", true, "One of: 100, 200, 300, 400, 500, 600, 700, 800"],
                ["dateOfBirth", false, "YYYY-MM-DD format, e.g. 1995-08-25"],
                ["gender", false, "M, F, or O (other)"],
                ["entryYear", true, "4-digit year of admission, e.g. 2021"],
                ["graduationYear", false, "4-digit year, e.g. 2025 — leave blank for current students"],
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

        {/* Limits */}
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Maximum file size: 80 MB · CSV format only
        </p>
      </section>

      <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-700 dark:text-indigo-300">
          Step 2
        </p>
        <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">Upload student records</h2>
        <p className="mb-5 mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400">
          Review the import summary before starting another batch.
        </p>
        <BulkUploadForm />
      </section>
      </div>
    </div>
  );
}
