import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  listContainers,
  getDockerInfo,
  getDockerVersion,
} from "@/lib/docker";
import { canAccessDocker, filterVisibleContainerIds } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import type { FullPermissions } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = user.permissions as FullPermissions | null;

  if (!canAccessDocker(perms)) {
    return NextResponse.json({ error: "Docker access denied" }, { status: 403 });
  }

  try {
    const [containers, info, version] = await Promise.all([
      listContainers(),
      getDockerInfo(),
      getDockerVersion(),
    ]);

    const visibleIds = filterVisibleContainerIds(
      perms,
      containers.map((c) => c.id)
    );

    const filtered = containers.filter((c) => visibleIds.includes(c.id));

    await writeAuditLog(
      { userId: user.id, username: user.username, role: user.role, sessionId: "" },
      "LIST_CONTAINERS",
      "docker",
      undefined,
      true,
      req
    );

    return NextResponse.json({ containers: filtered, info, version });
  } catch (err) {
    console.error("[docker/containers GET]", err);
    return NextResponse.json({ error: "Failed to reach Docker daemon" }, { status: 500 });
  }
}
