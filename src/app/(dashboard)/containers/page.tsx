import { getCurrentUser } from "@/lib/auth";
import { listContainers, listImages, listNetworks } from "@/lib/docker";
import { canAccessDocker, canCreateContainers, filterVisibleContainerIds } from "@/lib/rbac";
import type { FullPermissions } from "@/lib/rbac";
import { ContainerTable } from "@/components/docker/ContainerTable";
import { ContainerCreatePanel } from "@/components/docker/ContainerCreatePanel";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ContainersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessDocker(perms)) redirect("/dashboard");

  let containers: Awaited<ReturnType<typeof listContainers>> = [];
  let imageSuggestions: string[] = [];
  let networkSuggestions: string[] = [];
  let error: string | null = null;

  try {
    const all = await listContainers();
    const visibleIds = filterVisibleContainerIds(perms, all.map((c) => c.id));
    containers = all.filter((c) => visibleIds.includes(c.id));

    if (canCreateContainers(perms)) {
      const [images, networks] = await Promise.all([listImages(), listNetworks()]);
      imageSuggestions = images
        .flatMap((img) => img.RepoTags ?? [])
        .filter((tag) => !!tag && tag !== "<none>:<none>");
      networkSuggestions = networks.map((n) => n.Name).filter(Boolean);
    }
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
        <>
          {canCreateContainers(perms) && (
            <ContainerCreatePanel
              images={imageSuggestions}
              networks={networkSuggestions}
              sources={containers.map((c) => ({ id: c.id, name: c.name, shortId: c.shortId }))}
            />
          )}
          <ContainerTable containers={containers} permissions={perms} />
        </>
      )}
    </div>
  );
}
