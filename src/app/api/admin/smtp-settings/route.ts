import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/secrets";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const smtp = await db.smtpSettings.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    smtp: {
      enabled: smtp?.enabled ?? false,
      host: smtp?.host ?? "",
      port: smtp?.port ?? 587,
      secure: smtp?.secure ?? false,
      username: smtp?.username ?? "",
      fromEmail: smtp?.fromEmail ?? "",
      fromName: smtp?.fromName ?? "",
      useAlias: smtp?.useAlias ?? false,
      hasPassword: !!smtp?.passwordEnc,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const {
    enabled,
    host,
    port,
    secure,
    username,
    password,
    fromEmail,
    fromName,
    useAlias,
  } = body as {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password?: string;
    fromEmail: string;
    fromName?: string;
    useAlias: boolean;
  };

  const existing = await db.smtpSettings.findUnique({ where: { id: "default" } });

  const passwordEnc = password?.trim()
    ? encryptSecret(password.trim())
    : existing?.passwordEnc ?? null;

  const smtp = await db.smtpSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      enabled: !!enabled,
      host: host?.trim() || null,
      port: Number(port) || null,
      secure: !!secure,
      username: username?.trim() || null,
      passwordEnc,
      fromEmail: fromEmail?.trim() || null,
      fromName: fromName?.trim() || null,
      useAlias: !!useAlias,
    },
    update: {
      enabled: !!enabled,
      host: host?.trim() || null,
      port: Number(port) || null,
      secure: !!secure,
      username: username?.trim() || null,
      passwordEnc,
      fromEmail: fromEmail?.trim() || null,
      fromName: fromName?.trim() || null,
      useAlias: !!useAlias,
    },
  });

  await writeAuditLog(
    { userId: user.id, username: user.username, role: user.role, sessionId: "" },
    "UPDATE_SMTP_SETTINGS",
    `smtp:${smtp.id}`,
    `SMTP enabled=${smtp.enabled}`,
    true,
    req
  );

  return NextResponse.json({ success: true });
}
