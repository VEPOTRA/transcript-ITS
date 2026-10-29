/**
 * /audit — Audit log viewer.
 *
 * Access: SUPER_ADMIN only (view_audit_logs permission).
 *
 * Architecture:
 *   - page.tsx             (server) — fetches rows, stats, actors in parallel
 *   - _components/
 *       audit-stats-bar    (server) — summary counts by category
 *       audit-filter-form  (server) — GET form for filter state
 *       audit-table-row    (client) — expandable row with diff toggle
 *       audit-diff-viewer  (client) — before/after diff with key highlighting
 *       audit-pagination   (server) — cursor-based prev/next
 *
 * The page is a server component. Client interactivity (expand/collapse diff,
 * copy JSON, toggle diff mode) lives entirely in the row components.
 * No client-side data fetching is needed — all data comes from searchParams.
 */

import type { Metadata }          from "next";
import { requirePermission }      from "@/lib/auth/rbac";
import {
  queryAuditRows,
  queryAuditStats,
  queryAuditActors,
  PAGE_SIZE,
}                                 from "@/lib/audit/queries";
import { AuditStatsBar }          from "./_components/audit-stats-bar";
import { AuditFilterForm }        from "./_components/audit-filter-form";
import { AuditTableRow }          from "./_components/audit-table-row";
import { AuditPagination }        from "./_components/audit-pagination";

export const metadata: Metadata = {
  title: "Audit log — TMS",
};

// Revalidate this page frequently — audit logs grow constantly.
// Set to 0 for always-fresh, or a small positive number to allow brief caching.
export const revalidate = 0;

type PageProps = {
  searchParams: Promise<{
    action?:  string;
    entity?:  string;
    actor?:   string;
    from?:    string;
    to?:      string;
    before?:  string;
  }>;
};

export default async function AuditPage({ searchParams }: PageProps) {
  // ── Permission check — SUPER_ADMIN only ───────────────────────────────────
  await requirePermission("view_audit_logs");

  const params = await searchParams;
  const { action, entity, actor, from, to, before } = params;

  // ── Parallel data fetch ────────────────────────────────────────────────────
  const [{ rows, hasNextPage, nextCursor, prevCursor }, stats, actors] =
    await Promise.all([
      queryAuditRows({ action, entity, actor, from, to, before }),
      queryAuditStats(),
      queryAuditActors(),
    ]);

  const isFiltered = !!(action || entity || actor || from || to);

  return (
    <div className="space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Audit log
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Immutable, append-only record of all system mutations.
            Cannot be edited or deleted.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <LockIcon />
          SUPER_ADMIN access only
        </div>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      <AuditStatsBar stats={stats} />

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <AuditFilterForm
          action={action}
          entity={entity}
          actor={actor}
          from={from}
          to={to}
          actors={actors}
        />
      </div>

      {/* ── Result count ────────────────────────────────────────────────── */}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {rows.length === 0
          ? "No entries match the current filters."
          : `${rows.length}${hasNextPage ? "+" : ""} entr${rows.length === 1 ? "y" : "ies"}${isFiltered ? " matching filters" : ""}`}
      </p>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <EmptyState isFiltered={isFiltered} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="overflow-x-auto">
            <table
              className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800"
              aria-label="Audit log entries"
            >
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <Th>Timestamp</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th>Entity ID</Th>
                  <Th>IP address</Th>
                  <Th className="text-right">Diff</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
                {rows.map((row) => (
                  <AuditTableRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      <AuditPagination
        hasNextPage={hasNextPage}
        nextCursor={nextCursor}
        prevCursor={prevCursor}
        displayCount={rows.length}
        totalInPage={PAGE_SIZE}
        isFiltered={isFiltered}
        currentParams={{ action, entity, actor, from, to, before }}
      />

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 ${className}`}>
      {children}
    </th>
  );
}

function EmptyState({ isFiltered }: { isFiltered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center dark:border-gray-700 dark:bg-gray-900/30">
      <div className="mb-3 rounded-full bg-gray-100 p-3 dark:bg-gray-800">
        <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {isFiltered ? "No entries match the current filters" : "No audit entries yet"}
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
        {isFiltered
          ? "Try adjusting or clearing the filters"
          : "Audit entries appear here as users perform actions"}
      </p>
      {isFiltered && (
        <a
          href="/audit"
          className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        >
          Clear filters
        </a>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}
