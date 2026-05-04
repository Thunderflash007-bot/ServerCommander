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
