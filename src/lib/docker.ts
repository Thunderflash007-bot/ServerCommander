import Dockerode from "dockerode";

declare global {
  // eslint-disable-next-line no-var
  var __docker: Dockerode | undefined;
}

function createDockerClient(): Dockerode {
  const socketPath = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
  return new Dockerode({ socketPath });
}

export const docker = globalThis.__docker ?? createDockerClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__docker = docker;
}

// ── Typed response helpers ─────────────────────────────────────────────────────

export interface ContainerSummary {
  id: string;
  shortId: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: number;
  ports: Dockerode.Port[];
  labels: Record<string, string>;
}

export interface ManagedPortForward {
  id: string;
  name: string;
  hostPort: number;
  containerPort: number;
  protocol: "tcp";
  status: string;
}

export interface ContainerPortSpec {
  hostPort: number;
  containerPort: number;
  protocol?: "tcp" | "udp";
}

export interface ContainerVolumeSpec {
  source: string;
  target: string;
  readOnly?: boolean;
}

export interface ContainerEnvSpec {
  key: string;
  value: string;
}

export interface ContainerLiveStats {
  id: string;
  name: string;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  readAt: string;
}

export interface ContainerCreateSpec {
  name: string;
  image: string;
  env?: ContainerEnvSpec[];
  cmd?: string[];
  ports?: ContainerPortSpec[];
  volumes?: ContainerVolumeSpec[];
  networks?: string[];
  restartPolicyName?: "no" | "always" | "unless-stopped" | "on-failure";
  restartPolicyMaximumRetryCount?: number;
  autoStart?: boolean;
}

