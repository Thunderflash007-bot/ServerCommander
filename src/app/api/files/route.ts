import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessFilesystem, canReadPath, canWritePath, canCreateInPath, canDeleteInPath } from "@/lib/rbac";
import type { FullPermissions } from "@/lib/rbac";
import { isSshBackendEnabled, normalizeVirtualPath, resolveRemotePath, statRemotePath, withSftpClient } from "@/lib/remote-files";
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

function isNotFoundError(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException;
  const msg = String((err as Error)?.message ?? "").toLowerCase();
  return e?.code === "ENOENT" || msg.includes("no such file") || msg.includes("not found");
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") return Buffer.from(value, "utf-8");
  throw new Error("Unsupported file payload format from backend");
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
  const virtualPath = normalizeVirtualPath(requestedPath);

  if (!canReadPath(perms, virtualPath)) {
    return NextResponse.json({ error: "Permission denied for this path" }, { status: 403 });
  }

  try {
    if (await isSshBackendEnabled()) {
      return await withSftpClient(async (sftp) => {
        const remotePath = await resolveRemotePath(virtualPath);
        const stat = await statRemotePath(sftp, remotePath);

        if (mode === "download") {
          if (!stat.isDirectory) {
            const remoteData = await sftp.get(remotePath);
            const file = toBuffer(remoteData);
            return new NextResponse(new Uint8Array(file), {
              status: 200,
              headers: {
                "Content-Type": "application/octet-stream",
                "Content-Disposition": `attachment; filename="${encodeURIComponent(path.basename(remotePath))}"`,
              },
            });
          }
          return jsonError("Only files can be downloaded", 400);
        }

        if (mode === "content") {
          if (stat.isDirectory) {
            return jsonError("Only files have editable content", 400);
          }
          const remoteData = await sftp.get(remotePath);
          const content = toBuffer(remoteData).toString("utf-8");
          return NextResponse.json({
            path: virtualPath,
            content,
            size: stat.size,
            modified: stat.modified.toISOString(),
          });
        }

        if (stat.isDirectory) {
          const entries = await sftp.list(remotePath);
          return NextResponse.json({
            path: virtualPath,
            type: "directory",
            entries: entries.map((entry: { name: string; type: string; size: number; modifyTime: number }) => {
              const childVirtualPath = normalizeVirtualPath(path.posix.join(virtualPath, entry.name));
              return {
                name: entry.name,
                path: childVirtualPath,
                type: entry.type === "d" ? "directory" : "file",
                size: entry.size,
                modified: new Date(entry.modifyTime || Date.now()).toISOString(),
                canRead: canReadPath(perms, childVirtualPath),
                canWrite: canWritePath(perms, childVirtualPath),
              };
            }),
          });
        }

        return NextResponse.json({
          path: virtualPath,
          type: "file",
          size: stat.size,
          modified: stat.modified.toISOString(),
        });
      });
    }

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
    if (isNotFoundError(err)) {
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
    const rawFiles = formData.getAll("file").filter((entry): entry is File => entry instanceof File);
    const relativePaths = formData.getAll("relativePath").map((entry) => String(entry ?? ""));

    if (rawFiles.length === 0) {
      return jsonError("file is required", 400);
    }

    const virtualDir = normalizeVirtualPath(targetDir);
    if (!canCreateInPath(perms, virtualDir)) {
      return jsonError("Create permission denied", 403);
    }

    const uploads = await Promise.all(
      rawFiles.map(async (file, index) => ({
        file,
        relativePath: relativePaths[index] ? normalizeVirtualPath(`/${relativePaths[index]}`) : `/${file.name}`,
        buffer: Buffer.from(await file.arrayBuffer()),
      }))
    );

    if (await isSshBackendEnabled()) {
      await withSftpClient(async (sftp) => {
        const remoteDir = await resolveRemotePath(virtualDir);
        await sftp.mkdir(remoteDir, true);
        for (const upload of uploads) {
          const remotePath = path.posix.join(remoteDir, upload.relativePath.replace(/^\//, ""));
          const remoteParent = path.posix.dirname(remotePath);
          await sftp.mkdir(remoteParent, true);
          await sftp.put(upload.buffer, remotePath);
        }
      });
      return NextResponse.json({ success: true, uploaded: uploads.length });
    }

    const realDir = resolveSafePath(virtualDir);
    for (const upload of uploads) {
      const realPath = path.join(realDir, upload.relativePath.replace(/^\//, ""));
      await fs.mkdir(path.dirname(realPath), { recursive: true });
      await fs.writeFile(realPath, upload.buffer);
    }
    return NextResponse.json({ success: true, uploaded: uploads.length });
  }

  const body = await req.json();
  const action = String(body.action ?? "");
  const requestedPath = String(body.path ?? "/");
  const virtualPath = normalizeVirtualPath(requestedPath);

  if (!canCreateInPath(perms, virtualPath)) {
    return jsonError("Create permission denied", 403);
  }

  if (action === "mkdir") {
    if (await isSshBackendEnabled()) {
      await withSftpClient(async (sftp) => {
        await sftp.mkdir(await resolveRemotePath(virtualPath), true);
      });
    } else {
      await fs.mkdir(resolveSafePath(virtualPath), { recursive: true });
    }
    return NextResponse.json({ success: true, path: virtualPath });
  }

  if (action === "create-file") {
    if (await isSshBackendEnabled()) {
      await withSftpClient(async (sftp) => {
        await sftp.put(Buffer.from(String(body.content ?? ""), "utf-8"), await resolveRemotePath(virtualPath));
      });
    } else {
      await fs.writeFile(resolveSafePath(virtualPath), String(body.content ?? ""), "utf-8");
    }
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

  const virtualPath = normalizeVirtualPath(requestedPath);

  if (action === "rename") {
    const nextName = String(body.name ?? "").trim();
    if (!nextName) return jsonError("name required", 400);
    const targetVirtualPath = path.posix.join(path.posix.dirname(virtualPath), nextName);

    if (!canWritePath(perms, virtualPath) || !canCreateInPath(perms, path.posix.dirname(targetVirtualPath))) {
      return jsonError("Rename permission denied", 403);
    }

    if (await isSshBackendEnabled()) {
      await withSftpClient(async (sftp) => {
        await sftp.rename(await resolveRemotePath(virtualPath), await resolveRemotePath(targetVirtualPath));
      });
    } else {
      await fs.rename(resolveSafePath(virtualPath), resolveSafePath(targetVirtualPath));
    }
    return NextResponse.json({ success: true, path: targetVirtualPath });
  }

  if (action === "save") {
    if (!canWritePath(perms, virtualPath)) {
      return jsonError("Write permission denied", 403);
    }
    if (await isSshBackendEnabled()) {
      await withSftpClient(async (sftp) => {
        await sftp.put(Buffer.from(String(body.content ?? ""), "utf-8"), await resolveRemotePath(virtualPath));
      });
    } else {
      await fs.writeFile(resolveSafePath(virtualPath), String(body.content ?? ""), "utf-8");
    }
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

  const virtualPath = normalizeVirtualPath(requestedPath);

  if (!canDeleteInPath(perms, virtualPath)) {
    return NextResponse.json({ error: "Delete permission denied" }, { status: 403 });
  }

  try {
    if (await isSshBackendEnabled()) {
      await withSftpClient(async (sftp) => {
        const remotePath = await resolveRemotePath(virtualPath);
        const stat = await statRemotePath(sftp, remotePath);
        if (stat.isDirectory) {
          await sftp.rmdir(remotePath, true);
        } else {
          await sftp.delete(remotePath);
        }
      });
    } else {
      const realPath = resolveSafePath(virtualPath);
      const stat = await fs.stat(realPath);
      if (stat.isDirectory()) {
        await fs.rm(realPath, { recursive: true });
      } else {
        await fs.unlink(realPath);
      }
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
