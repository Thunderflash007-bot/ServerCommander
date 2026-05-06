import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isSmtpEnabled } from "@/lib/mail";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const smtpEnabled = await isSmtpEnabled();
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.twoFactorEnabled,
      smtpEnabled,
    },
    permissions: user.permissions,
  });
}
