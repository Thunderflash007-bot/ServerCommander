import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessFilesystem, canReadPath, canWritePath, canCreateInPath, canDeleteInPath } from "@/lib/rbac";
import type { FullPermissions } from "@/lib/rbac";
import fs from "fs/promises";
import path from "path";

const HOST_MOUNT = process.env.HOST_FS_MOUNT ?? "/host_system";

function resolveSafePath(requestedPath: string): string {
  // Ensure path stays within the host mount
  const normalized = path.normalize(path.join(HOST_MOUNT, requestedPath));
  if (!normalized.startsWith(HOST_MOUNT)) {
    throw new Error("Path traversal detected");
  }
  return normalized;
}

function toVirtualPath(absolutePath: string): string {
  return absolutePath.substring(HOST_MOUNT.length) || "/";
}

// ── GET /api/files?path=/some/dir ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = user.permissions as FullPermissions | null;

  if (!canAccessFilesystem(perms)) {
    return NextResponse.json({ error: "Filesystem access denied" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const requestedPath = searchParams.get("path") ?? "/";

  // Virtual path (relative to host root) used for RBAC checks
  const virtualPath = requestedPath.startsWith("/") ? requestedPath : "/" + requestedPath;

  if (!canReadPath(perms, virtualPath)) {
    return NextResponse.json({ error: "Permission denied for this path" }, { status: 403 });
  }

  try {
    const realPath = resolveSafePath(virtualPath);
    const stat = await fs.stat(realPath);

    if (stat.isDirectory()) {
      const entries = await fs.readdir(realPath, { withFileTypes: true });
      const items = await Promise.all(
        entries.map(async (entry) => {
          const childVirtualPath = path.join(virtualPath, entry.name);
          try {
            const childStat = await fs.stat(path.join(realPath, entry.name));
            return {
              name: entry.name,
              path: childVirtualPath,
              type: entry.isDirectory() ? "directory" : "file",
              size: childStat.size,
              modified: childStat.mtime.toISOString(),
              canRead: canReadPath(perms, childVirtualPath),
              canWrite: canWritePath(perms, childVirtualPath),
            };
          } catch {
            return null;
          }
        })
      );

      return NextResponse.json({
        path: virtualPath,
        type: "directory",
        entries: items.filter(Boolean),
      });
    } else {
      // Return file metadata; actual download via separate endpoint
      return NextResponse.json({
        path: virtualPath,
        type: "file",
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Path not found" }, { status: 404 });
    }
    if (err instanceof Error && err.message === "Path traversal detected") {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    return NextResponse.json({ error: "Filesystem error" }, { status: 500 });
  }
}

// ── DELETE /api/files?path=/some/file ─────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessFilesystem(perms)) {
    return NextResponse.json({ error: "Filesystem access denied" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const requestedPath = searchParams.get("path") ?? "";
  if (!requestedPath) return NextResponse.json({ error: "path required" }, { status: 400 });

  const virtualPath = requestedPath.startsWith("/") ? requestedPath : "/" + requestedPath;

  if (!canDeleteInPath(perms, virtualPath)) {
    return NextResponse.json({ error: "Delete permission denied" }, { status: 403 });
  }

  try {
    const realPath = resolveSafePath(virtualPath);
    const stat = await fs.stat(realPath);
    if (stat.isDirectory()) {
      await fs.rm(realPath, { recursive: true });
    } else {
      await fs.unlink(realPath);
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
