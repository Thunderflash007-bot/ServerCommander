import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { writeAuditLog } from "@/lib/audit";
import { buildWelcomeCredentialsMail, isSmtpEnabled, sendMail } from "@/lib/mail";
import { randomBytes } from "crypto";

function generateTemporaryPassword(length = 14): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

// ── GET /api/users — list all users (admin only) ──────────────────────────────

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await db.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      role: true,
      isActive: true,
      createdAt: true,
      permissions: {
        select: {
          dockerAccess: true,
          fsAccess: true,
          terminalAccess: true,
          containerPerms: { select: { containerName: true, containerId: true } },
        },
      },
      permissionGroups: {
        select: {
          group: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ users });
}

// ── POST /api/users — create user (admin only) ────────────────────────────────

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { username, email, permissions } = body;

  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  const smtpEnabled = await isSmtpEnabled();
  if (!smtpEnabled) {
    return NextResponse.json({ error: "SMTP must be configured before creating users" }, { status: 400 });
  }

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "Username already exists" }, { status: 409 });
  }

  if (normalizedEmail) {
    const existingEmail = await db.user.findFirst({ where: { email: normalizedEmail }, select: { id: true } });
    if (existingEmail) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const newUser = await db.user.create({
    data: {
      username,
      email: normalizedEmail,
      passwordHash,
      displayName: null,
      role: "USER",
      mustChangePassword: true,
      permissions: permissions
        ? {
            create: {
              dockerAccess: permissions.dockerAccess ?? false,
              dockerViewAll: permissions.dockerViewAll ?? false,
              dockerImages: permissions.dockerImages ?? false,
              dockerVolumes: permissions.dockerVolumes ?? false,
              dockerNetworks: permissions.dockerNetworks ?? false,
              dockerCreate: permissions.dockerCreate ?? false,
              dockerDelete: permissions.dockerDelete ?? false,
              fsAccess: permissions.fsAccess ?? false,
              terminalAccess: permissions.terminalAccess ?? false,
              terminalReadOnly: permissions.terminalReadOnly ?? true,
              terminalMaxSessions: permissions.terminalMaxSessions ?? 1,
            },
          }
        : {
            create: {},
          },
    },
  });

  await writeAuditLog(
    { userId: currentUser.id, username: currentUser.username, role: currentUser.role, sessionId: "" },
    "CREATE_USER",
    `user:${newUser.id}`,
    `Created: ${username}`,
    true,
    req
  );

  const welcomeMail = buildWelcomeCredentialsMail({
    displayName: username,
    username,
    temporaryPassword,
  });
  await sendMail({
    to: normalizedEmail,
    subject: welcomeMail.subject,
    text: welcomeMail.text,
    html: welcomeMail.html,
  });

  return NextResponse.json(
    {
      user: { id: newUser.id, username: newUser.username },
      mailSent: true,
    },
    { status: 201 }
  );
}
