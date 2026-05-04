# ServerCommander OS

> **Professional open-source server management console — clone, run `setup.sh`, done.**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Docker](https://img.shields.io/badge/Docker-ready-2496ed)

---

## ✨ Features

| Feature | Description |
|---|---|
| **Docker Management** | Full container lifecycle via `/var/run/docker.sock` using `dockerode` |
| **Container Factory** | Create and duplicate containers with image/env/cmd/ports/volumes/networks |
| **Container Port Forwarding** | Portainer-style managed TCP forwards per container (host port -> container port) |
| **Granular RBAC** | Per-container, per-path, per-feature permissions — mapped to individual users |
| **File Explorer** | Touch-optimized explorer via host mount or remote SFTP backend |
| **Multi-session Terminal** | xterm.js with local PTY or remote SSH shell backend |
| **User Management** | Admin UI to create users and assign surgical permissions |
| **Audit Log** | Every action is recorded with user, IP, resource, and outcome |
| **Dark Mode** | Enterprise-grade UI built with Tailwind CSS + Shadcn/UI |

---

## 🚀 Quick Start

### Prerequisites
- Docker Engine ≥ 24
- Docker Compose v2
- Linux host (the app mounts `/var/run/docker.sock` and `/`)

### One-command install

```bash
git clone https://github.com/your-org/servercommander-os.git
cd servercommander-os
bash setup.sh
```

### Troubleshooting: docker-compose not installed

If setup fails with:

```text
[ERROR] 'docker-compose' is not installed. Please install it and re-run setup.
```

Install Docker Compose (recommended: Compose Plugin):

```bash
apt-get update
apt-get install -y docker-compose-plugin
docker compose version
```

Legacy alternative (older systems):

```bash
apt-get update
apt-get install -y docker-compose
docker-compose --version
```

Then run setup again:

```bash
./setup.sh
```

`setup.sh` will:
1. Prompt for an **admin username and password**
2. Optionally prompt for **SSH/SFTP host credentials** (username/password)
3. Generate a cryptographically secure `.env` (unique secrets per install)
4. Build the Docker image
5. Run `docker compose up -d`
6. Wait for the health check and print the URL

### Full reset to fresh clone state

If you want to wipe all local runtime data and start clean:

```bash
./reset.sh
```

`reset.sh` removes for this project:
1. Compose containers/networks
2. Compose volumes (including SQLite data)
3. Locally built images
4. `.env` and backup env files
5. Build/cache artifacts (`node_modules`, `.next`, `dist`, logs, local db files)

---

## 🔐 RBAC — Permission Model

```
User
 └── UserPermission (1-to-1)
      ├── Docker Global Flags
      │     dockerAccess, dockerViewAll, dockerImages,
      │     dockerVolumes, dockerNetworks, dockerCreate, dockerDelete
      │
      ├── ContainerPermission[] (whitelist entries)
      │     containerId, containerName
      │     canView, canStart, canStop, canRestart,
      │     canDelete, canLogs, canExec, canInspect
      │
      ├── FsPathPermission[] (path-based grants)
      │     path (e.g. /var/www), readOnly, canCreate, canDelete
      │
      └── Terminal
            terminalAccess, terminalReadOnly, terminalMaxSessions
```

**Container whitelist logic:**
- When `dockerViewAll = true` → user sees all containers
- When `dockerViewAll = false` → only containers explicitly whitelisted appear; all Docker API calls are intercepted and filtered server-side before the response is sent to the browser

---

## 🏗️ Repository Structure

```
servercommander-os/
├── setup.sh                   # Interactive installer
├── docker-compose.yml         # App + volumes + mounts
├── Dockerfile                 # Multi-stage Next.js build
├── docker-entrypoint.sh       # Migrations + seed + start
├── server.mjs                 # Custom HTTP + Socket.IO server
├── prisma/
│   ├── schema.prisma          # Full RBAC schema (SQLite)
│   └── seed.ts                # Admin user seeder
└── src/
    ├── middleware.ts           # JWT auth guard (all routes)
    ├── lib/
    │   ├── auth.ts            # JWT sessions, cookie helpers
    │   ├── rbac.ts            # All permission check functions
    │   ├── docker.ts          # Dockerode wrapper
    │   ├── db.ts              # Prisma singleton
    │   └── audit.ts           # Audit log writer
    ├── app/
    │   ├── api/
    │   │   ├── auth/          # login, logout, me
    │   │   ├── docker/        # containers, images
    │   │   ├── users/         # CRUD + container-perms + fs-perms
    │   │   ├── files/         # Host filesystem API
    │   │   └── audit/         # Audit log endpoint
    │   └── (dashboard)/
    │       ├── dashboard/     # Overview + stats
    │       ├── containers/    # Container list + controls
    │       ├── files/         # File explorer
    │       ├── terminal/      # xterm.js multi-session
    │       ├── users/         # User management (admin)
    │       └── users/[id]/    # Permission editor UI
    └── components/
        ├── layout/            # Sidebar, TopBar
        ├── dashboard/         # StatusCard
        ├── docker/            # ContainerTable
        ├── files/             # FileExplorer
        ├── terminal/          # TerminalManager
        └── users/             # UsersTable, UserPermissionsEditor
```

---

## ⚙️ Configuration

All configuration lives in `.env` (generated by `setup.sh`):

| Variable | Description |
|---|---|
| `SESSION_SECRET` | 64-char secret for session signing |
| `JWT_SECRET` | 64-char secret for JWT tokens |
| `ADMIN_USERNAME` | Initial admin username |
| `ADMIN_PASSWORD` | Initial admin password (used only at first seed) |
| `SESSION_MAX_AGE` | Session duration in seconds (default 8h) |
| `DOCKER_SOCKET` | Docker socket path (default `/var/run/docker.sock`) |
| `HOST_FS_MOUNT` | Host filesystem mount point inside container |
| `SSH_ENABLED` | Enable remote SSH/SFTP backend for Terminal + Files (`true`/`false`) |
| `SSH_HOST` | Remote SSH host/IP |
| `SSH_PORT` | Remote SSH port |
| `SSH_USERNAME` | Remote SSH username |
| `SSH_PASSWORD` | Remote SSH password |
| `SSH_SFTP_ROOT` | Root directory used for SFTP operations |

---

## 🔒 Security Notes

- The Docker socket is mounted **read-only** in Docker Compose; write operations are proxied through the app which enforces RBAC before every API call
- Host filesystem is mounted with `rslave` propagation; all path operations are sandboxed via prefix-matching and directory traversal prevention
- Session tokens are HTTP-only, SameSite=Lax cookies — never accessible from JavaScript
- Passwords are hashed with `bcrypt` (cost factor 12)
- All privileged actions are written to the `AuditLog` table
- `no-new-privileges:true` security opt is set on the container

---

## 📄 License

[MIT](LICENSE) — Use freely, contribute back.
