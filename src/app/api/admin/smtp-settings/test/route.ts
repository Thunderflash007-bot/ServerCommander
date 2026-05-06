import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildSmtpTestMail, getSmtpSettings, isSmtpEnabled, sendMail } from "@/lib/mail";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { recipient } = (await req.json().catch(() => ({}))) as { recipient?: string };
  const target = recipient?.trim().toLowerCase();

  if (!target) {
    return NextResponse.json({ error: "recipient is required" }, { status: 400 });
  }

  const smtpEnabled = await isSmtpEnabled();
  if (!smtpEnabled) {
    return NextResponse.json({ error: "SMTP is disabled or incomplete" }, { status: 400 });
  }

  const smtp = await getSmtpSettings();
  if (!smtp?.host || !smtp.port || !smtp.fromEmail) {
    return NextResponse.json({ error: "SMTP config incomplete" }, { status: 400 });
  }

  try {
    const smtpTestMail = buildSmtpTestMail({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      fromEmail: smtp.fromEmail,
    });
    await sendMail({
      to: target,
      subject: smtpTestMail.subject,
      text: smtpTestMail.text,
      html: smtpTestMail.html,
    });

    await writeAuditLog(
      { userId: user.id, username: user.username, role: user.role, sessionId: "" },
      "SMTP_TEST_SUCCESS",
      `smtp:${smtp.id}`,
      `recipient=${target}`,
      true,
      req
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMTP test failed";

    await writeAuditLog(
      { userId: user.id, username: user.username, role: user.role, sessionId: "" },
      "SMTP_TEST_FAILED",
      `smtp:${smtp.id}`,
      `recipient=${target}; error=${message}`,
      false,
      req
    );

    return NextResponse.json({ error: message }, { status: 400 });
  }
}