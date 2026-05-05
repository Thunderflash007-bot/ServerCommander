import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

// GET /api/permission-groups — list all groups (admin only)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const groups = await db.permissionGroup.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ groups });
}

// POST /api/permission-groups — create group (admin only)
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, description, permissions } = body as {
    name: string;
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

  const normalizedName = (name ?? "").trim();
  if (!normalizedName || normalizedName.length < 2) {
    return NextResponse.json({ error: "Group name must be at least 2 characters" }, { status: 400 });
  }

  const existing = await db.permissionGroup.findUnique({ where: { name: normalizedName } });
  if (existing) {
    return NextResponse.json({ error: "Group name already exists" }, { status: 409 });
  }

  const group = await db.permissionGroup.create({
    data: {
      name: normalizedName,
      description: description?.trim() || null,
      dockerAccess: permissions?.dockerAccess ?? false,
      dockerViewAll: permissions?.dockerViewAll ?? false,
      dockerImages: permissions?.dockerImages ?? false,
      dockerVolumes: permissions?.dockerVolumes ?? false,
      dockerNetworks: permissions?.dockerNetworks ?? false,
      dockerCreate: permissions?.dockerCreate ?? false,
      dockerDelete: permissions?.dockerDelete ?? false,
      fsAccess: permissions?.fsAccess ?? false,
      terminalAccess: permissions?.terminalAccess ?? false,
      terminalReadOnly: permissions?.terminalReadOnly ?? true,
      terminalMaxSessions: permissions?.terminalMaxSessions ?? 1,
    },
  });

  await writeAuditLog(
    { userId: currentUser.id, username: currentUser.username, role: currentUser.role, sessionId: "" },
    "CREATE_PERMISSION_GROUP",
    `permission-group:${group.id}`,
    `Created group: ${group.name}`,
    true,
    req
  );

  return NextResponse.json({ group }, { status: 201 });
}
