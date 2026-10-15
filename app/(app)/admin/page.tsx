import { requireRole } from "@/lib/auth/rbac";

export default async function AdminIndexPage() {
  await requireRole("SUPER_ADMIN");

  const links = [
    { href: "/admin/institution", label: "Institution", description: "Name, address, and logo" },
    { href: "/admin/registrar", label: "Registrar", description: "Signatory name, title, and signature" },
    { href: "/admin/users", label: "Admin users", description: "Create and manage admin accounts" },
    { href: "/admin/grading-scale", label: "Grading scale", description: "View the grade point scale" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Admin settings</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          System configuration — SUPER_ADMIN access only.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600"
          >
            <p className="text-sm font-semibold text-gray-900 group-hover:text-gray-700 dark:text-gray-100">
              {link.label}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{link.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}