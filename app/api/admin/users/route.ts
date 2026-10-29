/**
 * POST /api/admin/users — create an admin account.
 * SUPER_ADMIN only.
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { adminCampuses, admins, campuses } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { COOKIE_NAME } from "@/lib/auth/config";
import { verifyToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/passwords";
import { logAuditEvent, extractRequestMeta } from "@/lib/audit";

async function getSession(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return token ? await verifyToken(token) : null;
}

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "VIEWER"]),
  campusIds: z.array(z.string().uuid()).default([]),
});

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const availableCampuses = await db
    .select({
      id: campuses.id,
      name: campuses.name,
      code: campuses.code,
    })
    .from(campuses)
    .where(eq(campuses.isActive, true))
    .orderBy(campuses.name);
  return NextResponse.json({ campuses: availableCampuses });
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof createAdminSchema>;
  try {
    body = createAdminSchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0].message : "Invalid body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const email = body.email.toLowerCase().trim();
  const campusIds = [...new Set(body.campusIds)];
  if (body.role === "SUPER_ADMIN" && campusIds.length > 0) {
    return NextResponse.json(
      { error: "Campus assignments are not required for Super Admin accounts." },
      { status: 400 },
    );
  }

  if (campusIds.length > 0) {
    const availableCampuses = await db
      .select({ id: campuses.id })
      .from(campuses)
      .where(inArray(campuses.id, campusIds));
    if (availableCampuses.length !== campusIds.length) {
      return NextResponse.json(
        { error: "One or more selected campuses do not exist." },
        { status: 400 },
      );
    }
  }

  const [existing] = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.email, email))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: "An admin with that email already exists." },
      { status: 409 },
    );
  }

  const password = await hashPassword(body.password);
  const created = await db.transaction(async (tx) => {
    const [admin] = await tx
      .insert(admins)
      .values({ email, password, role: body.role })
      .returning({
        id: admins.id,
        email: admins.email,
        role: admins.role,
        isActive: admins.isActive,
        createdAt: admins.createdAt,
      });

    if (campusIds.length > 0) {
      await tx.insert(adminCampuses).values(
        campusIds.map((campusId) => ({ adminId: admin.id, campusId })),
      );
    }
    return admin;
  });

  await logAuditEvent({
    adminId: session.adminId,
    action: "CREATE_ADMIN",
    entity: "admins",
    entityId: created.id,
    after: {
      email: created.email,
      role: created.role,
      isActive: created.isActive,
      campusIds,
    },
    ...extractRequestMeta(req.headers),
  });

  return NextResponse.json(created, { status: 201 });
}
