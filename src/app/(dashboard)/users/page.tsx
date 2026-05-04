import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { UsersTable } from "@/components/users/UsersTable";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const users = await db.user.findMany({
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      isActive: true,
      createdAt: true,
      permissions: {
        select: {
          dockerAccess: true,
          fsAccess: true,
          terminalAccess: true,
          containerPerms: { select: { containerName: true, containerId: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground text-sm mt-1">{users.length} user(s) configured</p>
      </div>
      <UsersTable users={users} currentUserId={user.id} />
    </div>
  );
}
