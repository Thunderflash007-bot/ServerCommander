#!/usr/bin/env bash
# =============================================================================
#  ServerCommander OS — Full Reset Script
#  Brings this repository back to a fresh post-clone state.
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
fatal()   { error "$*"; exit 1; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v docker &>/dev/null; then
  fatal "docker is required for reset.sh"
fi

if docker compose version &>/dev/null; then
  COMPOSE_CMD=(docker compose)
  COMPOSE_LABEL="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD=(docker-compose)
  COMPOSE_LABEL="docker-compose"
else
  fatal "Neither 'docker compose' nor 'docker-compose' is installed."
fi

echo -e "${BOLD}${RED}WARNING:${RESET} This will remove local runtime data for this project:"
echo "  - Compose containers/networks for this repo"
echo "  - Local images built by this repo"
echo "  - Compose volumes for this repo (including SQLite data)"
echo "  - .env and .env backup files"
echo "  - local build/cache artifacts (node_modules, .next, dist, *.db, logs)"
echo
read -rp "Type RESET to continue: " CONFIRM
if [[ "$CONFIRM" != "RESET" ]]; then
  warn "Aborted. Nothing changed."
  exit 0
fi

info "Stopping and removing compose stack (${COMPOSE_LABEL})"
"${COMPOSE_CMD[@]}" down --volumes --remove-orphans --rmi local || true

# Extra safety: remove project volume names that may remain from old project names
info "Removing known ServerCommander docker volumes (if present)"
VOLUMES_TO_REMOVE=(
  "servercommander_sc_data"
  "servercommanderos_sc_data"
  "sc_data"
)
for v in "${VOLUMES_TO_REMOVE[@]}"; do
  docker volume rm "$v" >/dev/null 2>&1 || true
done

# Remove generated env files
info "Removing generated environment files"
rm -f .env
rm -f .env.backup.*

# Remove local build/dev artifacts
info "Removing local artifacts"
rm -rf node_modules .next dist coverage .turbo
rm -f npm-debug.log* yarn-debug.log* yarn-error.log* .pnpm-debug.log*
rm -f *.db *.db-journal *.db-wal *.db-shm

# Remove optional app data directories if they exist
rm -rf data

# Remove untracked ignored files to mirror fresh clone as closely as possible
if command -v git &>/dev/null && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  info "Cleaning ignored files via git clean -fdX"
  git clean -fdX
else
  warn "Git repository not detected; skipped git clean -fdX."
fi

success "Reset complete. Repository is back to a fresh post-clone state."
echo
info "Next steps:"
echo "  1) ./setup.sh"
echo "  2) configure fresh admin credentials"
