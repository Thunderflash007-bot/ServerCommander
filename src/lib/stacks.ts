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

export async function ensureStacksDir() {
  await fs.mkdir(STACKS_DIR, { recursive: true });
}

export function getStackDir(name: string) {
  return path.join(STACKS_DIR, name);
}

export function getStackComposePath(name: string) {
  return path.join(getStackDir(name), "docker-compose.yml");
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
  return fs.readFile(getStackComposePath(name), "utf-8");
}

export async function writeStackFile(name: string, content: string) {
  const dir = getStackDir(name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(getStackComposePath(name), content, "utf-8");
}

export async function deleteStackFiles(name: string) {
  await fs.rm(getStackDir(name), { recursive: true, force: true });
}

async function runCompose(name: string, args: string[]) {
  const composePath = getStackComposePath(name);
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