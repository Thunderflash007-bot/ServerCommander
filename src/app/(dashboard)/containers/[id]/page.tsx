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
import { ContainerEditPanel } from "@/components/docker/ContainerEditPanel";

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

  let inspect: Record<string, unknown> | null = null;
  let error: string | null = null;

  try {
    inspect = (await getContainerInspect(id)) as unknown as Record<string, unknown>;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Failed to inspect container";
  }

  const state = (inspect?.State as { Running?: boolean; Status?: string } | undefined) ?? {};
  const name =
    typeof inspect?.Name === "string"
      ? inspect.Name.replace(/^\//, "")
      : id.substring(0, 12);
  const image = (inspect?.Config as { Image?: string } | undefined)?.Image ?? "unknown";
  const restartPolicy =
    (inspect?.HostConfig as { RestartPolicy?: { Name?: string } } | undefined)?.RestartPolicy
      ?.Name ?? "no";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Container Details</h1>
        <p className="text-muted-foreground text-sm mt-1">
          <span className="font-mono break-all">{id}</span>
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Name</div>
              <div className="mt-1 text-sm font-semibold text-foreground font-mono break-all">{name}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{state.Status ?? (state.Running ? "running" : "stopped")}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Image</div>
              <div className="mt-1 text-sm font-semibold text-foreground font-mono break-all">{image}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Restart Policy</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{restartPolicy}</div>
            </div>
          </div>

          <ContainerDetailsActions
            id={id}
            isRunning={!!state.Running}
            canStart={canStartContainer(perms, id)}
            canStop={canStopContainer(perms, id)}
            canRestart={canRestartContainer(perms, id)}
            canDelete={canDeleteContainer(perms, id)}
          />

          <ContainerEditPanel
            id={id}
            currentName={name}
            restartPolicy={restartPolicy}
            canEdit={canRestartContainer(perms, id) || canDeleteContainer(perms, id)}
          />

          <div className="grid gap-4 md:grid-cols-2">
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
          </div>
        </>
      )}
    </div>
  );
}