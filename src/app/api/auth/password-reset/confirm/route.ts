import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { consumeAuthCodeByCode } from "@/lib/auth-codes";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, newPassword } = body as { code: string; newPassword: string };

    if (!code || !newPassword) {
      return NextResponse.json({ error: "Code and newPassword are required" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const userId = await consumeAuthCodeByCode("PASSWORD_RESET", code);
    if (!userId) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[auth/password-reset/confirm]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
