import { NextRequest, NextResponse } from "next/server";
import { getSession, deleteSession, clearSessionCookie } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session) {
    await deleteSession(session.sessionId);
    await writeAuditLog(session, "LOGOUT", "auth", undefined, true, req);
  }

  const response = NextResponse.json({ success: true });
  const cookie = clearSessionCookie();
  response.cookies.set(cookie);
  return response;
}
