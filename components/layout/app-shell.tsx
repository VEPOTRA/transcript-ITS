"use client";

/**
 * AppShell — redesigned authenticated layout.
 *
 * Changes from v1:
 *  - Indigo accent colour throughout (replaces flat gray)
 *  - Grouped navigation sections (main / academic / system)
 *  - Active link has left accent bar + filled background
 *  - Topbar shows page title + current time
 *  - User avatar with initials (not just first letter)
 *  - Role badge styled by role level
 *  - Smooth sidebar slide animation on mobile
 *  - Profile + password link in user footer
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { logoutAction } from "@/actions/auth";
import type { AuthenticatedAdmin } from "@/types/auth";

// ─── Nav structure ────────────────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: string[];
  exact?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Main",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: <DashIcon />, exact: true },
      { href: "/transcripts", label: "Transcripts", icon: <TranscriptIcon /> },
      { href: "/students", label: "Students", icon: <StudentsIcon /> },
    ],
  },
  {
    label: "Academic",
    items: [
      { href: "/grades", label: "Grades", icon: <GradeIcon />, roles: ["SUPER_ADMIN", "ADMIN"] },
      { href: "/programmes", label: "Programmes", icon: <ProgrammeIcon />, roles: ["SUPER_ADMIN", "ADMIN"] },
      { href: "/courses", label: "Courses", icon: <CourseIcon />, roles: ["SUPER_ADMIN", "ADMIN"] },
      { href: "/semesters", label: "Semesters", icon: <CalIcon />, roles: ["SUPER_ADMIN", "ADMIN"] },
      // { href: "/admin/campuses", label: "Campuses", icon: <CapIcon />, roles: ["SUPER_ADMIN"] },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/bulk", label: "Bulk upload", icon: <UploadIcon />, roles: ["SUPER_ADMIN", "ADMIN"] },
      { href: "/audit", label: "Audit log", icon: <AuditIcon />, roles: ["SUPER_ADMIN", "ADMIN"] },
      { href: "/admin", label: "Admin", icon: <AdminIcon />, roles: ["SUPER_ADMIN"] },
    ],
  },
];

// ─── Role colours ─────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<string, string> = {
  SUPER_ADMIN: "bg-rose-100   text-rose-700   dark:bg-rose-950   dark:text-rose-300",
  ADMIN: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  VIEWER: "bg-gray-100   text-gray-600   dark:bg-gray-800   dark:text-gray-400",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  session: AuthenticatedAdmin;
  children: React.ReactNode;
  pathname: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AppShell({ session, children, pathname }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [time, setTime] = useState("");

  // Dark mode
  useEffect(() => {
    const stored = localStorage.getItem("tms-theme");
    const isDark = stored === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleDark = useCallback(() => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("tms-theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  }, [dark]);

  // Live clock
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  const initials = session.email
    .split("@")[0]
    .split(/[._-]/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  const pageLabel = getPageLabel(pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className={[
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col",
        "bg-white dark:bg-gray-900",
        "border-r border-gray-200 dark:border-gray-800",
        "transition-transform duration-300 ease-in-out",
        "lg:relative lg:translate-x-0",
        sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
      ].join(" ")}>

        {/* Logo bar */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-100 px-5 dark:border-gray-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-sm shadow-indigo-200 dark:shadow-indigo-900">
            <CapIcon />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white leading-none">TMS</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Academic Records</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group) => {
            const visible = group.items.filter(
              (item) => !item.roles || item.roles.includes(session.role)
            );
            if (visible.length === 0) return null;
            return (
              <div key={group.label}>
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {visible.map((item) => {
                    const active = item.exact
                      ? pathname === item.href
                      : pathname.startsWith(item.href);
                    return (
                      <li key={item.href}>
                        <a
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={[
                            "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                            active
                              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/60 dark:hover:text-gray-100",
                          ].join(" ")}
                        >
                          {/* Active bar */}
                          {active && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-indigo-600 dark:bg-indigo-400" />
                          )}
                          <span className={[
                            "h-4 w-4 shrink-0 transition-colors",
                            active ? "text-indigo-600 dark:text-indigo-400" : "",
                          ].join(" ")}>
                            {item.icon}
                          </span>
                          {item.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 p-3 space-y-1">
          {/* Profile link */}
          <a href="/profile"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group">
            <div className={[
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              "bg-indigo-600 text-white",
            ].join(" ")}>
              {initials || session.email[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100">
                {session.email}
              </p>
              <div className="flex items-center gap-1 flex-wrap">
                <span className={[
                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  // ROLE_STYLES[session.role] ?? ROLE_STYLES.VIEWER,
                ].join(" ")}>
                  {session.role.replace("_", " ")}
                </span>
                {(session as any).campusName && (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    {(session as any).campusName}
                  </span>
                )}
              </div>
            </div>
          </a>

          {/* Sign out */}
          <form action={logoutAction}>
            <button type="submit"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-red-400 transition-colors">
              <LogoutIcon />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Topbar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 dark:border-gray-800 dark:bg-gray-900">

          {/* Left: hamburger + page title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
              aria-label="Open menu"
            >
              <HamburgerIcon />
            </button>
            <div className="hidden lg:block">
              <Breadcrumb pathname={pathname} />
            </div>
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 lg:hidden">
              {pageLabel}
            </h1>
          </div>

          {/* Right: clock + dark mode */}
          <div className="flex items-center gap-1">
            {time && (
              <span className="hidden sm:flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                <ClockIcon />
                {time}
              </span>
            )}
            <button
              onClick={toggleDark}
              className="ml-1 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

const LABELS: Record<string, string> = {
  dashboard: "Dashboard", students: "Students", programmes: "Programmes",
  courses: "Courses", semesters: "Semesters", grades: "Grades",
  transcripts: "Transcripts", bulk: "Bulk upload", upload: "Upload",
  audit: "Audit log", admin: "Admin", users: "Users",
  enter: "Enter grades", templates: "Templates", profile: "My profile",
};

function getPageLabel(pathname: string) {
  const segs = pathname.split("/").filter(Boolean);
  return LABELS[segs[segs.length - 1] ?? ""] ?? "TMS";
}

function Breadcrumb({ pathname }: { pathname: string }) {
  const segs = pathname.split("/").filter(Boolean);
  return (
    <nav className="flex items-center gap-1 text-sm">
      {segs.map((seg, i) => {
        const isLast = i === segs.length - 1;
        const label = LABELS[seg] ?? seg;
        return (
          <span key={seg} className="flex items-center gap-1">
            {i > 0 && <ChevronIcon />}
            {isLast
              ? <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
              : <a href={"/" + segs.slice(0, i + 1).join("/")}
                className="text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors">
                {label}
              </a>
            }
          </span>
        );
      })}
    </nav>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CapIcon() {
  return (
    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
    </svg>
  );
}

function DashIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>; }
function StudentsIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>; }
function ProgrammeIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" /></svg>; }
function CourseIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0118 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>; }
function CalIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>; }
function GradeIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>; }
function TranscriptIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>; }
function UploadIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>; }
function AuditIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" /></svg>; }
function AdminIcon() { return <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>; }
function LogoutIcon() { return <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>; }
function HamburgerIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>; }
function SunIcon() { return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>; }
function MoonIcon() { return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>; }
function ChevronIcon() { return <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>; }
function ClockIcon() { return <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }