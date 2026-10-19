import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { postgresClient } from './helpers/postgres-client.mjs';
import { verifyCommunicationConcurrency } from './communication-plan-concurrency.mjs';

// Parsing and safety checks happen before opening any connection.
export function stagingEnvironment(env, args) {
  if (!args.includes('--confirm-staging')) {
    throw new Error('Explicit --confirm-staging approval is required for staging test writes.');
  }
  let staging, application;
  try {
    staging = new URL(env.STAGING_DATABASE_URL);
    application = new URL(env.SUPABASE_URL);
  } catch {
    throw new Error('Provide STAGING_DATABASE_URL (PostgreSQL) and the existing SUPABASE_URL (HTTPS).');
  }
  if (!['postgres:', 'postgresql:'].includes(staging.protocol)
      || application.protocol !== 'https:'
      || !/^[a-z0-9]+\.supabase\.co$/.test(application.hostname)
      || application.pathname !== '/') {
    throw new Error('Expected a PostgreSQL staging URL and the application Supabase API URL, not a dashboard URL.');
  }
  const appRef = application.hostname.split('.')[0];
  const username = decodeURIComponent(staging.username);
  const stagingRef = staging.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
    || (staging.hostname.endsWith('.pooler.supabase.com')
      ? username.match(/^[^.]+\.([a-z0-9]+)$/)?.[1] : undefined);
  if (!stagingRef) {
    throw new Error('Cannot establish the staging Supabase project identity; no connection opened.');
  }
  if (stagingRef === appRef) {
    throw new Error('Refusing staging writes: STAGING_DATABASE_URL points to the configured application project.');
  }
  if (!staging.password || !username || staging.pathname !== '/postgres'
      || /YOUR[-_ ]PASSWORD|\[|\]/i.test(decodeURIComponent(staging.password))) {
    throw new Error('The staging connection must contain a username, actual password and /postgres database.');
  }
  if (staging.port && staging.port !== '5432') {
    throw new Error('Use a direct connection or session pooler on port 5432, not transaction pooling.');
  }
  const sslmode = staging.searchParams.get('sslmode') || 'require';
  if (!['require', 'verify-ca', 'verify-full'].includes(sslmode)) {
    throw new Error('The staging connection must require SSL.');
  }
  // Pass libpq fields explicitly. PGDATABASE containing a URI is not expanded
  // into connection parameters by psql and can silently target the default host.
  const inherited = { ...env };
  // libpq distinguishes an absent service variable from an empty one: an empty
  // PGSERVICEFILE still asks it to open a file named "". Remove overrides.
  for (const key of ['PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE']) {
    delete inherited[key];
  }
  return {
    ...inherited,
    PGHOST: staging.hostname,
    PGPORT: staging.port || '5432',
    PGUSER: username,
    PGPASSWORD: decodeURIComponent(staging.password),
    PGDATABASE: 'postgres',
    PGSSLMODE: sslmode,
    PGAPPNAME: 'nanivio-staging-entitlement-verification',
    PGOPTIONS: '-c search_path=public -c statement_timeout=15000 -c lock_timeout=10000',
  };
}

async function main() {
  const env = stagingEnvironment(process.env, process.argv.slice(2));
  const db = postgresClient(env);
  const requiredTables = [
    'nanivio_subscriptions', 'nanivio_usage_events', 'nanivio_wallets',
    'nanivio_wallet_ledger', 'nanivio_invoices', 'nanivio_payments',
    'nanivio_billing_transactions', 'nanivio_billing_audit_logs',
    'nanivio_credit_accounts', 'nanivio_credit_ledger',
  ];
  const tables = await db.query(`BEGIN READ ONLY;
    SELECT COUNT(*) FROM unnest(ARRAY[${requiredTables.map((name) => `'${name}'`).join(',')}])
      AS name WHERE to_regclass('public.' || name) IS NOT NULL;
    COMMIT;`);
  if (Number(tables) !== requiredTables.length) {
    throw new Error('Staging lacks the prerequisite normalized billing tables. Apply migration 002 to staging first.');
  }
  if (process.argv.includes('--apply-migration')) {
    const migration = await readFile(new URL('../migrations/007_communication_plan_entitlements.sql', import.meta.url), 'utf8');
    await db.query(`BEGIN;\n${migration}\nCOMMIT;`);
    console.log('Applied migration 007 atomically to the separate staging project');
  }
  const privileges = JSON.parse(await db.query(`SELECT json_build_array(
    has_function_privilege('anon', 'public.nanivio_select_communication_plan(jsonb)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.nanivio_select_communication_plan(jsonb)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.nanivio_select_communication_plan(jsonb)', 'EXECUTE'),
    has_function_privilege('anon', 'public.nanivio_langpretation_usage(jsonb)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.nanivio_langpretation_usage(jsonb)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.nanivio_langpretation_usage(jsonb)', 'EXECUTE'));`));
  if (JSON.stringify(privileges) !== '[false,false,true,false,false,true]') {
    throw new Error('Entitlement RPC privileges must be restricted to service_role.');
  }
  const sequential = await readFile(new URL('./communication-plan-entitlements.sql', import.meta.url), 'utf8');
  await db.query(sequential);
  console.log('PASS: staging grant/retry/expiry/paid-pack checks (transaction rolled back)');
  await verifyCommunicationConcurrency(env);
  console.log('PASS: staging communication entitlement verification complete');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Helpers redact connection errors. Parser errors never include input values.
    console.error(error.message);
    process.exitCode = 1;
  });
}
