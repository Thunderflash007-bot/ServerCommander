"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Pencil, Trash2, ShieldCheck, FolderLock, Terminal } from "lucide-react";

interface ContainerPerm {
  containerId: string;
  containerName: string;
}

interface UserRow {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date | string;
  permissions: {
    dockerAccess: boolean;
    fsAccess: boolean;
    terminalAccess: boolean;
    containerPerms: ContainerPerm[];
  } | null;
}

interface UsersTableProps {
  users: UserRow[];
  currentUserId: string;
}

export function UsersTable({ users, currentUserId }: UsersTableProps) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string, username: string) {
    if (!confirm(`Delete user "${username}"? This is irreversible.`)) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error);
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition"
        >
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Permissions</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-muted/20 transition">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{u.username}</div>
                  {u.displayName && (
                    <div className="text-xs text-muted-foreground">{u.displayName}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium
                      ${u.role === "ADMIN"
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "bg-muted text-muted-foreground border-border"
                      }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {u.permissions?.dockerAccess && (
                      <span title="Docker access" className="text-blue-400">
                        <ShieldCheck className="w-4 h-4" />
                      </span>
                    )}
                    {u.permissions?.fsAccess && (
                      <span title="Filesystem access" className="text-emerald-400">
                        <FolderLock className="w-4 h-4" />
                      </span>
                    )}
                    {u.permissions?.terminalAccess && (
                      <span title="Terminal access" className="text-purple-400">
                        <Terminal className="w-4 h-4" />
                      </span>
                    )}
                    {u.permissions?.containerPerms?.length ? (
                      <span className="text-xs text-muted-foreground">
                        {u.permissions.containerPerms.length} container(s)
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleActive(u.id, u.isActive)}
                    disabled={u.id === currentUserId}
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition
                      ${u.isActive
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                        : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {u.isActive ? "Active" : "Disabled"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => router.push(`/users/${u.id}`)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition"
                      title="Edit permissions"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {u.id !== currentUserId && (
                      <button
                        onClick={() => handleDelete(u.id, u.username)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                        title="Delete user"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); router.refresh(); }} />
      )}
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, displayName: displayName || undefined }),
    });
    setLoading(false);
    if (res.ok) {
      onCreated();
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to create user");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-bold mb-4">Create User</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Username" value={username} onChange={setUsername} required />
          <Field label="Display Name (optional)" value={displayName} onChange={setDisplayName} />
          <Field label="Password" value={password} onChange={setPassword} type="password" required />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-accent transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition"
            >
              {loading ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
      />
    </div>
  );
}
