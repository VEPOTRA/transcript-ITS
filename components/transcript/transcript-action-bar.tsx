// "use client";

// /**
//  * TranscriptActionBar — sticky action bar above the transcript document.
//  *
//  * Contains:
//  *   - Generate / Re-generate transcript button
//  *   - Download PDF (opens the stored file in a new tab)
//  *   - Print (triggers window.print())
//  *   - Copy reference number
//  *
//  * The bar is sticky so it stays accessible while the user scrolls the
//  * full transcript. On print it is hidden via @media print.
//  */

// import { useState, useTransition, useCallback } from "react";
// import { recordTranscriptAction } from "@/actions/transcripts";
// import { useToast } from "@/components/ui";

// type Props = {
//   studentId: string;
//   studentName: string;
//   canGenerate: boolean;
//   latestRecordId: string | null;
// };

// export function TranscriptActionBar({ studentId, studentName, canGenerate, latestRecordId }: Props) {
//   const toast = useToast();
//   const [isPending, startTransition] = useTransition();
//   const [justCopied, setJustCopied] = useState(false);

//   function handleRecord() {
//     startTransition(async () => {
//       const result = await recordTranscriptAction(studentId);
//       if (result.status === "error") { toast.error(result.error); return; }
//       if (result.status === "success" && result.data) {
//         toast.success(`Transcript ${result.data.transcriptNumber} recorded`);
//       }
//     });
//   }

//   const handlePrint = useCallback(() => { window.print(); }, []);

//   async function handleCopyRef() {
//     const el = document.querySelector<HTMLElement>("[data-transcript-ref]");
//     const ref = el?.dataset.transcriptRef ?? "";
//     if (!ref || ref === "PREVIEW") return;
//     try {
//       await navigator.clipboard.writeText(ref);
//       setJustCopied(true);
//       setTimeout(() => setJustCopied(false), 2000);
//     } catch { toast.error("Could not copy to clipboard."); }
//   }

//   return (
//     <div className="print:hidden sticky top-0 z-10 mb-6 -mx-4 sm:-mx-6 lg:-mx-8" data-print-hide>
//       <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6 lg:px-8 dark:border-gray-800 dark:bg-gray-950/95">
//         <div className="flex items-center gap-2 text-sm">
//           <a href="/transcripts" className="text-gray-500 hover:text-gray-700 dark:text-gray-400">Transcripts</a>
//           <ChevronRight />
//           <span className="font-medium text-gray-900 dark:text-gray-100">{studentName}</span>
//         </div>
//         <div className="flex flex-wrap items-center gap-2">
//           {latestRecordId && (
//             <button type="button" onClick={handleCopyRef}
//               className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
//               {justCopied ? <CheckIcon /> : <CopyIcon />}
//               {justCopied ? "Copied!" : "Copy ref"}
//             </button>
//           )}
//           <button type="button" onClick={handlePrint}
//             className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
//             <PrintIcon />
//             Print / Save as PDF
//           </button>
//           {canGenerate && (
//             <button type="button" onClick={handleRecord} disabled={isPending}
//               className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-60 dark:bg-white dark:text-gray-900">
//               {isPending ? <><Spinner />Recording…</> : <><RecordIcon />{latestRecordId ? "Re-record" : "Record"} transcript</>}
//             </button>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }

// function ChevronRight() { return <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>; }
// function PrintIcon() { return <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>; }
// function CopyIcon() { return <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>; }
// function CheckIcon() { return <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>; }
// function RecordIcon() { return <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>; }
// function Spinner() { return <svg className="h-3.5 w-3.5 animate-spin mr-1" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>; }
