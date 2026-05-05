import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { writeAuditLog } from "@/lib/audit";

// ── GET /api/users — list all users (admin only) ──────────────────────────────

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await db.user.findMany({
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      isActive: true,
      createdAt: true,
      permissions: {
        select: {
          dockerAccess: true,
          fsAccess: true,
          terminalAccess: true,
          containerPerms: { select: { containerName: true, containerId: true } },
        },
      },
      permissionGroups: {
        select: {
          group: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ users });
}

// ── POST /api/users — create user (admin only) ────────────────────────────────

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { username, password, displayName, permissions } = body;

  if (!username || !password) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "Username already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const newUser = await db.user.create({
    data: {
      username,
      passwordHash,
      displayName: displayName ?? null,
      role: "USER",
      mustChangePassword: true,
      permissions: permissions
        ? {
            create: {
              dockerAccess: permissions.dockerAccess ?? false,
              dockerViewAll: permissions.dockerViewAll ?? false,
              dockerImages: permissions.dockerImages ?? false,
              dockerVolumes: permissions.dockerVolumes ?? false,
              dockerNetworks: permissions.dockerNetworks ?? false,
              dockerCreate: permissions.dockerCreate ?? false,
              dockerDelete: permissions.dockerDelete ?? false,
              fsAccess: permissions.fsAccess ?? false,
              terminalAccess: permissions.terminalAccess ?? false,
              terminalReadOnly: permissions.terminalReadOnly ?? true,
              terminalMaxSessions: permissions.terminalMaxSessions ?? 1,
            },
          }
        : {
            create: {},
          },
    },
  });

  await writeAuditLog(
    { userId: currentUser.id, username: currentUser.username, role: currentUser.role, sessionId: "" },
    "CREATE_USER",
    `user:${newUser.id}`,
    `Created: ${username}`,
    true,
    req
  );

  return NextResponse.json({ user: { id: newUser.id, username: newUser.username } }, { status: 201 });
}
