import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// ── PUT /api/users/[id]/container-perms — bulk-replace container whitelist ────

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { entries } = body as {
    entries: Array<{
      containerId: string;
      containerName: string;
      canView?: boolean;
      canStart?: boolean;
      canStop?: boolean;
      canRestart?: boolean;
      canDelete?: boolean;
      canLogs?: boolean;
      canExec?: boolean;
      canInspect?: boolean;
    }>;
  };

  const userPerm = await db.userPermission.findUnique({ where: { userId: id } });
  if (!userPerm) return NextResponse.json({ error: "User permission record not found" }, { status: 404 });

  // Use a transaction: delete all existing, insert new ones
  await db.$transaction([
    db.containerPermission.deleteMany({ where: { permissionId: userPerm.id } }),
    db.containerPermission.createMany({
      data: entries.map((e) => ({
        permissionId: userPerm.id,
        containerId: e.containerId,
        containerName: e.containerName,
        canView: e.canView ?? true,
        canStart: e.canStart ?? false,
        canStop: e.canStop ?? false,
        canRestart: e.canRestart ?? false,
        canDelete: e.canDelete ?? false,
        canLogs: e.canLogs ?? false,
        canExec: e.canExec ?? false,
        canInspect: e.canInspect ?? false,
      })),
    }),
  ]);

  return NextResponse.json({ success: true });
}
