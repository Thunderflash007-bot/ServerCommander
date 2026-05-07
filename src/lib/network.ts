import type { NextRequest, NextResponse } from "next/server";

const DEFAULT_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
].join("; ");

function normalizeIp(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
}

function getTrustedProxyList(): string[] {
  return (process.env.TRUSTED_PROXIES ?? "")
    .split(",")
    .map((entry) => normalizeIp(entry))
    .filter((entry): entry is string => !!entry);
}

export function isRequestFromTrustedProxy(req: NextRequest): boolean {
  const trustedProxies = getTrustedProxyList();
  if (trustedProxies.length === 0) return false;

  const sourceIp = normalizeIp(req.ip ?? req.headers.get("x-real-ip"));
  return !!sourceIp && trustedProxies.includes(sourceIp);
}

function getForwardedForClientIp(req: NextRequest): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (!forwardedFor) return null;

  const firstIp = normalizeIp(forwardedFor.split(",")[0]);
  return firstIp;
}

export function getClientIp(req: NextRequest): string | null {
  const sourceIp = normalizeIp(req.ip ?? req.headers.get("x-real-ip"));

  if (isRequestFromTrustedProxy(req)) {
    return getForwardedForClientIp(req) ?? sourceIp;
  }

  return sourceIp;
}

export function applySecurityHeaders(response: NextResponse): NextResponse {
  if (!response.headers.has("Content-Security-Policy")) {
    response.headers.set("Content-Security-Policy", process.env.CSP_HEADER?.trim() || DEFAULT_CSP);
  }
  if (!response.headers.has("X-Frame-Options")) {
    response.headers.set("X-Frame-Options", "DENY");
  }
  if (!response.headers.has("X-Content-Type-Options")) {
    response.headers.set("X-Content-Type-Options", "nosniff");
  }
  if (!response.headers.has("Referrer-Policy")) {
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  if (!response.headers.has("Permissions-Policy")) {
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  }

  return response;
}