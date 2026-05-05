import { NextRequest, NextResponse } from "next/server";
import { runAutoUpdateCycle } from "@/lib/auto-update";

export async function POST(req: NextRequest) {
  const internalAuditKey = process.env.JWT_SECRET;
  const providedKey = req.headers.get("x-internal-audit-key");

  if (!internalAuditKey || providedKey !== internalAuditKey) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await runAutoUpdateCycle();
  return NextResponse.json({ success: true });
}