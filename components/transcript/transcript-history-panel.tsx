// "use client";

// import { useState } from "react";
// import { deleteTranscriptAction } from "@/actions/transcripts";

// type TranscriptRecord = {
//   id: string;
//   transcriptNumber: string;
//   createdAt: Date;
// };

// type Props = {
//   records: TranscriptRecord[];
//   canDelete: boolean;
// };

// export function TranscriptHistoryPanel({ records: initial, canDelete }: Props) {
//   const [list, setList] = useState(initial);
//   const [expanded, setExpanded] = useState(false);
//   const [deleting, setDeleting] = useState<string | null>(null);
//   const [loading, setLoading] = useState<string | null>(null);
//   const [error, setError] = useState<string | null>(null);
//   const MAX_PREVIEW = 3;

//   async function handleDelete(id: string) {
//     setLoading(id); setError(null);
//     const result = await deleteTranscriptAction(id);
//     setLoading(null); setDeleting(null);
//     if (result.status === "error") { setError(result.error); return; }
//     setList((prev) => prev.filter((r) => r.id !== id));
//   }

//   const displayed = expanded ? list : list.slice(0, MAX_PREVIEW);

//   if (list.length === 0) {
//     return (
//       <section className="print:hidden mt-8" data-print-hide>
//         <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Transcript history</h2>
//         <p className="text-sm text-gray-500 dark:text-gray-400">
//           No records yet. Use the &ldquo;Record transcript&rdquo; button above after printing.
//         </p>
//       </section>
//     );
//   }

//   return (
//     <section className="print:hidden mt-8" data-print-hide>
//       <div className="flex items-center justify-between mb-3">
//         <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
//           Transcript history
//           <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
//             {list.length}
//           </span>
//         </h2>
//         {list.length > MAX_PREVIEW && (
//           <button type="button" onClick={() => setExpanded((v) => !v)}
//             className="text-xs text-blue-600 hover:underline dark:text-blue-400">
//             {expanded ? "Show fewer" : `Show all ${list.length}`}
//           </button>
//         )}
//       </div>

//       {error && (
//         <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</p>
//       )}

//       <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
//         <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
//           <thead className="bg-gray-50 dark:bg-gray-800/50">
//             <tr>
//               <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Reference</th>
//               <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Recorded</th>
//               {canDelete && <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Actions</th>}
//             </tr>
//           </thead>
//           <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
//             {displayed.map((t, i) => (
//               <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
//                 <td className="px-4 py-3">
//                   <div className="flex items-center gap-2">
//                     <span className="font-mono text-xs text-gray-700 dark:text-gray-300" data-transcript-ref={t.transcriptNumber}>
//                       {t.transcriptNumber}
//                     </span>
//                     {i === 0 && (
//                       <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">Latest</span>
//                     )}
//                   </div>
//                 </td>
//                 <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
//                   {new Date(t.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
//                 </td>
//                 {canDelete && (
//                   <td className="px-4 py-3 text-right">
//                     {deleting !== t.id ? (
//                       <button type="button" onClick={() => setDeleting(t.id)} disabled={loading === t.id}
//                         className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
//                         <TrashIcon /> Delete
//                       </button>
//                     ) : (
//                       <div className="flex items-center justify-end gap-2">
//                         <span className="text-xs text-gray-600 dark:text-gray-400">Delete record?</span>
//                         <button type="button" onClick={() => handleDelete(t.id)} disabled={loading === t.id}
//                           className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">
//                           {loading === t.id ? "Deleting…" : "Confirm"}
//                         </button>
//                         <button type="button" onClick={() => setDeleting(null)}
//                           className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400">
//                           Cancel
//                         </button>
//                       </div>
//                     )}
//                   </td>
//                 )}
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//     </section>
//   );
// }

// function TrashIcon() {
//   return <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>;
// }
