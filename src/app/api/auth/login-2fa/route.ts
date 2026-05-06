import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/auth";
import { verifyAuthCode } from "@/lib/auth-codes";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { challengeId, code } = body as { challengeId: string; code: string };

    if (!challengeId || !code) {
      return NextResponse.json({ error: "challengeId and code are required" }, { status: 400 });
    }

    const challenge = await db.authCode.findUnique({ where: { id: challengeId } });
    if (!challenge || challenge.purpose !== "LOGIN_2FA") {
      return NextResponse.json({ error: "Invalid challenge" }, { status: 400 });
    }

    const ok = await verifyAuthCode(challenge.userId, "LOGIN_2FA", code);
    if (!ok) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { id: challenge.userId } });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = await createSession(user.id, user.username, user.role, {
      userAgent: req.headers.get("user-agent") ?? undefined,
      ipAddress: req.headers.get("x-forwarded-for") ?? req.ip,
    }, user.mustChangePassword);

    await writeAuditLog(
      { userId: user.id, username: user.username, role: user.role, sessionId: "" },
      "LOGIN_SUCCESS_2FA",
      "auth",
      undefined,
      true,
      req
    );

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    });
    response.cookies.set(setSessionCookie(token));
    return response;
  } catch (err) {
    console.error("[auth/login-2fa]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
