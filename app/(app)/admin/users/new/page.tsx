/**
 * /admin/users/new — Create a new admin account.
 * SUPER_ADMIN only.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = ["SUPER_ADMIN", "ADMIN", "VIEWER"] as const;
type Role = (typeof ROLES)[number];

export default function NewAdminPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("ADMIN");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        body: JSON.stringify({ email, password, role }),
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
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <a href="/admin/users" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          ← Back to admin users
        </a>
        <h1 className="mt-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Create admin account
        </h1>
      </div>

      <form onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Password <span className="text-red-500">*</span>
          </label>
          <input
            type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Role <span className="text-red-500">*</span>
          </label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
            {ROLES.map((r) => (
              <option key={r} value={r}>{r.replace("_", " ")}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {role === "SUPER_ADMIN" && "Full access including user management and institution settings."}
            {role === "ADMIN" && "Manage students, grades, bulk uploads, and transcripts."}
            {role === "VIEWER" && "Read-only access to students, grades, and transcripts."}
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading}
            className="flex-1 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-60 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200">
            {loading ? "Creating…" : "Create admin"}
          </button>
          <a href="/admin/users"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}