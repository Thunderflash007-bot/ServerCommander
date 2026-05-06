import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isSshBackendEnabled, resolveRemotePath, statRemotePath, withSftpClient } from "@/lib/remote-files";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!(await isSshBackendEnabled())) {
    return NextResponse.json({ error: "SSH/SFTP is disabled" }, { status: 400 });
  }

  try {
    await withSftpClient(async (sftp) => {
      const rootPath = await resolveRemotePath("/");
      await statRemotePath(sftp, rootPath);
    });

    await writeAuditLog(
      { userId: user.id, username: user.username, role: user.role, sessionId: "" },
      "SSH_TEST_SUCCESS",
      "ssh:default",
      "SSH/SFTP test successful",
      true,
      req
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SSH/SFTP test failed";

    await writeAuditLog(
      { userId: user.id, username: user.username, role: user.role, sessionId: "" },
      "SSH_TEST_FAILED",
      "ssh:default",
      message,
      false,
      req
    );

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
