import type { NextRequest } from "next/server";
import { isRequestFromTrustedProxy } from "@/lib/network";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeHost(value: string | null): string | null {
  return value?.trim().toLowerCase() || null;
}

function getExpectedOrigin(req: NextRequest): string {
  const trustForwardedHeaders = isRequestFromTrustedProxy(req);
  const forwardedProto = trustForwardedHeaders ? req.headers.get("x-forwarded-proto") : null;
  const protocol = forwardedProto?.split(",")[0]?.trim() || req.nextUrl.protocol.replace(":", "");
  const forwardedHost = trustForwardedHeaders ? req.headers.get("x-forwarded-host") : null;
  const host = normalizeHost(forwardedHost?.split(",")[0] ?? req.headers.get("host"));

  if (!host) {
    return req.nextUrl.origin;
  }

  return `${protocol}://${host}`;
}

function matchesExpectedOrigin(candidate: string | null, expectedOrigin: string): boolean {
  if (!candidate) return false;

  try {
    return new URL(candidate).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function isCsrfProtectedMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function isValidSameOriginRequest(req: NextRequest): boolean {
  if (!isCsrfProtectedMethod(req.method)) {
    return true;
  }

  const expectedOrigin = getExpectedOrigin(req);
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const secFetchSite = req.headers.get("sec-fetch-site");

  if (matchesExpectedOrigin(origin, expectedOrigin)) {
    return secFetchSite == null || secFetchSite === "same-origin" || secFetchSite === "same-site";
  }

  if (!origin && matchesExpectedOrigin(referer, expectedOrigin)) {
    return secFetchSite == null || secFetchSite === "same-origin" || secFetchSite === "same-site";
  }

  return false;
}