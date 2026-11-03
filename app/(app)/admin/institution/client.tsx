"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Inst = { id: string; name: string; address: string | null; logoPath: string | null; createdAt: Date } | null;

export function InstitutionClient({ institution }: { institution: Inst }) {
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [name, setName] = useState(institution?.name ?? "");
    const [address, setAddress] = useState(institution?.address ?? "");
    const [logoPath, setLogoPath] = useState(institution?.logoPath ?? "");

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        startTransition(async () => {
            const res = await fetch("/api/admin/institution", {
                method: institution ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, address: address || null, logoPath: logoPath || null }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? "Failed to save."); return; }
            setSuccess(true);
            setEditing(false);
            router.refresh();
        });
    }

    return (
        <div className="mx-auto w-full max-w-5xl space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-indigo-950 dark:text-white">Institution settings</h2>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                        These details appear on every generated transcript.
                    </p>
                </div>
                {!editing && (
                    <button onClick={() => { setEditing(true); setSuccess(false); }}
                        className="rounded-lg bg-indigo-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
                        {institution ? "Edit" : "Add institution"}
                    </button>
                )}
            </div>

            {success && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                    Institution details saved successfully.
                </div>
            )}

            {!institution && !editing && (
                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                    No institution record found. Transcripts cannot be generated until an institution is configured.
                </div>
            )}

            {/* View mode */}
            {institution && !editing && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        <Row label="Name" value={institution.name} />
                        <Row label="Address" value={institution.address ?? "Not set"} muted={!institution.address} />
                        <Row label="Logo path" value={institution.logoPath ?? "Not set"} muted={!institution.logoPath} mono />
                        <Row label="Created" value={new Date(institution.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} />
                    </div>
                </div>
            )}

            {/* Edit form */}
            {editing && (
                <form onSubmit={handleSave}
                    className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">

                    <Field label="Institution name" required>
                        <input value={name} onChange={e => setName(e.target.value)} required
                            placeholder="University of Technology"
                            className={inputCls} />
                    </Field>

                    <Field label="Address" hint="Appears below the institution name on transcripts">
                        <textarea value={address} onChange={e => setAddress(e.target.value)}
                            rows={2} placeholder="P.O. Box 123, Accra, Ghana"
                            className={inputCls} />
                    </Field>

                    <Field label="Logo path" hint="Absolute URL or server path to the institution crest image">
                        <input value={logoPath} onChange={e => setLogoPath(e.target.value)}
                            placeholder="/logos/crest.png  or  https://..."
                            className={inputCls} />
                        {logoPath && (
                            <div className="mt-2 flex items-center gap-3">
                                <img src={logoPath} alt="Logo preview" className="h-14 w-14 rounded-full border object-contain" onError={e => (e.currentTarget.style.display = "none")} />
                                <span className="text-xs text-slate-600 dark:text-slate-400">Logo preview</span>
                            </div>
                        )}
                    </Field>

                    {error && (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                            {error}
                        </p>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button type="submit" disabled={isPending}
                            className="rounded-lg bg-indigo-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
                            {isPending ? "Saving…" : "Save changes"}
                        </button>
                        <button type="button" onClick={() => setEditing(false)}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

const inputCls = "block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {label}{required && <span className="ml-1 text-red-500">*</span>}
            </label>
            {children}
            {hint && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
        </div>
    );
}

function Row({ label, value, muted, mono }: { label: string; value: string; muted?: boolean; mono?: boolean }) {
    return (
        <div className="flex items-start gap-4 px-6 py-4">
            <span className="w-28 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
            <span className={`text-sm ${muted ? "italic text-gray-400" : "text-gray-900 dark:text-gray-100"} ${mono ? "font-mono" : ""}`}>{value}</span>
        </div>
    );
}