import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";
import type { NextRequest } from "next/server";

type AuditActor = Partial<Pick<SessionPayload, "userId" | "username" | "role" | "sessionId">>;

export async function writeAuditLog(
  session: SessionPayload | AuditActor | null,
  action: string,
  resource: string,
  detail?: string,
  success = true,
  req?: NextRequest
) {
  await db.auditLog.create({
    data: {
      userId: session?.userId ?? null,
      username: session?.username?.trim() || "anonymous",
      action,
      resource,
      detail: detail ?? null,
      ipAddress: req?.headers.get("x-forwarded-for") ?? req?.ip ?? null,
      success,
    },
  });
}
