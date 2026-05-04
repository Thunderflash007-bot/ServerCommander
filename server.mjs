import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import pty from "node-pty";
import { jwtVerify } from "jose";
import { PrismaClient } from "@prisma/client";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT ?? "3000", 10);
const prisma = new PrismaClient();

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Track active terminal sessions per user
const userSessionCount = new Map();

function hasContainerExecPermission(perms, containerId) {
  if (!perms || !containerId) return false;
  if (perms.dockerViewAll && perms.terminalAccess) return true;

  return perms.containerPerms.some(
    (entry) =>
      entry.canExec &&
      (entry.containerId === containerId ||
        containerId.startsWith(entry.containerId) ||
        entry.containerId.startsWith(containerId))
  );
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

function readCookie(name, cookieHeader = "") {
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(name + "=")) {
      return decodeURIComponent(part.slice(name.length + 1));
    }
  }
  return null;
}

async function verifySessionToken(token) {
  const { payload } = await jwtVerify(token, getJwtSecret());
  const sessionId = String(payload.sessionId ?? "");
  const userId = String(payload.userId ?? "");
  const username = String(payload.username ?? "");

  if (!sessionId || !userId) {
    throw new Error("Invalid session payload");
  }

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.expiresAt < new Date()) {
    throw new Error("Session expired or revoked");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new Error("User disabled or missing");
  }

  return { sessionId, userId, username };
}

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
    const token =
      socket.handshake.auth?.token ??
      readCookie("sc_session", socket.request.headers?.cookie ?? "");

    if (!token) return next(new Error("Unauthorized"));

    try {
      const session = await verifySessionToken(token);
      const perms = await prisma.userPermission.findUnique({
        where: { userId: session.userId },
        include: {
          containerPerms: true,
        },
      });

      if (!perms || !perms.terminalAccess) {
        return next(new Error("Terminal access denied"));
      }

      socket.data.userId = session.userId;
      socket.data.username = session.username;
      socket.data.readOnly = perms.terminalReadOnly;
      socket.data.maxSessions = perms.terminalMaxSessions;

      const mode = String(socket.handshake.query?.mode ?? "host");
      const containerId = String(socket.handshake.query?.containerId ?? "");

      if (mode === "container") {
        if (!containerId) {
          return next(new Error("Missing containerId"));
        }
        if (!hasContainerExecPermission(perms, containerId)) {
          return next(new Error("Container exec denied"));
        }
      }

      socket.data.mode = mode;
      socket.data.containerId = containerId;
      next();
    } catch {
      return next(new Error("Invalid session"));
    }
  });

  terminalNs.on("connection", (socket) => {
    const userId = socket.data.userId;
    const readOnly = socket.data.readOnly;
    const mode = socket.data.mode;
    const containerId = socket.data.containerId;

    // Enforce max sessions
    const current = userSessionCount.get(userId) ?? 0;
    const max = socket.data.maxSessions;
    if (max > 0 && current >= max) {
      socket.emit("output", "\r\n\x1b[31mMax terminal sessions reached.\x1b[0m\r\n");
      socket.disconnect();
      return;
    }
    userSessionCount.set(userId, current + 1);

    const cwd = process.env.HOST_FS_MOUNT ?? "/host_system";

    const ptyProcess =
        mode === "container"
          ? pty.spawn(
              "docker",
              ["exec", "-u", "0", "-it", containerId, "/bin/sh"],
            {
              name: "xterm-256color",
              cols: 80,
              rows: 24,
              cwd,
              env: {
                ...process.env,
                TERM: "xterm-256color",
                COLORTERM: "truecolor",
              },
            }
          )
        : pty.spawn(process.env.SHELL ?? "/bin/bash", [], {
            name: "xterm-256color",
            cols: 80,
            rows: 24,
            cwd,
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

  const shutdown = async () => {
    await prisma.$disconnect().catch(() => null);
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
});
