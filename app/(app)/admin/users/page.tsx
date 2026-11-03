/**
 * /admin/users — Admin account management.
 * SUPER_ADMIN only (enforced by parent admin/layout.tsx + requirePermission).
 */

import { requirePermission } from "@/lib/auth/rbac";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { desc } from "drizzle-orm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Users — TMS Admin" };

export default async function AdminUsersPage() {
  const session = await requirePermission("manage_users");

  const allAdmins = await db
    .select({
      id: admins.id,
      email: admins.email,
      role: admins.role,
      createdAt: admins.createdAt,
    })
    .from(admins)
    .orderBy(desc(admins.createdAt));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-indigo-950 dark:text-white">Admin accounts</h2>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{allAdmins.length} accounts</p>
        </div>
        <a
          href="/admin/users/new"
          className="rounded-lg bg-indigo-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        >
          Add admin
        </a>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80">
            <tr>
              {["Email", "Role", "Created", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {allAdmins.map((admin) => {
              const isSelf = admin.id === session.adminId;
              return (
                <tr key={admin.id} className="hover:bg-indigo-50/50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {admin.email}
                    {isSelf && (
                      <span className="ml-2 rounded-full bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950/30 dark:text-red-300">You</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={admin.role} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    {admin.createdAt.toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isSelf && (
                      <a href={`/admin/users/${admin.id}`}
                        className="text-xs font-medium text-indigo-800 hover:underline dark:text-indigo-300">
                        Manage →
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Role guide */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/60">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Role permissions</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { role: "SUPER_ADMIN", perms: "Full access including user management, institution settings, and grading scale." },
            { role: "ADMIN", perms: "Manage students, courses, grades, bulk uploads, and transcripts." },
            { role: "VIEWER", perms: "Read-only access to students, grades, and transcripts." },
          ].map(({ role, perms }) => (
            <div key={role} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <RoleBadge role={role as "SUPER_ADMIN" | "ADMIN" | "VIEWER"} />
              <p className="mt-2 text-xs text-gray-500">{perms}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: "SUPER_ADMIN" | "ADMIN" | "VIEWER" }) {
  const styles: Record<string, string> = {
    SUPER_ADMIN: "bg-red-50 text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900",
    ADMIN: "bg-indigo-50 text-indigo-900 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-800",
    VIEWER: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[role]}`}>
      {role.replace("_", " ")}
    </span>
  );
}
