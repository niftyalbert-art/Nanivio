#!/usr/bin/env bash
# Isolated PostgreSQL only; never reads or connects to the application's database.
set -euo pipefail
cd "$(dirname "$0")/.."
temp_db=$(mktemp -d /tmp/nanivio-regressions.XXXXXX)
trap 'pg_ctl -D "$temp_db/data" -m immediate -w stop >/dev/null 2>&1 || true; rm -rf "$temp_db"' EXIT
initdb -D "$temp_db/data" -A trust -U postgres >"$temp_db/init.log"
pg_ctl -D "$temp_db/data" -l "$temp_db/server.log" \
  -o "-k $temp_db -p 6543 -c listen_addresses=''" -w start
psql_command=(psql -h "$temp_db" -p 6543 -U postgres -d postgres -v ON_ERROR_STOP=1)
"${psql_command[@]}" -c 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;'
"${psql_command[@]}" -f migrations/002_billing_normalized_ledger.sql >"$temp_db/schema.log"
"${psql_command[@]}" -f migrations/007_communication_plan_entitlements.sql
"${psql_command[@]}" -f migrations/009_billing_malvi_expression_fix.sql
"${psql_command[@]}" -f tests/communication-plan-entitlements.sql
"${psql_command[@]}" -f tests/wallet-minute-purchase.sql

# The application table uses the existing profile's text primary key; no auth
# provider is simulated or contacted in these payload-storage regression checks.
"${psql_command[@]}" -c "CREATE TABLE public.nanivio_users(id TEXT PRIMARY KEY); INSERT INTO public.nanivio_users VALUES ('privacy-test');"
awk '/CREATE TABLE IF NOT EXISTS public.nanivio_user_applications/{capture=1}
     capture {print}
     capture && /^\);/ {exit}' migrations/003_production_auth_and_app_data.sql |
  "${psql_command[@]}"
"${psql_command[@]}" <<'SQL'
INSERT INTO nanivio_user_applications(id,user_id,application_type,status,payload)
VALUES('00000000-0000-0000-0000-000000000001','privacy-test','EXPERT','VERIFIED',
 '{"personal":{"password":"test-only","firstName":"Test"},"nested":[{"refresh_token":"test-only"}]}');
GRANT SELECT, INSERT, UPDATE ON nanivio_user_applications TO service_role;
SQL
"${psql_command[@]}" -f migrations/008_application_credentials_privacy.sql
"${psql_command[@]}" -c 'SET ROLE service_role;' -f tests/application-privacy.sql
