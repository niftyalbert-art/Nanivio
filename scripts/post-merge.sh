#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Validate the lockfile before installing its exact dependency versions.
npm run test:dependencies
npm ci --include=dev --no-audit --no-fund
npm run lint
npm run build

# Database migrations and billable provider checks require explicit approval;
# a code merge must not change live account or financial data.
echo "Post-merge setup complete. Database migrations were not run."