export async function listContainers(): Promise<ContainerSummary[]> {
  const containers = await docker.listContainers({ all: true });
  return containers.map((c) => ({
    id: c.Id,
    shortId: c.Id.substring(0, 12),
    name: c.Names[0]?.replace(/^\//, "") ?? c.Id.substring(0, 12),
    image: c.Image,
    status: c.Status,
    state: c.State,
    created: c.Created,
    ports: c.Ports,
    labels: c.Labels ?? {},
  }));
}

export async function getContainerById(id: string): Promise<Dockerode.Container> {
  return docker.getContainer(id);
}

export async function getContainerInspect(id: string) {
  const container = docker.getContainer(id);
  return container.inspect();
}

async function followPullProgress(image: string) {
  await new Promise<void>((resolve, reject) => {
    docker.pull(image, (err: unknown, stream: NodeJS.ReadableStream | undefined) => {
      if (err || !stream) {
        reject(err ?? new Error("Unable to pull image"));
        return;
      }
      docker.modem.followProgress(stream, (pullErr: unknown) => {
        if (pullErr) reject(pullErr);
        else resolve();
      });
    });
  });
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}

function computeCpuPercent(stats: Dockerode.ContainerStats) {
  const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) - (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const systemDelta = (stats.cpu_stats?.system_cpu_usage ?? 0) - (stats.precpu_stats?.system_cpu_usage ?? 0);
  const cpuCount = stats.cpu_stats?.online_cpus || stats.cpu_stats?.cpu_usage?.percpu_usage?.length || 1;

  if (cpuDelta <= 0 || systemDelta <= 0) {
    return 0;
  }

  return roundMetric((cpuDelta / systemDelta) * cpuCount * 100);
}

function computeMemoryUsage(stats: Dockerode.ContainerStats) {
  const usage = stats.memory_stats?.usage ?? 0;
  const cache = (stats.memory_stats?.stats as { cache?: number } | undefined)?.cache ?? 0;
  return Math.max(0, usage - cache);
}

function computeNetworkTotals(stats: Dockerode.ContainerStats) {
  const networks = stats.networks ?? {};
  return Object.values(networks).reduce(
    (totals, network) => ({
      rx: totals.rx + (network.rx_bytes ?? 0),
      tx: totals.tx + (network.tx_bytes ?? 0),
    }),
    { rx: 0, tx: 0 }
  );
}

export async function getContainerLiveStats(id: string): Promise<ContainerLiveStats> {
  const container = docker.getContainer(id);
  const [inspect, stats] = await Promise.all([
    container.inspect(),
    container.stats({ stream: false }),
  ]);

  const memoryUsage = computeMemoryUsage(stats);
  const memoryLimit = stats.memory_stats?.limit ?? 0;
  const memoryPercent = memoryLimit > 0 ? roundMetric((memoryUsage / memoryLimit) * 100) : 0;
  const network = computeNetworkTotals(stats);

  return {
    id,
    name: inspect.Name.replace(/^\//, "") || id.substring(0, 12),
    cpuPercent: computeCpuPercent(stats),
    memoryUsage,
    memoryLimit,
    memoryPercent,
    networkRx: network.rx,
    networkTx: network.tx,
    readAt: new Date().toISOString(),
  };
}

function buildCreateContainerOptions(spec: ContainerCreateSpec): Dockerode.ContainerCreateOptions {
  const env = (spec.env ?? [])
    .filter((entry) => entry.key.trim().length > 0)
    .map((entry) => `${entry.key}=${entry.value}`);

  const cmd = (spec.cmd ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
  const ports = (spec.ports ?? []).map((port) => ({
    hostPort: Number(port.hostPort),
    containerPort: Number(port.containerPort),
    protocol: port.protocol ?? "tcp",
  }));
  const volumes = (spec.volumes ?? []).map((vol) => ({
    source: vol.source.trim(),
    target: vol.target.trim(),
    readOnly: !!vol.readOnly,
  }));
  const networks = (spec.networks ?? []).map((name) => name.trim()).filter((name) => name.length > 0);

  const exposedPorts: Record<string, Record<string, never>> = {};
  const portBindings: Record<string, Array<{ HostPort: string }>> = {};
  for (const port of ports) {
    if (!port.hostPort || !port.containerPort) continue;
    if (port.hostPort < 1 || port.hostPort > 65535 || port.containerPort < 1 || port.containerPort > 65535) {
      throw new Error("Port values must be between 1 and 65535");
    }
    const key = `${port.containerPort}/${port.protocol}`;
    exposedPorts[key] = {};
    portBindings[key] = [{ HostPort: String(port.hostPort) }];
  }

  const binds = volumes
    .filter((vol) => vol.source && vol.target)
    .map((vol) => `${vol.source}:${vol.target}${vol.readOnly ? ":ro" : ""}`);

  const restartPolicyName = spec.restartPolicyName ?? "unless-stopped";

  return {
    name: spec.name,
    Image: spec.image,
    Env: env.length > 0 ? env : undefined,
    Cmd: cmd.length > 0 ? cmd : undefined,
    ExposedPorts: Object.keys(exposedPorts).length > 0 ? exposedPorts : undefined,
    HostConfig: {
      PortBindings: Object.keys(portBindings).length > 0 ? portBindings : undefined,
      Binds: binds.length > 0 ? binds : undefined,
      RestartPolicy: {
        Name: restartPolicyName,
        MaximumRetryCount: spec.restartPolicyMaximumRetryCount ?? 0,
      },
      NetworkMode: networks[0] || undefined,
    },
  };
}

async function connectExtraNetworks(containerId: string, networks: string[]): Promise<void> {
  if (networks.length <= 1) return;
  for (const networkName of networks.slice(1)) {
    if (!networkName) continue;
    try {
      const network = docker.getNetwork(networkName);
      await network.connect({ Container: containerId });
    } catch {
      // Ignore already-connected or invalid network errors for best-effort behavior.
    }
  }
}

export async function createContainerFromSpec(spec: ContainerCreateSpec) {
  if (!spec.name?.trim()) throw new Error("Container name is required");
  if (!spec.image?.trim()) throw new Error("Container image is required");

  const normalized: ContainerCreateSpec = {
    ...spec,
    name: spec.name.trim(),
    image: spec.image.trim(),
    autoStart: spec.autoStart ?? true,
  };

  const container = await docker.createContainer(buildCreateContainerOptions(normalized));
  await connectExtraNetworks(container.id, normalized.networks ?? []);
  if (normalized.autoStart) {
    await container.start();
  }
  return getContainerInspect(container.id);
}

export async function duplicateContainerFromSource(
  sourceId: string,
  opts: { name?: string; autoStart?: boolean } = {}
) {
  const inspect = await getContainerInspect(sourceId);
  const sourceName = inspect.Name.replace(/^\//, "") || sourceId.substring(0, 12);

  const sourcePorts = inspect.HostConfig?.PortBindings ?? {};
  const ports: ContainerPortSpec[] = Object.entries(sourcePorts).flatMap(([containerPortProto, bindings]) => {
    const [containerPortStr, protocolRaw] = containerPortProto.split("/");
    const protocol: "tcp" | "udp" = protocolRaw === "udp" ? "udp" : "tcp";
    const containerPort = Number(containerPortStr);
    const bindingList = (Array.isArray(bindings) ? bindings : []) as Array<{ HostPort?: string }>;
    return bindingList
      .map((binding) => ({
        hostPort: Number(binding?.HostPort ?? "0"),
        containerPort,
        protocol,
      }))
      .filter((entry) => entry.hostPort > 0 && entry.containerPort > 0);
  });

  const volumes: ContainerVolumeSpec[] = (inspect.HostConfig?.Binds ?? []).map((bind) => {
    const parts = bind.split(":");
    const source = parts[0] ?? "";
    const target = parts[1] ?? "";
    const mode = (parts[2] ?? "").toLowerCase();
    return {
      source,
      target,
      readOnly: mode.includes("ro"),
    };
  });

  const env: ContainerEnvSpec[] = (inspect.Config?.Env ?? []).map((value) => {
    const idx = value.indexOf("=");
    if (idx < 0) return { key: value, value: "" };
    return { key: value.substring(0, idx), value: value.substring(idx + 1) };
  });

  const networks = Object.keys(inspect.NetworkSettings?.Networks ?? {});

  const spec: ContainerCreateSpec = {
    name: opts.name?.trim() || `${sourceName}-copy`,
    image: inspect.Config?.Image ?? "",
    cmd: inspect.Config?.Cmd ?? undefined,
    env,
    ports,
    volumes,
    networks,
    restartPolicyName:
      (inspect.HostConfig?.RestartPolicy?.Name as "no" | "always" | "unless-stopped" | "on-failure" | undefined) ??
      "unless-stopped",
    restartPolicyMaximumRetryCount: inspect.HostConfig?.RestartPolicy?.MaximumRetryCount ?? 0,
    autoStart: opts.autoStart ?? true,
  };

  return createContainerFromSpec(spec);
}

async function ensureImageAvailable(image: string): Promise<void> {
  try {
    await docker.getImage(image).inspect();
    return;
  } catch {
    // Pull below
  }

  await followPullProgress(image);
}

export async function pullImage(image: string) {
  await followPullProgress(image);
  return docker.getImage(image).inspect();
}

function extractPortBindings(bindings: Record<string, Array<{ HostIp?: string; HostPort?: string }> | undefined> | undefined) {
  const result: Record<string, Array<{ HostIp?: string; HostPort?: string }>> = {};
  for (const [key, value] of Object.entries(bindings ?? {})) {
    if (!Array.isArray(value)) continue;
    result[key] = value.map((entry) => ({ HostIp: entry.HostIp, HostPort: entry.HostPort }));
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export async function recreateContainerWithImage(id: string, image: string) {
  const inspect = await getContainerInspect(id);
  const container = docker.getContainer(id);
  const name = inspect.Name.replace(/^\//, "");
  const shouldStart = inspect.State?.Running ?? false;
  const networkNames = Object.keys(inspect.NetworkSettings?.Networks ?? {});

  const createOptions: Dockerode.ContainerCreateOptions = {
    name,
    Image: image,
    Cmd: inspect.Config?.Cmd ?? undefined,
    Entrypoint: inspect.Config?.Entrypoint ?? undefined,
    Env: inspect.Config?.Env ?? undefined,
    WorkingDir: inspect.Config?.WorkingDir || undefined,
    User: inspect.Config?.User || undefined,
    Labels: inspect.Config?.Labels ?? undefined,
    ExposedPorts: inspect.Config?.ExposedPorts ?? undefined,
    HostConfig: {
      Binds: inspect.HostConfig?.Binds ?? undefined,
      PortBindings: extractPortBindings(inspect.HostConfig?.PortBindings),
      RestartPolicy: inspect.HostConfig?.RestartPolicy ?? undefined,
      NetworkMode: inspect.HostConfig?.NetworkMode || undefined,
      Privileged: inspect.HostConfig?.Privileged ?? false,
      AutoRemove: inspect.HostConfig?.AutoRemove ?? false,
      CapAdd: inspect.HostConfig?.CapAdd ?? undefined,
      CapDrop: inspect.HostConfig?.CapDrop ?? undefined,
      ExtraHosts: inspect.HostConfig?.ExtraHosts ?? undefined,
      PublishAllPorts: inspect.HostConfig?.PublishAllPorts ?? false,
    },
  };

  if (shouldStart) {
    await container.stop().catch(() => null);
  }
  await container.remove({ force: true });

  const recreated = await docker.createContainer(createOptions);
  await connectExtraNetworks(recreated.id, networkNames);
  if (shouldStart) {
    await recreated.start();
  }

  return recreated.inspect();
}

function getContainerPrimaryIp(inspect: Dockerode.ContainerInspectInfo): string {
  const networks = inspect.NetworkSettings?.Networks ?? {};
  for (const value of Object.values(networks)) {
    if (value?.IPAddress) return value.IPAddress;
  }
  throw new Error("Container has no reachable network IP. Start/connect it to a network first.");
}

export async function startContainer(id: string) {
  const container = docker.getContainer(id);
  await container.start();
}

export async function stopContainer(id: string) {
  const container = docker.getContainer(id);
  await container.stop();
}

export async function restartContainer(id: string) {
  const container = docker.getContainer(id);
  await container.restart();
}

export async function removeContainer(id: string, force = false) {
  const container = docker.getContainer(id);
  await container.remove({ force });
}

export async function renameContainer(id: string, name: string) {
  const container = docker.getContainer(id);
  await container.rename({ name });
}

export async function updateContainerConfig(
  id: string,
  opts: {
    restartPolicyName?: "no" | "always" | "unless-stopped" | "on-failure";
    restartPolicyMaximumRetryCount?: number;
  }
) {
  const container = docker.getContainer(id);
  await container.update({
    RestartPolicy:
      opts.restartPolicyName
        ? {
            Name: opts.restartPolicyName,
            MaximumRetryCount: opts.restartPolicyMaximumRetryCount ?? 0,
          }
        : undefined,
  });
}

export async function listManagedPortForwards(containerId: string): Promise<ManagedPortForward[]> {
  const helpers = await docker.listContainers({
    all: true,
    filters: {
      label: [
        "com.servercommander.portforward=true",
        `com.servercommander.portforward.target=${containerId}`,
      ],
    },
  });

  return helpers.map((helper) => ({
    id: helper.Id,
    name: helper.Names[0]?.replace(/^\//, "") ?? helper.Id.substring(0, 12),
    hostPort: Number(helper.Labels?.["com.servercommander.portforward.hostPort"] ?? 0),
    containerPort: Number(helper.Labels?.["com.servercommander.portforward.containerPort"] ?? 0),
    protocol: "tcp",
    status: helper.State,
  }));
}

export async function createManagedPortForward(
  containerId: string,
  opts: { hostPort: number; containerPort: number }
): Promise<ManagedPortForward> {
  if (opts.hostPort < 1 || opts.hostPort > 65535 || opts.containerPort < 1 || opts.containerPort > 65535) {
    throw new Error("Port values must be between 1 and 65535");
  }

  const inspect = await getContainerInspect(containerId);
  const targetIp = getContainerPrimaryIp(inspect);
  const containerName = inspect.Name.replace(/^\//, "") || containerId.substring(0, 12);

  const existing = await listManagedPortForwards(containerId);
  if (existing.some((entry) => entry.hostPort === opts.hostPort)) {
    throw new Error(`Host port ${opts.hostPort} is already forwarded for this container`);
  }

  const image = "alpine/socat:1.8.0.3";
  await ensureImageAvailable(image);

  const helperName = `scpf-${containerId.substring(0, 12)}-${opts.hostPort}-${opts.containerPort}`;
  const helper = await docker.createContainer({
    name: helperName,
    Image: image,
    Cmd: [
      "-d",
      "-d",
      `TCP-LISTEN:${opts.hostPort},fork,reuseaddr`,
      `TCP:${targetIp}:${opts.containerPort}`,
    ],
    HostConfig: {
      NetworkMode: "host",
      RestartPolicy: { Name: "unless-stopped" },
    },
    Labels: {
      "com.servercommander.portforward": "true",
      "com.servercommander.portforward.target": containerId,
      "com.servercommander.portforward.targetName": containerName,
      "com.servercommander.portforward.hostPort": String(opts.hostPort),
      "com.servercommander.portforward.containerPort": String(opts.containerPort),
      "com.servercommander.portforward.protocol": "tcp",
    },
  });

  await helper.start();

  return {
    id: helper.id,
    name: helperName,
    hostPort: opts.hostPort,
    containerPort: opts.containerPort,
    protocol: "tcp",
    status: "running",
  };
}

export async function removeManagedPortForward(forwardId: string): Promise<void> {
  const helper = docker.getContainer(forwardId);
  await helper.remove({ force: true });
}

export async function getContainerLogs(
  id: string,
  opts: { tail?: number; timestamps?: boolean } = {}
): Promise<string> {
  const container = docker.getContainer(id);
  const rawLogs: unknown = await container.logs({
    stdout: true,
    stderr: true,
    tail: opts.tail ?? 200,
    timestamps: opts.timestamps ?? true,
  });

  // Dockerode returns a Buffer for non-TTY containers
  if (Buffer.isBuffer(rawLogs)) {
    return demuxDockerStream(rawLogs);
  }

  if (typeof rawLogs === "string") {
    return rawLogs;
  }

  return String(rawLogs ?? "");
}

export async function listImages() {
  return docker.listImages({ all: false });
}

export async function removeImage(nameOrId: string, force = false) {
  const image = docker.getImage(nameOrId);
  await image.remove({ force });
}

export async function listVolumes() {
  return docker.listVolumes();
}

export async function listNetworks() {
  return docker.listNetworks();
}

export async function getDockerInfo() {
  return docker.info();
}

export async function getDockerVersion() {
  return docker.version();
}

// ── Stream helpers ────────────────────────────────────────────────────────────

/**
 * Docker multiplexes stdout/stderr into a single stream with 8-byte headers.
 * This strips those headers to produce clean text output.
 */
function demuxDockerStream(buffer: Buffer): string {
  const output: string[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const size = buffer.readUInt32BE(offset + 4);
    offset += 8;
    if (offset + size > buffer.length) break;
    output.push(buffer.slice(offset, offset + size).toString("utf-8"));
    offset += size;
  }
  return output.join("");
}
