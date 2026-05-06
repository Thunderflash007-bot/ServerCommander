import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSmtpEnabled } from "@/lib/mail";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const smtpEnabled = await isSmtpEnabled();
  const current = await db.user.findUnique({ where: { id: user.id } });
  return NextResponse.json({
    user: {
      id: current?.id,
      username: current?.username,
      displayName: current?.displayName,
      email: current?.email,
      twoFactorEnabled: current?.twoFactorEnabled ?? false,
      smtpEnabled,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { email, twoFactorEnabled } = body as { email?: string; twoFactorEnabled?: boolean };

  const updateData: Record<string, unknown> = {};
  if (email !== undefined) updateData.email = email?.trim() || null;
  if (twoFactorEnabled !== undefined) updateData.twoFactorEnabled = !!twoFactorEnabled;

  const updated = await db.user.update({
    where: { id: user.id },
    data: updateData,
  });

  return NextResponse.json({
    user: {
      id: updated.id,
      username: updated.username,
      displayName: updated.displayName,
      email: updated.email,
      twoFactorEnabled: updated.twoFactorEnabled,
    },
  });
}
