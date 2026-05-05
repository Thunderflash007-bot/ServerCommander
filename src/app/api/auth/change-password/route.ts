import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

// ── POST /api/auth/change-password — change password for current user ────────

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body as {
      currentPassword: string;
      newPassword: string;
    };

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Both current and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Verify current password
    const user = await db.user.findUnique({
      where: { id: currentUser.id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const storedHash = user.passwordHash ?? "";
    const looksLikeBcrypt = /^\$2[aby]\$\d{2}\$/.test(storedHash);
    const isPasswordValid = looksLikeBcrypt
      ? await bcrypt.compare(currentPassword, storedHash)
      : currentPassword === storedHash;
    if (!isPasswordValid) {
      await writeAuditLog(
        {
          userId: currentUser.id,
          username: currentUser.username,
          role: currentUser.role,
          sessionId: "",
        },
        "CHANGE_PASSWORD_FAILED",
        `user:${currentUser.id}`,
        `Invalid current password provided`,
        false,
        req
      );
      return NextResponse.json(
        { error: "Invalid current password" },
        { status: 401 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const updatedUser = await db.user.update({
      where: { id: currentUser.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    await writeAuditLog(
      {
        userId: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        sessionId: "",
      },
      "CHANGE_PASSWORD",
      `user:${currentUser.id}`,
      `User successfully changed password`,
      true,
      req
    );

    return NextResponse.json({
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        mustChangePassword: updatedUser.mustChangePassword,
      },
    });
  } catch (err) {
    console.error("[auth/change-password]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
