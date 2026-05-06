#!/usr/bin/env bash
# =============================================================================
#  ServerCommander OS — Interactive Setup Script
#  https://github.com/your-org/servercommander-os
# =============================================================================
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
fatal()   { error "$*"; exit 1; }
header()  { echo -e "\n${BOLD}${BLUE}▶  $*${RESET}"; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
cat <<'BANNER'
 ___                            ___                                    _
/ __| ___ _ ___ _____ _ _ ___ / __|___ _ __  _ __  __ _ _ _  __| |___ _ _
\__ \/ -_) '_\ V / -_) '_(_-< | (__/ _ \ '  \| '  \/ _` | ' \/ _` / -_) '_|
|___/\___|_|  \_/\___|_| /__/  \___\___/_|_|_|_|_|_\__,_|_||_\__,_\___|_|

                       Open-Source Server Management Console
BANNER
echo -e "${RESET}"

# ── Prerequisites Check ───────────────────────────────────────────────────────
header "Checking prerequisites"

require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    fatal "'$1' is not installed. Please install it and re-run setup."
  fi
  success "$1 found ($(command -v "$1"))"
}

require_cmd docker

if docker compose version &>/dev/null; then
  COMPOSE_CMD=(docker compose)
  COMPOSE_LABEL="docker compose"
  success "Docker Compose plugin found (docker compose)"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD=(docker-compose)
  COMPOSE_LABEL="docker-compose"
  success "docker-compose found ($(command -v docker-compose))"
else
  fatal "Neither 'docker compose' plugin nor 'docker-compose' is installed. Please install Docker Compose and re-run setup."
fi

# Check Docker daemon is running
if ! docker info &>/dev/null; then
  fatal "Docker daemon is not running. Start it and re-run setup."
fi
success "Docker daemon is running"

# ── Collect Admin Credentials ─────────────────────────────────────────────────
header "Admin Account Setup"

echo -e "Create the initial administrator account.\n"

read -rp "  Admin username [admin]: " ADMIN_USERNAME
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"

