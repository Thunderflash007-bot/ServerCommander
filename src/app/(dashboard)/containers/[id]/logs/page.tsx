import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getContainerLogs } from "@/lib/docker";
import { canAccessDocker, canViewLogs, type FullPermissions } from "@/lib/rbac";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function ContainerLogsPage({ params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessDocker(perms) || !canViewLogs(perms, id)) {
    redirect("/containers");
  }

  let logs = "";
  let error: string | null = null;

  try {
    logs = await getContainerLogs(id, { tail: 500, timestamps: true });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Failed to load logs";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Container Logs</h1>
        <p className="text-muted-foreground text-sm mt-1 font-mono break-all">{id}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <pre className="min-h-[60vh] overflow-auto rounded-xl border border-border bg-black p-4 text-xs text-emerald-300 whitespace-pre-wrap break-all">
          {logs || "No log output available."}
        </pre>
      )}
    </div>
  );
}