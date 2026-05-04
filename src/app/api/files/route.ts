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

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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
  const mode = searchParams.get("mode") ?? "list";

  // Virtual path (relative to host root) used for RBAC checks
  const virtualPath = requestedPath.startsWith("/") ? requestedPath : "/" + requestedPath;

  if (!canReadPath(perms, virtualPath)) {
    return NextResponse.json({ error: "Permission denied for this path" }, { status: 403 });
  }

  try {
    const realPath = resolveSafePath(virtualPath);
    const stat = await fs.stat(realPath);

    if (mode === "download") {
      if (!stat.isFile()) {
        return jsonError("Only files can be downloaded", 400);
      }
      const file = await fs.readFile(realPath);
      return new NextResponse(file, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(path.basename(realPath))}"`,
        },
      });
    }

    if (mode === "content") {
      if (!stat.isFile()) {
        return jsonError("Only files have editable content", 400);
      }
      const content = await fs.readFile(realPath, "utf-8");
      return NextResponse.json({ path: virtualPath, content, size: stat.size, modified: stat.mtime.toISOString() });
    }

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

// ── POST /api/files — upload/create directory/create file ────────────────────

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessFilesystem(perms)) {
    return jsonError("Filesystem access denied", 403);
  }

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const targetDir = String(formData.get("path") ?? "/");
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("file is required", 400);
    }

    const virtualDir = targetDir.startsWith("/") ? targetDir : `/${targetDir}`;
    if (!canCreateInPath(perms, virtualDir)) {
      return jsonError("Create permission denied", 403);
    }

    const realDir = resolveSafePath(virtualDir);
    const realPath = path.join(realDir, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(realPath, buffer);
    return NextResponse.json({ success: true, path: toVirtualPath(realPath) });
  }

  const body = await req.json();
  const action = String(body.action ?? "");
  const requestedPath = String(body.path ?? "/");
  const virtualPath = requestedPath.startsWith("/") ? requestedPath : `/${requestedPath}`;

  if (!canCreateInPath(perms, virtualPath)) {
    return jsonError("Create permission denied", 403);
  }

  const realPath = resolveSafePath(virtualPath);

  if (action === "mkdir") {
    await fs.mkdir(realPath, { recursive: true });
    return NextResponse.json({ success: true, path: virtualPath });
  }

  if (action === "create-file") {
    await fs.writeFile(realPath, String(body.content ?? ""), "utf-8");
    return NextResponse.json({ success: true, path: virtualPath });
  }

  return jsonError("Unknown action", 400);
}

// ── PATCH /api/files — rename or save file contents ──────────────────────────

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessFilesystem(perms)) {
    return jsonError("Filesystem access denied", 403);
  }

  const body = await req.json();
  const action = String(body.action ?? "");
  const requestedPath = String(body.path ?? "");

  if (!requestedPath) return jsonError("path required", 400);

  const virtualPath = requestedPath.startsWith("/") ? requestedPath : `/${requestedPath}`;
  const realPath = resolveSafePath(virtualPath);

  if (action === "rename") {
    const nextName = String(body.name ?? "").trim();
    if (!nextName) return jsonError("name required", 400);
    const targetVirtualPath = path.posix.join(path.posix.dirname(virtualPath), nextName);

    if (!canWritePath(perms, virtualPath) || !canCreateInPath(perms, path.posix.dirname(targetVirtualPath))) {
      return jsonError("Rename permission denied", 403);
    }

    await fs.rename(realPath, resolveSafePath(targetVirtualPath));
    return NextResponse.json({ success: true, path: targetVirtualPath });
  }

  if (action === "save") {
    if (!canWritePath(perms, virtualPath)) {
      return jsonError("Write permission denied", 403);
    }
    await fs.writeFile(realPath, String(body.content ?? ""), "utf-8");
    return NextResponse.json({ success: true, path: virtualPath });
  }

  return jsonError("Unknown action", 400);
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
