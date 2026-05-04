import { getCurrentUser } from "@/lib/auth";
import { listContainers } from "@/lib/docker";
import { canAccessDocker, filterVisibleContainerIds } from "@/lib/rbac";
import type { FullPermissions } from "@/lib/rbac";
import { ContainerTable } from "@/components/docker/ContainerTable";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ContainersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessDocker(perms)) redirect("/dashboard");

  let containers: Awaited<ReturnType<typeof listContainers>> = [];
  let error: string | null = null;

  try {
    const all = await listContainers();
    const visibleIds = filterVisibleContainerIds(perms, all.map((c) => c.id));
    containers = all.filter((c) => visibleIds.includes(c.id));
  } catch (e) {
    error = "Unable to connect to Docker daemon. Is the socket mounted?";
    console.error(e);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Containers</h1>
          <p className="text-muted-foreground text-sm mt-1">{containers.length} container(s) visible</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <ContainerTable containers={containers} permissions={perms} />
      )}
    </div>
  );
}