while true; do
  read -rsp "  Admin password (min 12 chars): " ADMIN_PASSWORD
  echo
  if [[ ${#ADMIN_PASSWORD} -lt 12 ]]; then
    warn "Password must be at least 12 characters. Try again."
    continue
  fi
  read -rsp "  Confirm password: " ADMIN_PASSWORD_CONFIRM
  echo
  if [[ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]]; then
    warn "Passwords do not match. Try again."
    continue
  fi
  break
done

success "Admin credentials accepted."

# ── Port Configuration ────────────────────────────────────────────────────────
header "Network Configuration"

read -rp "  Host port to expose ServerCommander on [3000]: " APP_PORT
APP_PORT="${APP_PORT:-3000}"

# Basic port validity check
if ! [[ "$APP_PORT" =~ ^[0-9]+$ ]] || (( APP_PORT < 1 || APP_PORT > 65535 )); then
  fatal "Invalid port: $APP_PORT"
fi
success "Application port: $APP_PORT"

# ── SSH/SFTP Backend Configuration ───────────────────────────────────────────
header "Remote Access Backend"

read -rp "  Use SSH/SFTP for Terminal + Files? (y/N): " SSH_ENABLE_INPUT
SSH_ENABLE_INPUT="${SSH_ENABLE_INPUT:-N}"

SSH_ENABLED=false
SSH_HOST=""
SSH_PORT="22"
SSH_USERNAME=""
SSH_PASSWORD=""
SSH_PRIVATE_KEY=""
SSH_KEY_PASSPHRASE=""
SSH_SFTP_ROOT="/"

if [[ "$SSH_ENABLE_INPUT" =~ ^[Yy]$ ]]; then
  SSH_ENABLED=true
  read -rp "  SSH host/IP: " SSH_HOST
  [[ -z "$SSH_HOST" ]] && fatal "SSH host is required when SSH/SFTP is enabled"

  read -rp "  SSH port [22]: " SSH_PORT
  SSH_PORT="${SSH_PORT:-22}"
  if ! [[ "$SSH_PORT" =~ ^[0-9]+$ ]] || (( SSH_PORT < 1 || SSH_PORT > 65535 )); then
    fatal "Invalid SSH port: $SSH_PORT"
  fi

  read -rp "  SSH username: " SSH_USERNAME
  [[ -z "$SSH_USERNAME" ]] && fatal "SSH username is required when SSH/SFTP is enabled"

  read -rp "  SSH authentication method ([k]ey/[p]assword) [k]: " SSH_AUTH_METHOD
  SSH_AUTH_METHOD="${SSH_AUTH_METHOD:-k}"

  if [[ "$SSH_AUTH_METHOD" =~ ^[Pp]$ ]]; then
    while true; do
      read -rsp "  SSH password: " SSH_PASSWORD
      echo
      if [[ -z "$SSH_PASSWORD" ]]; then
        warn "SSH password cannot be empty. Try again."
        continue
      fi
      break
    done
  else
    read -rp "  Path to private key [~/.ssh/id_ed25519]: " SSH_KEY_PATH
    SSH_KEY_PATH="${SSH_KEY_PATH:-~/.ssh/id_ed25519}"
    SSH_KEY_PATH="${SSH_KEY_PATH/#\~/$HOME}"
    [[ -f "$SSH_KEY_PATH" ]] || fatal "SSH private key not found: $SSH_KEY_PATH"
    SSH_PRIVATE_KEY="$(cat "$SSH_KEY_PATH")"

    read -rsp "  Key passphrase (optional): " SSH_KEY_PASSPHRASE
    echo
  fi

  read -rp "  SFTP root path [/]: " SSH_SFTP_ROOT
  SSH_SFTP_ROOT="${SSH_SFTP_ROOT:-/}"
  success "SSH/SFTP backend enabled (${SSH_USERNAME}@${SSH_HOST}:${SSH_PORT})"
else
  success "Using local host-mount backend for Terminal + Files"
fi

# ── SMTP / Mail Configuration ────────────────────────────────────────────────
header "SMTP / Mail Configuration"

read -rp "  Enable SMTP (mail sending)? (y/N): " SMTP_ENABLE_INPUT
SMTP_ENABLE_INPUT="${SMTP_ENABLE_INPUT:-N}"

SMTP_ENABLED=false
SMTP_HOST=""
SMTP_PORT="587"
SMTP_SECURE=false
SMTP_USERNAME=""
SMTP_PASSWORD=""
SMTP_FROM_EMAIL=""
SMTP_USE_ALIAS=false
SMTP_FROM_NAME=""

if [[ "$SMTP_ENABLE_INPUT" =~ ^[Yy]$ ]]; then
  SMTP_ENABLED=true

  read -rp "  SMTP host: " SMTP_HOST
  [[ -z "$SMTP_HOST" ]] && fatal "SMTP host is required when SMTP is enabled"

  read -rp "  SMTP port [587]: " SMTP_PORT
  SMTP_PORT="${SMTP_PORT:-587}"
  if ! [[ "$SMTP_PORT" =~ ^[0-9]+$ ]] || (( SMTP_PORT < 1 || SMTP_PORT > 65535 )); then
    fatal "Invalid SMTP port: $SMTP_PORT"
  fi

  read -rp "  Use secure SMTP/SSL? (y/N): " SMTP_SECURE_INPUT
  SMTP_SECURE_INPUT="${SMTP_SECURE_INPUT:-N}"
  if [[ "$SMTP_SECURE_INPUT" =~ ^[Yy]$ ]]; then
    SMTP_SECURE=true
  fi

  read -rp "  SMTP username: " SMTP_USERNAME
  [[ -z "$SMTP_USERNAME" ]] && fatal "SMTP username is required when SMTP is enabled"

  while true; do
    read -rsp "  SMTP password: " SMTP_PASSWORD
    echo
    if [[ -z "$SMTP_PASSWORD" ]]; then
      warn "SMTP password cannot be empty. Try again."
      continue
    fi
    break
  done

  read -rp "  Mail from address (e.g. noreply@example.com): " SMTP_FROM_EMAIL
  [[ -z "$SMTP_FROM_EMAIL" ]] && fatal "Mail from address is required when SMTP is enabled"

  read -rp "  Use alias sender name? (y/N): " SMTP_ALIAS_INPUT
  SMTP_ALIAS_INPUT="${SMTP_ALIAS_INPUT:-N}"
  if [[ "$SMTP_ALIAS_INPUT" =~ ^[Yy]$ ]]; then
    SMTP_USE_ALIAS=true
    read -rp "  Alias sender name (e.g. ServerCommander Security): " SMTP_FROM_NAME
    [[ -z "$SMTP_FROM_NAME" ]] && fatal "Alias name is required when alias sender is enabled"
  fi

  success "SMTP enabled (${SMTP_HOST}:${SMTP_PORT})"
else
  success "SMTP disabled"
fi

# ── Secure Secret Generation ──────────────────────────────────────────────────
header "Generating cryptographic secrets"

gen_hex() { head -c "$1" /dev/urandom | xxd -p | tr -d '\n' | cut -c1-"$((2 * $1))"; }

SESSION_SECRET="$(gen_hex 32)"
JWT_SECRET="$(gen_hex 32)"
ENCRYPTION_KEY="$(gen_hex 32)"

success "SESSION_SECRET generated (64-char hex)"
success "JWT_SECRET generated (64-char hex)"
success "ENCRYPTION_KEY generated (64-char hex)"

# ── Write .env File ───────────────────────────────────────────────────────────
header "Writing .env"

ENV_FILE=".env"

if [[ -f "$ENV_FILE" ]]; then
  BACKUP=".env.backup.$(date +%Y%m%d%H%M%S)"
  cp "$ENV_FILE" "$BACKUP"
  warn "Existing .env backed up to $BACKUP"
fi

escape_env() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

encrypt_secret_env() {
  local plaintext="$1"
  local iv
  local cipher_hex

  if ! command -v openssl &>/dev/null; then
    fatal "'openssl' is required to encrypt SSH password for .env storage"
  fi

  iv="$(head -c 16 /dev/urandom | xxd -p | tr -d '\n')"
  cipher_hex="$(printf '%s' "$plaintext" | openssl enc -aes-256-ctr -K "$ENCRYPTION_KEY" -iv "$iv" -nosalt -e | xxd -p -c 9999 | tr -d '\n')"
  printf '%s:%s' "$iv" "$cipher_hex"
}

ADMIN_USERNAME_ESCAPED="$(escape_env "$ADMIN_USERNAME")"
SSH_HOST_ESCAPED="$(escape_env "$SSH_HOST")"
SSH_USERNAME_ESCAPED="$(escape_env "$SSH_USERNAME")"
SSH_SFTP_ROOT_ESCAPED="$(escape_env "$SSH_SFTP_ROOT")"
SMTP_HOST_ESCAPED="$(escape_env "$SMTP_HOST")"
SMTP_USERNAME_ESCAPED="$(escape_env "$SMTP_USERNAME")"
SMTP_FROM_EMAIL_ESCAPED="$(escape_env "$SMTP_FROM_EMAIL")"
SMTP_FROM_NAME_ESCAPED="$(escape_env "$SMTP_FROM_NAME")"

ADMIN_PASSWORD_ENC="$(encrypt_secret_env "$ADMIN_PASSWORD")"
ADMIN_PASSWORD_ENC_ESCAPED="$(escape_env "$ADMIN_PASSWORD_ENC")"

SSH_PASSWORD_ENC=""
SSH_PRIVATE_KEY_ENC=""
SSH_KEY_PASSPHRASE_ENC=""
SMTP_PASSWORD_ENC=""
if [[ "$SSH_ENABLED" == "true" ]]; then
  if [[ -n "$SSH_PASSWORD" ]]; then
    SSH_PASSWORD_ENC="$(encrypt_secret_env "$SSH_PASSWORD")"
  fi
  if [[ -n "$SSH_PRIVATE_KEY" ]]; then
    SSH_PRIVATE_KEY_ENC="$(encrypt_secret_env "$SSH_PRIVATE_KEY")"
  fi
  if [[ -n "$SSH_KEY_PASSPHRASE" ]]; then
    SSH_KEY_PASSPHRASE_ENC="$(encrypt_secret_env "$SSH_KEY_PASSPHRASE")"
  fi
fi
if [[ "$SMTP_ENABLED" == "true" ]]; then
  SMTP_PASSWORD_ENC="$(encrypt_secret_env "$SMTP_PASSWORD")"
fi
SSH_PASSWORD_ENC_ESCAPED="$(escape_env "$SSH_PASSWORD_ENC")"
SSH_PRIVATE_KEY_ENC_ESCAPED="$(escape_env "$SSH_PRIVATE_KEY_ENC")"
SSH_KEY_PASSPHRASE_ENC_ESCAPED="$(escape_env "$SSH_KEY_PASSPHRASE_ENC")"
SMTP_PASSWORD_ENC_ESCAPED="$(escape_env "$SMTP_PASSWORD_ENC")"

cat > "$ENV_FILE" <<EOF
# ─────────────────────────────────────────────────────────────────────────────
# ServerCommander OS — Environment (generated by setup.sh on $(date))
# DO NOT COMMIT THIS FILE
# ─────────────────────────────────────────────────────────────────────────────

NODE_ENV=production
NEXT_PUBLIC_APP_NAME="ServerCommander OS"
PORT=3000
HOST_PORT=${APP_PORT}

SESSION_SECRET=${SESSION_SECRET}
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

DATABASE_URL="file:/app/data/servercommander.db"

ADMIN_USERNAME="${ADMIN_USERNAME_ESCAPED}"
ADMIN_PASSWORD_ENC="${ADMIN_PASSWORD_ENC_ESCAPED}"

DOCKER_SOCKET=/var/run/docker.sock
HOST_FS_MOUNT=/host_system

SSH_ENABLED=${SSH_ENABLED}
SSH_HOST="${SSH_HOST_ESCAPED}"
SSH_PORT=${SSH_PORT}
SSH_USERNAME="${SSH_USERNAME_ESCAPED}"
SSH_PASSWORD_ENC="${SSH_PASSWORD_ENC_ESCAPED}"
SSH_PRIVATE_KEY_ENC="${SSH_PRIVATE_KEY_ENC_ESCAPED}"
SSH_KEY_PASSPHRASE_ENC="${SSH_KEY_PASSPHRASE_ENC_ESCAPED}"
SSH_SFTP_ROOT="${SSH_SFTP_ROOT_ESCAPED}"

SMTP_ENABLED=${SMTP_ENABLED}
SMTP_HOST="${SMTP_HOST_ESCAPED}"
SMTP_PORT=${SMTP_PORT}
SMTP_SECURE=${SMTP_SECURE}
SMTP_USERNAME="${SMTP_USERNAME_ESCAPED}"
SMTP_PASSWORD_ENC="${SMTP_PASSWORD_ENC_ESCAPED}"
SMTP_FROM_EMAIL="${SMTP_FROM_EMAIL_ESCAPED}"
SMTP_USE_ALIAS=${SMTP_USE_ALIAS}
SMTP_FROM_NAME="${SMTP_FROM_NAME_ESCAPED}"

SESSION_MAX_AGE=28800
COOKIE_SECURE=false
EOF

chmod 600 "$ENV_FILE"
success ".env written with restricted permissions (600)"

# ── Build & Launch ────────────────────────────────────────────────────────────
header "Building Docker image (this may take a few minutes on first run)"

"${COMPOSE_CMD[@]}" build --no-cache

success "Docker image built."

header "Starting ServerCommander OS"

"${COMPOSE_CMD[@]}" up -d

# ── Wait for health ───────────────────────────────────────────────────────────
header "Waiting for application to become healthy"

MAX_WAIT=120
WAITED=0
until curl -sf "http://localhost:${APP_PORT}/api/auth/me" > /dev/null 2>&1; do
  WAITED=$((WAITED + 3))
  if (( WAITED >= MAX_WAIT )); then
    warn "Health check timed out after ${MAX_WAIT}s. Check logs: ${COMPOSE_LABEL} logs -f"
    break
  fi
  echo -n "."
  sleep 3
done
echo

success "Application is healthy!"

# ── Done ──────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║         ServerCommander OS is running!                       ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════╝${RESET}\n"
echo -e "  ${BOLD}URL:${RESET}      http://$(hostname -I | awk '{print $1}'):${APP_PORT}"
echo -e "  ${BOLD}Username:${RESET} ${ADMIN_USERNAME}"
echo -e "  ${BOLD}Password:${RESET} (as entered)\n"
echo -e "  Manage: ${CYAN}${COMPOSE_LABEL} logs -f${RESET}    — view logs"
echo -e "          ${CYAN}${COMPOSE_LABEL} down${RESET}        — stop"
echo -e "          ${CYAN}${COMPOSE_LABEL} restart${RESET}     — restart\n"
warn "Keep the .env file secure and never share your secrets."
