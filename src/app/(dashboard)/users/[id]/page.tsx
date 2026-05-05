import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { UserPermissionsEditor } from "@/components/users/UserPermissionsEditor";
import { listContainers } from "@/lib/docker";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function UserDetailPage({ params }: Params) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "ADMIN") redirect("/dashboard");

  const targetUser = await db.user.findUnique({
    where: { id },
    include: {
      permissions: {
        include: {
          containerPerms: true,
          fsPathPerms: true,
        },
      },
      permissionGroups: {
        include: {
          group: true,
        },
      },
    },
  });

  if (!targetUser) redirect("/users");

  let containers: Awaited<ReturnType<typeof listContainers>> = [];
  try {
    containers = await listContainers();
  } catch {
    // Docker unavailable
  }

  const { passwordHash: _, ...safeUser } = targetUser;
  const groups = await db.permissionGroup.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      dockerAccess: true,
      fsAccess: true,
      terminalAccess: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit User: {targetUser.username}</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure granular permissions for this user.</p>
      </div>
      <UserPermissionsEditor user={safeUser} containers={containers} groups={groups} />
    </div>
  );
}
