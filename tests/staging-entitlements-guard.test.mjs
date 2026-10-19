import test from 'node:test';
import assert from 'node:assert/strict';
import { stagingEnvironment } from './run-staging-entitlements.mjs';

// Deliberately fictitious credentials; no tests in this file open a connection.
const app = 'https://appproject.supabase.co';
const staging = 'postgresql://postgres.testproject:fixture-only@aws-0-test.pooler.supabase.com:5432/postgres';
const fixture = { SUPABASE_URL: app, STAGING_DATABASE_URL: staging };
const approved = ['--confirm-staging'];

test('requires explicit staging approval before any connection', () => {
  assert.throws(() => stagingEnvironment(fixture, []), /approval is required/);
});

test('rejects malformed URLs and dashboard/API URLs as database connections', () => {
  for (const connection of ['', 'fixture-only', app, 'https://supabase.com/dashboard/project/testproject']) {
    assert.throws(() => stagingEnvironment({ ...fixture, STAGING_DATABASE_URL: connection }, approved));
  }
  assert.throws(() => stagingEnvironment({
    ...fixture, SUPABASE_URL: 'https://supabase.com/dashboard/project/appproject',
  }, approved), /not a dashboard URL/);
});

test('refuses the configured app project through either direct or pooled connections', () => {
  for (const connection of [
    'postgresql://postgres.appproject:fixture-only@aws-0-test.pooler.supabase.com:5432/postgres',
    'postgresql://postgres:fixture-only@db.appproject.supabase.co:5432/postgres',
  ]) {
    assert.throws(() => stagingEnvironment({ ...fixture, STAGING_DATABASE_URL: connection }, approved),
      /Refusing staging writes/);
  }
});

test('does not assume an arbitrary database is staging', () => {
  assert.throws(() => stagingEnvironment({
    ...fixture, STAGING_DATABASE_URL: 'postgresql://postgres:fixture-only@localhost:5432/postgres',
  }, approved), /Cannot establish/);
});

test('accepts a separate Supabase project and uses explicit SSL libpq fields', () => {
  const env = stagingEnvironment({
    ...fixture, PGHOSTADDR: 'old-host', PGSERVICE: 'old-service', PGSERVICEFILE: 'old-service-file',
  }, approved);
  assert.equal(env.PGHOST, 'aws-0-test.pooler.supabase.com');
  assert.equal(env.PGUSER, 'postgres.testproject');
  assert.equal(env.PGDATABASE, 'postgres');
  assert.equal(env.PGPORT, '5432');
  assert.equal(env.PGSSLMODE, 'require');
  assert.equal(env.PGHOSTADDR, undefined);
  assert.equal(env.PGSERVICE, undefined);
  assert.equal(env.PGSERVICEFILE, undefined);
});

test('rejects transaction pooling, missing passwords, placeholders and disabled SSL', () => {
  for (const connection of [
    staging.replace(':5432', ':6543'),
    staging.replace(':fixture-only', ''),
    staging.replace('fixture-only', '%5BYOUR-PASSWORD%5D'),
    `${staging}?sslmode=disable`,
  ]) {
    assert.throws(() => stagingEnvironment({ ...fixture, STAGING_DATABASE_URL: connection }, approved));
  }
});

test('accepts an independent direct Supabase connection and decodes the password', () => {
  const env = stagingEnvironment({
    ...fixture, STAGING_DATABASE_URL: 'postgresql://postgres:fixture%40only@db.testproject.supabase.co:5432/postgres',
  }, approved);
  assert.equal(env.PGHOST, 'db.testproject.supabase.co');
  assert.equal(env.PGUSER, 'postgres');
  assert.equal(env.PGPASSWORD, 'fixture@only');
});
