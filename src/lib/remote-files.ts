import SftpClient from "ssh2-sftp-client";
import path from "path";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/secrets";

export type RemoteFileStat = {
  isDirectory: boolean;
  size: number;
  modified: Date;
};

type SshBackendSettings = {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  passwordEnc: string;
  privateKeyEnc: string;
  keyPassphraseEnc: string;
  hostKeySha256: string;
  sftpRoot: string;
};

function normalizeSshHostFingerprint(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const withoutPrefix = raw.replace(/^SHA256:/i, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(withoutPrefix)) {
    throw new Error("SSH host fingerprint must be SHA256 base64 (optionally prefixed with 'SHA256:')");
  }
  return withoutPrefix;
}

function isSameFingerprint(actualHash: string, expectedHash: string): boolean {
  const a = Buffer.from(actualHash, "utf-8");
  const b = Buffer.from(expectedHash, "utf-8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function loadSshBackendSettings(): Promise<SshBackendSettings> {
  const settings = await db.sshSettings.findUnique({ where: { id: "default" } });
  if (settings) {
    return {
      enabled: !!settings.enabled,
      host: settings.host?.trim() ?? "",
      port: Number(settings.port ?? 22),
      username: settings.username?.trim() ?? "",
      passwordEnc: settings.passwordEnc?.trim() ?? "",
      privateKeyEnc: settings.privateKeyEnc?.trim() ?? "",
      keyPassphraseEnc: settings.keyPassphraseEnc?.trim() ?? "",
      hostKeySha256: (settings as { hostKeySha256?: string | null }).hostKeySha256?.trim() ?? "",
      sftpRoot: settings.sftpRoot?.trim() || "/",
    };
  }

  return {
    enabled: String(process.env.SSH_ENABLED ?? "false").toLowerCase() === "true",
    host: process.env.SSH_HOST?.trim() ?? "",
    port: Number(process.env.SSH_PORT ?? "22"),
    username: process.env.SSH_USERNAME?.trim() ?? "",
    passwordEnc: process.env.SSH_PASSWORD_ENC?.trim() ?? "",
    privateKeyEnc: process.env.SSH_PRIVATE_KEY_ENC?.trim() ?? "",
    keyPassphraseEnc: process.env.SSH_KEY_PASSPHRASE_ENC?.trim() ?? "",
    hostKeySha256: process.env.SSH_HOST_KEY_SHA256?.trim() ?? "",
    sftpRoot: process.env.SSH_SFTP_ROOT?.trim() || "/",
  };
}

function getRequiredSetting(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Missing SSH setting: ${name}`);
  }
  return normalized;
}

export async function isSshBackendEnabled(): Promise<boolean> {
  const settings = await loadSshBackendSettings();
  return settings.enabled;
}

export async function getSshConfig() {
  const settings = await loadSshBackendSettings();
  const fallbackPassword = process.env.SSH_PASSWORD?.trim();

  const privateKey = settings.privateKeyEnc ? decryptSecret(settings.privateKeyEnc) : "";
  const passphrase = settings.keyPassphraseEnc ? decryptSecret(settings.keyPassphraseEnc) : "";
  const hostKeySha256 = normalizeSshHostFingerprint(settings.hostKeySha256);

  let password = "";
  if (settings.passwordEnc) {
    password = decryptSecret(settings.passwordEnc);
  } else if (fallbackPassword) {
    // Backward compatibility for older .env files.
    password = fallbackPassword;
  }

  if (!privateKey && !password) {
    throw new Error("Missing SSH credentials. Set private key or password in SSH settings");
  }

  const port = Number(settings.port || 22);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error("SSH port must be between 1 and 65535");
  }

  return {
    host: getRequiredSetting(settings.host, "host"),
    port,
    username: getRequiredSetting(settings.username, "username"),
    password: privateKey ? undefined : password,
    privateKey: privateKey || undefined,
    passphrase: privateKey ? passphrase || undefined : undefined,
    hostHash: hostKeySha256 ? "sha256" : undefined,
    hostVerifier: hostKeySha256 ? ((hashedKey: string) => isSameFingerprint(hashedKey, hostKeySha256)) : undefined,
    tryKeyboard: !privateKey,
    onKeyboardInteractive: !privateKey
      ? (_name: string, _instructions: string, _lang: string, _prompts: Array<{ prompt: string; echo: boolean }>, finish: (answers: string[]) => void) => {
          finish([password]);
        }
      : undefined,
  };
}

async function getSftpRoot(): Promise<string> {
  const settings = await loadSshBackendSettings();
  const root = settings.sftpRoot || "/";
  const normalized = path.posix.normalize(root);
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function normalizeVirtualPath(requestedPath: string): string {
  const normalized = path.posix.normalize(requestedPath || "/");
  const withSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withSlash === "" ? "/" : withSlash;
}

export async function resolveRemotePath(virtualPath: string): Promise<string> {
  const root = await getSftpRoot();
  const normalizedVirtual = normalizeVirtualPath(virtualPath);
  const joined = path.posix.normalize(path.posix.join(root, normalizedVirtual));

  if (root !== "/" && !joined.startsWith(root)) {
    throw new Error("Path traversal detected");
  }

  return joined;
}

export async function withSftpClient<T>(fn: (client: SftpClient) => Promise<T>): Promise<T> {
  const client = new SftpClient();
  try {
    await client.connect(await getSshConfig());
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function statRemotePath(client: SftpClient, remotePath: string): Promise<RemoteFileStat> {
  const stat = await client.stat(remotePath);
  const modified = stat.modifyTime ? new Date(stat.modifyTime) : new Date();
  return {
    isDirectory: stat.isDirectory,
    size: stat.size,
    modified,
  };
}
