import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// ── GET /api/users/[id] ───────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "ADMIN" && currentUser.id !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await db.user.findUnique({
    where: { id },
    include: {
      permissions: {
        include: {
          containerPerms: true,
          fsPathPerms: true,
        },
      },
      permissionGroups: {
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { passwordHash: _, ...safeUser } = user;
  return NextResponse.json({ user: safeUser });
}

// ── PATCH /api/users/[id] — update user or permissions ───────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { displayName, isActive, password, permissions, permissionGroupIds } = body;

  // Update base user fields
  const updateData: Record<string, unknown> = {};
  if (displayName !== undefined) updateData.displayName = displayName;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (password) updateData.passwordHash = await bcrypt.hash(password, 12);

  await db.user.update({ where: { id }, data: updateData });

  // Update permissions if provided
  if (permissions) {
    const {
      containerPerms: _cp,
      fsPathPerms: _fp,
      ...globalPerms
    } = permissions;

    await db.userPermission.upsert({
      where: { userId: id },
      update: globalPerms,
      create: { userId: id, ...globalPerms },
    });
  }

  if (Array.isArray(permissionGroupIds)) {
    const normalizedIds = Array.from(new Set(permissionGroupIds.map((value: unknown) => String(value)).filter(Boolean)));

    const existing = await db.permissionGroup.findMany({
      where: { id: { in: normalizedIds } },
      select: { id: true },
    });

    if (existing.length !== normalizedIds.length) {
      return NextResponse.json({ error: "One or more permission groups do not exist" }, { status: 400 });
    }

    await db.$transaction([
      db.userPermissionGroup.deleteMany({ where: { userId: id } }),
      ...(normalizedIds.length > 0
        ? [
            db.userPermissionGroup.createMany({
              data: normalizedIds.map((groupId) => ({ userId: id, groupId })),
            }),
          ]
        : []),
    ]);
  }

  await writeAuditLog(
    { userId: currentUser.id, username: currentUser.username, role: currentUser.role, sessionId: "" },
    "UPDATE_USER",
    `user:${id}`,
    undefined,
    true,
    req
  );

  return NextResponse.json({ success: true });
}

// ── DELETE /api/users/[id] ────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (currentUser.id === id) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  await db.user.delete({ where: { id } });

  await writeAuditLog(
    { userId: currentUser.id, username: currentUser.username, role: currentUser.role, sessionId: "" },
    "DELETE_USER",
    `user:${id}`,
    undefined,
    true,
    req
  );

  return NextResponse.json({ success: true });
}
