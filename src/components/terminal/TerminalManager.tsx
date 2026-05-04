"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Plus, X, AlertTriangle } from "lucide-react";
import { io, type Socket } from "socket.io-client";

interface TerminalManagerProps {
  maxSessions: number;
  readOnly: boolean;
  containerId?: string;
}

interface TerminalSession {
  id: string;
  label: string;
}

function makeSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function TerminalManager({ maxSessions, readOnly, containerId }: TerminalManagerProps) {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const addSession = useCallback(() => {
    const max = maxSessions === 0 ? Infinity : maxSessions;
    if (sessions.length >= max) return;
    const id = makeSessionId();
    const label = `Shell ${sessions.length + 1}`;
    setSessions((prev) => [...prev, { id, label }]);
    setActiveId(id);
  }, [sessions.length, maxSessions]);

  const removeSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (activeId === id) {
          setActiveId(next.length > 0 ? next[next.length - 1].id : null);
        }
        return next;
      });
    },
    [activeId]
  );

  // Start first session on mount
  useEffect(() => {
    addSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canAdd = maxSessions === 0 || sessions.length < maxSessions;

  return (
    <div className="flex flex-col h-full rounded-xl border border-border overflow-hidden bg-[#0d1117]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border bg-card/40 px-2 py-1.5 shrink-0 overflow-x-auto">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveId(s.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition shrink-0
              ${activeId === s.id
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
          >
            {s.label}
            <span
              onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}
              className="ml-1 opacity-60 hover:opacity-100 rounded p-0.5 hover:bg-destructive/20"
              role="button"
            >
              <X className="w-3 h-3" />
            </span>
          </button>
        ))}
        {canAdd && (
          <button
            onClick={addSession}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition shrink-0"
            title="New terminal"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
        {readOnly && (
          <span className="ml-auto flex items-center gap-1 text-xs text-yellow-400 shrink-0 pr-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Read-Only
          </span>
        )}
      </div>

      {/* Terminal panes */}
      <div className="flex-1 relative min-h-0">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`absolute inset-0 ${activeId === s.id ? "block" : "hidden"}`}
          >
            <TerminalPane sessionId={s.id} readOnly={readOnly} containerId={containerId} />
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No active sessions. Click + to open a terminal.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Single Terminal Pane ───────────────────────────────────────────────────────

function TerminalPane({
  sessionId,
  readOnly,
  containerId,
}: {
  sessionId: string;
  readOnly: boolean;
  containerId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const xtermRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let dispose: (() => void) | undefined;

    async function init() {
      try {
        const { Terminal } = await import("@xterm/xterm");
        const { FitAddon } = await import("@xterm/addon-fit");
        const { WebLinksAddon } = await import("@xterm/addon-web-links");

        if (!mounted || !containerRef.current) return;

        const term = new Terminal({
          theme: {
            background: "#0d1117",
            foreground: "#e6edf3",
            cursor: "#58a6ff",
            selectionBackground: "#264f7844",
          },
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
          fontSize: 13,
          lineHeight: 1.4,
          cursorBlink: true,
          scrollback: 5000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new WebLinksAddon());
        term.open(containerRef.current);
        fitAddon.fit();
        xtermRef.current = term;

        // Connect to WebSocket terminal server
        const socket: Socket = io("/terminal", {
          path: "/api/socket",
          query: {
            sessionId,
            readOnly: String(readOnly),
            mode: containerId ? "container" : "host",
            containerId: containerId ?? "",
          },
          withCredentials: true,
          transports: ["websocket", "polling"],
        });
        socketRef.current = socket;

        socket.on("output", (data: string) => term.write(data));
        socket.on("connect_error", (cause) => {
          const message = cause instanceof Error ? cause.message : "Connection failed";
          setError(message);
          term.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`);
        });
        socket.on("disconnect", () => term.write("\r\n\x1b[33mDisconnected from shell.\x1b[0m\r\n"));

        term.onData((data) => {
          if (!readOnly) socket.emit("input", data);
        });

        term.onResize(({ cols, rows }) => socket.emit("resize", { cols, rows }));

        // Fit on window resize
        const ro = new ResizeObserver(() => fitAddon.fit());
        ro.observe(containerRef.current);

        dispose = () => {
          ro.disconnect();
          term.dispose();
          socket.disconnect();
        };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Terminal initialization failed";
        if (mounted) {
          setError(message);
        }
      }
    }

    void init();
    return () => {
      mounted = false;
      dispose?.();
    };
  }, [sessionId, readOnly, containerId]);

  return (
    <div className="w-full h-full p-1">
      {error ? (
        <div className="flex h-full items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <div ref={containerRef} className="w-full h-full" />
      )}
    </div>
  );
}
