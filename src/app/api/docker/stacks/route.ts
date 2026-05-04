import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessDocker, type FullPermissions } from "@/lib/rbac";
import { deployStack, listStacks, writeStackFile } from "@/lib/stacks";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const perms = user.permissions as FullPermissions | null;
    if (!canAccessDocker(perms)) {
      return NextResponse.json({ error: "Docker access denied" }, { status: 403 });
    }

    const stacks = await listStacks();
    return NextResponse.json({ stacks });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Failed to list stacks" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const perms = user.permissions as FullPermissions | null;
    if (!canAccessDocker(perms) || !perms?.dockerCreate || !perms.dockerViewAll) {
      return NextResponse.json({ error: "Stack creation denied" }, { status: 403 });
    }

    const body = await req.json();
    const name = String(body.name ?? "").trim().toLowerCase();
    const content = String(body.content ?? "");
    const deploy = Boolean(body.deploy ?? true);

    if (!name.match(/^[a-z0-9][a-z0-9_-]{1,62}$/)) {
      return NextResponse.json({ error: "Invalid stack name" }, { status: 400 });
    }

    if (!content.trim()) {
      return NextResponse.json({ error: "Compose content required" }, { status: 400 });
    }

    await writeStackFile(name, content);
    if (deploy) {
      await deployStack(name);
    }

    return NextResponse.json({ success: true, name }, { status: 201 });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Failed to create stack" },
      { status: 500 }
    );
  }
}