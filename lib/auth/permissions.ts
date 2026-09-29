import type { AuthenticatedAdmin, Role } from "@/types/auth";

export type Permission =
  | "manage_institution"
  | "manage_registrar"
  | "manage_users"
  | "manage_programmes"
  | "manage_students"
  | "manage_courses"
  | "enter_grades"
  | "bulk_upload"
  | "generate_transcripts"
  | "view_transcripts"
  | "view_grades"
  | "view_audit_logs"
  | "search_students";

export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  ADMIN: 1,
  SUPER_ADMIN: 2,
};

export function hasMinimumRole(role: Role, minimumRole: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
}

export const PERMISSION_MAP: Record<Permission, string[]> = {
  manage_institution: ["SUPER_ADMIN"],
  manage_registrar: ["SUPER_ADMIN"],
  manage_users: ["SUPER_ADMIN"],
  manage_programmes: ["SUPER_ADMIN", "ADMIN"],
  manage_students: ["SUPER_ADMIN", "ADMIN"],
  manage_courses: ["SUPER_ADMIN", "ADMIN"],
  enter_grades: ["SUPER_ADMIN", "ADMIN"],
  bulk_upload: ["SUPER_ADMIN", "ADMIN"],
  generate_transcripts: ["SUPER_ADMIN", "ADMIN", "VIEWER"],
  view_transcripts: ["SUPER_ADMIN", "ADMIN", "VIEWER"],
  // view_grades: ["SUPER_ADMIN", "ADMIN", "VIEWER"],
  view_grades: ["SUPER_ADMIN", "ADMIN"],
  view_audit_logs: ["SUPER_ADMIN", "ADMIN"],
  search_students: ["SUPER_ADMIN", "ADMIN", "VIEWER"],
};

export function can(
  session: AuthenticatedAdmin,
  permission: Permission,
): boolean {
  return PERMISSION_MAP[permission]?.includes(session.role) ?? false;
}

export function canAll(
  session: AuthenticatedAdmin,
  permissions: Permission[],
): boolean {
  return permissions.every((p) => can(session, p));
}
