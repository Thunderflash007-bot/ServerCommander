import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";
import type { NextRequest } from "next/server";

export async function writeAuditLog(
  session: SessionPayload | null,
  action: string,
  resource: string,
  detail?: string,
  success = true,
  req?: NextRequest
) {
  await db.auditLog.create({
    data: {
      userId: session?.userId ?? null,
      username: session?.username ?? "anonymous",
      action,
      resource,
      detail: detail ?? null,
      ipAddress: req?.headers.get("x-forwarded-for") ?? req?.ip ?? null,
      success,
    },
  });
}
