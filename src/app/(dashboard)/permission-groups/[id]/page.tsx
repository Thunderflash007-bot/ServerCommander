import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PermissionGroupActions } from "@/components/users/PermissionGroupActions";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

function Flag({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/10 px-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
          enabled
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            : "bg-muted text-muted-foreground border-border"
        }`}
      >
        {enabled ? "Enabled" : "Disabled"}
      </span>
    </div>
  );
}

export default async function PermissionGroupDetailPage({ params }: Params) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "ADMIN") redirect("/dashboard");

  const group = await db.permissionGroup.findUnique({
    where: { id },
    include: {
      userAssignments: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              isActive: true,
            },
          },
        },
        orderBy: {
          user: {
            username: "asc",
          },
        },
      },
    },
  });

  if (!group) redirect("/users");

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Permission Group: {group.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Effective inherited permissions for all assigned users.
          </p>
          {group.description && <p className="text-sm text-muted-foreground mt-2">{group.description}</p>}
        </div>
        <Link
          href="/users"
          className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
        >
          Back to Users
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-foreground">Assignment Management</div>
          <div className="text-xs text-muted-foreground mt-1">
            Remove all current user assignments before deleting this group.
          </div>
        </div>
        <PermissionGroupActions groupId={group.id} assignmentCount={group.userAssignments.length} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Assigned Users</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">{group.userAssignments.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Terminal Read Only</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">{group.terminalReadOnly ? "Yes" : "No"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Max Terminal Sessions</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">{group.terminalMaxSessions}</div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Effective Rights Preview</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Flag label="Docker Access" enabled={group.dockerAccess} />
          <Flag label="Docker View All" enabled={group.dockerViewAll} />
          <Flag label="Docker Images" enabled={group.dockerImages} />
          <Flag label="Docker Volumes" enabled={group.dockerVolumes} />
          <Flag label="Docker Networks" enabled={group.dockerNetworks} />
          <Flag label="Docker Create" enabled={group.dockerCreate} />
          <Flag label="Docker Delete" enabled={group.dockerDelete} />
          <Flag label="Filesystem Access" enabled={group.fsAccess} />
          <Flag label="Terminal Access" enabled={group.terminalAccess} />
          <Flag label="Terminal Read-Only" enabled={group.terminalReadOnly} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border bg-muted/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Assigned Users</h2>
        </div>
        {group.userAssignments.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">No users assigned to this group.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/10">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Username</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Display Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {group.userAssignments.map((assignment) => (
                <tr key={assignment.id} className="hover:bg-muted/20 transition">
                  <td className="px-4 py-3 text-foreground font-medium">{assignment.user.username}</td>
                  <td className="px-4 py-3 text-muted-foreground">{assignment.user.displayName ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                        assignment.user.isActive
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                      }`}
                    >
                      {assignment.user.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/users/${assignment.user.id}`}
                      className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
                    >
                      Open User
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
