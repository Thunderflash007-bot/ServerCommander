import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getContainerInspect } from "@/lib/docker";
import {
  canAccessDocker,
  canDeleteContainer,
  canExecContainer,
  canInspectContainer,
  canRestartContainer,
  canStartContainer,
  canStopContainer,
  canViewLogs,
  type FullPermissions,
} from "@/lib/rbac";
import Link from "next/link";
import { ContainerDetailsActions } from "@/components/docker/ContainerDetailsActions";

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
        <h1 className="text-2xl font-bold tracking-tight">Container Details</h1>
        <p className="text-muted-foreground text-sm mt-1 font-mono break-all">{id}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <>
          <ContainerDetailsActions
            id={id}
            canStart={canStartContainer(perms, id)}
            canStop={canStopContainer(perms, id)}
            canRestart={canRestartContainer(perms, id)}
            canDelete={canDeleteContainer(perms, id)}
          />

          <div className="grid gap-4 md:grid-cols-3">
            <Link
              href={`/containers/${id}/logs`}
              className={`rounded-lg border border-border bg-card p-4 text-sm transition ${canViewLogs(perms, id) ? "hover:bg-accent" : "opacity-50 pointer-events-none"}`}
            >
              <div className="font-semibold text-foreground">Logs</div>
              <div className="text-muted-foreground mt-1">Live output and error traces</div>
            </Link>
            <Link
              href={`/containers/${id}/console`}
              className={`rounded-lg border border-border bg-card p-4 text-sm transition ${canExecContainer(perms, id) ? "hover:bg-accent" : "opacity-50 pointer-events-none"}`}
            >
              <div className="font-semibold text-foreground">Console</div>
              <div className="text-muted-foreground mt-1">Interactive shell inside container</div>
            </Link>
            <div className="rounded-lg border border-border bg-card p-4 text-sm">
              <div className="font-semibold text-foreground">Inspect JSON</div>
              <div className="text-muted-foreground mt-1">Low-level metadata below</div>
            </div>
          </div>

          <pre className="overflow-auto rounded-xl border border-border bg-card p-4 text-xs text-foreground whitespace-pre-wrap break-all">
            {JSON.stringify(inspect, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}