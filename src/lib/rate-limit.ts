import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS_PER_IP = 10;
const LOGIN_MAX_ATTEMPTS_PER_USERNAME = 5;
const LOGIN_RATE_LIMIT_ACTIONS = ["LOGIN_FAILED", "LOGIN_RATE_LIMITED"] as const;

type LoginRateLimitResult = {
  blocked: boolean;
  retryAfterSeconds: number;
  ipAddress: string | null;
};

function getClientIp(req: NextRequest): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  return req.ip ?? null;
}

function getRetryAfterSeconds(oldestAttemptAt: Date | null, now: number) {
  if (!oldestAttemptAt) return Math.ceil(LOGIN_WINDOW_MS / 1000);

  const unlockAt = oldestAttemptAt.getTime() + LOGIN_WINDOW_MS;
  return Math.max(1, Math.ceil((unlockAt - now) / 1000));
}

export async function getLoginRateLimit(username: string, req: NextRequest): Promise<LoginRateLimitResult> {
  const trimmedUsername = username.trim();
  const ipAddress = getClientIp(req);
  const windowStart = new Date(Date.now() - LOGIN_WINDOW_MS);
  const now = Date.now();

  const [ipAttempts, usernameAttempts] = await Promise.all([
    ipAddress
      ? db.auditLog.findMany({
          where: {
            action: { in: [...LOGIN_RATE_LIMIT_ACTIONS] },
            createdAt: { gte: windowStart },
            ipAddress,
          },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
    trimmedUsername
      ? db.auditLog.findMany({
          where: {
            action: { in: [...LOGIN_RATE_LIMIT_ACTIONS] },
            createdAt: { gte: windowStart },
            username: trimmedUsername,
          },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  if (usernameAttempts.length >= LOGIN_MAX_ATTEMPTS_PER_USERNAME) {
    return {
      blocked: true,
      retryAfterSeconds: getRetryAfterSeconds(usernameAttempts[0]?.createdAt ?? null, now),
      ipAddress,
    };
  }

  if (ipAttempts.length >= LOGIN_MAX_ATTEMPTS_PER_IP) {
    return {
      blocked: true,
      retryAfterSeconds: getRetryAfterSeconds(ipAttempts[0]?.createdAt ?? null, now),
      ipAddress,
    };
  }

  return {
    blocked: false,
    retryAfterSeconds: 0,
    ipAddress,
  };
}