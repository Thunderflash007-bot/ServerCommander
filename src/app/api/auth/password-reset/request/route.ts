import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { issueAuthCode } from "@/lib/auth-codes";
import { isSmtpEnabled, sendMail } from "@/lib/mail";

export async function POST(req: NextRequest) {
  try {
    const smtpEnabled = await isSmtpEnabled();
    if (!smtpEnabled) {
      return NextResponse.json(
        { error: "Password reset via mail is disabled. Contact your administrator." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { identifier } = body as { identifier: string };
    const id = (identifier ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Identifier is required" }, { status: 400 });
    }

    const user = await db.user.findFirst({
      where: {
        OR: [{ username: id }, { email: id }],
      },
    });

    // Always return success-like response to avoid account enumeration.
    if (!user || !user.email || !user.isActive) {
      return NextResponse.json({ success: true });
    }

    const challenge = await issueAuthCode(user.id, "PASSWORD_RESET", 600);
    await sendMail({
      to: user.email,
      subject: "ServerCommander Password Reset Code",
      text: `Hello ${user.displayName ?? user.username},\n\nYour password reset code is: ${challenge.code}\n\nThis code expires in 10 minutes.`,
    });

    return NextResponse.json({ success: true, routedToCodeEntry: true });
  } catch (err) {
    console.error("[auth/password-reset/request]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}