"use client";

import { useEffect, useState } from "react";

type ForwardEntry = {
  id: string;
  hostPort: number;
  containerPort: number;
  status: string;
};

type Props = {
  id: string;
  currentName: string;
  restartPolicy: string;
  canEdit: boolean;
};

type AutoUpdatePolicy = {
  enabled: boolean;
  intervalMinutes: number;
  lastCheckedAt: string | null;
  lastUpdatedAt: string | null;
  lastStatus: string | null;
};

export function ContainerEditPanel({ id, currentName, restartPolicy, canEdit }: Props) {
  const [name, setName] = useState(currentName);
  const [policy, setPolicy] = useState(restartPolicy || "no");
  const [hostPort, setHostPort] = useState("");
  const [containerPort, setContainerPort] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [forwards, setForwards] = useState<ForwardEntry[]>([]);
  const [autoUpdate, setAutoUpdate] = useState<AutoUpdatePolicy>({
    enabled: false,
    intervalMinutes: 15,
    lastCheckedAt: null,
    lastUpdatedAt: null,
    lastStatus: null,
  });

  async function loadForwards() {
    const res = await fetch(`/api/docker/containers/${id}?type=port-forwards`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setForwards((data.forwards ?? []) as ForwardEntry[]);
    }
  }

  async function loadAutoUpdate() {
    const res = await fetch(`/api/docker/containers/${id}?type=auto-update`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.policy) {
      setAutoUpdate(data.policy as AutoUpdatePolicy);
    }
  }

  useEffect(() => {
    void loadForwards();
    void loadAutoUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  async function addForward() {
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await fetch(`/api/docker/containers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "port-forward-add",
        hostPort: Number(hostPort),
        containerPort: Number(containerPort),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Port forwarding add failed");
      return;
    }
    setHostPort("");
    setContainerPort("");
    setOk("Port forwarding created");
    await loadForwards();
  }

  async function removeForward(forwardId: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await fetch(`/api/docker/containers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "port-forward-remove", forwardId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Port forwarding remove failed");
      return;
    }
    setOk("Port forwarding removed");
    await loadForwards();
  }

  async function saveAutoUpdate() {
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await fetch(`/api/docker/containers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "auto-update",
        enabled: autoUpdate.enabled,
        intervalMinutes: autoUpdate.intervalMinutes,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Auto-update configuration failed");
      return;
    }
    setOk("Auto-update policy saved");
    await loadAutoUpdate();
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

      <div className="space-y-3 rounded-lg border border-border/70 p-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Port Forwarding (Portainer-style)</h3>
          <p className="text-xs text-muted-foreground mt-1">Creates managed TCP forwards via sidecar helper containers.</p>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <input
            value={hostPort}
            onChange={(event) => setHostPort(event.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Host Port (e.g. 8080)"
            disabled={!canEdit || busy}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            value={containerPort}
            onChange={(event) => setContainerPort(event.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Container Port (e.g. 80)"
            disabled={!canEdit || busy}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={() => void addForward()}
            disabled={!canEdit || busy || !hostPort || !containerPort}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            Add Forward
          </button>
        </div>

        <div className="space-y-2">
          {forwards.length === 0 ? (
            <p className="text-xs text-muted-foreground">No managed forwards configured.</p>
          ) : (
            forwards.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <div>
                  <span className="font-mono">{entry.hostPort} -&gt; {entry.containerPort}/tcp</span>
                  <span className="ml-2 text-xs text-muted-foreground">{entry.status}</span>
                </div>
                <button
                  onClick={() => void removeForward(entry.id)}
                  disabled={!canEdit || busy}
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border/70 p-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Auto-Update</h3>
          <p className="text-xs text-muted-foreground mt-1">Watchtower-like polling that pulls the image and recreates or redeploys the container when a newer image is available.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-[auto_160px_auto] md:items-center">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={autoUpdate.enabled}
              disabled={!canEdit || busy}
              onChange={(event) => setAutoUpdate((current) => ({ ...current, enabled: event.target.checked }))}
            />
            Enable auto-update for this container
          </label>
          <input
            type="number"
            min={5}
            max={1440}
            value={autoUpdate.intervalMinutes}
            disabled={!canEdit || busy}
            onChange={(event) => setAutoUpdate((current) => ({ ...current, intervalMinutes: parseInt(event.target.value, 10) || 15 }))}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={() => void saveAutoUpdate()}
            disabled={!canEdit || busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            Save Policy
          </button>
        </div>

        <div className="grid gap-2 md:grid-cols-3 text-xs text-muted-foreground">
          <div>Last check: {autoUpdate.lastCheckedAt ? new Date(autoUpdate.lastCheckedAt).toLocaleString() : "never"}</div>
          <div>Last update: {autoUpdate.lastUpdatedAt ? new Date(autoUpdate.lastUpdatedAt).toLocaleString() : "never"}</div>
          <div>Status: {autoUpdate.lastStatus ?? "idle"}</div>
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      {ok && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{ok}</div>}
    </div>
  );
}
