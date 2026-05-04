import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessDocker, type FullPermissions } from "@/lib/rbac";
import {
  deleteStackFiles,
  deployStack,
  readStackFile,
  removeStack,
  restartStack,
  startStack,
  stopStack,
  writeStackFile,
} from "@/lib/stacks";

type Params = { params: Promise<{ name: string }> };

function isAllowedName(name: string) {
  return /^[a-z0-9][a-z0-9_-]{1,62}$/.test(name);
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { name } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessDocker(perms)) {
    return NextResponse.json({ error: "Docker access denied" }, { status: 403 });
  }

  if (!isAllowedName(name)) {
    return NextResponse.json({ error: "Invalid stack name" }, { status: 400 });
  }

  const content = await readStackFile(name);
  return NextResponse.json({ name, content });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { name } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = user.permissions as FullPermissions | null;
  if (!canAccessDocker(perms) || !perms?.dockerCreate || !perms.dockerViewAll) {
    return NextResponse.json({ error: "Stack update denied" }, { status: 403 });
  }

  if (!isAllowedName(name)) {
    return NextResponse.json({ error: "Invalid stack name" }, { status: 400 });
  }

  const body = await req.json();
  const action = String(body.action ?? "save");

  if (action === "save") {
    await writeStackFile(name, String(body.content ?? ""));
    return NextResponse.json({ success: true });
  }

  if (action === "deploy") {
    await writeStackFile(name, String(body.content ?? await readStackFile(name)));
    await deployStack(name);
    return NextResponse.json({ success: true });
  }

  if (action === "start") {
    await startStack(name);
    return NextResponse.json({ success: true });
  }

  if (action === "stop") {
    await stopStack(name);
    return NextResponse.json({ success: true });
  }

  if (action === "restart") {
    await restartStack(name);
    return NextResponse.json({ success: true });
  }

  if (action === "remove") {
    if (!perms.dockerDelete) {
      return NextResponse.json({ error: "Stack removal denied" }, { status: 403 });
    }
    await removeStack(name);
    await deleteStackFiles(name);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}