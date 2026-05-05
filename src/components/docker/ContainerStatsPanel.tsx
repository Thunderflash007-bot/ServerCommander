"use client";

import { useEffect, useMemo, useState } from "react";

type ContainerLiveStats = {
  id: string;
  name: string;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  readAt: string;
};

type Props = {
  title?: string;
};

type HistoryPoint = {
  cpuPercent: number;
  memoryPercent: number;
  networkTotalMb: number;
};

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

function buildSparkline(values: number[], color: string) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = 100 - (value / max) * 100;
    return `${x},${y}`;
  });

  return (
    <svg viewBox="0 0 100 100" className="h-16 w-full overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
    </svg>
  );
}

export function ContainerStatsPanel({ title = "Live Resource Stats" }: Props) {
  const [stats, setStats] = useState<ContainerLiveStats[]>([]);
  const [history, setHistory] = useState<Record<string, HistoryPoint[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStats() {
      try {
        const res = await fetch("/api/docker/stats", { credentials: "same-origin" });
        const data = (await res.json().catch(() => ({}))) as { error?: string; stats?: ContainerLiveStats[] };
        if (!res.ok) {
          if (active) setError(data.error ?? "Failed to load container stats");
          return;
        }

        const nextStats = data.stats ?? [];
        if (!active) return;
        setStats(nextStats);
        setError(null);
        setHistory((current) => {
          const nextHistory: Record<string, HistoryPoint[]> = {};
          for (const item of nextStats) {
            const previous = current[item.id] ?? [];
            nextHistory[item.id] = [
              ...previous,
              {
                cpuPercent: item.cpuPercent,
                memoryPercent: item.memoryPercent,
                networkTotalMb: (item.networkRx + item.networkTx) / 1024 / 1024,
              },
            ].slice(-24);
          }
          return nextHistory;
        });
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Failed to load container stats");
        }
      }
    }

    void loadStats();
    const timer = window.setInterval(() => {
      void loadStats();
    }, 4000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const cards = useMemo(() => stats.slice(0, 6), [stats]);

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No running containers with live stats available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">Polling every 4 seconds for CPU, memory and network trends.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {cards.map((item) => {
          const itemHistory = history[item.id] ?? [];
          return (
            <div key={item.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground">{item.name}</h3>
                  <p className="text-xs text-muted-foreground">Updated {new Date(item.readAt).toLocaleTimeString()}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>CPU {item.cpuPercent}%</div>
                  <div>RAM {item.memoryPercent}%</div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                  <div className="text-xs font-medium text-muted-foreground">CPU</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{item.cpuPercent}%</div>
                  <div className="mt-2">{buildSparkline(itemHistory.map((point) => point.cpuPercent), "#f59e0b")}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                  <div className="text-xs font-medium text-muted-foreground">Memory</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{formatBytes(item.memoryUsage)}</div>
                  <div className="text-xs text-muted-foreground">of {formatBytes(item.memoryLimit)}</div>
                  <div className="mt-2">{buildSparkline(itemHistory.map((point) => point.memoryPercent), "#10b981")}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                  <div className="text-xs font-medium text-muted-foreground">Network</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{formatBytes(item.networkRx + item.networkTx)}</div>
                  <div className="text-xs text-muted-foreground">RX {formatBytes(item.networkRx)} · TX {formatBytes(item.networkTx)}</div>
                  <div className="mt-2">{buildSparkline(itemHistory.map((point) => point.networkTotalMb), "#38bdf8")}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}