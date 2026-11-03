/**
 * Admin section layout — SUPER_ADMIN only.
 *
 * Third layer of role enforcement for the /admin/* route segment:
 *  1. middleware.ts        — redirects non-SUPER_ADMIN before the page renders
 *  2. (app)/layout.tsx     — asserts base authentication
 *  3. (app)/admin/layout   — asserts SUPER_ADMIN role (this file)
 *
 * The triple enforcement means a route is never accessible even if one
 * layer has a configuration or deployment bug.
 */

import { requireRole } from "@/lib/auth/rbac";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireRole("SUPER_ADMIN") calls requireAuth() internally,
  // then checks hasMinimumRole. Redirects to /unauthorized on failure.
  await requireRole("SUPER_ADMIN");

  return (
    <div className="space-y-6">
      {/* Section header — only visible to SUPER_ADMIN */}
      <div className="border-b border-slate-200 pb-5 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-md bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900">
            Super admin
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-indigo-950 dark:text-white">
            System administration
          </h1>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Manage system users, institution settings, and grading configuration.
        </p>
      </div>

      {/* Admin sub-navigation */}
      <nav aria-label="Administration" className="-mt-2 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        <AdminNavLink href="/admin/users">Users</AdminNavLink>
        <AdminNavLink href="/admin/institution">Institution</AdminNavLink>
        <AdminNavLink href="/admin/campuses">Campuses</AdminNavLink>
        <AdminNavLink href="/admin/grading-scale">Grading scale</AdminNavLink>
        <AdminNavLink href="/admin/registrar">Registrar</AdminNavLink>
        <AdminNavLink href="/audit">Audit log</AdminNavLink>
      </nav>

      {children}
    </div>
  );
}

function AdminNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="-mb-px shrink-0 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:border-red-700 hover:text-indigo-950 dark:text-slate-400 dark:hover:text-white"
    >
      {children}
    </a>
  );
}
