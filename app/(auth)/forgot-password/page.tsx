/**
 * /forgot-password — Request a password reset link.
 */
import type { Metadata } from "next";
import { ForgotPasswordForm } from "./_components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password — TMS" };

export default function ForgotPasswordPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
            <div className="w-full max-w-md space-y-8">

                {/* Logo */}
                <div className="text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-200 dark:shadow-none">
                        <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Forgot your password?</h1>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Enter your email address and we'll send you a secure link to reset it.
                    </p>
                </div>

                {/* Form card */}
                <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <ForgotPasswordForm />
                </div>

                <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                    Remembered it?{" "}
                    <a href="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                        Back to sign in
                    </a>
                </p>
            </div>
        </div>
    );
}