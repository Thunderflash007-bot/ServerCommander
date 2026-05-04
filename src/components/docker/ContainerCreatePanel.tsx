"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type PortRow = { hostPort: string; containerPort: string; protocol: "tcp" | "udp" };
type VolumeRow = { source: string; target: string; readOnly: boolean };
type EnvRow = { key: string; value: string };

type SourceContainer = { id: string; name: string; shortId: string };

type Props = {
  images: string[];
  networks: string[];
  sources: SourceContainer[];
};

export function ContainerCreatePanel({ images, networks, sources }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"create" | "duplicate">("create");

  const [name, setName] = useState("");
  const [image, setImage] = useState(images[0] ?? "");
  const [cmd, setCmd] = useState("");
  const [restartPolicyName, setRestartPolicyName] = useState<"no" | "always" | "unless-stopped" | "on-failure">("unless-stopped");
  const [autoStart, setAutoStart] = useState(true);

  const [ports, setPorts] = useState<PortRow[]>([]);
  const [volumes, setVolumes] = useState<VolumeRow[]>([]);
  const [env, setEnv] = useState<EnvRow[]>([]);
  const [selectedNetworks, setSelectedNetworks] = useState<string[]>([]);

  const [duplicateSourceId, setDuplicateSourceId] = useState(sources[0]?.id ?? "");
  const [duplicateName, setDuplicateName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const canSubmitCreate = useMemo(() => name.trim().length > 0 && image.trim().length > 0, [name, image]);
  const canSubmitDuplicate = useMemo(() => duplicateSourceId.trim().length > 0, [duplicateSourceId]);

  async function callApi(payload: unknown) {
    const res = await fetch("/api/docker/containers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? "Request failed");
    }
    return data;
  }

  async function onCreate() {
    setError(null);
    setOk(null);

    const payload = {
      action: "create",
      name,
      image,
      cmd: cmd
        .split("\n")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
      restartPolicyName,
      autoStart,
      env: env
        .filter((entry) => entry.key.trim().length > 0)
        .map((entry) => ({ key: entry.key.trim(), value: entry.value })),
      ports: ports
        .filter((entry) => entry.hostPort && entry.containerPort)
        .map((entry) => ({
          hostPort: Number(entry.hostPort),
          containerPort: Number(entry.containerPort),
          protocol: entry.protocol,
        })),
      volumes: volumes
        .filter((entry) => entry.source.trim() && entry.target.trim())
        .map((entry) => ({
          source: entry.source.trim(),
          target: entry.target.trim(),
          readOnly: entry.readOnly,
        })),
      networks: selectedNetworks,
    };

    try {
      await callApi(payload);
      setOk("Container created successfully");
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function onDuplicate() {
    setError(null);
    setOk(null);

    try {
      await callApi({
        action: "duplicate",
        sourceId: duplicateSourceId,
        name: duplicateName.trim() || undefined,
        autoStart,
      });
      setOk("Container duplicated successfully");
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Container Factory</h2>
          <p className="text-xs text-muted-foreground mt-1">Create or duplicate containers with ports, volumes, env and networks.</p>
        </div>
        <div className="inline-flex rounded-md border border-border p-1">
          <button
            onClick={() => setMode("create")}
            className={`rounded px-3 py-1 text-xs ${mode === "create" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Create
          </button>
          <button
            onClick={() => setMode("duplicate")}
            className={`rounded px-3 py-1 text-xs ${mode === "duplicate" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Duplicate
          </button>
        </div>
      </div>

      {mode === "create" ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="my-app"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Image</span>
              <input
                value={image}
                onChange={(event) => setImage(event.target.value)}
                list="container-images"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="nginx:latest"
              />
              <datalist id="container-images">
                {images.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
            </label>
          </div>

          <label className="space-y-1 text-xs block">
            <span className="text-muted-foreground">Command (one arg per line, optional)</span>
            <textarea
              value={cmd}
              onChange={(event) => setCmd(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-20"
              placeholder="npm\nrun\nstart"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Restart Policy</span>
              <select
                value={restartPolicyName}
                onChange={(event) => setRestartPolicyName(event.target.value as "no" | "always" | "unless-stopped" | "on-failure")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="no">no</option>
                <option value="always">always</option>
                <option value="unless-stopped">unless-stopped</option>
                <option value="on-failure">on-failure</option>
              </select>
            </label>
            <label className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoStart}
                onChange={(event) => setAutoStart(event.target.checked)}
              />
              Start container immediately
            </label>
          </div>

          <section className="space-y-2 rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Environment</h3>
              <button
                onClick={() => setEnv((rows) => [...rows, { key: "", value: "" }])}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
              >
                Add
              </button>
            </div>
            {env.map((row, idx) => (
              <div key={idx} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <input
                  value={row.key}
                  onChange={(event) => setEnv((rows) => rows.map((item, i) => (i === idx ? { ...item, key: event.target.value } : item)))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="KEY"
                />
                <input
                  value={row.value}
                  onChange={(event) => setEnv((rows) => rows.map((item, i) => (i === idx ? { ...item, value: event.target.value } : item)))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="value"
                />
                <button
                  onClick={() => setEnv((rows) => rows.filter((_, i) => i !== idx))}
                  className="rounded border border-destructive/30 bg-destructive/10 px-2 text-xs text-destructive"
                >
                  Remove
                </button>
              </div>
            ))}
          </section>

          <section className="space-y-2 rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Port Mappings</h3>
              <button
                onClick={() => setPorts((rows) => [...rows, { hostPort: "", containerPort: "", protocol: "tcp" }])}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
              >
                Add
              </button>
            </div>
            {ports.map((row, idx) => (
              <div key={idx} className="grid gap-2 md:grid-cols-[1fr_1fr_120px_auto]">
                <input
                  value={row.hostPort}
                  onChange={(event) => setPorts((rows) => rows.map((item, i) => (i === idx ? { ...item, hostPort: event.target.value.replace(/[^0-9]/g, "") } : item)))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Host Port"
                />
                <input
                  value={row.containerPort}
                  onChange={(event) => setPorts((rows) => rows.map((item, i) => (i === idx ? { ...item, containerPort: event.target.value.replace(/[^0-9]/g, "") } : item)))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Container Port"
                />
                <select
                  value={row.protocol}
                  onChange={(event) => setPorts((rows) => rows.map((item, i) => (i === idx ? { ...item, protocol: event.target.value as "tcp" | "udp" } : item)))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="tcp">tcp</option>
                  <option value="udp">udp</option>
                </select>
                <button
                  onClick={() => setPorts((rows) => rows.filter((_, i) => i !== idx))}
                  className="rounded border border-destructive/30 bg-destructive/10 px-2 text-xs text-destructive"
                >
                  Remove
                </button>
              </div>
            ))}
          </section>

          <section className="space-y-2 rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Volume Mounts</h3>
              <button
                onClick={() => setVolumes((rows) => [...rows, { source: "", target: "", readOnly: false }])}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
              >
                Add
              </button>
            </div>
            {volumes.map((row, idx) => (
              <div key={idx} className="grid gap-2 md:grid-cols-[1fr_1fr_100px_auto]">
                <input
                  value={row.source}
                  onChange={(event) => setVolumes((rows) => rows.map((item, i) => (i === idx ? { ...item, source: event.target.value } : item)))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="/host/path"
                />
                <input
                  value={row.target}
                  onChange={(event) => setVolumes((rows) => rows.map((item, i) => (i === idx ? { ...item, target: event.target.value } : item)))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="/container/path"
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={row.readOnly}
                    onChange={(event) => setVolumes((rows) => rows.map((item, i) => (i === idx ? { ...item, readOnly: event.target.checked } : item)))}
                  />
                  Read-only
                </label>
                <button
                  onClick={() => setVolumes((rows) => rows.filter((_, i) => i !== idx))}
                  className="rounded border border-destructive/30 bg-destructive/10 px-2 text-xs text-destructive"
                >
                  Remove
                </button>
              </div>
            ))}
          </section>

          <section className="space-y-2 rounded-lg border border-border/60 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Networks</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {networks.map((network) => {
                const enabled = selectedNetworks.includes(network);
                return (
                  <label key={network} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedNetworks((arr) => [...arr, network]);
                        } else {
                          setSelectedNetworks((arr) => arr.filter((entry) => entry !== network));
                        }
                      }}
                    />
                    {network}
                  </label>
                );
              })}
            </div>
          </section>

          <button
            onClick={() => void onCreate()}
            disabled={isPending || !canSubmitCreate}
            className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {isPending ? "Working..." : "Create Container"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Source Container</span>
              <select
                value={duplicateSourceId}
                onChange={(event) => setDuplicateSourceId(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {sources.length === 0 && <option value="">No source containers</option>}
                {sources.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} ({entry.shortId})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">New Name (optional)</span>
              <input
                value={duplicateName}
                onChange={(event) => setDuplicateName(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="my-copy"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(event) => setAutoStart(event.target.checked)}
            />
            Start duplicated container immediately
          </label>

          <button
            onClick={() => void onDuplicate()}
            disabled={isPending || !canSubmitDuplicate}
            className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {isPending ? "Working..." : "Duplicate Container"}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {ok}
        </div>
      )}
    </div>
  );
}
