import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessDocker, type FullPermissions } from "@/lib/rbac";
import {
  deleteStackFiles,
  deployStack,
  listStackFiles,
  readStackFile,
  readStackEntry,
  removeStack,
  restartStack,
  startStack,
  stopStack,
  validateStack,
  writeStackFile,
} from "@/lib/stacks";

type Params = { params: Promise<{ name: string }> };

function isAllowedName(name: string) {
  return /^[a-z0-9][a-z0-9_-]{1,62}$/.test(name);
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
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

    const requestedFile = String(new URL(_req.url).searchParams.get("file") ?? "").trim();
    const files = await listStackFiles(name);
    const selectedFile = requestedFile || files[0]?.path || "docker-compose.yml";
    const content = selectedFile === "docker-compose.yml" && files.length === 0
      ? await readStackFile(name)
      : await readStackEntry(name, selectedFile);
    return NextResponse.json({ name, content, files, selectedFile });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Failed to read stack" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
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
    const file = String(body.file ?? "docker-compose.yml");

    if (action === "save") {
      await writeStackFile(name, String(body.content ?? ""), file);
      return NextResponse.json({ success: true });
    }

    if (action === "add-file") {
      await writeStackFile(name, String(body.content ?? ""), file);
      return NextResponse.json({ success: true });
    }

    if (action === "validate") {
      await writeStackFile(name, String(body.content ?? await readStackEntry(name, file)), file);
      const result = await validateStack(name);
      return NextResponse.json({ success: true, output: result.stdout || result.stderr || "Compose file is valid" });
    }

    if (action === "deploy") {
      await writeStackFile(name, String(body.content ?? await readStackEntry(name, file)), file);
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
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Failed to update stack" },
      { status: 500 }
    );
  }
}