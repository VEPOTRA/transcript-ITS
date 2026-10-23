"use client";

/**
 * Bulk upload form — client component.
 *
 * States:
 *   idle       → user has not yet selected a file
 *   selected   → file chosen but not submitted
 *   uploading  → POST in flight
 *   done       → result received (success + partial success + total failure)
 *
 * Features:
 *   - Drag-and-drop zone
 *   - File type and size pre-validation (mirrors server guards)
 *   - Streaming progress via XMLHttpRequest (shows bytes sent)
 *   - Expandable failure table
 *   - Error report CSV download
 */

import { useState, useRef, useCallback } from "react";
import { formatUploadSummary } from "@/lib/bulk/students/report";
import type { BulkUploadResult, RowFailure } from "@/lib/bulk/students/types";

type UploadState =
  | { phase: "idle" }
  | { phase: "selected"; file: File }
  | { phase: "uploading"; file: File; progress: number }
  | { phase: "done"; result: BulkUploadResult };

const MAX_MB = 80; // 80 MB

export function BulkUploadForm() {
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File selection ─────────────────────────────────────────────────────────

  const selectFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please select a CSV file.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      alert(`File exceeds ${MAX_MB} MB limit. Split it into smaller batches.`);
      return;
    }
    setState({ phase: "selected", file });
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) selectFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) selectFile(file);
  };

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = () => {
    if (state.phase !== "selected") return;
    const { file } = state;

    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setState({ phase: "uploading", file, progress: Math.round((e.loaded / e.total) * 100) });
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        try {
          const result: BulkUploadResult = JSON.parse(xhr.responseText);
          setState({ phase: "done", result });
          setShowAllErrors(false);
        } catch {
          alert("Server returned an unreadable response. Check the console.");
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          alert(err.error ?? "Upload failed.");
        } catch {
          alert(`Upload failed with status ${xhr.status}.`);
        }
        setState({ phase: "selected", file });
      }
    });

    xhr.addEventListener("error", () => {
      alert("Network error. Check your connection and try again.");
      setState({ phase: "selected", file });
    });

    xhr.open("POST", "/api/bulk/upload");
    xhr.send(form);

    setState({ phase: "uploading", file, progress: 0 });
  };

  // ── Error report download ──────────────────────────────────────────────────

  const downloadErrorReport = async (failures: RowFailure[]) => {
    const res = await fetch("/api/bulk/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ failures }),
    });
    if (!res.ok) { alert("Could not generate error report."); return; }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `upload-errors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Reset ──────────────────────────────────────────────────────────────────

  const reset = () => {
    setState({ phase: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Drop zone — visible when not done */}
      {state.phase !== "done" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => state.phase === "idle" && fileInputRef.current?.click()}
          className={[
            "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed",
            "px-8 py-12 text-center transition-colors",
            state.phase === "idle"
              ? dragOver
                ? "cursor-copy border-blue-400 bg-blue-50"
                : "cursor-pointer border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40"
              : "border-gray-200 bg-gray-50",
          ].join(" ")}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={onInputChange}
            disabled={state.phase === "uploading"}
          />

          {state.phase === "idle" && (
            <>
              <UploadIcon />
              <p className="mt-3 text-sm font-medium text-gray-700">
                Drop a CSV file here, or click to browse
              </p>
              <p className="mt-1 text-xs text-gray-500">Max {MAX_MB} MB · CSV only</p>
            </>
          )}

          {state.phase === "selected" && (
            <>
              <FileIcon />
              <p className="mt-3 text-sm font-medium text-gray-800">{state.file.name}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {(state.file.size / 1024).toFixed(1)} KB
              </p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); reset(); }}
                className="mt-3 text-xs text-gray-400 underline hover:text-gray-600"
              >
                Remove
              </button>
            </>
          )}

          {state.phase === "uploading" && (
            <>
              <p className="text-sm font-medium text-gray-700">Uploading…</p>
              <div className="mt-4 h-2 w-48 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-200"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">{state.progress}%</p>
            </>
          )}
        </div>
      )}

      {/* Action buttons */}
      {(state.phase === "selected" || state.phase === "uploading") && (
        <button
          type="button"
          onClick={handleUpload}
          disabled={state.phase === "uploading"}
          className={[
            "w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-60",
            state.phase === "uploading"
              ? "bg-blue-400"
              : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800",
          ].join(" ")}
        >
          {state.phase === "uploading" ? "Processing…" : "Upload and import"}
        </button>
      )}

      {/* Result panel */}
      {state.phase === "done" && (
        <ResultPanel
          result={state.result}
          showAllErrors={showAllErrors}
          onToggleErrors={() => setShowAllErrors((v) => !v)}
          onDownloadErrors={() => downloadErrorReport(state.result.failures)}
          onReset={reset}
        />
      )}
    </div>
  );
}

// ─── Result panel ──────────────────────────────────────────────────────────────

function ResultPanel({
  result,
  showAllErrors,
  onToggleErrors,
  onDownloadErrors,
  onReset,
}: {
  result: BulkUploadResult;
  showAllErrors: boolean;
  onToggleErrors: () => void;
  onDownloadErrors: () => void;
  onReset: () => void;
}) {
  const hasFailures = result.failureCount > 0;
  const hasSuccess = result.successCount > 0;
  const allFailed = result.successCount === 0 && result.failureCount > 0;

  const PREVIEW_ROWS = 5;
  const visibleFailures = showAllErrors
    ? result.failures
    : result.failures.slice(0, PREVIEW_ROWS);

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className={[
        "flex items-start gap-3 rounded-xl border px-5 py-4",
        allFailed
          ? "border-red-200 bg-red-50"
          : hasFailures
            ? "border-amber-200 bg-amber-50"
            : "border-green-200 bg-green-50",
      ].join(" ")}>
        <span className="mt-0.5 text-lg">
          {allFailed ? "✗" : hasFailures ? "⚠" : "✓"}
        </span>
        <div className="flex-1">
          <p className={[
            "text-sm font-semibold",
            allFailed ? "text-red-800" : hasFailures ? "text-amber-800" : "text-green-800",
          ].join(" ")}>
            {formatUploadSummary(result.successCount, result.failureCount)}
          </p>
          <p className={[
            "mt-0.5 text-xs",
            allFailed ? "text-red-600" : hasFailures ? "text-amber-600" : "text-green-600",
          ].join(" ")}>
            {result.totalRows} total rows · {result.durationMs}ms
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total rows" value={result.totalRows} color="gray" />
        <StatCard label="Imported" value={result.successCount} color="green" />
        <StatCard label="Failed" value={result.failureCount} color={result.failureCount > 0 ? "red" : "gray"} />
      </div>

      {/* Failure table */}
      {hasFailures && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Failed rows
            </h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onDownloadErrors}
                className="text-xs text-blue-600 hover:underline"
              >
                Download error report CSV
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-red-200">
            <table className="min-w-full divide-y divide-red-100 text-xs">
              <thead className="bg-red-50">
                <tr>
                  {["Row", "Index no.", "Name", "Programme", "Errors"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-red-700">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-red-50 bg-white">
                {visibleFailures.map((f) => (
                  <tr key={f.rowNumber}>
                    <td className="px-3 py-2 font-mono text-gray-500">{f.rowNumber}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {f.rawValues.indexNumber || <span className="text-gray-400 italic">empty</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {[f.rawValues.firstName, f.rawValues.lastName].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {f.rawValues.programmeCode || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <ul className="space-y-0.5">
                        {f.errors.map((err, i) => (
                          <li key={i} className="text-red-700">{err}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {result.failures.length > PREVIEW_ROWS && (
              <button
                type="button"
                onClick={onToggleErrors}
                className="w-full border-t border-red-100 bg-red-50 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                {showAllErrors
                  ? "Show fewer"
                  : `Show all ${result.failures.length} failed rows`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Upload another file
        </button>
        {hasSuccess && (
          <a
            href="/students"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            View students
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: "gray" | "green" | "red" }) {
  const colors = {
    gray: "bg-gray-50  border-gray-200  text-gray-900",
    green: "bg-green-50 border-green-200 text-green-800",
    red: "bg-red-50   border-red-200   text-red-800",
  };
  return (
    <div className={`rounded-lg border p-3 text-center ${colors[color]}`}>
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-xs font-medium opacity-70">{label}</p>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="h-10 w-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}
