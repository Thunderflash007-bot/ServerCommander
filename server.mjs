import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import pty from "node-pty";
import { Client as SSHClient } from "ssh2";
import { jwtVerify } from "jose";
import { PrismaClient } from "@prisma/client";
import { createDecipheriv } from "crypto";

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

function isSshBackendEnabled() {
  return String(process.env.SSH_ENABLED ?? "false").toLowerCase() === "true";
}

function getSshRuntimeConfig() {
  const host = process.env.SSH_HOST?.trim();
  const username = process.env.SSH_USERNAME?.trim();
  const password = getSshPassword();
  const port = Number(process.env.SSH_PORT ?? "22");

  if (!host || !username || !password) {
    throw new Error("SSH backend is enabled but SSH_HOST/SSH_USERNAME/SSH_PASSWORD_ENC are missing");
  }

  return { host, username, password, port };
}

function getSshPassword() {
  const encryptedPassword = process.env.SSH_PASSWORD_ENC?.trim();
  const fallbackPassword = process.env.SSH_PASSWORD?.trim();

  if (encryptedPassword) {
    return decryptSecret(encryptedPassword);
  }
  return fallbackPassword ?? "";
}

function decryptSecret(ciphertext) {
  const keyHex = (process.env.ENCRYPTION_KEY ?? "").trim();
  if (!/^[0-9a-fA-F]{32}$/.test(keyHex)) {
    throw new Error("ENCRYPTION_KEY must be 32 hex characters");
  }

  const [ivHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !dataHex || !/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(dataHex)) {
    throw new Error("Invalid SSH_PASSWORD_ENC format");
  }

  const decipher = createDecipheriv(
    "aes-256-ctr",
    Buffer.from(keyHex, "hex"),
    Buffer.from(ivHex, "hex")
  );
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf-8");
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
    const useSshHostShell = mode === "host" && isSshBackendEnabled();

    let ptyProcess = null;
    let sshConn = null;
    let sshStream = null;

    if (useSshHostShell) {
      try {
        const sshCfg = getSshRuntimeConfig();
        sshConn = new SSHClient();
        sshConn.on("ready", () => {
          sshConn.shell(
            {
              term: "xterm-256color",
              cols: 80,
              rows: 24,
            },
            (err, stream) => {
              if (err) {
                socket.emit("output", `\r\n\x1b[31mSSH shell failed: ${err.message}\x1b[0m\r\n`);
                socket.disconnect();
                return;
              }
              sshStream = stream;
              stream.on("data", (data) => socket.emit("output", data.toString("utf-8")));
              stream.on("close", () => {
                socket.emit("output", "\r\n\x1b[33m[SSH session closed]\x1b[0m\r\n");
                socket.disconnect();
              });
            }
          );
        });
        sshConn.on("error", (err) => {
          socket.emit("output", `\r\n\x1b[31mSSH error: ${err.message}\x1b[0m\r\n`);
        });
        sshConn.connect({
          host: sshCfg.host,
          port: sshCfg.port,
          username: sshCfg.username,
          password: sshCfg.password,
          readyTimeout: 15000,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        socket.emit("output", `\r\n\x1b[31mSSH config error: ${message}\x1b[0m\r\n`);
        socket.disconnect();
        return;
      }
    } else {
      ptyProcess =
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
    }

    socket.on("input", (data) => {
      if (readOnly) return;
      if (sshStream) {
        sshStream.write(data);
        return;
      }
      if (ptyProcess) {
        ptyProcess.write(data);
      }
    });

    socket.on("resize", ({ cols, rows }) => {
      const safeCols = Math.max(1, cols);
      const safeRows = Math.max(1, rows);
      if (sshStream?.setWindow) {
        sshStream.setWindow(safeRows, safeCols, 0, 0);
      }
      if (ptyProcess) {
        ptyProcess.resize(safeCols, safeRows);
      }
    });

    socket.on("disconnect", () => {
      if (sshStream) {
        try {
          sshStream.end();
        } catch {
          // noop
        }
      }
      if (sshConn) {
        try {
          sshConn.end();
        } catch {
          // noop
        }
      }
      if (ptyProcess) {
        ptyProcess.kill();
      }
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
