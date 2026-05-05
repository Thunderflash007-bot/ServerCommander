"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface PermissionGroupActionsProps {
  groupId: string;
  assignmentCount: number;
}

export function PermissionGroupActions({ groupId, assignmentCount }: PermissionGroupActionsProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function unassignAll() {
    if (assignmentCount === 0) return;
    if (!confirm(`Alle ${assignmentCount} User von dieser Gruppe entfernen?`)) return;

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/permission-groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "unassign-all-users" }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Unassign failed");
      }

      setSuccess(`Alle ${assignmentCount} User wurden entfernt.`);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unassign failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => void unassignAll()}
        disabled={busy || assignmentCount === 0}
        className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
      >
        {busy ? "Removing..." : "Unassign all users"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {success && <p className="text-xs text-emerald-400">{success}</p>}
    </div>
  );
}
