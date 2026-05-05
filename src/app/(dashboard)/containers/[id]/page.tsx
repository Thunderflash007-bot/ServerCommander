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
  const command = ((inspect?.Config as { Cmd?: string[] } | undefined)?.Cmd ?? []).join(" ");

  const ports = Object.entries(
    ((inspect?.NetworkSettings as { Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null> } | undefined)
      ?.Ports ?? {})
  )
    .map(([containerPort, bindings]) => {
      if (!bindings || bindings.length === 0) return `${containerPort} (not published)`;
      return bindings
        .map((binding) => {
          const hostIp = binding.HostIp && binding.HostIp !== "0.0.0.0" ? `${binding.HostIp}:` : "";
          return `${hostIp}${binding.HostPort}->${containerPort}`;
        })
        .join(", ");
    })
    .filter(Boolean);

  const envVars = ((inspect?.Config as { Env?: string[] } | undefined)?.Env ?? []).filter(Boolean);

  const mounts = ((inspect?.Mounts as Array<{ Source?: string; Destination?: string; RW?: boolean; Type?: string }> | undefined) ?? [])
    .map((mount) => {
      const mode = mount.RW ? "rw" : "ro";
      return `${mount.Source ?? ""}:${mount.Destination ?? ""} (${mount.Type ?? "bind"}, ${mode})`;
    })
    .filter(Boolean);

  const networks = Object.entries(
    ((inspect?.NetworkSettings as { Networks?: Record<string, { IPAddress?: string }> } | undefined)?.Networks ?? {})
  ).map(([networkName, networkConfig]) => {
    const ip = networkConfig?.IPAddress ? ` (${networkConfig.IPAddress})` : "";
    return `${networkName}${ip}`;
  });

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
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground">Port Mappings</h2>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground font-mono break-all">
                {ports.length === 0 ? <div>No ports exposed</div> : ports.map((port) => <div key={port}>{port}</div>)}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground">Networks</h2>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground font-mono break-all">
                {networks.length === 0 ? <div>No networks attached</div> : networks.map((network) => <div key={network}>{network}</div>)}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground">Mounts</h2>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground font-mono break-all">
                {mounts.length === 0 ? <div>No mounts configured</div> : mounts.map((mount) => <div key={mount}>{mount}</div>)}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground">Command</h2>
              <div className="mt-2 text-xs text-muted-foreground font-mono break-all">
                {command || "No command override"}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Environment</h2>
            <div className="mt-2 max-h-56 overflow-auto space-y-1 text-xs text-muted-foreground font-mono break-all">
              {envVars.length === 0 ? <div>No environment variables</div> : envVars.map((entry) => <div key={entry}>{entry}</div>)}
            </div>
          </div>

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