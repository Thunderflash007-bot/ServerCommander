"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, RotateCcw, Trash2, FileText, Eye, TerminalSquare } from "lucide-react";
import type { ContainerSummary } from "@/lib/docker";
import type { FullPermissions } from "@/lib/rbac";
import {
  canStartContainer,
  canStopContainer,
  canRestartContainer,
  canDeleteContainer,
  canViewLogs,
  canInspectContainer,
  canExecContainer,
} from "@/lib/rbac";

interface ContainerTableProps {
  containers: ContainerSummary[];
  permissions: FullPermissions | null;
  compact?: boolean;
}

function StateChip({ state }: { state: string }) {
  const map: Record<string, string> = {
    running: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    exited: "bg-red-500/15 text-red-400 border-red-500/20",
    paused: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    restarting: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    dead: "bg-red-500/15 text-red-400 border-red-500/20",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${map[state] ?? "bg-muted text-muted-foreground"}`}
    >
      {state}
    </span>
  );
}

async function doAction(id: string, action: string) {
  const res = await fetch(`/api/docker/containers/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? action + " failed");
  }
}

export function ContainerTable({ containers, permissions, compact }: ContainerTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(id: string, action: string) {
    setError(null);
    setActionId(`${id}:${action}`);
    try {
      await doAction(id, action);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {error && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Image</th>
              {!compact && <th className="text-left px-4 py-3 font-medium text-muted-foreground">ID</th>}
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {containers.map((c) => {
              const busy = isPending && actionId?.startsWith(c.id);
              return (
                <tr key={c.id} className="hover:bg-muted/20 transition">
                  <td className="px-4 py-3 font-mono font-medium text-foreground">
                    {c.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[180px]">
                    {c.image}
                  </td>
                  {!compact && (
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {c.shortId}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <StateChip state={c.state} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {canStartContainer(permissions, c.id) && c.state !== "running" && (
                        <ActionButton
                          onClick={() => handleAction(c.id, "start")}
                          disabled={!!busy}
                          title="Start"
                          variant="success"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </ActionButton>
                      )}
                      {canStopContainer(permissions, c.id) && c.state === "running" && (
                        <ActionButton
                          onClick={() => handleAction(c.id, "stop")}
                          disabled={!!busy}
                          title="Stop"
                          variant="warning"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </ActionButton>
                      )}
                      {canRestartContainer(permissions, c.id) && (
                        <ActionButton
                          onClick={() => handleAction(c.id, "restart")}
                          disabled={!!busy}
                          title="Restart"
                          variant="default"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </ActionButton>
                      )}
                      {canViewLogs(permissions, c.id) && (
                        <ActionButton
                          onClick={() => router.push(`/containers/${c.id}/logs`)}
                          disabled={!!busy}
                          title="Logs"
                          variant="default"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </ActionButton>
                      )}
                      {canInspectContainer(permissions, c.id) && (
                        <ActionButton
                          onClick={() => router.push(`/containers/${c.id}`)}
                          disabled={!!busy}
                          title="Inspect"
                          variant="default"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </ActionButton>
                      )}
                      {canExecContainer(permissions, c.id) && (
                        <ActionButton
                          onClick={() => router.push(`/containers/${c.id}/console`)}
                          disabled={!!busy}
                          title="Console"
                          variant="default"
                        >
                          <TerminalSquare className="w-3.5 h-3.5" />
                        </ActionButton>
                      )}
                      {canDeleteContainer(permissions, c.id) && (
                        <ActionButton
                          onClick={() => {
                            if (confirm(`Remove container "${c.name}"?`))
                              handleAction(c.id, "delete");
                          }}
                          disabled={!!busy}
                          title="Remove"
                          variant="destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </ActionButton>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {containers.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">No containers found.</div>
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  title,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  title: string;
  variant: "success" | "warning" | "destructive" | "default";
}) {
  const styles = {
    success: "text-emerald-400 hover:bg-emerald-500/10",
    warning: "text-yellow-400 hover:bg-yellow-500/10",
    destructive: "text-red-400 hover:bg-red-500/10",
    default: "text-muted-foreground hover:text-foreground hover:bg-accent",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-md transition disabled:opacity-40 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
