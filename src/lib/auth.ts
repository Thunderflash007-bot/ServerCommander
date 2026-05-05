import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";

const SESSION_COOKIE = "sc_session";
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE ?? "28800", 10);

function isCookieSecure(): boolean {
  const raw = (process.env.COOKIE_SECURE ?? "false").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

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
  mustChangePassword?: boolean;
}

type CurrentUser = {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions: Awaited<ReturnType<typeof getUserPermissions>>;
};

type MergedPermissionGroup = {
  dockerAccess: boolean;
  dockerViewAll: boolean;
  dockerImages: boolean;
  dockerVolumes: boolean;
  dockerNetworks: boolean;
  dockerCreate: boolean;
  dockerDelete: boolean;
  fsAccess: boolean;
  terminalAccess: boolean;
  terminalReadOnly: boolean;
  terminalMaxSessions: number;
};

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
  meta?: { userAgent?: string; ipAddress?: string },
  mustChangePassword?: boolean
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

  const jwt = await signToken({
    userId,
    username,
    role,
    sessionId: session.id,
    mustChangePassword,
  });
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
    secure: isCookieSecure(),
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
    secure: isCookieSecure(),
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
}

// ── Current user helpers ──────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<
  CurrentUser | null
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
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      permissions: {
        include: {
          containerPerms: true,
          fsPathPerms: true,
        },
      },
      permissionGroups: {
        include: {
          group: true,
        },
      },
    },
  });

  if (!user) return null;

  const manual = user.permissions;
  const rawGroups = ((user as unknown as {
    permissionGroups?: Array<{ group: MergedPermissionGroup }>;
  }).permissionGroups ?? []);
  const groups: MergedPermissionGroup[] = rawGroups.map((entry) => entry.group);
  if (!manual && groups.length === 0) return null;

  return {
    id: manual?.id ?? `group-only-${userId}`,
    userId,
    dockerAccess: (manual?.dockerAccess ?? false) || groups.some((g) => g.dockerAccess),
    dockerViewAll: (manual?.dockerViewAll ?? false) || groups.some((g) => g.dockerViewAll),
    dockerImages: (manual?.dockerImages ?? false) || groups.some((g) => g.dockerImages),
    dockerVolumes: (manual?.dockerVolumes ?? false) || groups.some((g) => g.dockerVolumes),
    dockerNetworks: (manual?.dockerNetworks ?? false) || groups.some((g) => g.dockerNetworks),
    dockerCreate: (manual?.dockerCreate ?? false) || groups.some((g) => g.dockerCreate),
    dockerDelete: (manual?.dockerDelete ?? false) || groups.some((g) => g.dockerDelete),
    fsAccess: (manual?.fsAccess ?? false) || groups.some((g) => g.fsAccess),
    terminalAccess: (manual?.terminalAccess ?? false) || groups.some((g) => g.terminalAccess),
    terminalReadOnly:
      (manual?.terminalReadOnly ?? true) && groups.every((g) => g.terminalReadOnly),
    terminalMaxSessions: Math.max(
      manual?.terminalMaxSessions ?? 1,
      ...groups.map((g) => g.terminalMaxSessions)
    ),
    containerPerms: manual?.containerPerms ?? [],
    fsPathPerms: manual?.fsPathPerms ?? [],
  };
}
