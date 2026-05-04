"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Play, Square, RotateCcw, Trash2 } from "lucide-react";

type Props = {
  id: string;
  isRunning: boolean;
  canStart: boolean;
  canStop: boolean;
  canRestart: boolean;
  canDelete: boolean;
};

async function runAction(id: string, action: string) {
  const res = await fetch(`/api/docker/containers/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `${action} failed`);
  }
}

export function ContainerDetailsActions({ id, isRunning, canStart, canStop, canRestart, canDelete }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onAction(action: string) {
    setError(null);
    try {
      await runAction(id, action);
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!isRunning && canStart && (
          <button
            onClick={() => void onAction("start")}
            disabled={isPending}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-1"><Play className="w-4 h-4" />Start</span>
          </button>
        )}
        {isRunning && canStop && (
          <button
            onClick={() => void onAction("stop")}
            disabled={isPending}
            className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-1"><Square className="w-4 h-4" />Stop</span>
          </button>
        )}
        {canRestart && (
          <button
            onClick={() => void onAction("restart")}
            disabled={isPending}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-accent disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-1"><RotateCcw className="w-4 h-4" />Restart</span>
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => {
              if (confirm("Remove this container?")) {
                void onAction("delete");
              }
            }}
            disabled={isPending}
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/20 disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-1"><Trash2 className="w-4 h-4" />Remove</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
