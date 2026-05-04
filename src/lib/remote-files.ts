import SftpClient from "ssh2-sftp-client";
import path from "path";

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
  return {
    host: getRequiredEnv("SSH_HOST"),
    port: Number(process.env.SSH_PORT ?? "22"),
    username: getRequiredEnv("SSH_USERNAME"),
    password: getRequiredEnv("SSH_PASSWORD"),
  };
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
