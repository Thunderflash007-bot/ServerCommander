"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  Trash2,
  RefreshCw,
  Lock,
} from "lucide-react";
import type { FullPermissions } from "@/lib/rbac";
import { canReadPath, canDeleteInPath } from "@/lib/rbac";

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
                    {isDeletable && (
                      <button
                        onClick={() => handleDelete(entry)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
        </ul>
      </div>
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
