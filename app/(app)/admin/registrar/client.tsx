"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Registrar = { id: string; name: string; title: string; signaturePath: string | null; isActive: boolean | null; createdAt: Date };

type Props = { records: Registrar[] };

export function RegistrarClient({ records: initial }: Props) {
  const router = useRouter();
  const [records, setRecords]   = useState(initial);
  const [editing, setEditing]   = useState<Registrar | "new" | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);

  const [name, setName]                 = useState("");
  const [title, setTitle]               = useState("");
  const [signaturePath, setSignaturePath] = useState("");

  function openNew() {
    setEditing("new"); setName(""); setTitle(""); setSignaturePath(""); setError(null);
  }

  function openEdit(r: Registrar) {
    setEditing(r);
    setName(r.name);
    setTitle(r.title);
    setSignaturePath(r.signaturePath ?? "");
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);

    const isNew = editing === "new";
    const url   = isNew ? "/api/admin/registrar" : `/api/admin/registrar/${(editing as Registrar).id}`;
    const method = isNew ? "POST" : "PATCH";

    const res  = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, title, signaturePath: signaturePath || null }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) { setError(data.error ?? "Failed to save."); return; }

    setEditing(null);
    router.refresh();

    if (isNew) {
      setRecords(prev => [...prev, data]);
    } else {
      setRecords(prev => prev.map(r => r.id === data.id ? data : r));
    }
  }

  async function handleToggle(r: Registrar) {
    const res  = await fetch(`/api/admin/registrar/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !r.isActive }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setRecords(prev => prev.map(x => x.id === r.id ? { ...x, isActive: data.isActive } : x));
  }

  const activeRegistrar = records.find(r => r.isActive);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-indigo-950 dark:text-white">Registrar</h2>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            The active registrar's name and signature appear on every transcript.
          </p>
        </div>
        {!editing && (
          <button onClick={openNew}
            className="rounded-lg bg-indigo-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
            Add registrar
          </button>
        )}
      </div>

      {activeRegistrar && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          Active: <strong>{activeRegistrar.name}</strong> — {activeRegistrar.title}
        </div>
      )}

      {!activeRegistrar && records.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          No active registrar. Transcripts will not have a signature. Activate one below.
        </div>
      )}

      {records.length === 0 && !editing && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/30">
          No registrar records yet.
        </div>
      )}

      {/* Registrar list */}
      {records.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {records.map((r, i) => (
            <div key={r.id} className={`flex items-center gap-4 px-5 py-4 ${i > 0 ? "border-t border-slate-100 dark:border-slate-800" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{r.name}</p>
                  {r.isActive && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Active</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{r.title}</p>
                {r.signaturePath && (
                  <p className="mt-1 font-mono text-xs text-gray-400 dark:text-gray-600 truncate">{r.signaturePath}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(r)}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-indigo-900 hover:bg-indigo-50 dark:border-slate-700 dark:text-indigo-300 dark:hover:bg-indigo-950/40">
                  Edit
                </button>
                <button onClick={() => handleToggle(r)}
                  className={`rounded-lg border px-3 py-1 text-xs font-medium ${r.isActive ? "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-400" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400"}`}>
                  {r.isActive ? "Deactivate" : "Set active"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Create form */}
      {editing && (
        <form onSubmit={handleSave}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {editing === "new" ? "Add registrar" : "Edit registrar"}
          </h3>

          <Field label="Full name" required>
            <input value={name} onChange={e => setName(e.target.value)} required placeholder="Dr. Kofi Mensah" className={inputCls} />
          </Field>

          <Field label="Title / designation" required hint="Shown below the signature line on transcripts">
            <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="Deputy Registrar (Academic Affairs)" className={inputCls} />
          </Field>

          <Field label="Signature image path" hint="URL or server path to a PNG/JPG of the handwritten signature">
            <input value={signaturePath} onChange={e => setSignaturePath(e.target.value)} placeholder="/signatures/registrar.png" className={inputCls} />
            {signaturePath && (
              <div className="mt-2 flex items-center gap-3">
                <img src={signaturePath} alt="Signature preview" className="h-12 max-w-[160px] border object-contain p-1 rounded dark:border-gray-700"
                  onError={e => (e.currentTarget.style.display = "none")} />
                <span className="text-xs text-gray-400">Preview</span>
              </div>
            )}
          </Field>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-indigo-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(null)}
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
