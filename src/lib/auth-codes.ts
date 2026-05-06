import { createHash, randomInt } from "crypto";
import { db } from "@/lib/db";

export type AuthCodePurpose = "LOGIN_2FA" | "PASSWORD_RESET";

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function generateNumericCode(length = 6): string {
  const max = 10 ** length;
  const value = randomInt(0, max);
  return String(value).padStart(length, "0");
}

export async function issueAuthCode(userId: string, purpose: AuthCodePurpose, ttlSeconds = 300) {
  const code = generateNumericCode(6);
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const record = await db.authCode.create({
    data: {
      userId,
      purpose,
      codeHash,
      expiresAt,
    },
  });

  return { id: record.id, code, expiresAt };
}

export async function verifyAuthCode(userId: string, purpose: AuthCodePurpose, code: string) {
  const now = new Date();
  const codeHash = hashCode(code);
  const record = await db.authCode.findFirst({
    where: {
      userId,
      purpose,
      codeHash,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return false;

  await db.authCode.update({
    where: { id: record.id },
    data: { consumedAt: now },
  });

  return true;
}

export async function consumeAuthCodeByCode(purpose: AuthCodePurpose, code: string) {
  const now = new Date();
  const codeHash = hashCode(code);
  const record = await db.authCode.findFirst({
    where: {
      purpose,
      codeHash,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return null;

  await db.authCode.update({
    where: { id: record.id },
    data: { consumedAt: now },
  });

  return record.userId;
}
