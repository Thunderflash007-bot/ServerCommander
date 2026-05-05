import { getCurrentUser } from "@/lib/auth";
import { getDockerInfo, listContainers } from "@/lib/docker";
import { canAccessDocker, filterVisibleContainerIds } from "@/lib/rbac";
import type { FullPermissions } from "@/lib/rbac";
import { StatusCard } from "@/components/dashboard/StatusCard";
import { ContainerTable } from "@/components/docker/ContainerTable";
import { ContainerStatsPanel } from "@/components/docker/ContainerStatsPanel";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = user.permissions as FullPermissions | null;
  const hasDocker = canAccessDocker(perms);

  let dockerInfo = null;
  let visibleContainers: Awaited<ReturnType<typeof listContainers>> = [];

  if (hasDocker) {
    try {
      const [info, all] = await Promise.all([getDockerInfo(), listContainers()]);
      dockerInfo = info;
      const visibleIds = filterVisibleContainerIds(perms, all.map((c) => c.id));
      visibleContainers = all.filter((c) => visibleIds.includes(c.id));
    } catch {
      // Docker daemon unreachable
    }
  }

  const running = visibleContainers.filter((c) => c.state === "running").length;
  const stopped = visibleContainers.filter((c) => c.state !== "running").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Welcome back, <span className="text-foreground font-medium">{user.displayName ?? user.username}</span>
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatusCard
          title="Running Containers"
          value={hasDocker ? String(running) : "—"}
          variant="success"
          icon="play"
        />
        <StatusCard
          title="Stopped Containers"
          value={hasDocker ? String(stopped) : "—"}
          variant="warning"
          icon="stop"
        />
        <StatusCard
          title="Total Containers"
          value={hasDocker ? String(visibleContainers.length) : "—"}
          variant="default"
          icon="container"
        />
        <StatusCard
          title="Docker Version"
          value={dockerInfo?.ServerVersion ?? "—"}
          variant="default"
          icon="docker"
        />
      </div>

      {/* Quick Container Overview */}
      {hasDocker && <ContainerStatsPanel />}

      {hasDocker && visibleContainers.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Container Overview</h2>
          <ContainerTable containers={visibleContainers} permissions={perms} compact />
        </div>
      )}

      {!hasDocker && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground text-sm">
            You do not have permission to access Docker resources. Contact your administrator.
          </p>
        </div>
      )}
    </div>
  );
}
