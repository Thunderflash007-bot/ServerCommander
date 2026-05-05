import fs from "fs/promises";
import path from "path";
import { docker, getContainerInspect, pullImage, recreateContainerWithImage } from "@/lib/docker";
import { updateStackService } from "@/lib/stacks";
import { writeAuditLog } from "@/lib/audit";

const DATA_DIR = path.join("/app", "data");
const AUTO_UPDATE_FILE = path.join(DATA_DIR, "auto-update.json");

export type AutoUpdatePolicy = {
  id: string;
  containerId: string;
  containerName: string;
  enabled: boolean;
  intervalMinutes: number;
  lastCheckedAt: string | null;
  lastUpdatedAt: string | null;
  lastStatus: string | null;
  updatedAt: string;
};

type AutoUpdateStore = AutoUpdatePolicy[];

async function ensureStoreDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStore(): Promise<AutoUpdateStore> {
  await ensureStoreDir();
  try {
    const raw = await fs.readFile(AUTO_UPDATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as AutoUpdateStore;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeStore(entries: AutoUpdateStore) {
  await ensureStoreDir();
  await fs.writeFile(AUTO_UPDATE_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

function normalizeInterval(intervalMinutes: number) {
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 5) {
    return 15;
  }
  return Math.min(24 * 60, Math.round(intervalMinutes));
}

export async function getAutoUpdatePolicy(containerId: string, fallbackName?: string): Promise<AutoUpdatePolicy> {
  const entries = await readStore();
  const entry = entries.find((item) => item.containerId === containerId || (!!fallbackName && item.containerName === fallbackName));
  if (entry) return entry;

  return {
    id: containerId,
    containerId,
    containerName: fallbackName ?? containerId.substring(0, 12),
    enabled: false,
    intervalMinutes: 15,
    lastCheckedAt: null,
    lastUpdatedAt: null,
    lastStatus: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function saveAutoUpdatePolicy(input: {
  containerId: string;
  containerName: string;
  enabled: boolean;
  intervalMinutes: number;
}) {
  const entries = await readStore();
  const policy: AutoUpdatePolicy = {
    ...(await getAutoUpdatePolicy(input.containerId, input.containerName)),
    containerId: input.containerId,
    containerName: input.containerName,
    enabled: Boolean(input.enabled),
    intervalMinutes: normalizeInterval(input.intervalMinutes),
    updatedAt: new Date().toISOString(),
  };

  const nextEntries = entries.filter((entry) => entry.containerId !== input.containerId && entry.containerName !== input.containerName);
  nextEntries.push(policy);
  await writeStore(nextEntries);
  return policy;
}

async function updatePolicyState(policy: AutoUpdatePolicy, patch: Partial<AutoUpdatePolicy>) {
  const entries = await readStore();
  const nextEntries = entries.map((entry) =>
    entry.containerId === policy.containerId || entry.containerName === policy.containerName
      ? { ...entry, ...patch }
      : entry
  );
  await writeStore(nextEntries);
}

async function runPolicy(policy: AutoUpdatePolicy) {
  const containers = await docker.listContainers({ all: true });
  const container = containers.find(
    (entry) => entry.Id === policy.containerId || entry.Names.some((name) => name.replace(/^\//, "") === policy.containerName)
  );

  if (!container) {
    await updatePolicyState(policy, {
      lastCheckedAt: new Date().toISOString(),
      lastStatus: "Container not found",
    });
    return;
  }

  const inspect = await getContainerInspect(container.Id);
  const imageRef = inspect.Config?.Image ?? "";
  if (!imageRef) {
    await updatePolicyState(policy, {
      lastCheckedAt: new Date().toISOString(),
      lastStatus: "Container image not resolvable",
    });
    return;
  }

  const currentImageId = inspect.Image;
  const composeProject = inspect.Config?.Labels?.["com.docker.compose.project"];
  const composeService = inspect.Config?.Labels?.["com.docker.compose.service"];

  const pulledImage = await pullImage(imageRef);
  const nextImageId = pulledImage.Id;
  const now = new Date().toISOString();

  if (nextImageId === currentImageId) {
    await updatePolicyState(policy, {
      containerId: container.Id,
      containerName: inspect.Name.replace(/^\//, ""),
      lastCheckedAt: now,
      lastStatus: "Already up to date",
    });
    return;
  }

  if (composeProject && composeService) {
    await updateStackService(composeProject, composeService);
  } else {
    await recreateContainerWithImage(container.Id, imageRef);
  }

  await updatePolicyState(policy, {
    containerId: container.Id,
    containerName: inspect.Name.replace(/^\//, ""),
    lastCheckedAt: now,
    lastUpdatedAt: now,
    lastStatus: `Updated to ${imageRef}`,
  });
}

export async function runAutoUpdateCycle() {
  const entries = await readStore();
  const now = Date.now();

  for (const policy of entries.filter((entry) => entry.enabled)) {
    const lastChecked = policy.lastCheckedAt ? new Date(policy.lastCheckedAt).getTime() : 0;
    if (lastChecked && now - lastChecked < policy.intervalMinutes * 60 * 1000) {
      continue;
    }

    try {
      await runPolicy(policy);
      await writeAuditLog(
        { username: "system" },
        "AUTO_UPDATE_RUN",
        `container:${policy.containerName}`,
        policy.lastStatus ?? undefined,
        true
      );
    } catch (error) {
      await updatePolicyState(policy, {
        lastCheckedAt: new Date().toISOString(),
        lastStatus: error instanceof Error ? error.message : "Auto update failed",
      });
      await writeAuditLog(
        { username: "system" },
        "AUTO_UPDATE_FAILED",
        `container:${policy.containerName}`,
        error instanceof Error ? error.message : "Auto update failed",
        false
      );
    }
  }
}