"use client";

import { useEffect, useState } from "react";

type SystemSettingsForm = {
  sessionMaxAge: number;
  cookieSecure: boolean;
  trustedProxies: string;
  dockerHost: string;
  hostFsSource: string;
  internalRpcSecret: string;
  hasInternalRpcSecret: boolean;
};

const DEFAULT_FORM: SystemSettingsForm = {
  sessionMaxAge: 28800,
  cookieSecure: false,
  trustedProxies: "",
  dockerHost: "tcp://docker-socket-proxy:2375",
  hostFsSource: "/srv/servercommander",
  internalRpcSecret: "",
  hasInternalRpcSecret: false,
};

export default function SystemSettingsPage() {
  const [form, setForm] = useState<SystemSettingsForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/system-settings", { credentials: "same-origin" });
      if (!res.ok) return;

      const data = (await res.json()) as {
        settings?: Omit<SystemSettingsForm, "internalRpcSecret">;
      };
      if (!data.settings) return;

      setForm((prev) => ({
        ...prev,
        ...data.settings,
        internalRpcSecret: "",
      }));
    }

    void load();
  }, []);

  async function save() {
    setSaving(true);
    setStatus(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/system-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        restartRequired?: boolean;
      };

      if (!res.ok) {
        setError(data.error ?? "Failed to save system settings");
      } else {
        setStatus(
          data.restartRequired
            ? "System settings saved. Restart the app/container to apply all changes globally."
            : "System settings saved"
        );
        setForm((prev) => ({ ...prev, internalRpcSecret: "" }));
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Network error";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Security Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure setup-level runtime security options after installation.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Session max age (seconds)</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
              type="number"
              min={300}
              max={604800}
              value={form.sessionMaxAge}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, sessionMaxAge: parseInt(event.target.value, 10) || 0 }))
              }
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Cookie secure</span>
            <div className="rounded-md border border-input bg-background px-3 py-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.cookieSecure}
                  onChange={(event) => setForm((prev) => ({ ...prev, cookieSecure: event.target.checked }))}
                />
                <span>Require HTTPS for auth cookie</span>
              </label>
            </div>
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs text-muted-foreground">Trusted proxies (comma-separated IPs)</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
              placeholder="127.0.0.1,10.0.0.2"
              value={form.trustedProxies}
              onChange={(event) => setForm((prev) => ({ ...prev, trustedProxies: event.target.value }))}
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs text-muted-foreground">Docker host endpoint</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
              placeholder="tcp://docker-socket-proxy:2375"
              value={form.dockerHost}
              onChange={(event) => setForm((prev) => ({ ...prev, dockerHost: event.target.value }))}
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs text-muted-foreground">Host filesystem source</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
              placeholder="/srv/servercommander"
              value={form.hostFsSource}
              onChange={(event) => setForm((prev) => ({ ...prev, hostFsSource: event.target.value }))}
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs text-muted-foreground">Internal RPC secret (optional rotate)</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
              type="password"
              placeholder={form.hasInternalRpcSecret ? "Leave empty to keep current secret" : "Set a secret (min 32 chars)"}
              value={form.internalRpcSecret}
              onChange={(event) => setForm((prev) => ({ ...prev, internalRpcSecret: event.target.value }))}
            />
          </label>
        </div>

        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">
          <p>Some settings are applied immediately for new requests, but full consistency needs a container/app restart.</p>
          <p>Rotate INTERNAL_RPC_SECRET only if all internal callers are updated and restart follows.</p>
        </div>

        {status && <p className="text-xs text-emerald-400">{status}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save System Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}