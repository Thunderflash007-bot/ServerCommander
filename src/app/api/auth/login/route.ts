import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getLoginRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body as { username: string; password: string };
    const normalizedUsername = typeof username === "string" ? username.trim() : "";

    if (!normalizedUsername || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    const rateLimit = await getLoginRateLimit(normalizedUsername, req);
    if (rateLimit.blocked) {
      await writeAuditLog(
        { username: normalizedUsername },
        "LOGIN_RATE_LIMITED",
        "auth",
        `Retry after ${rateLimit.retryAfterSeconds}s`,
        false,
        req
      );

      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const user = await db.user.findUnique({ where: { username: normalizedUsername } });

    if (!user || !user.isActive) {
      await writeAuditLog(
        { username: normalizedUsername },
        "LOGIN_FAILED",
        "auth",
        "Invalid credentials",
        false,
        req
      );
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const storedHash = user.passwordHash ?? "";
    const looksLikeBcrypt = /^\$2[aby]\$\d{2}\$/.test(storedHash);

    const valid = looksLikeBcrypt
      ? await bcrypt.compare(password, storedHash)
      : password === storedHash;

    // Legacy migration: if an old plaintext password is still in DB,
    // upgrade it to bcrypt immediately after successful login.
    if (valid && !looksLikeBcrypt) {
      const migratedHash = await bcrypt.hash(password, 12);
      await db.user.update({
        where: { id: user.id },
        data: { passwordHash: migratedHash },
      });
    }

    if (!valid) {
      await writeAuditLog(
        { userId: user.id, username: normalizedUsername, role: user.role },
        "LOGIN_FAILED",
        "auth",
        "Invalid credentials",
        false,
        req
      );
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
