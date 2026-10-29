/**
 * /admin/users/[id] — Manage a single admin account.
 * SUPER_ADMIN only.
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminCampusAssign } from "@/components/admin/AdminCampusAssign";

type Campus = { id: string; name: string; code: string };
type Admin = {
  id: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "VIEWER";
  isActive: boolean;
  createdAt: string;
  campuses?: Campus[];
  assignedCampusIds?: string[];
};

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [assignedCampusIds, setAssignedCampusIds] = useState<string[]>([]);

  // Form state
  const [role, setRole] = useState<"SUPER_ADMIN" | "ADMIN" | "VIEWER">("ADMIN");
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  useEffect(() => {
    params.then(({ id: paramId }) => {
      setId(paramId);
      fetch(`/api/admin/users/${paramId}`)
        .then(r => r.json())
        .then(data => {
          if (data.error) { setError(data.error); return; }
          setAdmin(data);
          setRole(data.role);
          setCampuses(data.campuses ?? []);
          setAssignedCampusIds(data.assignedCampusIds ?? []);
        })
        .catch(() => setError("Failed to load admin."))
        .finally(() => setLoading(false));
    });
  }, [params]);

  async function handleSave() {
    setSaving(true); setError(null); setSuccess(null);
    const body: Record<string, unknown> = { role };
    if (showPasswordField && newPassword) {
      if (newPassword.length < 8) { setError("Password must be at least 8 characters."); setSaving(false); return; }
      body.newPassword = newPassword;
    }
    const res = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error); return; }
    setSuccess("Changes saved successfully.");
    setAdmin(data);
    setNewPassword("");
    setShowPasswordField(false);
    router.refresh();
  }

  async function handleDisable() {
    if (!confirmDisable) { setConfirmDisable(true); return; }
    setSaving(true); setError(null);
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error); return; }
    router.push("/admin/users");
    router.refresh();
  }

  async function handleReEnable() {
    setSaving(true); setError(null);
    const res = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: true }) });
    setSaving(false);
    if (!res.ok) { const d = await res.json(); setError(d.error); return; }
    setAdmin(prev => prev ? { ...prev, isActive: true } : prev);
    setSuccess("Account re-enabled.");
  }

  if (loading) return <div className="py-10 text-center text-sm text-gray-500">Loading…</div>;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <a href="/admin/users" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">← Back to admin users</a>
        <h1 className="mt-3 text-xl font-semibold text-gray-900 dark:text-gray-100">Manage admin account</h1>
        {admin && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{admin.email}</p>}
      </div>

      {!admin && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>
      )}

      {admin && (
        <>
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${admin.isActive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>
              {admin.isActive ? "Active" : "Disabled"}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Created {new Date(admin.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>

          {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{success}</div>}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

          {/* Edit form */}
          <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Account settings</h2>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
              <select value={role} onChange={e => setRole(e.target.value as typeof role)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-900">
                <option value="SUPER_ADMIN">SUPER ADMIN — full access</option>
                <option value="ADMIN">ADMIN — manage students, grades, transcripts</option>
                <option value="VIEWER">VIEWER — read-only access</option>
              </select>
            </div>

            {!showPasswordField ? (
              <button type="button" onClick={() => setShowPasswordField(true)}
                className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                Reset password
              </button>
            ) : (
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-900" />
                <button type="button" onClick={() => { setShowPasswordField(false); setNewPassword(""); }}
                  className="text-xs text-gray-500 hover:underline dark:text-gray-400">Cancel password reset</button>
              </div>
            )}

            <button type="button" onClick={handleSave} disabled={saving}
              className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-60 dark:bg-white dark:text-gray-900">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <AdminCampusAssign
              adminId={admin.id}
              adminName={admin.email}
              adminRole={admin.role}
              allCampuses={campuses}
              assignedCampusIds={assignedCampusIds}
              onDone={() => router.refresh()}
            />
          </div>

          {/* Enable / Disable */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">Account status</h2>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              {admin.isActive
                ? "Disabling this account prevents the user from logging in. Their data and audit history are preserved."
                : "This account is currently disabled. Re-enable to allow the user to log in again."}
            </p>

            {admin.isActive ? (
              <div className="space-y-2">
                {confirmDisable && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                    Click "Disable account" again to confirm.
                  </p>
                )}
                <button type="button" onClick={handleDisable} disabled={saving}
                  className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                  {confirmDisable ? "Confirm — Disable account" : "Disable account"}
                </button>
                {confirmDisable && (
                  <button type="button" onClick={() => setConfirmDisable(false)}
                    className="ml-2 text-sm text-gray-500 hover:underline dark:text-gray-400">Cancel</button>
                )}
              </div>
            ) : (
              <button type="button" onClick={handleReEnable} disabled={saving}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
                Re-enable account
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
