/**
 * /bulk/courses — Bulk upload courses.
 * CSV columns: code, title, credit_hours, is_scoring, category (optional)
 */
import { requirePermission } from "@/lib/auth/rbac";
import { BulkGenericForm } from "@/components/bulk/generic-form";

export const metadata = { title: "Bulk course import — TMS" };

export default async function BulkCoursesPage() {
    await requirePermission("manage_courses");
    return (
        <div className="mx-auto w-full max-w-6xl space-y-7">
            <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700 dark:text-indigo-300">
                    Records administration
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                    Bulk course import
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                    Add course codes, titles and credit details from a prepared CSV.
                </p>
            </header>

            <div className="grid items-stretch gap-6 lg:grid-cols-2">
            <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-700 dark:text-indigo-300">Step 1</p>
                <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">Check the CSV format</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400">
                    Include the required columns and optionally add a category column.
                </p>
                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-5 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <p className="font-semibold text-indigo-800 dark:text-indigo-200">Required columns</p>
                    <p className="mt-1 break-words">code,title,credit_hours,is_scoring,category</p>
                    <p className="mt-4 font-semibold text-indigo-800 dark:text-indigo-200">Example row</p>
                    <p className="mt-1 break-words">MATH101,Introduction to Mathematics,3,true,OSIS_NEW</p>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <li><strong className="text-slate-800 dark:text-slate-200">code</strong> — unique course code.</li>
                    <li><strong className="text-slate-800 dark:text-slate-200">title</strong> — full course title.</li>
                    <li><strong className="text-slate-800 dark:text-slate-200">credit_hours</strong> — numeric course credit value.</li>
                    <li><strong className="text-slate-800 dark:text-slate-200">is_scoring</strong> — true or false.</li>
                    <li><strong className="text-slate-800 dark:text-slate-200">category</strong> — optional; one of OSIS_OLD, OSIS_ONE, OSIS_ITC, OSIS_SRO, OSIS_MAIN, OSIS_EVAL, OSIS_NEW, ITS, or OSIS_2. Defaults to OSIS_NEW.</li>
                </ul>
                <a href="/api/templates/courses"
                    className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-semibold text-indigo-800 hover:underline dark:text-indigo-300">
                    <DownloadIcon />
                    Download course template
                </a>
            </section>

            <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-700 dark:text-indigo-300">Step 2</p>
                <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">Upload courses</h2>
                <p className="mb-5 mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400">
                    Choose the completed CSV and review the import summary.
                </p>
                <BulkGenericForm
                    endpoint="/api/bulk/courses/upload"
                    successHref="/courses"
                    successLabel="View courses"
                />
            </section>
            </div>
        </div>
    );
}

function DownloadIcon() {
    return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v3h16v-3" />
        </svg>
    );
}