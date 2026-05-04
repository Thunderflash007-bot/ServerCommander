import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import pty from "node-pty";
import { verifyToken } from "./src/lib/auth.js";
import { getUserPermissions } from "./src/lib/auth.js";
import { canAccessTerminal, isTerminalReadOnly, getTerminalMaxSessions } from "./src/lib/rbac.js";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Track active terminal sessions per user
const userSessionCount = new Map();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    path: "/api/socket",
    cors: { origin: false },
  });

  const terminalNs = io.of("/terminal");

  terminalNs.use(async (socket, next) => {
    const token = socket.handshake.auth?.token ?? socket.request.headers?.cookie
      ?.split(";")
      .find((c) => c.trim().startsWith("sc_session="))
      ?.split("=")[1];

    if (!token) return next(new Error("Unauthorized"));

    const payload = await verifyToken(token);
    if (!payload) return next(new Error("Invalid session"));

    const perms = await getUserPermissions(payload.userId);
    if (!canAccessTerminal(perms)) return next(new Error("Terminal access denied"));

    socket.data.userId = payload.userId;
    socket.data.username = payload.username;
    socket.data.readOnly = isTerminalReadOnly(perms);
    socket.data.maxSessions = getTerminalMaxSessions(perms);
    next();
  });

  terminalNs.on("connection", (socket) => {
    const userId = socket.data.userId;
    const readOnly = socket.data.readOnly;

    // Enforce max sessions
    const current = userSessionCount.get(userId) ?? 0;
    const max = socket.data.maxSessions;
    if (max > 0 && current >= max) {
      socket.emit("output", "\r\n\x1b[31mMax terminal sessions reached.\x1b[0m\r\n");
      socket.disconnect();
      return;
    }
    userSessionCount.set(userId, current + 1);

    const shell = process.env.SHELL ?? "/bin/bash";
    const cwd = process.env.HOST_FS_MOUNT ?? "/host_system";

    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
    });

    ptyProcess.onData((data) => socket.emit("output", data));

    ptyProcess.onExit(() => {
      socket.emit("output", "\r\n\x1b[33m[Process exited]\x1b[0m\r\n");
      socket.disconnect();
    });

    socket.on("input", (data) => {
      if (!readOnly) {
        ptyProcess.write(data);
      }
    });

    socket.on("resize", ({ cols, rows }) => {
      ptyProcess.resize(Math.max(1, cols), Math.max(1, rows));
    });

    socket.on("disconnect", () => {
      ptyProcess.kill();
      const cnt = userSessionCount.get(userId) ?? 1;
      userSessionCount.set(userId, Math.max(0, cnt - 1));
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`[ServerCommander OS] Ready on http://${hostname}:${port}`);
  });
});
