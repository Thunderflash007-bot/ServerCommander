"use client";

import { useState } from "react";

type Props = {
  id: string;
  currentName: string;
  restartPolicy: string;
  canEdit: boolean;
};

export function ContainerEditPanel({ id, currentName, restartPolicy, canEdit }: Props) {
  const [name, setName] = useState(currentName);
  const [policy, setPolicy] = useState(restartPolicy || "no");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function updateName() {
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await fetch(`/api/docker/containers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", name }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Rename failed");
      return;
    }
    setOk("Container name updated");
  }

  async function updateRestartPolicy() {
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await fetch(`/api/docker/containers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restart-policy", policy }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Restart policy update failed");
      return;
    }
    setOk("Restart policy updated");
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Edit Container</h2>
        <p className="text-xs text-muted-foreground mt-1">Rename or change restart behavior (container-specific).</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Container Name</label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!canEdit || busy}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={() => void updateName()}
              disabled={!canEdit || busy || !name.trim()}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Restart Policy</label>
          <div className="flex gap-2">
            <select
              value={policy}
              onChange={(event) => setPolicy(event.target.value)}
              disabled={!canEdit || busy}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="no">no</option>
              <option value="always">always</option>
              <option value="unless-stopped">unless-stopped</option>
              <option value="on-failure">on-failure</option>
            </select>
            <button
              onClick={() => void updateRestartPolicy()}
              disabled={!canEdit || busy}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      {ok && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{ok}</div>}
    </div>
  );
}
