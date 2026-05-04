#!/bin/sh
set -e

echo "[ServerCommander OS] Starting up..."

# Initialize database schema
if [ -d /app/prisma/migrations ] && [ "$(ls -A /app/prisma/migrations 2>/dev/null)" ]; then
	echo "[ServerCommander OS] Running database migrations..."
	/app/node_modules/.bin/prisma migrate deploy --schema=/app/prisma/schema.prisma
else
	echo "[ServerCommander OS] No migrations found. Syncing schema with prisma db push..."
	/app/node_modules/.bin/prisma db push --schema=/app/prisma/schema.prisma --accept-data-loss
fi

# Seed admin user on first run
echo "[ServerCommander OS] Seeding initial data..."
/app/node_modules/.bin/tsx /app/prisma/seed.ts || true

echo "[ServerCommander OS] Starting application server..."
exec node /app/server.mjs
