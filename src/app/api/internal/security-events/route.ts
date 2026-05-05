import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";

type SecurityEventBody = {
  event?: string;
  username?: string;
  userId?: string;
  role?: string;
  detail?: string;
};

export async function POST(req: NextRequest) {
  const internalAuditKey = process.env.JWT_SECRET;
  const providedKey = req.headers.get("x-internal-audit-key");

  if (!internalAuditKey || providedKey !== internalAuditKey) {
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