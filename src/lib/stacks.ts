import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { docker } from "@/lib/docker";

const execFileAsync = promisify(execFile);
const HOST_ROOT = process.env.HOST_FS_MOUNT ?? "/host_system";
const STACKS_DIR = path.join("/app", "data", "stacks");

export interface StackSummary {
  name: string;
  composePath: string;
  updatedAt: string;
  existsOnDisk: boolean;
  containerCount: number;
  runningCount: number;
}

export interface StackFileSummary {
  path: string;
  updatedAt: string;
  size: number;
  kind: "compose" | "env" | "config";
}

export async function ensureStacksDir() {
  await fs.mkdir(STACKS_DIR, { recursive: true });
}

export function getStackDir(name: string) {
  return path.join(STACKS_DIR, name);
}

export function getStackComposePath(name: string) {
  return path.join(getStackDir(name), "docker-compose.yml");
}

function getStackPrimaryComposeCandidates(name: string) {
  const dir = getStackDir(name);
  return [
    path.join(dir, "docker-compose.yml"),
    path.join(dir, "docker-compose.yaml"),
    path.join(dir, "compose.yml"),
    path.join(dir, "compose.yaml"),
  ];
}

function getStackFileKind(filePath: string): StackFileSummary["kind"] {
  if (filePath.endsWith(".env") || filePath.endsWith(".env.local")) return "env";
  if (filePath.endsWith(".yml") || filePath.endsWith(".yaml")) return "compose";
  return "config";
}

function normalizeRelativeStackPath(relativePath: string) {
  const trimmed = relativePath.trim().replace(/\\/g, "/");
  if (!trimmed) {
    throw new Error("File path is required");
  }

  if (trimmed.startsWith("/") || trimmed.includes("..")) {
    throw new Error("Invalid stack file path");
  }

  if (!/^[a-zA-Z0-9._/-]+$/.test(trimmed)) {
    throw new Error("Stack file path contains unsupported characters");
  }

  return trimmed;
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findPrimaryComposePath(name: string) {
  for (const candidate of getStackPrimaryComposeCandidates(name)) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return getStackComposePath(name);
}

async function walkStackFiles(rootDir: string, currentDir: string, acc: StackFileSummary[]): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walkStackFiles(rootDir, fullPath, acc);
      continue;
    }

    const stat = await fs.stat(fullPath);
    const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
    acc.push({
      path: relativePath,
      updatedAt: stat.mtime.toISOString(),
      size: stat.size,
      kind: getStackFileKind(relativePath),
    });
  }
}

export async function listStacks(): Promise<StackSummary[]> {
  await ensureStacksDir();
  const [entries, containers] = await Promise.all([
    fs.readdir(STACKS_DIR, { withFileTypes: true }),
    docker.listContainers({ all: true }),
  ]);

  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const composePath = getStackComposePath(entry.name);
        const stat = await fs.stat(getStackDir(entry.name));
        const stackContainers = containers.filter(
          (container) => container.Labels?.["com.docker.compose.project"] === entry.name
        );

        return {
          name: entry.name,
          composePath,
          updatedAt: stat.mtime.toISOString(),
          existsOnDisk: true,
          containerCount: stackContainers.length,
          runningCount: stackContainers.filter((container) => container.State === "running").length,
        } satisfies StackSummary;
      })
  );
}

export async function readStackFile(name: string) {
  return fs.readFile(await findPrimaryComposePath(name), "utf-8");
}

export async function readStackEntry(name: string, relativePath: string) {
  const normalizedPath = normalizeRelativeStackPath(relativePath);
  return fs.readFile(path.join(getStackDir(name), normalizedPath), "utf-8");
}

export async function writeStackFile(name: string, content: string, relativePath = "docker-compose.yml") {
  const normalizedPath = normalizeRelativeStackPath(relativePath);
  const dir = getStackDir(name);
  const targetPath = path.join(dir, normalizedPath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf-8");
}

export async function listStackFiles(name: string): Promise<StackFileSummary[]> {
  const dir = getStackDir(name);
  const items: StackFileSummary[] = [];
  await walkStackFiles(dir, dir, items);
  return items.sort((left, right) => left.path.localeCompare(right.path));
}

export async function deleteStackFiles(name: string) {
  await fs.rm(getStackDir(name), { recursive: true, force: true });
}

async function runCompose(name: string, args: string[]) {
  const composePath = await findPrimaryComposePath(name);
  await ensureStacksDir();
  return execFileAsync(
    "docker",
    ["compose", "-f", composePath, "-p", name, ...args],
    {
      env: process.env,
      cwd: getStackDir(name),
      maxBuffer: 1024 * 1024 * 8,
    }
  );
}

export async function deployStack(name: string) {
  return runCompose(name, ["up", "-d"]);
}

export async function stopStack(name: string) {
  return runCompose(name, ["stop"]);
}

export async function startStack(name: string) {
  return runCompose(name, ["start"]);
}

export async function restartStack(name: string) {
  return runCompose(name, ["restart"]);
}

export async function removeStack(name: string) {
  return runCompose(name, ["down", "--remove-orphans"]);
}

export async function validateStack(name: string) {
  return runCompose(name, ["config"]);
}

export async function updateStackService(name: string, service: string) {
  await runCompose(name, ["pull", service]);
  return runCompose(name, ["up", "-d", service]);
}