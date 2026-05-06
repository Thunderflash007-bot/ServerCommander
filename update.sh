#!/usr/bin/env bash
set -euo pipefail

# ServerCommander OS update helper
# - Pull latest code from origin/main
# - Rebuild and restart container
# - Keep persistent data (no volume deletion)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
ok()      { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
fatal()   { error "$*"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fatal "Missing required command: $1"
}

require_cmd git
require_cmd docker

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
  COMPOSE_LABEL="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
  COMPOSE_LABEL="docker-compose"
else
  fatal "Neither docker compose nor docker-compose is available"
fi

if ! docker info >/dev/null 2>&1; then
  fatal "Docker daemon is not running"
fi

if [[ ! -f .env ]]; then
  fatal "Missing .env in project root. Run setup.sh first."
fi

if [[ ! -f docker-compose.yml ]]; then
  fatal "Missing docker-compose.yml in project root."
fi

if [[ -n "$(git status --porcelain)" ]]; then
  fatal "Working tree has local changes. Commit/stash first, then run update.sh again."
fi

backup_file=".env.backup.update.$(date +%Y%m%d%H%M%S)"
cp .env "$backup_file"
ok "Created .env backup: $backup_file"

info "Pulling latest changes from origin/main..."
git fetch origin main
git pull --no-rebase origin main
ok "Repository updated"

info "Rebuilding image..."
"${COMPOSE_CMD[@]}" build --pull
ok "Image rebuilt"

info "Restarting service (volumes are preserved)..."
"${COMPOSE_CMD[@]}" down
"${COMPOSE_CMD[@]}" up -d
ok "Service restarted"

if command -v curl >/dev/null 2>&1; then
  info "Checking health endpoint..."
  if curl -sf "http://localhost:${HOST_PORT:-3000}/login" >/dev/null 2>&1; then
    ok "Health check passed"
  else
    warn "Health endpoint not ready yet. Check logs: ${COMPOSE_LABEL} logs -f"
  fi
else
  warn "curl not found; skipping health check"
fi

ok "Update completed. Existing data volume remains intact."
