import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// GET /api/permission-groups/[id] — fetch one group (admin only)
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const group = await db.permissionGroup.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          userAssignments: true,
        },
      },
    },
  });

  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  return NextResponse.json({ group });
}

// PATCH /api/permission-groups/[id] — update group (admin only)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { action, name, description, permissions } = body as {
    action?: string;
    name?: string;
    description?: string;
    permissions?: {
      dockerAccess?: boolean;
      dockerViewAll?: boolean;
      dockerImages?: boolean;
      dockerVolumes?: boolean;
      dockerNetworks?: boolean;
      dockerCreate?: boolean;
      dockerDelete?: boolean;
      fsAccess?: boolean;
      terminalAccess?: boolean;
      terminalReadOnly?: boolean;
      terminalMaxSessions?: number;
    };
  };

  const updateData: Record<string, unknown> = {};

  if (action === "unassign-all-users") {
    await db.userPermissionGroup.deleteMany({ where: { groupId: id } });

    await writeAuditLog(
      { userId: currentUser.id, username: currentUser.username, role: currentUser.role, sessionId: "" },
      "UNASSIGN_PERMISSION_GROUP_USERS",
      `permission-group:${id}`,
      "Removed all user assignments from group",
      true,
      req
    );

    return NextResponse.json({ success: true });
  }

  if (typeof name === "string") {
    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      return NextResponse.json({ error: "Group name must be at least 2 characters" }, { status: 400 });
    }

    const existing = await db.permissionGroup.findFirst({
      where: {
        name: normalizedName,
        id: { not: id },
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ error: "Group name already exists" }, { status: 409 });
    }

    updateData.name = normalizedName;
  }

  if (description !== undefined) {
    updateData.description = description?.trim() || null;
  }

  if (permissions) {
    updateData.dockerAccess = permissions.dockerAccess ?? false;
    updateData.dockerViewAll = permissions.dockerViewAll ?? false;
    updateData.dockerImages = permissions.dockerImages ?? false;
    updateData.dockerVolumes = permissions.dockerVolumes ?? false;
    updateData.dockerNetworks = permissions.dockerNetworks ?? false;
    updateData.dockerCreate = permissions.dockerCreate ?? false;
    updateData.dockerDelete = permissions.dockerDelete ?? false;
    updateData.fsAccess = permissions.fsAccess ?? false;
    updateData.terminalAccess = permissions.terminalAccess ?? false;
    updateData.terminalReadOnly = permissions.terminalReadOnly ?? true;
    updateData.terminalMaxSessions = permissions.terminalMaxSessions ?? 1;
  }

  const group = await db.permissionGroup.update({
    where: { id },
    data: updateData,
  });

  await writeAuditLog(
    { userId: currentUser.id, username: currentUser.username, role: currentUser.role, sessionId: "" },
    "UPDATE_PERMISSION_GROUP",
    `permission-group:${group.id}`,
    `Updated group: ${group.name}`,
    true,
    req
  );

  return NextResponse.json({ group });
}

// DELETE /api/permission-groups/[id] — delete group (admin only)
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await db.permissionGroup.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const assignments = await db.userPermissionGroup.count({ where: { groupId: id } });
  if (assignments > 0) {
    return NextResponse.json(
      { error: `Group is assigned to ${assignments} user(s). Remove assignments first.` },
      { status: 409 }
    );
  }

  await db.permissionGroup.delete({ where: { id } });

  await writeAuditLog(
    { userId: currentUser.id, username: currentUser.username, role: currentUser.role, sessionId: "" },
    "DELETE_PERMISSION_GROUP",
    `permission-group:${id}`,
    `Deleted group: ${existing.name}`,
    true,
    req
  );

  return NextResponse.json({ success: true });
}
