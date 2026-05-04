import type { UserPermission, ContainerPermission, FsPathPermission } from "@prisma/client";

export type FullPermissions = UserPermission & {
  containerPerms: ContainerPermission[];
  fsPathPerms: FsPathPermission[];
};

// ── Docker Global Checks ──────────────────────────────────────────────────────

export function canAccessDocker(p: FullPermissions | null): boolean {
  return !!p?.dockerAccess;
}

export function canViewAllContainers(p: FullPermissions | null): boolean {
  return !!p?.dockerViewAll;
}

export function canManageImages(p: FullPermissions | null): boolean {
  return !!p?.dockerImages;
}

export function canManageVolumes(p: FullPermissions | null): boolean {
  return !!p?.dockerVolumes;
}

export function canManageNetworks(p: FullPermissions | null): boolean {
  return !!p?.dockerNetworks;
}

export function canCreateContainers(p: FullPermissions | null): boolean {
  return !!p?.dockerCreate;
}

// ── Per-Container Checks ──────────────────────────────────────────────────────

function getContainerPerm(
  p: FullPermissions | null,
  containerId: string
): ContainerPermission | undefined {
  if (!p) return undefined;
  return p.containerPerms.find(
    (cp) =>
      cp.containerId === containerId ||
      cp.containerId === containerId.substring(0, 12) ||
      containerId.startsWith(cp.containerId)
  );
}

export function canViewContainer(p: FullPermissions | null, containerId: string): boolean {
  if (!p) return false;
  if (p.dockerViewAll) return true;
  return !!getContainerPerm(p, containerId)?.canView;
}

export function canStartContainer(p: FullPermissions | null, containerId: string): boolean {
  if (!p) return false;
  if (p.dockerViewAll && p.dockerCreate) return true;
  return !!getContainerPerm(p, containerId)?.canStart;
}

export function canStopContainer(p: FullPermissions | null, containerId: string): boolean {
  if (!p) return false;
  return !!getContainerPerm(p, containerId)?.canStop;
}

export function canRestartContainer(p: FullPermissions | null, containerId: string): boolean {
  if (!p) return false;
  return !!getContainerPerm(p, containerId)?.canRestart;
}

export function canDeleteContainer(p: FullPermissions | null, containerId: string): boolean {
  if (!p) return false;
  if (p.dockerViewAll && p.dockerDelete) return true;
  return !!getContainerPerm(p, containerId)?.canDelete;
}

export function canViewLogs(p: FullPermissions | null, containerId: string): boolean {
  if (!p) return false;
  if (p.dockerViewAll) return true;
  return !!getContainerPerm(p, containerId)?.canLogs;
}

export function canExecContainer(p: FullPermissions | null, containerId: string): boolean {
  if (!p) return false;
  if (p.dockerViewAll && p.terminalAccess) return true;
  return !!getContainerPerm(p, containerId)?.canExec;
}

export function canInspectContainer(p: FullPermissions | null, containerId: string): boolean {
  if (!p) return false;
  if (p.dockerViewAll) return true;
  return !!getContainerPerm(p, containerId)?.canInspect;
}

// ── Filesystem Checks ─────────────────────────────────────────────────────────

export function canAccessFilesystem(p: FullPermissions | null): boolean {
  return !!p?.fsAccess;
}

export function getPathPermission(
  p: FullPermissions | null,
  requestedPath: string
): FsPathPermission | null {
  if (!p) return null;
  if (p.fsAccess && p.fsPathPerms.length === 0) {
    return {
      id: "implicit-full-access",
      permissionId: p.id,
      path: "/",
      readOnly: false,
      canCreate: true,
      canDelete: true,
      createdAt: new Date(0),
    };
  }
  // Find the most specific matching path (longest prefix wins)
  const normalized = requestedPath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  let best: FsPathPermission | null = null;
  let bestLen = -1;

  for (const fp of p.fsPathPerms) {
    const base = fp.path.replace(/\/$/, "");
    if (normalized === base || normalized.startsWith(base + "/")) {
      if (base.length > bestLen) {
        best = fp;
        bestLen = base.length;
      }
    }
  }
  return best;
}

export function canReadPath(p: FullPermissions | null, path: string): boolean {
  const fp = getPathPermission(p, path);
  return !!fp; // any matching path grant implies read
}

export function canWritePath(p: FullPermissions | null, path: string): boolean {
  const fp = getPathPermission(p, path);
  return !!fp && !fp.readOnly;
}

export function canCreateInPath(p: FullPermissions | null, path: string): boolean {
  const fp = getPathPermission(p, path);
  return !!fp && !fp.readOnly && fp.canCreate;
}

export function canDeleteInPath(p: FullPermissions | null, path: string): boolean {
  const fp = getPathPermission(p, path);
  return !!fp && !fp.readOnly && fp.canDelete;
}

// ── Terminal Checks ───────────────────────────────────────────────────────────

export function canAccessTerminal(p: FullPermissions | null): boolean {
  return !!p?.terminalAccess;
}

export function isTerminalReadOnly(p: FullPermissions | null): boolean {
  return p?.terminalReadOnly ?? true;
}

export function getTerminalMaxSessions(p: FullPermissions | null): number {
  return p?.terminalMaxSessions ?? 1;
}

// ── Utility: filter visible container IDs from a full list ───────────────────

export function filterVisibleContainerIds(
  p: FullPermissions | null,
  allContainerIds: string[]
): string[] {
  if (!p) return [];
  if (p.dockerViewAll) return allContainerIds;
  const whitelist = new Set(p.containerPerms.filter((cp) => cp.canView).map((cp) => cp.containerId));
  return allContainerIds.filter(
    (id) => whitelist.has(id) || whitelist.has(id.substring(0, 12))
  );
}
