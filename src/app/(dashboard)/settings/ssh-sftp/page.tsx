"use client";

import { useEffect, useState } from "react";

type AuthMode = "password" | "key";

type SshForm = {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  sftpRoot: string;
  authMode: AuthMode;
  password: string;
  privateKey: string;
  keyPassphrase: string;
  hasPassword?: boolean;
  hasPrivateKey?: boolean;
  hasPassphrase?: boolean;
};

export default function SshSftpSettingsPage() {
  const [form, setForm] = useState<SshForm>({
    enabled: false,
    host: "",
    port: 22,
    username: "",
    sftpRoot: "/",
    authMode: "password",
    password: "",
    privateKey: "",
    keyPassphrase: "",
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/ssh-settings", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = (await res.json()) as { ssh: SshForm };
      setForm((prev) => ({ ...prev, ...data.ssh, password: "", privateKey: "", keyPassphrase: "" }));
    }
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/ssh-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to save SSH/SFTP settings");
      } else {
        setStatus("SSH/SFTP settings saved");
        setForm((prev) => ({ ...prev, password: "", privateKey: "", keyPassphrase: "" }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/ssh-settings/test", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to test SSH/SFTP");
      } else {
        setStatus("SSH/SFTP connection successful");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">SSH/SFTP Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure remote host access for Terminal and File Explorer, even after initial setup.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          Enable SSH/SFTP backend
        </label>

        <div className="grid md:grid-cols-2 gap-3">
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="SSH host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" type="number" placeholder="SSH port" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) || 0 })} />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="SSH username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="SFTP root (e.g. /var/www)" value={form.sftpRoot} onChange={(e) => setForm({ ...form, sftpRoot: e.target.value })} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Authentication</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="authMode"
                checked={form.authMode === "password"}
                onChange={() => setForm({ ...form, authMode: "password" })}
              />
              Password
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="authMode"
                checked={form.authMode === "key"}
                onChange={() => setForm({ ...form, authMode: "key" })}
              />
              Private key
            </label>
          </div>
        </div>

        {form.authMode === "password" ? (
          <input
            className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
            type="password"
            placeholder={form.hasPassword ? "Password (leave empty to keep)" : "Password"}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        ) : (
          <div className="space-y-3">
            <textarea
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full min-h-32 font-mono"
              placeholder={form.hasPrivateKey ? "Private key (leave empty to keep)" : "Private key (-----BEGIN ...-----)"}
              value={form.privateKey}
              onChange={(e) => setForm({ ...form, privateKey: e.target.value })}
            />
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
              type="password"
              placeholder={form.hasPassphrase ? "Key passphrase (leave empty to keep/none)" : "Key passphrase (optional)"}
              value={form.keyPassphrase}
              onChange={(e) => setForm({ ...form, keyPassphrase: e.target.value })}
            />
          </div>
        )}

        <div className="rounded-lg border border-border/70 bg-background/40 p-3 text-xs text-muted-foreground space-y-1">
          <p>When enabled, host Terminal sessions and Files are routed via SSH/SFTP.</p>
          <p>Container terminal sessions remain Docker exec based and are not affected.</p>
        </div>

        {status && <p className="text-xs text-emerald-400">{status}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button onClick={() => void save()} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
            {saving ? "Saving..." : "Save SSH/SFTP"}
          </button>
          <button
            onClick={() => void testConnection()}
            disabled={testing || !form.enabled}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {testing ? "Testing..." : "Test connection"}
          </button>
        </div>
      </div>
    </div>
  );
}
