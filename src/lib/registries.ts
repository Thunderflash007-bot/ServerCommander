import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "crypto";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join("/app", "data");
const REGISTRY_FILE = path.join(DATA_DIR, "registries.json");

type StoredRegistry = {
  id: string;
  name: string;
  server: string;
  username: string;
  passwordEnc: string;
  updatedAt: string;
};

export type RegistrySummary = Omit<StoredRegistry, "passwordEnc">;

function getEncryptionKeyBuffer() {
  const keyHex = (process.env.ENCRYPTION_KEY ?? "").trim();
  if (!/^[0-9a-fA-F]{32}$/.test(keyHex) && !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error("ENCRYPTION_KEY must be 32 or 64 hex characters to store registry credentials");
  }

  return Buffer.from(keyHex.padEnd(64, "0"), "hex");
}

function encryptSecret(value: string) {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-ctr", getEncryptionKeyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf-8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptSecret(value: string) {
  const [ivHex, payloadHex] = value.split(":");
  if (!ivHex || !payloadHex) {
    throw new Error("Invalid encrypted secret format");
  }

  const decipher = createDecipheriv(
    "aes-256-ctr",
    getEncryptionKeyBuffer(),
    Buffer.from(ivHex, "hex")
  );
  return Buffer.concat([
    decipher.update(Buffer.from(payloadHex, "hex")),
    decipher.final(),
  ]).toString("utf-8");
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readRegistryStore(): Promise<StoredRegistry[]> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(REGISTRY_FILE, "utf-8");
    const parsed = JSON.parse(raw) as StoredRegistry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeRegistryStore(entries: StoredRegistry[]) {
  await ensureDataDir();
  await fs.writeFile(REGISTRY_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

function sanitizeRegistry(entry: StoredRegistry): RegistrySummary {
  const { passwordEnc: _passwordEnc, ...safe } = entry;
  return safe;
}

function normalizeServer(server: string) {
  const normalized = server.trim();
  if (!normalized) {
    throw new Error("Registry server is required");
  }

  if (!/^[a-zA-Z0-9./:_-]+$/.test(normalized)) {
    throw new Error("Registry server contains unsupported characters");
  }

  return normalized;
}

function runDockerLogin(server: string, username: string, password: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("docker", ["login", server, "--username", username, "--password-stdin"], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || "docker login failed"));
      }
    });

    child.stdin.write(password);
    child.stdin.end();
  });
}

export async function listRegistries(): Promise<RegistrySummary[]> {
  const entries = await readRegistryStore();
  return entries.map(sanitizeRegistry).sort((left, right) => left.name.localeCompare(right.name));
}

export async function saveRegistry(input: { id?: string; name: string; server: string; username: string; password: string }) {
  const name = input.name.trim();
  const server = normalizeServer(input.server);
  const username = input.username.trim();
  const password = input.password;

  if (!name) throw new Error("Registry name is required");
  if (!username) throw new Error("Registry username is required");
  if (!password) throw new Error("Registry password or token is required");

  await runDockerLogin(server, username, password);

  const entries = await readRegistryStore();
  const nextEntry: StoredRegistry = {
    id: input.id?.trim() || randomUUID(),
    name,
    server,
    username,
    passwordEnc: encryptSecret(password),
    updatedAt: new Date().toISOString(),
  };

  const filtered = entries.filter((entry) => entry.id !== nextEntry.id);
  filtered.push(nextEntry);
  await writeRegistryStore(filtered);
  return sanitizeRegistry(nextEntry);
}

export async function deleteRegistry(id: string) {
  const entries = await readRegistryStore();
  const nextEntries = entries.filter((entry) => entry.id !== id);
  await writeRegistryStore(nextEntries);
}

export async function getRegistryCredentials(server: string) {
  const entries = await readRegistryStore();
  const match = entries.find((entry) => entry.server === server);
  if (!match) return null;
  return {
    server: match.server,
    username: match.username,
    password: decryptSecret(match.passwordEnc),
  };
}