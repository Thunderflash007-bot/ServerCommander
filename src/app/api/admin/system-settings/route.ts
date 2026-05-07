import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

type SystemSettingsResponse = {
  sessionMaxAge: number;
  cookieSecure: boolean;
  trustedProxies: string;
  dockerHost: string;
  hostFsSource: string;
  hasInternalRpcSecret: boolean;
};

type SystemSettingsPatchBody = {
  sessionMaxAge?: number;
  cookieSecure?: boolean;
  trustedProxies?: string;
  dockerHost?: string;
  hostFsSource?: string;
  internalRpcSecret?: string;
};

const ENV_FILE = path.join(process.cwd(), ".env");

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getCurrentSettings(): SystemSettingsResponse {
  return {
    sessionMaxAge: Number(process.env.SESSION_MAX_AGE ?? "28800") || 28800,
    cookieSecure: parseBoolean(process.env.COOKIE_SECURE, false),
    trustedProxies: (process.env.TRUSTED_PROXIES ?? "").trim(),
    dockerHost: (process.env.DOCKER_HOST ?? "tcp://docker-socket-proxy:2375").trim(),
    hostFsSource: (process.env.HOST_FS_SOURCE ?? "/srv/servercommander").trim(),
    hasInternalRpcSecret: !!(process.env.INTERNAL_RPC_SECRET ?? "").trim(),
  };
}

function validateTrustedProxies(value: string): string {
  const normalized = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const validProxyPattern = /^[a-fA-F0-9:.]+$/;
  for (const proxy of normalized) {
    if (!validProxyPattern.test(proxy)) {
      throw new Error(`Invalid proxy IP entry: ${proxy}`);
    }
  }

  return normalized.join(",");
}

function validateDockerHost(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("DOCKER_HOST is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("DOCKER_HOST must be a valid URL");
  }

  if (!["tcp:", "unix:"].includes(parsed.protocol)) {
    throw new Error("DOCKER_HOST must use tcp:// or unix://");
  }

  return normalized;
}

function validateHostFsSource(value: string): string {
  const normalized = value.trim();
  if (!normalized.startsWith("/")) {
    throw new Error("HOST_FS_SOURCE must be an absolute path");
  }
  return normalized;
}

function validateSessionMaxAge(value: number): number {
  if (!Number.isInteger(value) || value < 300 || value > 7 * 24 * 60 * 60) {
    throw new Error("SESSION_MAX_AGE must be an integer between 300 and 604800");
  }
  return value;
}

function validateInternalRpcSecret(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized.length < 32) {
    throw new Error("INTERNAL_RPC_SECRET must be at least 32 characters");
  }
  return normalized;
}

function upsertEnvValue(content: string, key: string, value: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const linePattern = new RegExp(`^${escapedKey}=.*$`, "m");
  const nextLine = `${key}=${value}`;

  if (linePattern.test(content)) {
    return content.replace(linePattern, nextLine);
  }

  const suffix = content.endsWith("\n") ? "" : "\n";
  return `${content}${suffix}${nextLine}\n`;
}

function toEnvBoolean(value: boolean): string {
  return value ? "true" : "false";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ settings: getCurrentSettings() });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as SystemSettingsPatchBody;
  const current = getCurrentSettings();

  try {
    const sessionMaxAge = validateSessionMaxAge(Number(body.sessionMaxAge ?? current.sessionMaxAge));
    const cookieSecure = Boolean(body.cookieSecure ?? current.cookieSecure);
    const trustedProxies = validateTrustedProxies(String(body.trustedProxies ?? current.trustedProxies));
    const dockerHost = validateDockerHost(String(body.dockerHost ?? current.dockerHost));
    const hostFsSource = validateHostFsSource(String(body.hostFsSource ?? current.hostFsSource));
    const internalRpcSecret = validateInternalRpcSecret(String(body.internalRpcSecret ?? ""));

    const fileContent = await fs.readFile(ENV_FILE, "utf-8");
    let nextContent = fileContent;
    nextContent = upsertEnvValue(nextContent, "SESSION_MAX_AGE", String(sessionMaxAge));
    nextContent = upsertEnvValue(nextContent, "COOKIE_SECURE", toEnvBoolean(cookieSecure));
    nextContent = upsertEnvValue(nextContent, "TRUSTED_PROXIES", trustedProxies);
    nextContent = upsertEnvValue(nextContent, "DOCKER_HOST", dockerHost);
    nextContent = upsertEnvValue(nextContent, "HOST_FS_SOURCE", hostFsSource);
    if (internalRpcSecret) {
      nextContent = upsertEnvValue(nextContent, "INTERNAL_RPC_SECRET", internalRpcSecret);
    }

    await fs.writeFile(ENV_FILE, nextContent, { encoding: "utf-8", mode: 0o600 });

    // Keep process-level config aligned for settings that can be applied without restart.
    process.env.SESSION_MAX_AGE = String(sessionMaxAge);
    process.env.COOKIE_SECURE = toEnvBoolean(cookieSecure);
    process.env.TRUSTED_PROXIES = trustedProxies;
    process.env.DOCKER_HOST = dockerHost;
    process.env.HOST_FS_SOURCE = hostFsSource;
    if (internalRpcSecret) {
      process.env.INTERNAL_RPC_SECRET = internalRpcSecret;
    }

    await writeAuditLog(
      { userId: user.id, username: user.username, role: user.role, sessionId: "" },
      "UPDATE_SYSTEM_SETTINGS",
      "system:security",
      "Updated system security/runtime settings",
      true,
      req
    );

    return NextResponse.json({
      success: true,
      restartRequired: true,
      settings: {
        sessionMaxAge,
        cookieSecure,
        trustedProxies,
        dockerHost,
        hostFsSource,
        hasInternalRpcSecret: !!(process.env.INTERNAL_RPC_SECRET ?? "").trim(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update settings" },
      { status: 400 }
    );
  }
}