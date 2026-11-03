/**
 * /bulk — Bulk upload hub.
 * Links to all bulk upload pages.
 */
import Link from "next/link";
import { requireAuth, can } from "@/lib/auth/rbac";

export const metadata = { title: "Bulk upload — TMS" };

const cards = [
  {
    href: "/bulk/upload",
    title: "Student records",
    description: "Register multiple students and their programme details.",
    label: "STUDENT DATA",
    icon: StudentRecordsIcon,
    permission: "bulk_upload" as const,
  },
  {
    href: "/bulk/grades",
    title: "Student grades",
    description: "Import semester results and course grades in one batch.",
    label: "ACADEMIC RESULTS",
    icon: GradeRecordsIcon,
    permission: "bulk_upload" as const,
  },
  {
    href: "/bulk/programmes",
    title: "Programmes",
    description: "Add academic programmes from a structured CSV file.",
    label: "ACADEMIC STRUCTURE",
    icon: ProgrammeRecordsIcon,
    permission: "manage_programmes" as const,
  },
  {
    href: "/bulk/courses",
    title: "Courses",
    description: "Add course codes, titles and credit details in a batch.",
    label: "ACADEMIC STRUCTURE",
    icon: CourseRecordsIcon,
    permission: "manage_courses" as const,
  },
];

export default async function BulkPage() {
  const session = await requireAuth();
  const visibleCards = cards.filter((card) => can(session, card.permission));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700 dark:text-indigo-300">
          Records administration
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
          Bulk data import
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
          Select a record type to import. Prepare a CSV using the corresponding
          template before uploading.
        </p>
      </header>

      <section aria-label="Available imports" className="grid auto-rows-fr gap-4 sm:grid-cols-2">
        {visibleCards.map(({ href, title, description, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex min-h-44 items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md focus-visible:outline-indigo-700 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-800 ring-1 ring-indigo-100 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-900">
              <Icon />
            </span>
            <span className="flex min-h-[6.5rem] flex-1 flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                {label}
              </span>
              <span className="mt-1 text-base font-semibold text-slate-900 group-hover:text-indigo-800 dark:text-slate-100 dark:group-hover:text-indigo-300">
                {title}
              </span>
              <span className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400">
                {description}
              </span>
              <span className="mt-auto flex items-center gap-1 pt-3 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                Open import
                <ArrowIcon />
              </span>
            </span>
          </Link>
        ))}
      </section>

      <aside className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-5 dark:border-indigo-900 dark:bg-indigo-950/30">
        <h2 className="text-sm font-semibold text-indigo-950 dark:text-indigo-100">
          Before you import
        </h2>
        <ul className="mt-3 grid gap-x-8 gap-y-2 text-sm leading-5 text-indigo-900 sm:grid-cols-2 dark:text-indigo-200">
          <li>Use the import-specific template and keep its column names unchanged.</li>
          <li>Save the completed spreadsheet as a comma-separated CSV file.</li>
          <li>Check required fields and reference codes before uploading.</li>
          <li>Review the import report; valid rows may be processed when other rows fail.</li>
        </ul>
      </aside>
    </div>
  );
}

function StudentRecordsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m18 0v-2a4 4 0 00-3-3.87M9 11a4 4 0 100-8 4 4 0 000 8zm12-3a4 4 0 01-3 3.87" />
    </svg>
  );
}

function GradeRecordsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m0 14h17M8 15l4-4 3 3 6-7M17 7h4v4" />
    </svg>
  );
}

function ProgrammeRecordsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.42A12.08 12.08 0 0118 16.5c0 1.66-2.69 3-6 3s-6-1.34-6-3c0-2.4.71-4.45 1.84-5.92L12 14zm0 0v5.5" />
    </svg>
  );
}

function CourseRecordsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A2.5 2.5 0 016.5 3H20v17H6.5A2.5 2.5 0 014 17.5v-12zM4 17.5A2.5 2.5 0 016.5 15H20M8 7h8m-8 4h6" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}
