import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { INTERNAL_RPC_HEADER, isInternalRpcAuthorized } from "@/lib/internal-rpc";

type SecurityEventBody = {
  event?: string;
  username?: string;
  userId?: string;
  role?: string;
  detail?: string;
};

export async function POST(req: NextRequest) {
  const providedKey = req.headers.get(INTERNAL_RPC_HEADER);

  if (!isInternalRpcAuthorized(providedKey)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as SecurityEventBody | null;
  if (!body?.event) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await writeAuditLog(
    body.username
      ? {
          userId: body.userId,
          username: body.username,
          role: body.role,
        }
      : null,
    body.event,
    "security",
    body.detail,
    false,
    req
  );

  return NextResponse.json({ success: true });
}