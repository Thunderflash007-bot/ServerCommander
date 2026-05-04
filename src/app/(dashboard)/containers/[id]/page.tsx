import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getContainerInspect } from "@/lib/docker";
import { canAccessDocker, canInspectContainer, type FullPermissions } from "@/lib/rbac";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function ContainerInspectPage({ params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessDocker(perms) || !canInspectContainer(perms, id)) {
    redirect("/containers");
  }

  let inspect: unknown = null;
  let error: string | null = null;

  try {
    inspect = await getContainerInspect(id);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Failed to inspect container";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Container Inspect</h1>
        <p className="text-muted-foreground text-sm mt-1 font-mono break-all">{id}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <pre className="overflow-auto rounded-xl border border-border bg-card p-4 text-xs text-foreground whitespace-pre-wrap break-all">
          {JSON.stringify(inspect, null, 2)}
        </pre>
      )}
    </div>
  );
}