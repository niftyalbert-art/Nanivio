// Isolated synthetic PostgreSQL only. Never reads connection strings or live data.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('aggregate incident assessment covers nested keys and deduplicates without exposing values', () => {
  const root = mkdtempSync(join(tmpdir(), 'application-incident-test-'));
  const data = join(root, 'db');
  const env = { ...process.env, PGHOST: root, PGPORT: '55439', PGDATABASE: 'postgres', PGUSER: process.env.USER };
  for (const key of ['PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS']) delete env[key];
  let started = false;
  function run(command, args, input) {
    const result = spawnSync(command, args, { env, input, encoding: 'utf8' });
    assert.equal(result.status, 0, `${command} failed: ${result.error?.message || result.stderr}`);
    return result.stdout.trim();
  }
  const sql = input => run('psql', ['-X', '-qAt', '--no-password', '-v', 'ON_ERROR_STOP=1'], input);
  const assessment = readFileSync(new URL('../scripts/incident-application-cohort.sql', import.meta.url), 'utf8');
  try {
    run('initdb', ['-D', data, '--auth=trust', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-F -k ${root} -h '' -p 55439`, '-w', 'start']);
    started = true;
    sql(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid);
      CREATE TABLE public.nanivio_users (id text PRIMARY KEY, auth_user_id uuid);
      CREATE TABLE public.nanivio_user_applications (
        id uuid PRIMARY KEY, user_id text, application_type text, payload jsonb,
        created_at timestamptz DEFAULT '2026-01-01Z', updated_at timestamptz DEFAULT '2026-01-01Z'
      );
      INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001');
      INSERT INTO auth.sessions VALUES
        ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001');
      INSERT INTO public.nanivio_users VALUES
        ('mapped', '00000000-0000-0000-0000-000000000001'), ('unmapped', NULL);
      INSERT INTO public.nanivio_user_applications (id, user_id, application_type, payload) VALUES
        ('00000000-0000-0000-0000-000000000011', 'mapped', 'EXPERT',
          '{"personal":{"Pass_Word":"synthetic-marker"},"safe":"kept"}'),
        ('00000000-0000-0000-0000-000000000012', 'mapped', 'EXPERT',
          '{"nested":[{"confirm-password":"synthetic-marker"}]}'),
        ('00000000-0000-0000-0000-000000000013', 'unmapped', 'DRIVER',
          '{"nested":[[{"password":false}]]}'),
        ('00000000-0000-0000-0000-000000000014', 'unmapped', 'BUSINESS',
          '{"password":null,"nested":{"password":""}}'),
        ('00000000-0000-0000-0000-000000000015', 'unmapped', 'BUSINESS',
          '{"credentials":{"nested":"synthetic-marker"}}'),
        ('00000000-0000-0000-0000-000000000016', 'mapped', 'DRIVER', '[null,1,"safe"]');
    `);
    const before = sql(assessment).split('\n');
    assert.equal(before.length, 5, 'Only four cohort aggregates and one installation row');
    assert.deepEqual(before[0].split('|').slice(0, 11),
      ['ALL', '6', '2', '4', '3', '2', '5', '2', '1', '1', '1']);
    assert.equal(before.at(-1), 'f|f');
    assert.doesNotMatch(before.join('\n'), /synthetic-marker|mapped|00000000/);
    sql(readFileSync(new URL('../migrations/008_application_credentials_privacy.sql', import.meta.url), 'utf8'));
    const after = sql(assessment).split('\n');
    assert.deepEqual(after[0].split('|').slice(0, 11),
      ['ALL', '6', '2', '0', '0', '0', '0', '0', '0', '0', '0']);
    assert.equal(after.at(-1), 't|t');
    assert.equal(sql(`SELECT payload->>'safe' FROM public.nanivio_user_applications
      WHERE id='00000000-0000-0000-0000-000000000011'`), 'kept');
    sql(`INSERT INTO public.nanivio_user_applications (id,user_id,application_type,payload)
      VALUES ('00000000-0000-0000-0000-000000000017','mapped','EXPERT',
        '{"nested":[{"password":"synthetic-marker"}]}')`);
    assert.equal(sql(assessment).split('\n')[0].split('|')[6], '0', 'Guard sanitizes new writes');
    assert.match(assessment, /BEGIN READ ONLY;/);
    assert.match(assessment, /statement_timeout = '15s'/);
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
