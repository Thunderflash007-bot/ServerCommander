import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessDocker, canExecContainer, type FullPermissions } from "@/lib/rbac";
import { TerminalManager } from "@/components/terminal/TerminalManager";

type Params = { params: Promise<{ id: string }> };

export default async function ContainerConsolePage({ params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessDocker(perms) || !canExecContainer(perms, id)) {
    redirect(`/containers/${id}`);
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Container Console</h1>
        <p className="text-muted-foreground text-sm mt-1 font-mono break-all">{id}</p>
      </div>
      <div className="flex-1 min-h-0">
        <TerminalManager maxSessions={1} readOnly={false} containerId={id} />
      </div>
    </div>
  );
}
