/**
 * /templates — Template download hub.
 *
 * Shows both CSV templates (students + grades) side by side with:
 *   - Live preview of the template rows
 *   - Full column reference
 *   - Download button for each
 *   - Link to the corresponding upload page
 *
 * ADMIN+ only (bulk_upload permission).
 */

import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/rbac";
import { TEMPLATE_SPECS } from "@/lib/templates";
import { DEFAULT_GRADE_SCALE } from "@/lib/gpa/scale";
import { TemplateDownloadButton } from "@/components/templates/template-download-button";
import { TemplatePreviewTable } from "@/components/templates/template-preview-table";

export const metadata: Metadata = {
  title: "Templates — Transcript Management System",
};

export default async function TemplatesPage() {
  await requirePermission("bulk_upload");

  return (
    <div className="space-y-10">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Upload templates</h1>
        <p className="mt-1 text-sm text-gray-500">
          Download a template, fill in your data, and upload it on the corresponding
          upload page. Comment rows in the template are stripped automatically —
          you do not need to delete them before uploading.
        </p>
      </div>

      {/* Student template card */}
      <TemplateCard
        spec={TEMPLATE_SPECS[0]}
        uploadHref="/bulk/upload"
        uploadLabel="Go to student upload"
        columnRows={[
          { name: "indexNumber", required: true, note: "Unique student identifier, e.g. CS/2024/001" },
          { name: "firstName", required: true, note: "Student's given name" },
          { name: "lastName", required: true, note: "Student's family / surname" },
          { name: "programmeCode", required: true, note: "Must match an active programme code in the system" },
          { name: "level", required: true, note: "100, 200, 300, 400, 500, 600, 700, or 800" },
          { name: "entryYear", required: true, note: "4-digit year of first admission, e.g. 2024" },
          { name: "graduationYear", required: false, note: "4-digit year — leave blank for current students" },
        ]}
        warningNote={null}
      />

      {/* Grades template card */}
      <TemplateCard
        spec={TEMPLATE_SPECS[1]}
        uploadHref="/bulk/grades"
        uploadLabel="Go to grade upload"
        columnRows={[
          { name: "indexNumber", required: true, note: "Must match an existing student index number" },
          { name: "courseCode", required: true, note: "Must match an existing active course code" },
          { name: "courseCategory", required: false, note: "Required when the course code exists in multiple categories" },
          { name: "semester", required: true, note: "FIRST or SECOND (also accepts 1, 2, first, second)" },
          { name: "year", required: true, note: "4-digit academic year start, e.g. 2024 for 2024/2025" },
          { name: "grade", required: true, note: `One of: ${Object.keys(DEFAULT_GRADE_SCALE).join(", ")}. P/F only for non-scoring courses.` },
          { name: "isResit", required: false, note: "true/false; blank defaults to false. Resit credits count twice toward GPA." },
        ]}
        warningNote="Do not add gradePoint, creditHours, or computedQualityPoints columns. These are computed server-side from the grade letter and course record. Resit quality points use actual course credit."
      />
    </div>
  );
}

// ─── Template card ────────────────────────────────────────────────────────────

type ColumnRow = { name: string; required: boolean; note: string };
type Spec = (typeof TEMPLATE_SPECS)[number];

async function TemplateCard({
  spec,
  uploadHref,
  uploadLabel,
  columnRows,
  warningNote,
}: {
  spec: Spec;
  uploadHref: string;
  uploadLabel: string;
  columnRows: ColumnRow[];
  warningNote: string | null;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Card header */}
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{spec.label}</h2>
          <p className="mt-0.5 text-sm text-gray-500">{spec.description}</p>
          <p className="mt-1.5 text-xs text-gray-400">
            {spec.columns.length} columns &middot; {spec.sampleCount} sample rows
            &middot; CRLF line endings &middot; UTF-8 with BOM
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
          <TemplateDownloadButton
            endpoint={spec.endpoint}
            filename={spec.filename}
            label="Download CSV"
            variant="primary"
            size="md"
          />
          <a
            href={uploadHref}
            className="text-xs text-blue-600 hover:underline"
          >
            {uploadLabel} →
          </a>
        </div>
      </div>

      {/* Warning note (grades only) */}
      {warningNote && (
        <div className="mx-6 mt-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
          <p className="text-xs font-medium text-amber-800">{warningNote}</p>
        </div>
      )}

      {/* Column reference */}
      <div className="px-6 pt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Column reference
        </h3>
        <div className="overflow-hidden rounded-lg border border-gray-100">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-gray-500">Column</th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-gray-500">Required</th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-gray-500">Format / notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {columnRows.map((col) => (
                <tr key={col.name}>
                  <td className="px-3 py-2">
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-800">
                      {col.name}
                    </code>
                  </td>
                  <td className="px-3 py-2">
                    <span className={[
                      "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                      col.required
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-500",
                    ].join(" ")}>
                      {col.required ? "Required" : "Optional"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{col.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live preview */}
      <div className="px-6 py-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Template preview
        </h3>
        <TemplatePreviewTable type={spec.id} />
        <p className="mt-2 text-xs text-gray-400">
          Comment rows are not shown. They appear in the downloaded file and are
          stripped automatically on upload.
        </p>
      </div>
    </section>
  );
}
