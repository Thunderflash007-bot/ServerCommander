import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  listContainers,
  getDockerInfo,
  getDockerVersion,
  createContainerFromSpec,
  duplicateContainerFromSource,
} from "@/lib/docker";
import { canAccessDocker, canCreateContainers, canViewContainer, filterVisibleContainerIds } from "@/lib/rbac";
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

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessDocker(perms) || !canCreateContainers(perms)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json();
  const action = String(body.action ?? "create");

  try {
    if (action === "create") {
      const created = await createContainerFromSpec({
        name: String(body.name ?? "").trim(),
        image: String(body.image ?? "").trim(),
        env: Array.isArray(body.env) ? body.env : [],
        cmd: Array.isArray(body.cmd) ? body.cmd : [],
        ports: Array.isArray(body.ports) ? body.ports : [],
        volumes: Array.isArray(body.volumes) ? body.volumes : [],
        networks: Array.isArray(body.networks) ? body.networks : [],
        restartPolicyName: body.restartPolicyName,
        restartPolicyMaximumRetryCount: Number(body.restartPolicyMaximumRetryCount ?? 0),
        autoStart: body.autoStart !== false,
      });

      await writeAuditLog(
        { userId: user.id, username: user.username, role: user.role, sessionId: "" },
        "CREATE_CONTAINER",
        "docker",
        `name=${String(body.name ?? "")};image=${String(body.image ?? "")}`,
        true,
        req
      );

      return NextResponse.json({ success: true, container: created });
    }

    if (action === "duplicate") {
      const sourceId = String(body.sourceId ?? "").trim();
      if (!sourceId) {
        return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
      }
      if (!canViewContainer(perms, sourceId)) {
        return NextResponse.json({ error: "Permission denied for source container" }, { status: 403 });
      }

      const created = await duplicateContainerFromSource(sourceId, {
        name: String(body.name ?? "").trim() || undefined,
        autoStart: body.autoStart !== false,
      });

      await writeAuditLog(
        { userId: user.id, username: user.username, role: user.role, sessionId: "" },
        "DUPLICATE_CONTAINER",
        `container:${sourceId}`,
        `name=${String(body.name ?? "")}`,
        true,
        req
      );

      return NextResponse.json({ success: true, container: created });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[docker/containers POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
