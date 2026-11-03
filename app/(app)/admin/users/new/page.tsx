/**
 * /admin/users/new — Create a new admin account.
 * SUPER_ADMIN only.
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = ["SUPER_ADMIN", "ADMIN", "VIEWER"] as const;
type Role = (typeof ROLES)[number];
type Campus = { id: string; name: string; code: string };

function isCampusList(value: unknown): value is Campus[] {
  return (
    Array.isArray(value) &&
    value.every(
      (campus) =>
        typeof campus === "object" &&
        campus !== null &&
        "id" in campus &&
        typeof campus.id === "string" &&
        "name" in campus &&
        typeof campus.name === "string" &&
        "code" in campus &&
        typeof campus.code === "string",
    )
  );
}

export default function NewAdminPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("ADMIN");
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [campusesLoading, setCampusesLoading] = useState(true);
  const [selectedCampusIds, setSelectedCampusIds] = useState<string[]>([]);
  const [campusLoadError, setCampusLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/users")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Could not load campuses.");
        }
        if (!isCampusList(data.campuses)) {
          throw new Error("Campus list returned an invalid response.");
        }
        return data.campuses;
      })
      .then((campusList) => {
        if (active) setCampuses(campusList);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setCampusLoadError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load campuses.",
          );
        }
      })
      .finally(() => {
        if (active) setCampusesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          role,
          campusIds: role === "SUPER_ADMIN" ? [] : selectedCampusIds,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create admin.");
        return;
      }

      router.push("/admin/users");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <a href="/admin/users" className="text-sm font-medium text-indigo-800 hover:text-red-800 dark:text-indigo-300 dark:hover:text-red-300">
          ← Back to admin users
        </a>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-indigo-950 dark:text-white">
          Create admin account
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Set the account role and campus access before creating the account.
        </p>
      </div>

      <form onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 md:grid-cols-2 dark:border-slate-800 dark:bg-slate-900">

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-800/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        {role !== "SUPER_ADMIN" && (
          <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 md:col-span-2 dark:border-slate-700 dark:bg-slate-800/40">
            <legend className="block text-sm font-semibold text-indigo-950 dark:text-slate-100">
              Campus access
            </legend>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Select the campuses this account may access. No selection means
              it cannot access student records.
            </p>
            {campusLoadError ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {campusLoadError}
              </p>
            ) : campuses.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No active campuses are available.
              </p>
            ) : (
              <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-900">
                {campuses.map((campus) => (
                  <label
                    key={campus.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-2 py-2 hover:border-indigo-200 hover:bg-indigo-50/70 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/40"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCampusIds.includes(campus.id)}
                      onChange={(event) => {
                        setSelectedCampusIds((current) =>
                          event.target.checked
                            ? [...current, campus.id]
                            : current.filter((id) => id !== campus.id),
                        );
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-900 focus:ring-indigo-700"
                    />
                    <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">
                      {campus.name}
                    </span>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {campus.code}
                    </code>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Password <span className="text-red-500">*</span>
          </label>
          <input
            type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-800/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Role <span className="text-red-500">*</span>
          </label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}
            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-800/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            {ROLES.map((r) => (
              <option key={r} value={r}>{r.replace("_", " ")}</option>
            ))}
          </select>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {role === "SUPER_ADMIN" && "Full access including user management and institution settings."}
            {role === "ADMIN" && "Manage students, grades, bulk uploads, and transcripts for assigned campuses."}
            {role === "VIEWER" && "Read-only access to students, grades, and transcripts."}
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row md:col-span-2">
          <button
            type="submit"
            disabled={loading || campusesLoading || (role !== "SUPER_ADMIN" && !!campusLoadError)}
            className="flex-1 rounded-lg bg-indigo-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
            {loading ? "Creating…" : campusesLoading ? "Loading campuses…" : "Create admin"}
          </button>
          <a href="/admin/users"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}