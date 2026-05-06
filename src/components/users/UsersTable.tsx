"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Pencil, Trash2, ShieldCheck, FolderLock, Terminal, Users, Eye, Search } from "lucide-react";

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
  permissionGroups: Array<{
    group: {
      id: string;
      name: string;
    };
  }>;
}

interface UsersTableProps {
  users: UserRow[];
  groups: Array<{
    id: string;
    name: string;
    description: string | null;
    dockerAccess: boolean;
    fsAccess: boolean;
    terminalAccess: boolean;
    _count: {
      userAssignments: number;
    };
  }>;
  currentUserId: string;
}

export function UsersTable({ users, groups, currentUserId }: UsersTableProps) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<UsersTableProps["groups"][number] | null>(null);
  const [groupFilter, setGroupFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filteredGroups = groups.filter((group) => {
    const q = groupFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      group.name.toLowerCase().includes(q) ||
      (group.description ?? "").toLowerCase().includes(q)
    );
  });

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

  async function handleDeleteGroup(id: string, name: string) {
    if (!confirm(`Delete group "${name}"? Assigned users will lose inherited permissions from this group.`)) return;

    const res = await fetch(`/api/permission-groups/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to delete group");
    }
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateGroup(true)}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-accent transition"
          >
            <Users className="w-4 h-4" />
            Add Group
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </button>
        </div>
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
                    {u.permissionGroups?.length ? (
                      <span className="text-xs text-muted-foreground">
                        {u.permissionGroups.length} group(s)
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

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-muted-foreground">Permission Groups</h3>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
                placeholder="Search groups"
                className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-xs"
              />
            </div>
          </div>
        </div>
        {filteredGroups.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">No permission groups yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/10">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Access</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Assigned Users</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredGroups.map((group) => (
                <tr key={group.id} className="hover:bg-muted/20 transition">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{group.name}</div>
                    {group.description && (
                      <div className="text-xs text-muted-foreground">{group.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {group.dockerAccess && <span className="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-blue-300">Docker</span>}
                      {group.fsAccess && <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">FS</span>}
                      {group.terminalAccess && <span className="rounded border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-purple-300">Terminal</span>}
                      {!group.dockerAccess && !group.fsAccess && !group.terminalAccess && <span>No access</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{group._count.userAssignments}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => router.push(`/permission-groups/${group.id}`)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition"
                        title="View group details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingGroup(group)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition"
                        title="Edit group"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void handleDeleteGroup(group.id, group.name)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                        title="Delete group"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create User Modal */}
      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); router.refresh(); }} />
      )}

      {showCreateGroup && (
        <CreateGroupModal onClose={() => setShowCreateGroup(false)} onCreated={() => { setShowCreateGroup(false); router.refresh(); }} />
      )}

      {editingGroup && (
        <EditGroupModal
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onSaved={() => {
            setEditingGroup(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function EditGroupModal({
  group,
  onClose,
  onSaved,
}: {
  group: UsersTableProps["groups"][number];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState({
    dockerAccess: group.dockerAccess,
    dockerViewAll: false,
    dockerImages: false,
    dockerVolumes: false,
    dockerNetworks: false,
    dockerCreate: false,
    dockerDelete: false,
    fsAccess: group.fsAccess,
    terminalAccess: group.terminalAccess,
    terminalReadOnly: true,
    terminalMaxSessions: 1,
  });

  async function hydrateGroup() {
    const res = await fetch(`/api/permission-groups/${group.id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.group) {
      setPermissions({
        dockerAccess: !!data.group.dockerAccess,
        dockerViewAll: !!data.group.dockerViewAll,
        dockerImages: !!data.group.dockerImages,
        dockerVolumes: !!data.group.dockerVolumes,
        dockerNetworks: !!data.group.dockerNetworks,
        dockerCreate: !!data.group.dockerCreate,
        dockerDelete: !!data.group.dockerDelete,
        fsAccess: !!data.group.fsAccess,
        terminalAccess: !!data.group.terminalAccess,
        terminalReadOnly: !!data.group.terminalReadOnly,
        terminalMaxSessions: Number(data.group.terminalMaxSessions ?? 1),
      });
    }
  }

  useEffect(() => {
    void hydrateGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  function toggle(key: keyof typeof permissions) {
    setPermissions((p) => ({ ...p, [key]: !p[key] }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch(`/api/permission-groups/${group.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, permissions }),
    });

    setLoading(false);
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to update group");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-2xl shadow-2xl">
        <h2 className="text-lg font-bold mb-4">Edit Permission Group</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <Field label="Group Name" value={name} onChange={setName} required />
          <Field label="Description (optional)" value={description} onChange={setDescription} />

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 rounded-lg border border-border p-3">
            {([
              ["dockerAccess", "Docker Access"],
              ["dockerViewAll", "View All Containers"],
              ["dockerImages", "Manage Images"],
              ["dockerVolumes", "Manage Volumes"],
              ["dockerNetworks", "Manage Networks"],
              ["dockerCreate", "Create Containers"],
              ["dockerDelete", "Delete Containers"],
              ["fsAccess", "Filesystem Access"],
              ["terminalAccess", "Terminal Access"],
              ["terminalReadOnly", "Terminal Read-Only"],
            ] as Array<[keyof typeof permissions, string]>).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!permissions[key]}
                  onChange={() => toggle(key)}
                  className="rounded border-border"
                />
                {label}
              </label>
            ))}
            <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-2">
              <label className="text-sm">Max Terminal Sessions</label>
              <input
                type="number"
                min={0}
                max={10}
                value={permissions.terminalMaxSessions}
                onChange={(e) => setPermissions((p) => ({ ...p, terminalMaxSessions: parseInt(e.target.value, 10) || 0 }))}
                className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>

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
              {loading ? "Saving..." : "Save Group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState({
    dockerAccess: false,
    dockerViewAll: false,
    dockerImages: false,
    dockerVolumes: false,
    dockerNetworks: false,
    dockerCreate: false,
    dockerDelete: false,
    fsAccess: false,
    terminalAccess: false,
    terminalReadOnly: true,
    terminalMaxSessions: 1,
  });

  function toggle(key: keyof typeof permissions) {
    setPermissions((p) => ({ ...p, [key]: !p[key] }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/permission-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        permissions,
      }),
    });

    setLoading(false);
    if (res.ok) {
      onCreated();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create group");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-2xl shadow-2xl">
        <h2 className="text-lg font-bold mb-4">Create Permission Group</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Group Name" value={name} onChange={setName} required />
          <Field label="Description (optional)" value={description} onChange={setDescription} />

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 rounded-lg border border-border p-3">
            {([
              ["dockerAccess", "Docker Access"],
              ["dockerViewAll", "View All Containers"],
              ["dockerImages", "Manage Images"],
              ["dockerVolumes", "Manage Volumes"],
              ["dockerNetworks", "Manage Networks"],
              ["dockerCreate", "Create Containers"],
              ["dockerDelete", "Delete Containers"],
              ["fsAccess", "Filesystem Access"],
              ["terminalAccess", "Terminal Access"],
              ["terminalReadOnly", "Terminal Read-Only"],
            ] as Array<[keyof typeof permissions, string]>).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!permissions[key]}
                  onChange={() => toggle(key)}
                  className="rounded border-border"
                />
                {label}
              </label>
            ))}
            <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-2">
              <label className="text-sm">Max Terminal Sessions</label>
              <input
                type="number"
                min={0}
                max={10}
                value={permissions.terminalMaxSessions}
                onChange={(e) => setPermissions((p) => ({ ...p, terminalMaxSessions: parseInt(e.target.value, 10) || 0 }))}
                className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>

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
              {loading ? "Creating..." : "Create Group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email }),
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
          <Field label="Email" value={email} onChange={setEmail} type="email" required />
          <p className="text-xs text-muted-foreground">
            A secure temporary password is generated automatically and sent to this email address.
          </p>
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
