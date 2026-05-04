import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// ── PUT /api/users/[id]/fs-perms — bulk-replace filesystem path permissions ───

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { paths } = body as {
    paths: Array<{
      path: string;
      readOnly?: boolean;
      canCreate?: boolean;
      canDelete?: boolean;
    }>;
  };

  const userPerm = await db.userPermission.findUnique({ where: { userId: id } });
  if (!userPerm) return NextResponse.json({ error: "Permission record not found" }, { status: 404 });

  // Validate paths — prevent directory traversal
  for (const p of paths) {
    const normalized = p.path.replace(/\.\./g, "");
    if (normalized !== p.path || !p.path.startsWith("/")) {
      return NextResponse.json(
        { error: `Invalid path: ${p.path}` },
        { status: 400 }
      );
    }
  }

  await db.$transaction([
    db.fsPathPermission.deleteMany({ where: { permissionId: userPerm.id } }),
    db.fsPathPermission.createMany({
      data: paths.map((p) => ({
        permissionId: userPerm.id,
        path: p.path,
        readOnly: p.readOnly ?? true,
        canCreate: p.canCreate ?? false,
        canDelete: p.canDelete ?? false,
      })),
    }),
  ]);

  return NextResponse.json({ success: true });
}
