import SftpClient from "ssh2-sftp-client";
import path from "path";
import { createDecipheriv } from "crypto";

export type RemoteFileStat = {
  isDirectory: boolean;
  size: number;
  modified: Date;
};

export function isSshBackendEnabled(): boolean {
  return String(process.env.SSH_ENABLED ?? "false").toLowerCase() === "true";
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function getSshConfig() {
  const encryptedPassword = process.env.SSH_PASSWORD_ENC?.trim();
  const fallbackPassword = process.env.SSH_PASSWORD?.trim();

  let password = "";
  if (encryptedPassword) {
    password = decryptSecret(encryptedPassword);
  } else if (fallbackPassword) {
    // Backward compatibility for older .env files.
    password = fallbackPassword;
  }

  if (!password) {
    throw new Error("Missing SSH password. Set SSH_PASSWORD_ENC (preferred) or SSH_PASSWORD");
  }

  return {
    host: getRequiredEnv("SSH_HOST"),
    port: Number(process.env.SSH_PORT ?? "22"),
    username: getRequiredEnv("SSH_USERNAME"),
    password,
  };
}

function decryptSecret(ciphertext: string): string {
  const keyHex = process.env.ENCRYPTION_KEY?.trim() ?? "";
  if (!/^[0-9a-fA-F]{32}$/.test(keyHex) && !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error("ENCRYPTION_KEY must be 32 or 64 hex characters");
  }

  const [ivHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !dataHex || !/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(dataHex)) {
    throw new Error("Invalid SSH_PASSWORD_ENC format");
  }

  const normalizedKeyHex = keyHex.padEnd(64, "0");
  const decipher = createDecipheriv(
    "aes-256-ctr",
    Buffer.from(normalizedKeyHex, "hex"),
    Buffer.from(ivHex, "hex")
  );
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf-8");
}

function getSftpRoot(): string {
  const root = process.env.SSH_SFTP_ROOT?.trim() || "/";
  const normalized = path.posix.normalize(root);
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function normalizeVirtualPath(requestedPath: string): string {
  const normalized = path.posix.normalize(requestedPath || "/");
  const withSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withSlash === "" ? "/" : withSlash;
}

export function resolveRemotePath(virtualPath: string): string {
  const root = getSftpRoot();
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
    await client.connect(getSshConfig());
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
