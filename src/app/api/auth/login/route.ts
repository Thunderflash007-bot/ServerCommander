import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body as { username: string; password: string };

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { username } });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await writeAuditLog(null, "LOGIN_FAILED", "auth", `User: ${username}`, false, req);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await createSession(user.id, user.username, user.role, {
      userAgent: req.headers.get("user-agent") ?? undefined,
      ipAddress: req.headers.get("x-forwarded-for") ?? req.ip,
    }, user.mustChangePassword);

    await writeAuditLog(
      { userId: user.id, username: user.username, role: user.role, sessionId: "" },
      "LOGIN_SUCCESS",
      "auth",
      undefined,
      true,
      req
    );

    const response = NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword },
    });

    const cookie = setSessionCookie(token);
    response.cookies.set(cookie);

    return response;
  } catch (err) {
    console.error("[auth/login]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
