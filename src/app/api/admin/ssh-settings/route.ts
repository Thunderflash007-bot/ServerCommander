import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/secrets";
import { writeAuditLog } from "@/lib/audit";

type AuthMode = "password" | "key";

function normalizePrivateKey(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  return normalized ? `${normalized}\n` : "";
}

function toPort(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("SSH port must be between 1 and 65535");
  }
  return parsed;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ssh = await db.sshSettings.findUnique({ where: { id: "default" } });

  return NextResponse.json({
    ssh: {
      enabled: ssh?.enabled ?? false,
      host: ssh?.host ?? "",
      port: ssh?.port ?? 22,
      username: ssh?.username ?? "",
      sftpRoot: ssh?.sftpRoot ?? "/",
      hostKeySha256: (ssh as { hostKeySha256?: string | null })?.hostKeySha256 ?? "",
      authMode: ssh?.privateKeyEnc ? "key" : "password",
      hasPassword: !!ssh?.passwordEnc,
      hasPrivateKey: !!ssh?.privateKeyEnc,
      hasPassphrase: !!ssh?.keyPassphraseEnc,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    host?: string;
    port?: number;
    username?: string;
    sftpRoot?: string;
    hostKeySha256?: string;
    authMode?: AuthMode;
    password?: string;
    privateKey?: string;
    keyPassphrase?: string;
  };

  const existing = await db.sshSettings.findUnique({ where: { id: "default" } });

  const enabled = !!body.enabled;
  const host = String(body.host ?? "").trim();
  const username = String(body.username ?? "").trim();
  const sftpRoot = String(body.sftpRoot ?? "/").trim() || "/";
  const hostKeySha256 = String(body.hostKeySha256 ?? "").trim();
  const port = toPort(body.port ?? 22);
  const authMode: AuthMode = body.authMode === "key" ? "key" : "password";

  let passwordEnc: string | null = null;
  let privateKeyEnc: string | null = null;
  let keyPassphraseEnc: string | null = null;

  if (authMode === "password") {
    passwordEnc = typeof body.password === "string" && body.password.trim().length > 0
      ? encryptSecret(body.password)
      : existing?.passwordEnc ?? null;
  } else {
    privateKeyEnc = typeof body.privateKey === "string" && body.privateKey.trim().length > 0
      ? encryptSecret(normalizePrivateKey(body.privateKey))
      : existing?.privateKeyEnc ?? null;

    keyPassphraseEnc = typeof body.keyPassphrase === "string" && body.keyPassphrase.trim().length > 0
      ? encryptSecret(body.keyPassphrase)
      : existing?.keyPassphraseEnc ?? null;
  }

  if (enabled) {
    if (!host || !username) {
      return NextResponse.json({ error: "host and username are required when SSH/SFTP is enabled" }, { status: 400 });
    }
    if (authMode === "password" && !passwordEnc) {
      return NextResponse.json({ error: "password is required for password auth" }, { status: 400 });
    }
    if (authMode === "key" && !privateKeyEnc) {
      return NextResponse.json({ error: "private key is required for key auth" }, { status: 400 });
    }
  }

  const ssh = await db.sshSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      enabled,
      host: host || null,
      port,
      username: username || null,
      passwordEnc,
      privateKeyEnc,
      keyPassphraseEnc,
      hostKeySha256: hostKeySha256 || null,
      sftpRoot,
    },
    update: {
      enabled,
      host: host || null,
      port,
      username: username || null,
      passwordEnc,
      privateKeyEnc,
      keyPassphraseEnc,
      hostKeySha256: hostKeySha256 || null,
      sftpRoot,
    },
  });

  await writeAuditLog(
    { userId: user.id, username: user.username, role: user.role, sessionId: "" },
    "UPDATE_SSH_SETTINGS",
    `ssh:${ssh.id}`,
    `ssh enabled=${ssh.enabled}`,
    true,
    req
  );

  return NextResponse.json({ success: true });
}
