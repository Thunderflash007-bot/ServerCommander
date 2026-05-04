"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronRight,
  FolderOpen,
  FileText,
  Trash2,
  RefreshCw,
  Lock,
  Download,
  Upload,
  Pencil,
  FolderPlus,
  FilePlus,
} from "lucide-react";
import type { FullPermissions } from "@/lib/rbac";
import { canReadPath, canDeleteInPath, canCreateInPath, canWritePath } from "@/lib/rbac";

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modified?: string;
  canRead?: boolean;
  canWrite?: boolean;
}

interface FileExplorerProps {
  permissions: FullPermissions | null;
}

export function FileExplorer({ permissions }: FileExplorerProps) {
  const [currentPath, setCurrentPath] = useState("/");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [pendingName, setPendingName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPath = useCallback(
    async (p: string) => {
      if (!canReadPath(permissions, p)) {
        setError("You do not have permission to access this path.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/files?path=${encodeURIComponent(p)}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error);
          return;
        }
        const data = await res.json();
        setCurrentPath(p);
        setEntries(data.entries ?? []);
      } catch {
        setError("Failed to load directory.");
      } finally {
        setLoading(false);
      }
    },
    [permissions]
  );

  useEffect(() => {
    // Find the first readable path from permissions or default to /
    if (permissions?.fsPathPerms?.length) {
      loadPath(permissions.fsPathPerms[0].path);
    } else {
      loadPath("/");
    }
  }, [permissions, loadPath]);

  async function handleDelete(entry: FileEntry) {
    if (!canDeleteInPath(permissions, entry.path)) return;
    if (!confirm(`Delete "${entry.name}"?`)) return;
    const res = await fetch(`/api/files?path=${encodeURIComponent(entry.path)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      loadPath(currentPath);
    } else {
      const data = await res.json();
      setError(data.error);
    }
  }

  async function handleDownload(entry: FileEntry) {
    const res = await fetch(`/api/files?path=${encodeURIComponent(entry.path)}&mode=download`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Download failed" }));
      setError(data.error ?? "Download failed");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = entry.name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function openEditor(entry: FileEntry) {
    const res = await fetch(`/api/files?path=${encodeURIComponent(entry.path)}&mode=content`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to open file");
      return;
    }
    setEditingFile({ path: entry.path, name: entry.name, content: data.content ?? "" });
  }

  async function saveEditor() {
    if (!editingFile) return;
    const res = await fetch("/api/files", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", path: editingFile.path, content: editingFile.content }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Save failed");
      return;
    }
    setEditingFile(null);
    loadPath(currentPath);
  }

  async function renameEntry(entry: FileEntry) {
    const nextName = prompt("New name", entry.name);
    if (!nextName || nextName === entry.name) return;
    const res = await fetch("/api/files", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", path: entry.path, name: nextName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Rename failed");
      return;
    }
    loadPath(currentPath);
  }

  async function createDirectory() {
    const name = prompt("Folder name");
    if (!name) return;
    const target = `${currentPath.replace(/\/$/, "")}/${name}`;
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mkdir", path: target }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Create folder failed");
      return;
    }
    loadPath(currentPath);
  }

  async function createFile() {
    const name = prompt("File name");
    if (!name) return;
    const target = `${currentPath.replace(/\/$/, "")}/${name}`;
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-file", path: target, content: "" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Create file failed");
      return;
    }
    loadPath(currentPath);
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    const formData = new FormData();
    formData.append("path", currentPath);
    formData.append("file", files[0]);
    const res = await fetch("/api/files", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      return;
    }
    loadPath(currentPath);
  }

  // Breadcrumbs
  const parts = currentPath.split("/").filter(Boolean);

  return (
    <div className="flex flex-col h-full rounded-xl border border-border overflow-hidden bg-card">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 bg-muted/20 shrink-0">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-x-auto">
          <button
            onClick={() => loadPath("/")}
            className="text-muted-foreground hover:text-foreground transition shrink-0"
          >
            /
          </button>
          {parts.map((part, i) => {
            const path = "/" + parts.slice(0, i + 1).join("/");
            return (
              <span key={path} className="flex items-center gap-1 shrink-0">
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                <button
                  onClick={() => loadPath(path)}
                  className="text-muted-foreground hover:text-foreground transition"
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>
        <button
          onClick={() => loadPath(currentPath)}
          disabled={loading}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition disabled:opacity-40 shrink-0"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        {canCreateInPath(permissions, currentPath) && (
          <>
            <button
              onClick={createDirectory}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-accent transition shrink-0"
            >
              <span className="inline-flex items-center gap-1"><FolderPlus className="w-3.5 h-3.5" />Folder</span>
            </button>
            <button
              onClick={createFile}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-accent transition shrink-0"
            >
              <span className="inline-flex items-center gap-1"><FilePlus className="w-3.5 h-3.5" />File</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-accent transition shrink-0"
            >
              <span className="inline-flex items-center gap-1"><Upload className="w-3.5 h-3.5" />Upload</span>
            </button>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => void handleUpload(event.target.files)}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="m-4 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {!error && entries.length === 0 && !loading && (
          <div className="text-center py-16 text-muted-foreground text-sm">
            This directory is empty.
          </div>
        )}
        <ul className="divide-y divide-border">
          {entries
            .sort((a, b) => {
              if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .map((entry) => {
              const isReadable = canReadPath(permissions, entry.path);
              const isDeletable = canDeleteInPath(permissions, entry.path);

              return (
                <li key={entry.path} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition group">
                  {/* Icon */}
                  <div className="text-muted-foreground shrink-0">
                    {entry.type === "directory" ? (
                      <FolderOpen className="w-4 h-4 text-blue-400" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    {entry.type === "directory" && isReadable ? (
                      <button
                        onClick={() => loadPath(entry.path)}
                        className="text-sm text-foreground hover:text-primary transition truncate block"
                      >
                        {entry.name}
                      </button>
                    ) : (
                      <span className={`text-sm truncate block ${isReadable ? "text-foreground" : "text-muted-foreground"}`}>
                        {entry.name}
                        {!isReadable && <Lock className="inline w-3 h-3 ml-1 opacity-50" />}
                      </span>
                    )}
                    {entry.modified && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.modified).toLocaleString()}
                        {entry.size !== undefined && ` · ${formatSize(entry.size)}`}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1 shrink-0">
                    {entry.type === "file" && isReadable && (
                      <button
                        onClick={() => handleDownload(entry)}
                        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    {entry.type === "file" && canWritePath(permissions, entry.path) && (
                      <button
                        onClick={() => openEditor(entry)}
                        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {canWritePath(permissions, entry.path) && (
                      <button
                        onClick={() => renameEntry(entry)}
                        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition"
                        title="Rename"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {isDeletable && (
                      <button
                        onClick={() => handleDelete(entry)}
                        className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
        </ul>
      </div>

      {editingFile && (
        <div className="absolute inset-0 z-10 flex flex-col bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Edit File</div>
              <div className="text-xs text-muted-foreground font-mono">{editingFile.path}</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditingFile(null)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent transition">Cancel</button>
              <button onClick={saveEditor} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition">Save</button>
            </div>
          </div>
          <textarea
            value={editingFile.content}
            onChange={(event) => setEditingFile({ ...editingFile, content: event.target.value })}
            className="min-h-0 flex-1 resize-none bg-background p-4 font-mono text-sm text-foreground outline-none"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let val = bytes;
  let u = 0;
  while (val >= 1024 && u < units.length - 1) {
    val /= 1024;
    u++;
  }
  return `${val.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
}
