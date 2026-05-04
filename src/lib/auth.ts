import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";
import type { User } from "@prisma/client";

const SESSION_COOKIE = "sc_session";
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE ?? "28800", 10);

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  username: string;
  role: string;
  sessionId: string;
}

// ── Token helpers ─────────────────────────────────────────────────────────────

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ── Session management ────────────────────────────────────────────────────────

export async function createSession(
  userId: string,
  username: string,
  role: string,
  meta?: { userAgent?: string; ipAddress?: string }
): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  const session = await db.session.create({
    data: {
      userId,
      token: crypto.randomUUID(),
      expiresAt,
      userAgent: meta?.userAgent,
      ipAddress: meta?.ipAddress,
    },
  });

  const jwt = await signToken({ userId, username, role, sessionId: session.id });
  return jwt;
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  // Validate session still exists in DB (not revoked)
  const session = await db.session.findUnique({
    where: { id: payload.sessionId },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return payload;
}

export async function deleteSession(sessionId: string) {
  await db.session.delete({ where: { id: sessionId } }).catch(() => null);
}

export function setSessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: SESSION_MAX_AGE,
    path: "/",
  };
}

export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
}

// ── Current user helpers ──────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<
  (User & { permissions: Awaited<ReturnType<typeof getUserPermissions>> }) | null
> {
  const session = await getSession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
  });

  if (!user || !user.isActive) return null;

  const permissions = await getUserPermissions(user.id);
  return { ...user, permissions };
}

export async function getUserPermissions(userId: string) {
  return db.userPermission.findUnique({
    where: { userId },
    include: {
      containerPerms: true,
      fsPathPerms: true,
    },
  });
}
