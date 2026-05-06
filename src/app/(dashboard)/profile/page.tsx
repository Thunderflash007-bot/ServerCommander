"use client";

import { useEffect, useState } from "react";

type ProfileUser = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  twoFactorEnabled: boolean;
  smtpEnabled: boolean;
};

export default function ProfilePage() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [email, setEmail] = useState("");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/auth/profile", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = (await res.json()) as { user: ProfileUser };
      setUser(data.user);
      setEmail(data.user.email ?? "");
      setTwoFactorEnabled(data.user.twoFactorEnabled);
    }
    void load();
  }, []);

  async function saveProfile() {
    setLoading(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, twoFactorEnabled }),
      });
      const data = (await res.json()) as { error?: string; user?: ProfileUser };
      if (!res.ok) {
        setError(data.error ?? "Failed to update profile");
      } else {
        setUser((prev) => (prev ? { ...prev, ...data.user! } : data.user ?? null));
        setStatus("Profile updated");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function requestPasswordReset() {
    if (!user?.smtpEnabled) {
      setError("Password reset by email is disabled by admin.");
      return;
    }

    const identifier = (email || user.username).trim();
    const res = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier }),
    });
    if (res.ok) {
      window.location.href = "/reset-password";
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Failed to send reset code");
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account security settings.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="text-sm text-muted-foreground">User: <span className="text-foreground font-medium">{user?.username ?? "..."}</span></div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={twoFactorEnabled}
            onChange={(e) => setTwoFactorEnabled(e.target.checked)}
            className="rounded border-border"
          />
          Enable 2FA via email code
        </label>

        {!user?.smtpEnabled && (
          <p className="text-xs text-amber-300">SMTP is disabled. 2FA and email reset are unavailable.</p>
        )}

        {status && <p className="text-xs text-emerald-400">{status}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => void saveProfile()}
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => void requestPasswordReset()}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Reset password via code
          </button>
        </div>
      </div>
    </div>
  );
}
