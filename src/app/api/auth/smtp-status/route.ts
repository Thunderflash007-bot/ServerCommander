import { NextResponse } from "next/server";
import { isSmtpEnabled } from "@/lib/mail";

export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = await isSmtpEnabled();
  return NextResponse.json({ enabled });
}
