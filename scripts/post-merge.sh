#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
# Apply idempotent SQL migrations (drizzle-kit push blocks on interactive prompts in CI)
if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  for f in scripts/migrations/*.sql; do
    [ -e "$f" ] && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
  done
fi
