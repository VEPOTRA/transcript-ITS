import "./globals.css";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next"

export const metadata: Metadata = {
  title: "Transcript Management System",
  description: "Academic transcript management for UEW Students",
};

/**
 * Root layout.
 *
 * suppressHydrationWarning on <html> is necessary because the AppShell
 * client component writes `class="dark"` to the html element on mount
 * (based on localStorage). Without this flag, React hydration throws a
 * mismatch warning because the server renders without the dark class.
 *
 * The inline script in <head> applies dark mode before first paint,
 * eliminating any flash of the wrong theme.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Inline script to apply dark mode before React hydrates.
          Runs synchronously during HTML parsing — no FOUC.
          Using dangerouslySetInnerHTML to avoid Next.js JSX escaping.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var stored = localStorage.getItem('tms-theme');
                if (stored === 'dark') {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="antialiased" >
        <Analytics />
        {children}
      </body>
    </html>
  );
}