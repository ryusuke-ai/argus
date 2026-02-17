#!/bin/sh
set -e

echo "=== Argus Demo: Starting up ==="

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
until pg_isready -h postgres -p 5432 -U argus -q 2>/dev/null; do
  sleep 1
done
echo "PostgreSQL is ready."

# Run database schema push (creates tables if not exist)
# Use npx directly to avoid NODE_OPTIONS='--env-file=../../.env' in package.json
# which would fail since .env doesn't exist in the container.
# DATABASE_URL is already set via docker-compose environment.
echo "Pushing database schema..."
cd /app/packages/db
npx drizzle-kit push

# Seed demo data (idempotent — uses ON CONFLICT DO NOTHING)
echo "Seeding demo data..."
PGPASSWORD=argus psql -h postgres -U argus -d argus -f /app/scripts/seed-demo.sql

echo "=== Starting Dashboard on port 3150 ==="

# Start Next.js Dashboard in production mode
cd /app/apps/dashboard
exec node_modules/next/dist/bin/next start --port 3150
