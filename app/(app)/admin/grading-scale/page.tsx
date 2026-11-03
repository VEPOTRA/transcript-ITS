/**
 * /admin/grading-scale — Grading scale reference with custom credit hour preview.
 * SUPER_ADMIN only.
 */

"use client";

import { useState } from "react";
import { DEFAULT_GRADE_SCALE, GRADE_LETTERS } from "@/lib/gpa/scale";

const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-100   text-green-800",
  "B+": "bg-emerald-100 text-emerald-800",
  B: "bg-teal-100    text-teal-800",
  "C+": "bg-yellow-100  text-yellow-800",
  C: "bg-amber-100   text-amber-800",
  "D+": "bg-orange-100  text-orange-800",
  D: "bg-red-100     text-red-700",
  F: "bg-red-200     text-red-900",
};

function gradeClass(gp: number): string {
  if (gp >= 3.5) return "Distinction";
  if (gp >= 3.0) return "Upper credit";
  if (gp >= 2.0) return "Credit";
  if (gp >= 1.0) return "Pass";
  return "Fail";
}

function GradeBadge({ grade }: { grade: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${GRADE_COLORS[grade] ?? "bg-gray-100 text-gray-700"}`}>
      {grade}
    </span>
  );
}

// Common credit hour presets
const PRESETS = [2, 3, 6, 12, 18, 24];

export default function GradingScalePage() {
  // Two customisable credit hour columns
  const [col1, setCol1] = useState(3);
  const [col2, setCol2] = useState(6);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-indigo-950 dark:text-white">Grading scale</h2>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          The grade-to-grade-point mapping used to compute quality points and GPA.
          Use the credit hour selectors below the table header to preview quality
          points for any credit value used in your institution.
        </p>
      </div>

      {/* Credit hour selectors */}
      <div className="flex flex-wrap items-center gap-6 rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Preview credit hours:</p>

        <CreditHourPicker label="Column A" value={col1} onChange={setCol1} presets={PRESETS} />
        <CreditHourPicker label="Column B" value={col2} onChange={setCol2} presets={PRESETS} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              {[
                "Grade",
                "Grade point",
                "Classification",
                `Quality pts (${col1} cr hrs)`,
                `Quality pts (${col2} cr hrs)`,
              ].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {GRADE_LETTERS.map((grade) => {
              const gp = DEFAULT_GRADE_SCALE[grade]!;
              const qp1 = (gp * col1).toFixed(2);
              const qp2 = (gp * col2).toFixed(2);
              return (
                <tr key={grade} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30">
                  <td className="px-5 py-3"><GradeBadge grade={grade} /></td>
                  <td className="px-5 py-3 tabular-nums text-gray-900 dark:text-gray-100">{gp.toFixed(2)}</td>
                  <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{gradeClass(gp)}</td>
                  <td className="px-5 py-3 tabular-nums font-medium text-gray-700 dark:text-gray-300">{qp1}</td>
                  <td className="px-5 py-3 tabular-nums font-medium text-gray-700 dark:text-gray-300">{qp2}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Formula explainer */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
        <p className="font-medium mb-2">How GPA is computed</p>
        <div className="space-y-1 font-mono text-xs">
          <p>quality_points = grade_point × credit_hours  (stored at write time)</p>
          <p>SGPA = Σ(quality_points) / Σ(credit_hours)   per semester</p>
          <p>CGPA = Σ(all quality_points) / Σ(all credit_hours)</p>
        </div>
        <p className="mt-3 text-xs text-indigo-800 dark:text-indigo-300">
          Non-scoring courses are excluded from all GPA calculations.
          F grades contribute 0 quality points but are counted in credits attempted.
          Credit hours are snapshotted from the course at the time of grade entry —
          updating a course's credit hours does not retroactively change existing grades.
        </p>
      </div>
    </div>
  );
}

function CreditHourPicker({
  label, value, onChange, presets,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  presets: number[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}:</span>
      <div className="flex gap-1">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={[
              "rounded px-2 py-0.5 text-xs font-medium transition-colors",
              value === p
                ? "bg-indigo-900 text-white dark:bg-indigo-200 dark:text-indigo-950"
                : "border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800",
            ].join(" ")}
          >
            {p}
          </button>
        ))}
      </div>
      <input
        type="number"
        min={1}
        max={99}
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= 1) onChange(v);
        }}
        className="w-14 rounded border border-gray-300 px-2 py-0.5 text-xs text-center dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-900"
      />
      <span className="text-xs text-gray-400">cr hrs</span>
    </div>
  );
}