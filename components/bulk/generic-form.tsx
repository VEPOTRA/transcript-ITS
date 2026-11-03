"use client";
/**
 * components/bulk/generic-form.tsx
 *
 * Reusable drag-and-drop CSV upload form.
 * Used by /bulk/programmes and /bulk/courses pages.
 *
 * Props:
 *   endpoint     — API route to POST the file to
 *   successHref  — page to link to after successful import
 *   successLabel — button label for the success link
 */

import { useState, useRef, useCallback } from "react";

type Phase =
    | { name: "idle" }
    | { name: "selected"; file: File }
    | { name: "uploading"; file: File; progress: number }
    | { name: "done"; ok: number; failed: number; errors: { row: number; message: string }[] };

const MAX_MB = 5;

export function BulkGenericForm({
    endpoint,
    successHref,
    successLabel,
}: {
    endpoint: string;
    successHref: string;
    successLabel: string;
}) {
    const [phase, setPhase] = useState<Phase>({ name: "idle" });
    const [dragOver, setDragOver] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const pickFile = useCallback((file: File) => {
        if (!file.name.toLowerCase().endsWith(".csv")) {
            alert("Please select a CSV file. Open the xlsx template in Excel, fill in your data, then save as CSV.");
            return;
        }
        if (file.size > MAX_MB * 1024 * 1024) {
            alert(`File must be under ${MAX_MB} MB.`);
            return;
        }
        setPhase({ name: "selected", file });
    }, []);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) pickFile(f);
    };

    const handleUpload = () => {
        if (phase.name !== "selected") return;
        const { file } = phase;
        const fd = new FormData();
        fd.append("file", file);
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
                setPhase({ name: "uploading", file, progress: Math.round((e.loaded / e.total) * 100) });
            }
        });

        xhr.addEventListener("load", () => {
            try {
                const r = JSON.parse(xhr.responseText);
                if (xhr.status === 200) {
                    setPhase({
                        name: "done",
                        ok: r.successCount ?? r.inserted ?? 0,
                        failed: r.failureCount ?? r.failed ?? 0,
                        errors: r.failures ?? r.errors ?? [],
                    });
                } else {
                    alert(r.error ?? "Upload failed.");
                    setPhase({ name: "selected", file });
                }
            } catch {
                alert("Unreadable server response.");
                setPhase({ name: "selected", file });
            }
        });

        xhr.addEventListener("error", () => {
            alert("Network error — check your connection and try again.");
            setPhase({ name: "selected", file });
        });

        xhr.open("POST", endpoint);
        xhr.send(fd);
        setPhase({ name: "uploading", file, progress: 0 });
    };

    const reset = () => {
        setPhase({ name: "idle" });
        setShowAll(false);
        if (inputRef.current) inputRef.current.value = "";
    };

    /* ── Done state ──────────────────────────────────────────────────────────── */
    if (phase.name === "done") {
        const allOk = phase.failed === 0;
        const allFail = phase.ok === 0 && phase.failed > 0;
        const visible = showAll ? phase.errors : phase.errors.slice(0, 5);

        return (
            <div className="flex flex-1 flex-col space-y-5">
                <div className={[
                    "flex items-start gap-3 rounded-2xl border px-5 py-4",
                    allOk ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20"
                        : allFail ? "border-red-200    bg-red-50    dark:border-red-900    dark:bg-red-950/20"
                            : "border-amber-200  bg-amber-50  dark:border-amber-900  dark:bg-amber-950/20",
                ].join(" ")}>
                    <span className="mt-0.5 text-lg">{allOk ? "✓" : allFail ? "✗" : "⚠"}</span>
                    <p className={[
                        "text-sm font-semibold",
                        allOk ? "text-emerald-800 dark:text-emerald-300"
                            : allFail ? "text-red-800    dark:text-red-300"
                                : "text-amber-800  dark:text-amber-300",
                    ].join(" ")}>
                        {allOk && `All ${phase.ok} records imported successfully.`}
                        {allFail && `All ${phase.failed} rows failed — nothing was imported.`}
                        {!allOk && !allFail && `${phase.ok} imported, ${phase.failed} failed.`}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {([["Imported", phase.ok, "emerald"], ["Failed", phase.failed, phase.failed > 0 ? "red" : "gray"]] as const).map(([label, val, color]) => (
                        <div key={label} className={[
                            "rounded-xl border p-4 text-center",
                            color === "emerald" ? "border-emerald-200 bg-emerald-50  dark:border-emerald-900 dark:bg-emerald-950/20"
                                : color === "red" ? "border-red-200    bg-red-50      dark:border-red-900    dark:bg-red-950/20"
                                    : "border-gray-200   bg-gray-50     dark:border-gray-800   dark:bg-gray-900",
                        ].join(" ")}>
                            <p className={[
                                "text-2xl font-bold tabular-nums",
                                color === "emerald" ? "text-emerald-700 dark:text-emerald-300"
                                    : color === "red" ? "text-red-700    dark:text-red-300"
                                        : "text-gray-700   dark:text-gray-300",
                            ].join(" ")}>{val}</p>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{label}</p>
                        </div>
                    ))}
                </div>

                {phase.errors.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Failed rows</p>
                        <div className="overflow-hidden rounded-xl border border-red-200 dark:border-red-900">
                            <table className="min-w-full text-xs divide-y divide-red-100 dark:divide-red-900">
                                <thead className="bg-red-50 dark:bg-red-950/30">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold text-red-700 dark:text-red-400 w-16">Row</th>
                                        <th className="px-3 py-2 text-left font-semibold text-red-700 dark:text-red-400">Error</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-900 divide-y divide-red-50 dark:divide-red-950">
                                    {visible.map((e, i) => (
                                        <tr key={i}>
                                            <td className="px-3 py-2 font-mono text-gray-500 dark:text-gray-400">{e.row || "—"}</td>
                                            <td className="px-3 py-2 text-red-700 dark:text-red-400">{e.message}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {phase.errors.length > 5 && (
                                <button type="button" onClick={() => setShowAll(v => !v)}
                                    className="w-full border-t border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-950/20 px-4 py-2 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-100">
                                    {showAll ? "Show fewer" : `Show all ${phase.errors.length} errors`}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex gap-3">
                    <button type="button" onClick={reset}
                        className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                        Upload another file
                    </button>
                    {phase.ok > 0 && (
                        <a href={successHref}
                            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                            {successLabel}
                        </a>
                    )}
                </div>
            </div>
        );
    }

    /* ── Upload / idle / selected state ─────────────────────────────────────── */
    return (
        <div className="flex flex-1 flex-col space-y-4">
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => phase.name === "idle" && inputRef.current?.click()}
                className={[
                    "flex min-h-56 flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-12 text-center transition-all",
                    phase.name === "idle"
                        ? dragOver
                            ? "cursor-copy border-indigo-400 bg-indigo-50 dark:bg-indigo-950/20"
                            : "cursor-pointer border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-gray-700 dark:hover:border-indigo-700"
                        : "border-gray-200 dark:border-gray-800",
                ].join(" ")}
            >
                <input
                    ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
                    disabled={phase.name === "uploading"}
                />

                {phase.name === "idle" && (
                    <>
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-950">
                            <svg className="h-6 w-6 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                            </svg>
                        </div>
                        <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">Drop CSV here, or click to browse</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">Max {MAX_MB} MB · CSV files only</p>
                    </>
                )}

                {phase.name === "selected" && (
                    <>
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950">
                            <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-200">{phase.file.name}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{(phase.file.size / 1024).toFixed(1)} KB</p>
                        <button type="button" onClick={(e) => { e.stopPropagation(); reset(); }}
                            className="mt-2 text-xs text-gray-400 underline hover:text-gray-600">
                            Remove
                        </button>
                    </>
                )}

                {phase.name === "uploading" && (
                    <>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Uploading…</p>
                        <div className="mt-4 h-2 w-48 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                            <div className="h-full rounded-full bg-indigo-600 transition-all duration-300" style={{ width: `${phase.progress}%` }} />
                        </div>
                        <p className="mt-2 text-xs text-gray-500">{phase.progress}%</p>
                    </>
                )}
            </div>

            {(phase.name === "selected" || phase.name === "uploading") && (
                <button type="button" onClick={handleUpload} disabled={phase.name === "uploading"}
                    className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 shadow-sm shadow-indigo-100 dark:shadow-none transition-colors">
                    {phase.name === "uploading" ? "Processing…" : "Upload and import"}
                </button>
            )}
        </div>
    );
}