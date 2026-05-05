import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteRegistry, listRegistries, saveRegistry } from "@/lib/registries";

function deny(status = 403, error = "Forbidden") {
  return NextResponse.json({ error }, { status });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return deny(401, "Unauthorized");
  if (user.role !== "ADMIN") return deny();

  const registries = await listRegistries();
  return NextResponse.json({ registries });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return deny(401, "Unauthorized");
    if (user.role !== "ADMIN") return deny();

    const body = await req.json();
    const registry = await saveRegistry({
      id: typeof body.id === "string" ? body.id : undefined,
      name: String(body.name ?? ""),
      server: String(body.server ?? ""),
      username: String(body.username ?? ""),
      password: String(body.password ?? ""),
    });

    return NextResponse.json({ registry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save registry" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return deny(401, "Unauthorized");
  if (user.role !== "ADMIN") return deny();

  const { searchParams } = new URL(req.url);
  const id = String(searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Registry id required" }, { status: 400 });
  }

  await deleteRegistry(id);
  return NextResponse.json({ success: true });
}