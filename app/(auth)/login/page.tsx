/**
 * /login — Sign in page.
 *
 * getSession() is wrapped in try/catch so a DB connection error
 * (AggregateError, wrong credentials, etc.) shows a helpful message
 * instead of a blank crash page.
 *
 * If no admins exist yet, redirects to /setup for first-time configuration.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "./_components/login-form";

export const metadata: Metadata = {
  title: "Sign in — TMS",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ callbackUrl?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { callbackUrl: raw } = await searchParams;
  const safe = raw?.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";

  // Check session — wrapped so a DB error shows a proper message
  let isAuthenticated = false;
  let dbError = false;

  try {
    const { getSession } = await import("@/lib/auth/session");
    const session = await getSession();
    if (session) redirect("/dashboard");
    isAuthenticated = false;
  } catch (err: unknown) {
    // DB unreachable, wrong credentials, or SSL mismatch
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("AggregateError") ||
      msg.includes("password") || msg.includes("database") ||
      String(err).includes("AggregateError")) {
      dbError = true;
    }
  }

  return (
    <div className="flex min-h-screen">

      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-indigo-600 p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-white" />
          <div className="absolute -bottom-32 -right-16 h-[500px] w-[500px] rounded-full bg-white" />
          <div className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </div>

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <CapIcon />
          </div>
          <span className="text-lg font-bold text-white">TMS</span>
        </div>

        <div className="relative space-y-4">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Transcript<br />Management<br />System
          </h1>
          <p className="text-indigo-200 text-base leading-relaxed max-w-xs">
            Official academic records platform for managing student transcripts, grades, and academic history.
          </p>
          <ul className="space-y-3 pt-4">
            {["Secure role-based access", "Bulk student & grade uploads", "Official printable transcripts", "Full audit trail"].map((f) => (
              <li key={f} className="flex items-center gap-3 text-indigo-100 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-indigo-300">Authorised personnel only. All access is logged.</p>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-white dark:bg-gray-950">
        {/* Mobile logo */}
        <div className="mb-10 flex flex-col items-center lg:hidden">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-200">
            <CapIcon />
          </div>
          <p className="mt-3 text-xl font-bold text-gray-900 dark:text-white">TMS</p>
        </div>

        <div className="w-full max-w-sm">
          {dbError ? (
            <DatabaseErrorPanel />
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome back</h2>
                <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                  Sign in to access the academic records system.
                </p>
              </div>
              <LoginForm callbackUrl={safe} />
              <div className="mt-4 text-center">
                <a href="/forgot-password"
                  className="text-xs text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors">
                  Forgot your password?
                </a>
              </div>
              <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-600">
                First time?{" "}
                <a href="/setup" className="text-indigo-600 hover:underline dark:text-indigo-400">
                  Set up your admin account →
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DatabaseErrorPanel() {
  return (
    <div className="space-y-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-950/30">
        <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Database not reachable</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        The app cannot connect to PostgreSQL. Check the following:
      </p>
      <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
        <li className="flex gap-2"><span className="text-red-500 font-bold">1.</span> Is PostgreSQL running? Open Windows Services and check <strong>postgresql-x64-16</strong></li>
        <li className="flex gap-2"><span className="text-red-500 font-bold">2.</span> Is <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">DATABASE_URL</code> set correctly in <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">.env.local</code>?</li>
        <li className="flex gap-2"><span className="text-red-500 font-bold">3.</span> Did you run <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">pnpm db:push</code> to create the tables?</li>
      </ul>
      <button onClick={() => window.location.reload()}
        className="mt-2 w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900">
        Retry connection
      </button>
    </div>
  );
}

function CapIcon() {
  return (
    <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
    </svg>
  );
}