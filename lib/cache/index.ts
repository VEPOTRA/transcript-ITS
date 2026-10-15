import { cache } from "react";
import { getSession } from "@/lib/auth/session";

export const getCachedSession = cache(async () => getSession());

export const getCachedDashboardStats = cache(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  const [counts] = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM students WHERE status = 'ACTIVE') AS active_students,
      (SELECT COUNT(*)::int FROM students) AS total_students,
      (SELECT COUNT(*)::int FROM programmes WHERE is_active = true) AS active_programmes,
      (SELECT COUNT(*)::int FROM courses WHERE is_active = true) AS active_courses,
      (SELECT COUNT(*)::int FROM grades WHERE is_superseded = false)  AS total_grades,
      (SELECT COUNT(*)::int FROM transcripts) AS total_transcripts,
      (SELECT COUNT(*)::int FROM admins WHERE is_active = true) AS active_admins
  `);
  return counts as Record<string, number>;
});
