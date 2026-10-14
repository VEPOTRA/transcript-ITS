"use client";

import { useActionState } from "react";
import { requestPasswordResetAction } from "@/actions/password-reset";
import type { ActionState } from "@/types/auth";

const init: ActionState = { status: "idle" };

export function ForgotPasswordForm() {
    const [state, action, pending] = useActionState(requestPasswordResetAction, init);

    if (state.status === "success") {
        return (
            <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                    <svg className="h-7 w-7 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Check your email</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    If an account exists for that email address, a password reset link has been sent.
                    The link expires in <strong>60 minutes</strong>.
                </p>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                    Check your spam folder if you don't see it within a few minutes.
                </div>
                <a href="/login"
                    className="mt-2 inline-block w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 text-center">
                    Back to sign in
                </a>
            </div>
        );
    }

    return (
        <form action={action} noValidate className="space-y-5">
            {state.status === "error" && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                    <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H2.645c-1.73 0-2.813-1.874-1.948-3.374L10.05 3.378c.866-1.5 3.032-1.5 3.898 0l7.355 12.748z" />
                    </svg>
                    {state.error}
                </div>
            )}

            <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email address
                </label>
                <input id="email" name="email" type="email" autoComplete="email"
                    required disabled={pending} autoFocus
                    placeholder="admin@institution.edu"
                    className="block w-full rounded-xl border border-gray-300 px-4 py-3 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
            </div>

            <button type="submit" disabled={pending}
                className={[
                    "w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3",
                    "text-sm font-semibold text-white transition-all",
                    "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    pending ? "bg-indigo-400" : "bg-indigo-600 hover:bg-indigo-700",
                ].join(" ")}>
                {pending
                    ? <><Spinner /> Sending reset link…</>
                    : "Send reset link"}
            </button>
        </form>
    );
}

function Spinner() {
    return <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>;
}