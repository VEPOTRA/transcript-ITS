/**
 * GET    /api/admin/users/[id] — fetch single admin
 * PATCH  /api/admin/users/[id] — update role / reset password / re-enable
 * DELETE /api/admin/users/[id] — disable account (soft delete)
 * SUPER_ADMIN only.
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { adminCampuses, admins, campuses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyToken } from "@/lib/auth/jwt";
import { COOKIE_NAME } from "@/lib/auth/config";
import { hashPassword } from "@/lib/auth/passwords";
import { logAuditEvent, extractRequestMeta } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

async function getSession(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return token ? await verifyToken(token) : null;
}

const UNAUTH = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const FORBID = (m = "Forbidden") =>
  NextResponse.json({ error: m }, { status: 403 });
const MISSING = () =>
  NextResponse.json({ error: "Admin not found" }, { status: 404 });

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req);
  if (!session) return UNAUTH();
  if (session.role !== "SUPER_ADMIN") return FORBID();

  const { id } = await params;
  const [admin] = await db
    .select({
      id: admins.id,
      email: admins.email,
      role: admins.role,
      isActive: admins.isActive,
      createdAt: admins.createdAt,
    })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);

  if (!admin) return MISSING();

  const [allCampuses, assignedCampuses] = await Promise.all([
    db
      .select({
        id: campuses.id,
        name: campuses.name,
        code: campuses.code,
      })
      .from(campuses)
      .orderBy(campuses.name),
    db
      .select({ campusId: adminCampuses.campusId })
      .from(adminCampuses)
      .where(eq(adminCampuses.adminId, id)),
  ]);
  return NextResponse.json({
    ...admin,
    campuses: allCampuses,
    assignedCampusIds: assignedCampuses.map(({ campusId }) => campusId),
  });
}

// ─── PATCH ───────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "ADMIN", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
  newPassword: z.string().min(8).optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req);
  if (!session) return UNAUTH();
  if (session.role !== "SUPER_ADMIN") return FORBID();

  const { id } = await params;
  if (id === session.adminId)
    return FORBID("Use the profile page to update your own account.");

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0].message : "Invalid body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);
  if (!existing) return MISSING();

  const updates: Record<string, unknown> = {};
  if (body.role !== undefined) updates.role = body.role;
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.newPassword) updates.password = await hashPassword(body.newPassword);

  const [updated] = await db
    .update(admins)
    .set(updates)
    .where(eq(admins.id, id))
    .returning({
      id: admins.id,
      email: admins.email,
      role: admins.role,
      isActive: admins.isActive,
    });

  await logAuditEvent({
    adminId: session.adminId,
    action: "UPDATE_ADMIN",
    entity: "admins",
    entityId: id,
    before: { role: existing.role, isActive: existing.isActive },
    after: {
      role: updated.role,
      isActive: updated.isActive,
      passwordReset: !!body.newPassword,
    },
    ...extractRequestMeta(req.headers),
  });

  return NextResponse.json(updated);
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req);
  if (!session) return UNAUTH();
  if (session.role !== "SUPER_ADMIN") return FORBID();

  const { id } = await params;
  if (id === session.adminId)
    return FORBID("You cannot disable your own account.");

  const [existing] = await db
    .select({ id: admins.id, email: admins.email, role: admins.role })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);
  if (!existing) return MISSING();

  await db.update(admins).set({ isActive: false }).where(eq(admins.id, id));

  await logAuditEvent({
    adminId: session.adminId,
    action: "DISABLE_ADMIN",
    entity: "admins",
    entityId: id,
    before: { email: existing.email, role: existing.role, isActive: true },
    after: { isActive: false },
    ...extractRequestMeta(req.headers),
  });

  return NextResponse.json({ disabled: true });
}
