"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showResetInfo, setShowResetInfo] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });

      let payload:
        | {
            error?: string;
            user?: { mustChangePassword: boolean };
            requiresTwoFactor?: boolean;
            challengeId?: string;
          }
        | null = null;
      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        payload = (await res.json()) as {
          error?: string;
          user?: { mustChangePassword: boolean };
        };
      } else {
        const text = await res.text();
        payload = { error: text.slice(0, 200) || "Unexpected server response" };
      }

      if (!res.ok) {
        setError(payload?.error ?? "Login failed");
        return;
      }

      if (payload?.requiresTwoFactor && payload.challengeId) {
        setChallengeId(payload.challengeId);
        setRequiresTwoFactor(true);
        return;
      }

      // Store mustChangePassword flag for dashboard
      if (payload?.user?.mustChangePassword) {
        localStorage.setItem("mustChangePassword", "true");
      } else {
        localStorage.removeItem("mustChangePassword");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTwoFactorSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ challengeId, code: twoFactorCode }),
      });

      const payload = (await res.json().catch(() => ({}))) as { error?: string; user?: { mustChangePassword: boolean } };
      if (!res.ok) {
        setError(payload.error ?? "2FA verification failed");
        return;
      }

      if (payload?.user?.mustChangePassword) {
        localStorage.setItem("mustChangePassword", "true");
      } else {
        localStorage.removeItem("mustChangePassword");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const statusRes = await fetch("/api/auth/smtp-status", { credentials: "same-origin" });
      const status = (await statusRes.json().catch(() => ({ enabled: false }))) as { enabled?: boolean };
      if (!status.enabled) {
        setError("Passwort-Reset per E-Mail ist deaktiviert. Bitte Administrator kontaktieren.");
        return;
      }

      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: resetIdentifier }),
      });

      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Reset request failed");
        return;
      }

      router.push("/reset-password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-10 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none [background:radial-gradient(circle_at_25%_20%,rgba(45,212,191,0.22),transparent_38%),radial-gradient(circle_at_80%_15%,rgba(251,146,60,0.18),transparent_32%)]" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/12 border border-primary/30 mb-4 shadow-[0_0_50px_rgba(45,212,191,0.2)]">
            <svg
              className="w-8 h-8 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 0 0 3 3h7.5a3 3 0 0 0 3-3m-13.5 0V9a3 3 0 0 1 3-3h7.5a3 3 0 0 1 3 3v5.25m-4.5-5.25h.008v.008H12V9Z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">ServerCommander OS</h1>
          <p className="text-sm text-muted-foreground mt-2">Secure access to your host, containers and runtime operations</p>
        </div>

        <div className="bg-card/95 backdrop-blur border border-border/80 rounded-2xl p-7 shadow-[0_20px_70px_rgba(0,0,0,0.5)]">
          {requiresTwoFactor ? (
            <form onSubmit={handleTwoFactorSubmit} className="space-y-5">
              <div>
                <label htmlFor="twofactor" className="block text-sm font-medium text-foreground mb-1.5">
                  2FA Code
                </label>
                <input
                  id="twofactor"
                  type="text"
                  required
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  className="w-full rounded-lg border border-input bg-background/70 px-3.5 py-2.5 text-sm"
                  placeholder="6-digit code"
                />
                <p className="text-xs text-muted-foreground mt-2">A 6-digit code was sent to your email.</p>
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? "Verifying..." : "Verify & sign in"}
              </button>
            </form>
          ) : showResetInfo ? (
            <form onSubmit={handleResetRequest} className="space-y-5">
              <div>
                <label htmlFor="reset-identifier" className="block text-sm font-medium text-foreground mb-1.5">
                  Username or Email
                </label>
                <input
                  id="reset-identifier"
                  type="text"
                  required
                  value={resetIdentifier}
                  onChange={(e) => setResetIdentifier(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background/70 px-3.5 py-2.5 text-sm"
                  placeholder="username or email"
                />
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? "Sending code..." : "Send reset code"}
              </button>

              <button
                type="button"
                onClick={() => setShowResetInfo(false)}
                className="w-full rounded-lg border border-input px-4 py-2.5 text-sm"
              >
                Back to login
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-foreground mb-1.5">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/70 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
                placeholder="admin"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/70 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
                placeholder="••••••••"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowResetInfo((current) => !current)}
                  className="text-xs font-medium text-primary hover:text-primary/80 transition"
                >
                  Passwort zurücksetzen
                </button>
              </div>
            </div>

            {showResetInfo && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
                Wenn Sie Ihr Passwort zurücksetzen möchten, kontaktieren Sie bitte einen Administrator. Administratoren können im Admin-Bereich ein temporäres Passwort setzen.
              </div>
            )}

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/80">
          ServerCommander OS — Open Source Server Management
        </p>
      </div>
    </div>
  );
}
