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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Admin accounts</h2>
          <p className="mt-0.5 text-sm text-gray-500">{allAdmins.length} accounts</p>
        </div>
        <a
          href="/admin/users/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add admin
        </a>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Email", "Role", "Created", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {allAdmins.map((admin) => {
              const isSelf = admin.id === session.adminId;
              return (
                <tr key={admin.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {admin.email}
                    {isSelf && (
                      <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">You</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={admin.role} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {admin.createdAt.toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isSelf && (
                      <a href={`/admin/users/${admin.id}`}
                        className="text-xs text-blue-600 hover:underline">
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
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Role permissions</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { role: "SUPER_ADMIN", color: "purple", perms: "Full access including user management, institution settings, and grading scale." },
            { role: "ADMIN", color: "blue", perms: "Manage students, courses, grades, bulk uploads, and transcripts." },
            { role: "VIEWER", color: "gray", perms: "Read-only access to students, grades, and transcripts." },
          ].map(({ role, color, perms }) => (
            <div key={role} className="rounded-lg border border-gray-200 bg-white p-3">
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
    SUPER_ADMIN: "bg-purple-100 text-purple-800",
    ADMIN: "bg-blue-100   text-blue-800",
    VIEWER: "bg-gray-100   text-gray-600",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[role]}`}>
      {role.replace("_", " ")}
    </span>
  );
}
