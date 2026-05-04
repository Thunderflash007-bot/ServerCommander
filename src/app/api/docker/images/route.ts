import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listImages, removeImage } from "@/lib/docker";
import { canAccessDocker, canManageImages } from "@/lib/rbac";
import type { FullPermissions } from "@/lib/rbac";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const perms = user.permissions as FullPermissions | null;
  if (!canAccessDocker(perms) || !canManageImages(perms)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const images = await listImages();
  return NextResponse.json({ images });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const perms = user.permissions as FullPermissions | null;
  if (!canAccessDocker(perms) || !canManageImages(perms)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const { id, force } = await req.json();
  await removeImage(id, force ?? false);
  return NextResponse.json({ success: true });
}
