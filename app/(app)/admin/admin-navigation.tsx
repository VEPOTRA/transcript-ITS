"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/institution", label: "Institution" },
  { href: "/admin/campuses", label: "Campuses" },
  { href: "/admin/grading-scale", label: "Grading scale" },
  { href: "/admin/registrar", label: "Registrar" },
  { href: "/audit", label: "Audit log" },
];

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Administration"
      className="-mt-2 flex gap-1 border-b border-slate-200 text-sm font-semibold dark:border-slate-800"
    >
      {links.map(({ href, label }) => {
        const active =
          pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              "-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
              active
                ? "border-red-700 text-indigo-950 dark:text-white"
                : "border-transparent text-slate-600 hover:border-red-700 hover:text-indigo-950 dark:text-slate-400 dark:hover:text-white",
            ].join(" ")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
