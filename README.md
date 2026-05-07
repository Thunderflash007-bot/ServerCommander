# ServerCommander OS

> **Professional open-source server management console — clone, run `setup.sh`, done.**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Docker](https://img.shields.io/badge/Docker-ready-2496ed)

---

## Features

| Feature | Description |
|---|---|
| **Docker Management** | Full container lifecycle via `/var/run/docker.sock` using `dockerode` |
| **Container Factory** | Create and duplicate containers with image/env/cmd/ports/volumes/networks |
| **Container Port Forwarding** | Portainer-style managed TCP forwards per container (host port -> container port) |
| **Granular RBAC** | Per-container, per-path, per-feature permissions — mapped to individual users |
| **File Explorer** | Touch-optimized explorer via host mount or remote SFTP backend |
| **Diff Viewer** | Compare unsaved changes for stack/config files directly in the browser before saving |
| **Drag & Drop Uploads** | Upload files and whole folders into the file explorer via folder picker or drag & drop |
| **Multi-session Terminal** | xterm.js with local PTY or remote SSH shell backend |
| **SSH Key Backend** | Remote Terminal + Files support encrypted SSH private keys instead of password-only auth |
| **User Management** | Admin UI to create users and assign surgical permissions |
| **Audit Log** | Every action is recorded with user, IP, resource, and outcome |
| **Dark Mode** | Enterprise-grade UI built with Tailwind CSS + Shadcn/UI |

---

## Quick Start

### Prerequisites
- Docker Engine ≥ 24
- Docker Compose v2
- Linux host (the app mounts `/var/run/docker.sock` and `/`)

### One-command install

```bash
git clone https://github.com/your-org/ServerCommander.git
cd ServerCommander
bash setup.sh
```

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

## RBAC — Permission Model

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

## Repository Structure

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

## Configuration

All configuration lives in `.env` (generated by `setup.sh`):

| Variable | Description |
|---|---|
| `SESSION_SECRET` | 64-char secret for session signing |
| `JWT_SECRET` | 64-char secret for JWT tokens |
| `INTERNAL_RPC_SECRET` | Dedicated secret for internal RPC endpoints (`/api/internal/*`) |
| `ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM encryption |
| `ADMIN_USERNAME` | Initial admin username |
| `ADMIN_PASSWORD_ENC` | Encrypted initial admin password (`iv_hex:cipher_hex:tag_hex`) |
| `SESSION_MAX_AGE` | Session duration in seconds (default 8h) |
| `DOCKER_HOST` | Docker endpoint for API access (recommended: docker-socket-proxy) |
| `HOST_FS_MOUNT` | Host filesystem mount point inside container |
| `HOST_FS_SOURCE` | Explicit host directory mounted into `HOST_FS_MOUNT` |
| `TRUSTED_PROXIES` | Comma-separated proxy IPs trusted for `X-Forwarded-For` |
| `COOKIE_SECURE` | Require HTTPS transport for the session cookie |
| `SSH_ENABLED` | Enable remote SSH/SFTP backend for Terminal + Files (`true`/`false`) |
| `SSH_HOST` | Remote SSH host/IP |
| `SSH_PORT` | Remote SSH port |
| `SSH_USERNAME` | Remote SSH username |
| `SSH_PASSWORD_ENC` | Encrypted remote SSH password, optional when using keys |
| `SSH_PRIVATE_KEY_ENC` | Encrypted OpenSSH private key for Terminal + Files backend |
| `SSH_KEY_PASSPHRASE_ENC` | Encrypted passphrase for the SSH private key, optional |
| `SSH_HOST_KEY_SHA256` | Expected remote host-key fingerprint (OpenSSH format `SHA256:...`) |
| `SSH_SFTP_ROOT` | Root directory used for SFTP operations |

Admin UI coverage after setup:
`/settings/system` manages `SESSION_MAX_AGE`, `COOKIE_SECURE`, `TRUSTED_PROXIES`, `DOCKER_HOST`, `HOST_FS_SOURCE`, and optional `INTERNAL_RPC_SECRET` rotation.
`/settings/smtp` manages SMTP values.
`/settings/ssh-sftp` manages SSH/SFTP values including host-key pinning.

### SSH Key Setup

ServerCommander now supports SSH key authentication for the remote Terminal and SFTP-backed File Explorer. The recommended path is:

1. Generate a dedicated key pair on the machine where you run setup:

```bash
ssh-keygen -t ed25519 -a 100 -f ~/.ssh/servercommander_ed25519 -C "servercommander"
```

2. Install the public key on the target host:

```bash
ssh-copy-id -i ~/.ssh/servercommander_ed25519.pub user@your-server
```

If `ssh-copy-id` is not available, append the `.pub` file manually to `~/.ssh/authorized_keys` on the target server.

3. Run `bash setup.sh`, enable SSH/SFTP, choose key-based authentication, and point the installer to your private key file.

4. If your private key has a passphrase, enter it when the installer asks for it. The private key and passphrase are encrypted into `.env` using `ENCRYPTION_KEY`.

### Where to get an SSH key

An SSH key is not downloaded from a vendor. You generate it yourself.

- For Linux and macOS, `ssh-keygen` is usually already installed through OpenSSH.
- On Windows, use PowerShell or Git Bash and run the same `ssh-keygen` command.
- If you already have a key like `~/.ssh/id_ed25519`, you can reuse it, but a dedicated key for ServerCommander is cleaner and easier to revoke.

Recommended commands:

```bash
# Create a new dedicated Ed25519 key pair
ssh-keygen -t ed25519 -a 100 -f ~/.ssh/servercommander_ed25519 -C "servercommander"

# Show the public key you need to install on the remote host
cat ~/.ssh/servercommander_ed25519.pub

# Test the connection before running setup
ssh -i ~/.ssh/servercommander_ed25519 user@your-server
```

What each file means:

- `~/.ssh/servercommander_ed25519`: your private key, keep it secret
- `~/.ssh/servercommander_ed25519.pub`: your public key, this goes on the server

Security notes for keys:

- Prefer Ed25519 keys over RSA for new setups.
- Use a passphrase when possible.
- Do not commit private keys into Git.
- If a key is compromised, remove its public key from `authorized_keys` on the server and generate a new pair.

---

## Security Notes

- Docker API access is brokered via `docker-socket-proxy` with only required endpoint groups enabled
- Host filesystem mount is explicitly scoped via `HOST_FS_SOURCE` instead of mounting `/`
- Local filesystem operations validate resolved paths via `realpath` to block symlink escape attacks
- Session tokens are HTTP-only, SameSite=Lax cookies — never accessible from JavaScript
- Passwords are hashed with `bcrypt` (cost factor 12)
- SSH private keys and registry credentials are encrypted with AES-256-GCM (`ENCRYPTION_KEY`) and include integrity protection
- SSH supports host-key fingerprint pinning via `SSH_HOST_KEY_SHA256`
- `X-Forwarded-For` is only trusted when `TRUSTED_PROXIES` is explicitly configured
- Baseline response hardening headers are set (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- All privileged actions are written to the `AuditLog` table
- `no-new-privileges:true` security opt is set on the container

---

## License

[MIT](LICENSE) — Use freely, contribute back.
