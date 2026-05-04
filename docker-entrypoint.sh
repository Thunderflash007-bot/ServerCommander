#!/bin/sh
set -e

echo "[ServerCommander OS] Starting up..."

# Run database migrations
echo "[ServerCommander OS] Running database migrations..."
npx prisma migrate deploy --schema=/app/prisma/schema.prisma

# Seed admin user on first run
echo "[ServerCommander OS] Seeding initial data..."
node -e "
const { execSync } = require('child_process');
try {
  execSync('npx tsx /app/prisma/seed.ts', { stdio: 'inherit' });
} catch (e) {
  console.warn('[seed] Seed failed (may already exist):', e.message);
}
" 2>/dev/null || true

echo "[ServerCommander OS] Starting application server..."
exec node /app/server.mjs
