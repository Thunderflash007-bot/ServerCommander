"use client";

import { useEffect, useState } from "react";

type SmtpForm = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  useAlias: boolean;
  hasPassword?: boolean;
};

export default function SmtpSettingsPage() {
  const [form, setForm] = useState<SmtpForm>({
    enabled: false,
    host: "",
    port: 587,
    secure: false,
    username: "",
    password: "",
    fromEmail: "",
    fromName: "",
    useAlias: false,
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/smtp-settings", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = (await res.json()) as { smtp: SmtpForm };
      setForm((prev) => ({ ...prev, ...data.smtp, password: "" }));
    }
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/smtp-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to save SMTP settings");
      } else {
        setStatus("SMTP settings saved");
        setForm((prev) => ({ ...prev, password: "" }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">SMTP Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure outbound mail for account notifications, 2FA and password reset.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          Enable SMTP
        </label>

        <div className="grid md:grid-cols-2 gap-3">
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" type="number" placeholder="Port" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) || 0 })} />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" type="password" placeholder={form.hasPassword ? "Password (leave empty to keep)" : "Password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="From email" value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="From alias name" value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} />
            Secure (SSL/TLS)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.useAlias} onChange={(e) => setForm({ ...form, useAlias: e.target.checked })} />
            Use alias sender name
          </label>
        </div>

        {status && <p className="text-xs text-emerald-400">{status}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}

        <button onClick={() => void save()} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
          {saving ? "Saving..." : "Save SMTP"}
        </button>
      </div>
    </div>
  );
}
