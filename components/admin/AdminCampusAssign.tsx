"use client";

/**
 * components/admin/AdminCampusAssign.tsx
 *
 * Multi-campus selector shown inside the admin user edit modal.
 * Allows SUPER_ADMIN to assign one or more campuses to an admin.
 * Zero checkboxes ticked = SUPER_ADMIN access (sees all campuses).
 */

import { useState, useTransition } from "react";
import { setAdminCampusesAction } from "@/actions/crud/campuses";
import { useToast } from "@/components/ui";

type Campus = { id: string; name: string; code: string };

type Props = {
    adminId: string;
    adminName: string;
    allCampuses: Campus[];
    assignedCampusIds: string[];
    onDone?: () => void;
};

export function AdminCampusAssign({
    adminId, adminName, allCampuses, assignedCampusIds, onDone,
}: Props) {
    const toast = useToast();
    const [selected, setSelected] = useState<Set<string>>(new Set(assignedCampusIds));
    const [isPending, startTransition] = useTransition();

    function toggle(campusId: string) {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(campusId) ? next.delete(campusId) : next.add(campusId);
            return next;
        });
    }

    function handleSave() {
        startTransition(async () => {
            const r = await setAdminCampusesAction(adminId, Array.from(selected));
            if (r.status === "success") {
                toast.success(
                    selected.size === 0
                        ? `${adminName} now has SUPER_ADMIN-level campus access.`
                        : `${adminName} assigned to ${selected.size} campus${selected.size !== 1 ? "es" : ""}.`
                );
                onDone?.();
            } else if (r.status === "error") {
                toast.error(r.error);
            }
        });
    }

    const isSuperAccess = selected.size === 0;

    return (
        <div className="space-y-4">
            <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Campus access for <span className="font-semibold">{adminName}</span>
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Tick the campuses this admin can access. Leave all unticked to grant full access across all campuses.
                </p>
            </div>

            {/* Campuses checklist */}
            <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                {allCampuses.map(campus => (
                    <label key={campus.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white dark:hover:bg-gray-800 transition-colors">
                        <input
                            type="checkbox"
                            checked={selected.has(campus.id)}
                            onChange={() => toggle(campus.id)}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{campus.name}</span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            {campus.code}
                        </code>
                    </label>
                ))}
            </div>

            {/* Access level indicator */}
            {isSuperAccess ? (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/20">
                    <svg className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                    </svg>
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                        No campuses selected — this admin will have <strong>full access to all campuses</strong> (same as SUPER_ADMIN).
                    </p>
                </div>
            ) : (
                <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950/20">
                    <svg className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                    <p className="text-xs text-indigo-800 dark:text-indigo-300">
                        Restricted to <strong>{selected.size} campus{selected.size !== 1 ? "es" : ""}</strong>:&nbsp;
                        {allCampuses.filter(c => selected.has(c.id)).map(c => c.code).join(", ")}
                    </p>
                </div>
            )}

            <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                {isPending ? "Saving…" : "Save campus access"}
            </button>
        </div>
    );
}