/**
 * POST /api/admin/users — create an admin account.
 * SUPER_ADMIN only.
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { eq } from "drizzle-orm";
import { COOKIE_NAME } from "@/lib/auth/config";
import { verifyToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/passwords";
import { logAuditEvent, extractRequestMeta } from "@/lib/audit";
// import { ca } from "zod/v4/locales";

async function getSession(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return token ? await verifyToken(token) : null;
}

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "VIEWER"]),
  campusId: z.string().uuid().optional().nullable(),
});

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

  const [created] = await db
    .insert(admins)
    .values({
      email,
      password: await hashPassword(body.password),
      role: body.role,
    })
    .returning({
      id: admins.id,
      email: admins.email,
      role: admins.role,
      isActive: admins.isActive,
      createdAt: admins.createdAt,
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
    },
    ...extractRequestMeta(req.headers),
  });

  return NextResponse.json(created, { status: 201 });
}
