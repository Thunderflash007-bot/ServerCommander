type Props = {
  state: string;
  statusText?: string;
};

export function getDisplayContainerStatus(state: string, statusText = ""): string {
  const normalizedState = (state || "").toLowerCase();
  const normalizedStatus = (statusText || "").toLowerCase();

  if (normalizedState === "running") {
    if (normalizedStatus.includes("unhealthy")) return "unhealthy";
    if (normalizedStatus.includes("healthy")) return "healthy";
    if (normalizedStatus.includes("health: starting") || normalizedStatus.includes("(starting)")) return "starting";
    return "running";
  }

  if (normalizedState === "created") return "starting";
  if (normalizedState === "restarting") return "restarting";
  if (normalizedState === "paused") return "paused";
  if (normalizedState === "dead") return "dead";
  if (normalizedState === "removing") return "removing";
  if (normalizedState === "exited") return "stopped";

  return normalizedState || "unknown";
}

export function ContainerStatusChip({ state, statusText = "" }: Props) {
  const label = getDisplayContainerStatus(state, statusText);
  const map: Record<string, string> = {
    healthy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    unhealthy: "bg-red-500/15 text-red-400 border-red-500/20",
    starting: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    running: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    stopped: "bg-red-500/15 text-red-400 border-red-500/20",
    paused: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    restarting: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    dead: "bg-red-500/15 text-red-400 border-red-500/20",
    removing: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${map[label] ?? "bg-muted text-muted-foreground"}`}
      title={statusText || state}
    >
      {label}
    </span>
  );
}