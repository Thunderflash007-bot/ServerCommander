import { NextRequest, NextResponse } from "next/server";
import { runAutoUpdateCycle } from "@/lib/auto-update";
import { INTERNAL_RPC_HEADER, isInternalRpcAuthorized } from "@/lib/internal-rpc";

export async function POST(req: NextRequest) {
  const providedKey = req.headers.get(INTERNAL_RPC_HEADER);

  if (!isInternalRpcAuthorized(providedKey)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await runAutoUpdateCycle();
  return NextResponse.json({ success: true });
}