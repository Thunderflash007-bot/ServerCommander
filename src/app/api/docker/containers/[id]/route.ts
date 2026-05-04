import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getContainerInspect,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  getContainerLogs,
} from "@/lib/docker";
import {
  canAccessDocker,
  canViewContainer,
  canStartContainer,
  canStopContainer,
  canRestartContainer,
  canDeleteContainer,
  canViewLogs,
  canInspectContainer,
} from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import type { FullPermissions } from "@/lib/rbac";

type Params = { params: Promise<{ id: string }> };

function deny() {
  return NextResponse.json({ error: "Permission denied" }, { status: 403 });
}

// ── GET /api/docker/containers/[id] — inspect or logs ────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = user.permissions as FullPermissions | null;

  if (!canAccessDocker(perms) || !canViewContainer(perms, id)) return deny();

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "inspect";

  try {
    if (type === "logs") {
      if (!canViewLogs(perms, id)) return deny();
      const tail = parseInt(searchParams.get("tail") ?? "200", 10);
      const logs = await getContainerLogs(id, { tail, timestamps: true });
      await writeAuditLog(
        { userId: user.id, username: user.username, role: user.role, sessionId: "" },
        "VIEW_LOGS",
        `container:${id}`,
        undefined,
        true,
        req
      );
      return NextResponse.json({ logs });
    }

    if (!canInspectContainer(perms, id)) return deny();
    const data = await getContainerInspect(id);
    await writeAuditLog(
      { userId: user.id, username: user.username, role: user.role, sessionId: "" },
      "INSPECT_CONTAINER",
      `container:${id}`,
      undefined,
      true,
      req
    );
    return NextResponse.json({ container: data });
  } catch (err) {
    console.error(`[docker/containers/${id} GET]`, err);
    return NextResponse.json({ error: "Container not found" }, { status: 404 });
  }
}

// ── POST /api/docker/containers/[id] — action ────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = user.permissions as FullPermissions | null;

  if (!canAccessDocker(perms) || !canViewContainer(perms, id)) return deny();

  const body = await req.json();
  const { action } = body as { action: string };

  try {
    switch (action) {
      case "start":
        if (!canStartContainer(perms, id)) return deny();
        await startContainer(id);
        break;
      case "stop":
        if (!canStopContainer(perms, id)) return deny();
        await stopContainer(id);
        break;
      case "restart":
        if (!canRestartContainer(perms, id)) return deny();
        await restartContainer(id);
        break;
      case "remove":
      case "delete":
        if (!canDeleteContainer(perms, id)) return deny();
        await removeContainer(id, body.force ?? false);
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    await writeAuditLog(
      { userId: user.id, username: user.username, role: user.role, sessionId: "" },
      action.toUpperCase() + "_CONTAINER",
      `container:${id}`,
      undefined,
      true,
      req
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[docker/containers/${id} POST]`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── DELETE /api/docker/containers/[id] ───────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessDocker(perms) || !canDeleteContainer(perms, id)) return deny();

  try {
    await removeContainer(id, true);
    await writeAuditLog(
      { userId: user.id, username: user.username, role: user.role, sessionId: "" },
      "DELETE_CONTAINER",
      `container:${id}`,
      undefined,
      true,
      req
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
