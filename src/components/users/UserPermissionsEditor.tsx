"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, ChevronLeft, Container, FolderOpen, Terminal, ShieldCheck } from "lucide-react";
import type { ContainerSummary } from "@/lib/docker";

interface Permissions {
  dockerAccess: boolean;
  dockerViewAll: boolean;
  dockerImages: boolean;
  dockerVolumes: boolean;
  dockerNetworks: boolean;
  dockerCreate: boolean;
  dockerDelete: boolean;
  fsAccess: boolean;
  terminalAccess: boolean;
  terminalReadOnly: boolean;
  terminalMaxSessions: number;
  containerPerms: ContainerPerm[];
  fsPathPerms: FsPathPerm[];
}

interface ContainerPerm {
  containerId: string;
  containerName: string;
  canView: boolean;
  canStart: boolean;
  canStop: boolean;
  canRestart: boolean;
  canDelete: boolean;
  canLogs: boolean;
  canExec: boolean;
  canInspect: boolean;
}

interface FsPathPerm {
  path: string;
  readOnly: boolean;
  canCreate: boolean;
  canDelete: boolean;
}

interface UserPermissionsEditorProps {
  user: {
    id: string;
    username: string;
    displayName: string | null;
    isActive: boolean;
    permissions: Permissions | null;
    permissionGroups: Array<{
      group: {
        id: string;
        name: string;
        description: string | null;
      };
    }>;
  };
  containers: ContainerSummary[];
  groups: Array<{
    id: string;
    name: string;
    description: string | null;
    dockerAccess: boolean;
    fsAccess: boolean;
    terminalAccess: boolean;
  }>;
}

function emptyPerms(): Permissions {
  return {
    dockerAccess: false, dockerViewAll: false, dockerImages: false,
    dockerVolumes: false, dockerNetworks: false, dockerCreate: false,
    dockerDelete: false, fsAccess: false, terminalAccess: false,
    terminalReadOnly: true, terminalMaxSessions: 1,
    containerPerms: [], fsPathPerms: [],
  };
}

