import { getCurrentUser } from "@/lib/auth";
import { canAccessTerminal } from "@/lib/rbac";
import type { FullPermissions } from "@/lib/rbac";
import { TerminalManager } from "@/components/terminal/TerminalManager";
import { redirect } from "next/navigation";

export default async function TerminalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessTerminal(perms)) redirect("/dashboard");

  return (
    <div className="flex flex-col h-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Terminal</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Shell access to the host system
          {perms?.terminalReadOnly && (
            <span className="ml-2 inline-flex items-center rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-500 border border-yellow-500/20">
              Read-Only Mode
            </span>
          )}
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <TerminalManager
          maxSessions={perms?.terminalMaxSessions ?? 1}
          readOnly={perms?.terminalReadOnly ?? true}
        />
      </div>
    </div>
  );
}
