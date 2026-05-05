import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import type { FullPermissions } from "@/lib/rbac";
import { canAccessDocker } from "@/lib/rbac";
import { StackManager } from "@/components/docker/StackManager";
import { RegistryManager } from "@/components/docker/RegistryManager";

export default async function StacksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessDocker(perms)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stacks</h1>
        <p className="text-muted-foreground text-sm mt-1">Deploy and operate Compose stacks with RBAC-aware controls.</p>
      </div>
      <RegistryManager enabled={user.role === "ADMIN"} />
      <StackManager canManage={!!perms?.dockerCreate && !!perms?.dockerViewAll} canDelete={!!perms?.dockerDelete && !!perms?.dockerViewAll} />
    </div>
  );
}