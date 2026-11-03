"use client";

/**
 * components/transcript/search-controls.tsx
 *
 * Small client components used by the server-rendered transcripts/page.tsx.
 * Extracted here because server components cannot have onClick handlers.
 */

import { useRouter } from "next/navigation";

/** Print / Save as PDF button — calls window.print() */
export function PrintButton() {
    return (
        <button
            type="button"
            onClick={() => window.print()}
            className="print:hidden inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-950 shadow-sm transition-colors hover:border-red-300 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-800 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-indigo-950/50"
        >
            <PrintIcon />
            Print Transcript
        </button>
    );
}

/** Clickable table row that navigates to the transcript search. */
export function TranscriptHistoryRow({
    indexNumber,
    transcriptNumber,
    studentName,
    programme,
    date,
}: {
    indexNumber: string;
    transcriptNumber: string;
    studentName: string;
    programme: string;
    date: string;
}) {
    return (
        <tr
            className="cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-colors"
            onClick={() => {
                window.location.href = `/transcripts?q=${encodeURIComponent(indexNumber)}`;
            }}
        >
            <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                {transcriptNumber}
            </td>
            <td className="px-4 py-3">
                <p className="font-medium text-gray-900 dark:text-gray-100">{studentName}</p>
                <p className="font-mono text-xs text-gray-400">{indexNumber}</p>
            </td>
            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{programme}</td>
            <td className="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-gray-400">{date}</td>
        </tr>
    );
}

function PrintIcon() {
    return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
        </svg>
    );
}