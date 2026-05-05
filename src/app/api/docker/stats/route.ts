import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getContainerLiveStats, listContainers } from "@/lib/docker";
import { canAccessDocker, filterVisibleContainerIds, type FullPermissions } from "@/lib/rbac";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const perms = user.permissions as FullPermissions | null;
    if (!canAccessDocker(perms)) {
      return NextResponse.json({ error: "Docker access denied" }, { status: 403 });
    }

    const containers = await listContainers();
    const visibleIds = filterVisibleContainerIds(perms, containers.map((container) => container.id));
    const runningContainers = containers.filter((container) => visibleIds.includes(container.id) && container.state === "running");

    const stats = await Promise.all(
      runningContainers.map(async (container) => {
        try {
          return await getContainerLiveStats(container.id);
        } catch {
          return null;
        }
      })
    );

    return NextResponse.json({ stats: stats.filter(Boolean) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load container stats" },
      { status: 500 }
    );
  }
}