"use client";

import { useEffect, useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";

type RegistrySummary = {
  id: string;
  name: string;
  server: string;
  username: string;
  updatedAt: string;
};

type Props = {
  enabled: boolean;
};

export function RegistryManager({ enabled }: Props) {
  const [registries, setRegistries] = useState<RegistrySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", server: "", username: "", password: "" });

  async function parseResponse(res: Response) {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { error: text.slice(0, 200) || "Unexpected server response" };
    }
  }

  async function loadRegistries() {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/docker/registries", { credentials: "same-origin" });
      const data = await parseResponse(res);
      if (!res.ok) {
        setError(String(data.error ?? "Failed to load registries"));
        return;
      }
      setRegistries((data.registries as RegistrySummary[] | undefined) ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRegistries();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  async function handleSave() {
    setError(null);
    const res = await fetch("/api/docker/registries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(form),
    });
    const data = await parseResponse(res);
    if (!res.ok) {
      setError(String(data.error ?? "Failed to save registry"));
      return;
    }
    setForm({ name: "", server: "", username: "", password: "" });
    await loadRegistries();
  }

  async function handleDelete(id: string) {
    setError(null);
    const res = await fetch(`/api/docker/registries?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const data = await parseResponse(res);
    if (!res.ok) {
      setError(String(data.error ?? "Failed to delete registry"));
      return;
    }
    await loadRegistries();
  }

  if (!enabled) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <KeyRound className="w-4 h-4 text-primary" />
            Private Registries
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Store registry endpoints for Docker Hub, GHCR and self-hosted registries. Credentials are encrypted with ENCRYPTION_KEY.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="Registry name"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          value={form.server}
          onChange={(event) => setForm((current) => ({ ...current, server: event.target.value }))}
          placeholder="ghcr.io"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          value={form.username}
          onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
          placeholder="Username"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          type="password"
          value={form.password}
          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          placeholder="Password or token"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => void handleSave()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <Plus className="w-4 h-4" />
          Registry speichern
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {registries.map((registry) => (
          <div key={registry.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/10 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground">{registry.name}</div>
              <div className="text-xs text-muted-foreground">
                {registry.server} · {registry.username}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(registry.updatedAt).toLocaleString()}
            </div>
            <button
              onClick={() => void handleDelete(registry.id)}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Entfernen
            </button>
          </div>
        ))}
        {registries.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            No private registries stored yet.
          </div>
        )}
      </div>
    </div>
  );
}