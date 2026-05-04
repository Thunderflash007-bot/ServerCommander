import { getCurrentUser } from "@/lib/auth";
import { canAccessFilesystem } from "@/lib/rbac";
import type { FullPermissions } from "@/lib/rbac";
import { FileExplorer } from "@/components/files/FileExplorer";
import { redirect } from "next/navigation";

export default async function FilesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessFilesystem(perms)) redirect("/dashboard");

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">File Explorer</h1>
        <p className="text-muted-foreground text-sm mt-1">Host filesystem — access restricted to your permitted paths</p>
      </div>
      <div className="flex-1 min-h-0">
        <FileExplorer permissions={perms} />
      </div>
    </div>
  );
}