export function UserPermissionsEditor({ user, containers, groups }: UserPermissionsEditorProps) {
  const router = useRouter();
  const [perms, setPerms] = useState<Permissions>(user.permissions ?? emptyPerms());
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    user.permissionGroups.map((entry) => entry.group.id)
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [newPath, setNewPath] = useState("");

  function toggle<K extends keyof Permissions>(key: K) {
    setPerms((p) => ({ ...p, [key]: !p[key] }));
  }

  // ── Container perms helpers ──────────────────────────────────────────────────

  function isContainerEnabled(id: string) {
    return perms.containerPerms.some((c) => c.containerId === id);
  }

  function toggleContainer(c: ContainerSummary) {
    setPerms((p) => {
      const exists = p.containerPerms.find((cp) => cp.containerId === c.id);
      if (exists) {
        return { ...p, containerPerms: p.containerPerms.filter((cp) => cp.containerId !== c.id) };
      }
      return {
        ...p,
        containerPerms: [
          ...p.containerPerms,
          { containerId: c.id, containerName: c.name, canView: true, canStart: false, canStop: false, canRestart: false, canDelete: false, canLogs: false, canExec: false, canInspect: false },
        ],
      };
    });
  }

  function updateContainerPerm(id: string, key: keyof ContainerPerm, value: boolean) {
    setPerms((p) => ({
      ...p,
      containerPerms: p.containerPerms.map((cp) =>
        cp.containerId === id ? { ...cp, [key]: value } : cp
      ),
    }));
  }

  // ── FS path helpers ──────────────────────────────────────────────────────────

  function addPath() {
    const normalized = newPath.trim();
    if (!normalized || !normalized.startsWith("/")) return;
    if (perms.fsPathPerms.some((fp) => fp.path === normalized)) return;
    setPerms((p) => ({
      ...p,
      fsPathPerms: [...p.fsPathPerms, { path: normalized, readOnly: true, canCreate: false, canDelete: false }],
    }));
    setNewPath("");
  }

  function removePath(path: string) {
    setPerms((p) => ({ ...p, fsPathPerms: p.fsPathPerms.filter((fp) => fp.path !== path) }));
  }

  function updatePathPerm(path: string, key: keyof FsPathPerm, value: boolean) {
    setPerms((p) => ({
      ...p,
      fsPathPerms: p.fsPathPerms.map((fp) => fp.path === path ? { ...fp, [key]: value } : fp),
    }));
  }

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    );
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setStatus(null);

    const { containerPerms, fsPathPerms, ...globalPerms } = perms;

    // 1. Update global permissions
    const r1 = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: globalPerms, permissionGroupIds: selectedGroupIds }),
    });

    // 2. Update container whitelist
    const r2 = await fetch(`/api/users/${user.id}/container-perms`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: containerPerms }),
    });

    // 3. Update filesystem paths
    const r3 = await fetch(`/api/users/${user.id}/fs-perms`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: fsPathPerms }),
    });

    setSaving(false);

    if (r1.ok && r2.ok && r3.ok) {
      setStatus({ type: "success", message: "Permissions saved successfully." });
      router.refresh();
    } else {
      setStatus({ type: "error", message: "One or more updates failed. Check inputs and try again." });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/users")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Users
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : "Save Permissions"}
        </button>
      </div>

      {status && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${status.type === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-destructive/10 border-destructive/20 text-destructive"}`}>
          {status.message}
        </div>
      )}

      {/* ── Section: Docker Global ─────────────────────────────────────────── */}
      <Section icon={<ShieldCheck className="w-4 h-4" />} title="Permission Groups">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No groups created yet. Create one in User Management first.</p>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => {
              const checked = selectedGroupIds.includes(group.id);
              return (
                <label key={group.id} className="flex items-start gap-3 rounded-lg border border-border bg-muted/10 p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleGroup(group.id)}
                    className="mt-1 rounded border-border"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{group.name}</div>
                    {group.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{group.description}</div>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      {group.dockerAccess && <span>Docker</span>}
                      {group.fsAccess && <span>Filesystem</span>}
                      {group.terminalAccess && <span>Terminal</span>}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </Section>

      <Section icon={<ShieldCheck className="w-4 h-4" />} title="Docker — Global Permissions">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {([
            ["dockerAccess", "Docker Access (master toggle)"],
            ["dockerViewAll", "View All Containers"],
            ["dockerImages", "Manage Images"],
            ["dockerVolumes", "Manage Volumes"],
            ["dockerNetworks", "Manage Networks"],
            ["dockerCreate", "Create Containers"],
            ["dockerDelete", "Delete Any Container"],
          ] as [keyof Permissions, string][]).map(([key, label]) => (
            <Toggle key={key} label={label} checked={!!perms[key]} onChange={() => toggle(key)} />
          ))}
        </div>
      </Section>

      {/* ── Section: Container Whitelist ──────────────────────────────────── */}
      {!perms.dockerViewAll && (
        <Section icon={<Container className="w-4 h-4" />} title="Container Whitelist">
          <p className="text-xs text-muted-foreground mb-3">
            When "View All Containers" is OFF, only whitelisted containers below are visible to this user.
          </p>
          {containers.length === 0 && (
            <p className="text-sm text-muted-foreground bg-muted/20 rounded-lg p-4 text-center">
              No containers found (Docker daemon may be unavailable).
            </p>
          )}
          <div className="space-y-2">
            {containers.map((c) => {
              const enabled = isContainerEnabled(c.id);
              const cp = perms.containerPerms.find((x) => x.containerId === c.id);
              return (
                <div key={c.id} className="rounded-lg border border-border bg-muted/10 p-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={`c-${c.id}`}
                      checked={enabled}
                      onChange={() => toggleContainer(c)}
                      className="rounded border-border"
                    />
                    <label htmlFor={`c-${c.id}`} className="flex-1 cursor-pointer">
                      <span className="font-medium text-sm">{c.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground font-mono">{c.shortId}</span>
                    </label>
                    <StateChip state={c.state} />
                  </div>

                  {enabled && cp && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 pl-6">
                      {(["canView", "canStart", "canStop", "canRestart", "canDelete", "canLogs", "canExec", "canInspect"] as (keyof ContainerPerm)[]).map((perm) => (
                        <label key={perm} className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!cp[perm]}
                            onChange={(e) => updateContainerPerm(c.id, perm, e.target.checked)}
                            className="rounded border-border"
                          />
                          {perm.replace("can", "")}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Section: Filesystem ───────────────────────────────────────────── */}
      <Section icon={<FolderOpen className="w-4 h-4" />} title="Filesystem Permissions">
        <Toggle
          label="Enable Filesystem Access"
          checked={perms.fsAccess}
          onChange={() => toggle("fsAccess")}
        />
        {perms.fsAccess && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPath()}
                placeholder="/var/www"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={addPath}
                className="rounded-md bg-secondary px-4 py-2 text-sm hover:bg-secondary/80 transition"
              >
                Add Path
              </button>
            </div>
            <div className="space-y-2">
              {perms.fsPathPerms.map((fp) => (
                <div key={fp.path} className="rounded-lg border border-border bg-muted/10 p-3 flex flex-wrap items-center gap-3">
                  <code className="text-sm font-mono text-foreground flex-1">{fp.path}</code>
                  <div className="flex items-center gap-4 flex-wrap">
                    {(["readOnly", "canCreate", "canDelete"] as (keyof FsPathPerm)[]).map((k) => (
                      <label key={k} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!fp[k]}
                          onChange={(e) => updatePathPerm(fp.path, k, e.target.checked)}
                          className="rounded border-border"
                        />
                        {k === "readOnly" ? "Read-Only" : k.replace("can", "Allow ")}
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => removePath(fp.path)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── Section: Terminal ─────────────────────────────────────────────── */}
      <Section icon={<Terminal className="w-4 h-4" />} title="Terminal Permissions">
        <div className="space-y-3">
          <Toggle label="Enable Terminal Access" checked={perms.terminalAccess} onChange={() => toggle("terminalAccess")} />
          {perms.terminalAccess && (
            <>
              <Toggle label="Read-Only Mode (no input)" checked={perms.terminalReadOnly} onChange={() => toggle("terminalReadOnly")} />
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium">Max Concurrent Sessions</label>
                <input
                  type="number"
                  value={perms.terminalMaxSessions}
                  onChange={(e) => setPerms((p) => ({ ...p, terminalMaxSessions: parseInt(e.target.value) || 0 }))}
                  min={0}
                  max={10}
                  className="w-20 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">(0 = unlimited)</span>
              </div>
            </>
          )}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold mb-4">
        <span className="text-primary">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-1"}`} />
      </div>
      <span className="text-sm">{label}</span>
    </label>
  );
}

function StateChip({ state }: { state: string }) {
  const map: Record<string, string> = {
    running: "bg-emerald-500/15 text-emerald-400",
    exited: "bg-red-500/15 text-red-400",
  };
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${map[state] ?? "bg-muted text-muted-foreground"}`}>
      {state}
    </span>
  );
}
