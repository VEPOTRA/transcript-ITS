"use client";

/**
 * Grade bulk upload form — client component.
 *
 * Identical interaction model to the student upload form:
 *   idle → selected → uploading → done
 *
 * The result panel surfaces grade-specific columns (courseCode, semester)
 * in the failure table. The computed values (gradePoint, creditHours,
 * computedQualityPoints) are never shown here — they are server-only.
 */

import { useState, useRef, useCallback } from "react";
import { formatGradeUploadSummary }  from "@/lib/bulk/grades/report";
import type { GradeBulkResult, GradeRowFailure } from "@/lib/bulk/grades/types";

type UploadState =
  | { phase: "idle" }
  | { phase: "selected"; file: File }
  | { phase: "uploading"; file: File; progress: number }
  | { phase: "done"; result: GradeBulkResult };

const MAX_MB = 5;

export function GradeUploadForm() {
  const [state, setState]           = useState<UploadState>({ phase: "idle" });
  const [dragOver, setDragOver]     = useState(false);
  const [showAll, setShowAll]       = useState(false);
  const fileInputRef                = useRef<HTMLInputElement>(null);

  // ── File selection ─────────────────────────────────────────────────────────

  const selectFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) { alert("Please select a CSV file."); return; }
    if (file.size > MAX_MB * 1024 * 1024)          { alert(`File exceeds ${MAX_MB} MB limit.`); return; }
    setState({ phase: "selected", file });
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) selectFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) selectFile(f);
  };

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = () => {
    if (state.phase !== "selected") return;
    const { file } = state;
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) setState({ phase: "uploading", file, progress: Math.round(e.loaded / e.total * 100) });
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        try { setState({ phase: "done", result: JSON.parse(xhr.responseText) }); setShowAll(false); }
        catch { alert("Server returned an unreadable response."); }
      } else {
        try { alert(JSON.parse(xhr.responseText).error ?? "Upload failed."); }
        catch { alert(`Upload failed (${xhr.status}).`); }
        setState({ phase: "selected", file });
      }
    });

    xhr.addEventListener("error", () => { alert("Network error. Try again."); setState({ phase: "selected", file }); });
    xhr.open("POST", "/api/bulk/grades/upload");
    xhr.send(form);
    setState({ phase: "uploading", file, progress: 0 });
  };

  // ── Error report download ──────────────────────────────────────────────────

  const downloadReport = async (failures: GradeRowFailure[]) => {
    const res = await fetch("/api/bulk/grades/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ failures }),
    });
    if (!res.ok) { alert("Could not generate error report."); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `grade-upload-errors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => { setState({ phase: "idle" }); if (fileInputRef.current) fileInputRef.current.value = ""; };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {state.phase !== "done" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => state.phase === "idle" && fileInputRef.current?.click()}
          className={[
            "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 py-12 text-center transition-colors",
            state.phase === "idle"
              ? dragOver ? "cursor-copy border-emerald-400 bg-emerald-50" : "cursor-pointer border-gray-300 bg-gray-50 hover:border-emerald-300 hover:bg-emerald-50/40"
              : "border-gray-200 bg-gray-50",
          ].join(" ")}
        >
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={onInputChange} disabled={state.phase === "uploading"} />

          {state.phase === "idle" && (
            <>
              <GradeUploadIcon />
              <p className="mt-3 text-sm font-medium text-gray-700">Drop a CSV file here, or click to browse</p>
              <p className="mt-1 text-xs text-gray-500">Max {MAX_MB} MB · CSV only</p>
            </>
          )}

          {state.phase === "selected" && (
            <>
              <FileIcon />
              <p className="mt-3 text-sm font-medium text-gray-800">{state.file.name}</p>
              <p className="mt-0.5 text-xs text-gray-500">{(state.file.size / 1024).toFixed(1)} KB</p>
              <button type="button" onClick={(e) => { e.stopPropagation(); reset(); }} className="mt-3 text-xs text-gray-400 underline hover:text-gray-600">Remove</button>
            </>
          )}

          {state.phase === "uploading" && (
            <>
              <p className="text-sm font-medium text-gray-700">Uploading and processing…</p>
              <div className="mt-4 h-2 w-48 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-emerald-600 transition-all duration-200" style={{ width: `${state.progress}%` }} />
              </div>
              <p className="mt-2 text-xs text-gray-500">{state.progress}%</p>
            </>
          )}
        </div>
      )}

      {(state.phase === "selected" || state.phase === "uploading") && (
        <button
          type="button" onClick={handleUpload} disabled={state.phase === "uploading"}
          className={["w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
            state.phase === "uploading" ? "bg-emerald-400" : "bg-emerald-600 hover:bg-emerald-700"].join(" ")}
        >
          {state.phase === "uploading" ? "Importing grades…" : "Upload and import grades"}
        </button>
      )}

      {state.phase === "done" && (
        <ResultPanel
          result={state.result} showAll={showAll}
          onToggle={() => setShowAll((v) => !v)}
          onDownload={() => downloadReport(state.result.failures)}
          onReset={reset}
        />
      )}
    </div>
  );
}

// ─── Result panel ──────────────────────────────────────────────────────────────

function ResultPanel({
  result, showAll, onToggle, onDownload, onReset,
}: {
  result: GradeBulkResult; showAll: boolean;
  onToggle: () => void; onDownload: () => void; onReset: () => void;
}) {
  const allFailed   = result.successCount === 0 && result.failureCount > 0;
  const hasPartial  = result.successCount > 0 && result.failureCount > 0;
  const allSuccess  = result.failureCount === 0 && result.successCount > 0;

  const PREVIEW = 5;
  const visible  = showAll ? result.failures : result.failures.slice(0, PREVIEW);

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className={["flex items-start gap-3 rounded-xl border px-5 py-4",
        allFailed  ? "border-red-200 bg-red-50" :
        hasPartial ? "border-amber-200 bg-amber-50" :
                     "border-emerald-200 bg-emerald-50"].join(" ")}>
        <span className="mt-0.5 text-lg">{allFailed ? "✗" : hasPartial ? "⚠" : "✓"}</span>
        <div className="flex-1">
          <p className={["text-sm font-semibold",
            allFailed ? "text-red-800" : hasPartial ? "text-amber-800" : "text-emerald-800"].join(" ")}>
            {formatGradeUploadSummary(result.successCount, result.failureCount)}
          </p>
          <p className={["mt-0.5 text-xs",
            allFailed ? "text-red-600" : hasPartial ? "text-amber-600" : "text-emerald-600"].join(" ")}>
            {result.totalRows} total rows · {result.durationMs}ms
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total rows" value={result.totalRows}    color="gray"  />
        <StatCard label="Imported"   value={result.successCount} color="green" />
        <StatCard label="Failed"     value={result.failureCount} color={result.failureCount > 0 ? "red" : "gray"} />
      </div>

      {/* Failure table */}
      {result.failureCount > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Failed rows</h3>
            <button type="button" onClick={onDownload} className="text-xs text-blue-600 hover:underline">
              Download error report CSV
            </button>
          </div>

          <div className="overflow-hidden rounded-lg border border-red-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-red-100 text-xs">
                <thead className="bg-red-50">
                  <tr>
                    {["Row", "Index no.", "Course", "Category", "Semester", "Year", "Grade", "Errors"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-semibold uppercase tracking-wide text-red-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50 bg-white">
                  {visible.map((f) => (
                    <tr key={f.rowNumber}>
                      <td className="px-3 py-2 font-mono text-gray-500">{f.rowNumber}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{f.rawValues.indexNumber || <span className="italic text-gray-400">empty</span>}</td>
                      <td className="px-3 py-2 text-gray-600">{f.rawValues.courseCode  || "—"}</td>
                      <td className="px-3 py-2 text-gray-600">{f.rawValues.courseCategory || "—"}</td>
                      <td className="px-3 py-2 text-gray-600">{f.rawValues.semester    || "—"}</td>
                      <td className="px-3 py-2 text-gray-600">{f.rawValues.year        || "—"}</td>
                      <td className="px-3 py-2 font-mono font-bold text-gray-800">{f.rawValues.grade || "—"}</td>
                      <td className="px-3 py-2">
                        <ul className="space-y-0.5">
                          {f.errors.map((e, i) => <li key={i} className="text-red-700">{e}</li>)}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.failures.length > PREVIEW && (
              <button type="button" onClick={onToggle}
                className="w-full border-t border-red-100 bg-red-50 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-100">
                {showAll ? "Show fewer" : `Show all ${result.failures.length} failed rows`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button type="button" onClick={onReset}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Upload another file
        </button>
        {result.successCount > 0 && (
          <a href="/grades" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            View grades
          </a>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: "gray" | "green" | "red" }) {
  const c = { gray: "bg-gray-50 border-gray-200 text-gray-900", green: "bg-green-50 border-green-200 text-green-800", red: "bg-red-50 border-red-200 text-red-800" };
  return (
    <div className={`rounded-lg border p-3 text-center ${c[color]}`}>
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-xs font-medium opacity-70">{label}</p>
    </div>
  );
}

function GradeUploadIcon() {
  return (
    <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="h-10 w-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}
