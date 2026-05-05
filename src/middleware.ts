import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { isCsrfProtectedMethod, isValidSameOriginRequest } from "@/lib/csrf";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/internal/security-events", "/api/internal/auto-update"];

async function logCsrfViolation(req: NextRequest) {
  const token = req.cookies.get("sc_session")?.value;
  const session = token ? await verifyToken(token) : null;
  const internalAuditKey = process.env.JWT_SECRET;

  if (!internalAuditKey) {
    return;
  }

  const detail = JSON.stringify({
    method: req.method,
    path: req.nextUrl.pathname,
    origin: req.headers.get("origin"),
    referer: req.headers.get("referer"),
    secFetchSite: req.headers.get("sec-fetch-site"),
  });

  try {
    await fetch(new URL("/api/internal/security-events", req.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-audit-key": internalAuditKey,
      },
      body: JSON.stringify({
        event: "CSRF_BLOCKED",
        userId: session?.userId,
        username: session?.username,
        role: session?.role,
        detail,
      }),
    });
  } catch (error) {
    console.error("[middleware/csrf-log]", error);
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/") && isCsrfProtectedMethod(req.method) && !isValidSameOriginRequest(req)) {
    await logCsrfViolation(req);
    return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("sc_session")?.value;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const payload = await verifyToken(token);

  if (!payload) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete("sc_session");
    return res;
  }

  // Inject user info into request headers for server components / route handlers
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-user-id", payload.userId);
  requestHeaders.set("x-user-role", payload.role);
  requestHeaders.set("x-session-id", payload.sessionId);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
