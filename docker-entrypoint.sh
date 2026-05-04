#!/bin/sh
set -e

echo "[ServerCommander OS] Starting up..."

# Run database migrations
echo "[ServerCommander OS] Running database migrations..."
/app/node_modules/.bin/prisma migrate deploy --schema=/app/prisma/schema.prisma

# Seed admin user on first run
echo "[ServerCommander OS] Seeding initial data..."
/app/node_modules/.bin/tsx /app/prisma/seed.ts || true

echo "[ServerCommander OS] Starting application server..."
exec node /app/server.mjs
