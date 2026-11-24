import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { readConversationMemory, appendConversationMemory } from '../src/server/assistant/conversationMemory.ts';
import { MALVI_CAPABILITIES, subscriptionHasCapability } from '../src/lib/malviCapabilities.ts';
import { registerAssistantRoutes } from '../src/server/assistant/routes.ts';

const migration = () => fs.readFile('migrations/034_malvi_automatic_memory.sql', 'utf8');
async function database() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE nanivio_users(id TEXT PRIMARY KEY, name TEXT);
    INSERT INTO nanivio_users VALUES('a','Same name'),('b','Same name'),('c','New account');`);
  return db;
}
function repository(db: PGlite) {
  return {
    rpc(name: string, args: any) {
      const query = async () => {
        const params = name === 'nanivio_initialize_malvi_memory' ? [args.p_user]
          : [args.p_user, args.p_generation, JSON.stringify(args.p_events)];
        const sql = name === 'nanivio_initialize_malvi_memory'
          ? 'SELECT nanivio_initialize_malvi_memory($1) AS result'
          : 'SELECT nanivio_append_malvi_memory($1,$2,$3::jsonb) AS result';
        const result = await db.query<{ result: unknown }>(sql, params);
        return { data: result.rows[0].result, error: null };
      };
      return { then: (resolve: any, reject: any) => query().then(resolve, reject), abortSignal: query };
    },
    from(table: string) {
      let owner = '';
      const read = async () => {
        assert.ok(['nanivio_malvi_memory_preferences', 'nanivio_malvi_messages'].includes(table));
        const ordering = table === 'nanivio_malvi_messages' ? ' ORDER BY created_at DESC,role ASC' : '';
        const result = await db.query(`SELECT * FROM ${table} WHERE user_id=$1${ordering}`, [owner]);
        return { data: result.rows, error: null };
      };
      const chain: any = {
        select: () => chain, eq: (key: string, value: string) => {
          assert.equal(key, 'user_id'); owner = value; return chain;
        },
        abortSignal: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: async () => { const result = await read(); return { ...result, data: result.data[0] || null }; },
        then: (resolve: any, reject: any) => read().then(resolve, reject),
      };
      return chain;
    },
  } as any;
}

test('fresh setup automatically remembers returning accounts without sharing same-name histories', async () => {
  const db = await database();
  try {
    const installed = await db.exec(await migration());
    assert.equal((installed.at(-1)?.rows?.[0] as any).malvi_automatic_memory_installed, true);
    const api = repository(db);
    const first = await readConversationMemory('a', '', api);
    assert.equal(first.enabled, true); assert.equal(first.generation, 0); assert.equal(first.hasPrevious, false);
    await appendConversationMemory('a', first.generation, [
      { key: 'turn:user', role: 'user', text: 'My bicycle is blue.' },
      { key: 'turn:assistant', role: 'assistant', text: 'We discussed your blue bicycle.' },
    ], api);
    const returning = await readConversationMemory('a', '', api);
    assert.equal(returning.hasPrevious, true);
    assert.deepEqual(returning.messages.map(message => message.role), ['user', 'assistant']);
    assert.ok(returning.messages.some(message => message.text === 'My bicycle is blue.'));
    const other = await readConversationMemory('b', '', api);
    assert.equal(other.enabled, true); assert.deepEqual(other.messages, []); assert.equal(other.hasPrevious, false);
    assert.equal((await db.query<{ allowed: boolean }>("SELECT has_function_privilege('authenticated','nanivio_initialize_malvi_memory(text)','EXECUTE') AS allowed")).rows[0].allowed, false);
  } finally { await db.close(); }
});

test('upgrades preserve existing opt-outs, history, deletion tombstones and generation protection', async () => {
  const db = await database();
  try {
    await db.exec(await fs.readFile('migrations/011_malvi_conversation_memory.sql', 'utf8'));
    await db.query("SELECT nanivio_set_malvi_memory('a',true)");
    await db.query("SELECT nanivio_set_malvi_memory('b',false)");
    await db.query("SELECT nanivio_append_malvi_memory('a',1,$1::jsonb)", [JSON.stringify([{ key: 'old', role: 'user', text: 'Keep my existing history' }])]);
    await db.exec(await migration());
    await db.exec(await migration());
    const api = repository(db);
    assert.equal((await readConversationMemory('b', '', api)).enabled, false);
    assert.equal((await readConversationMemory('a', '', api)).messages.length, 1);
    assert.equal((await readConversationMemory('c', '', api)).enabled, true);
    await db.query("SELECT nanivio_set_malvi_memory('a',false)");
    await assert.rejects(appendConversationMemory('a', 1, [{ key: 'late', role: 'user', text: 'Must not save' }], api), { code: 'MEMORY_CHANGED' });
    assert.equal((await readConversationMemory('a', '', api)).enabled, false);
    await db.query("SELECT nanivio_set_malvi_memory('a',true)");
    await assert.rejects(appendConversationMemory('a', 1, [{ key: 'late-again', role: 'user', text: 'Still stale' }], api), { code: 'MEMORY_CHANGED' });
    await db.query("SELECT nanivio_set_malvi_memory('a',false,true)");
    const init = await db.query<{ state: { enabled: boolean } }>("SELECT nanivio_initialize_malvi_memory('a') AS state");
    assert.equal(init.rows[0].state.enabled, false);
    assert.equal((await db.query("SELECT * FROM nanivio_malvi_messages WHERE user_id='a'")).rows.length, 0);
    assert.equal((await readConversationMemory('c', '', api)).enabled, true);
  } finally { await db.close(); }
});

test('an opt-out racing first-use initialization is respected', async () => {
  const calls: any[] = [];
  const missing: any = { select() { return this; }, eq() { return this; }, abortSignal() { return this; },
    async maybeSingle() { return { data: null, error: null }; } };
  const db = {
    from(table: string) { calls.push(table); return missing; },
    rpc(name: string, args: unknown) {
      calls.push([name, args]);
      return { abortSignal: async () => ({ data: { enabled: false, generation: 2 }, error: null }) };
    },
  };
  const result = await readConversationMemory('signed-in-owner', '', db as any);
  assert.equal(result.enabled, false); assert.equal(result.generation, 2);
  assert.deepEqual(calls, ['nanivio_malvi_memory_preferences', ['nanivio_initialize_malvi_memory', { p_user: 'signed-in-owner' }]]);
});

test('missing schema is reported honestly without exposing raw database errors', async () => {
  const logged: unknown[][] = [], original = console.warn;
  console.warn = (...args) => { logged.push(args); };
  try {
    const chain: any = { select() { return this; }, eq() { return this; }, abortSignal() { return this; },
      maybeSingle: async () => ({ data: null, error: { code: 'PGRST205', message: 'PRIVATE DATABASE DETAILS' } }) };
    await assert.rejects(readConversationMemory('owner', '', { from: () => chain } as any), error =>
      (error as any).code === 'MEMORY_SETUP_REQUIRED' && !String(error).includes('PRIVATE'));
    assert.ok(!JSON.stringify(logged).includes('PRIVATE'));
    assert.ok(!JSON.stringify(logged).includes('owner'));
  } finally { console.warn = original; }
});

test('memory is additive for trials and all paid tiers, including purchased snapshots', () => {
  for (const tier of Object.keys(MALVI_CAPABILITIES)) {
    assert.ok(MALVI_CAPABILITIES[tier as keyof typeof MALVI_CAPABILITIES].includes('memory'));
    for (const status of ['TRIAL', 'ACTIVE']) {
      const subscription = { tier, status, purchasedCapabilities: [] };
      assert.equal(subscriptionHasCapability(subscription, 'memory'), true);
      assert.equal(subscriptionHasCapability(subscription, 'research'), false);
      assert.equal(subscriptionHasCapability({ ...subscription, status: 'EXPIRED' }, 'memory'), false);
    }
  }
  assert.equal(subscriptionHasCapability({ tier: 'unknown', status: 'ACTIVE', purchasedCapabilities: [] }, 'memory'), false);
});

test('stale browser account headers cannot read, enable or delete the newly signed-in account memory', async () => {
  const app = express(); app.use(express.json());
  registerAssistantRoutes(app, (req, _res, next) => { (req as any).authUser = { id: 'b' }; next(); }, () => true, false);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/assistant/memory`, {
        method, headers: { 'X-Nanivio-Memory-Owner': 'a', 'content-type': 'application/json' },
        ...(method === 'PUT' ? { body: '{"enabled":true}' } : {}),
      });
      assert.equal(response.status, 409);
      assert.equal((await response.json() as any).code, 'ACCOUNT_CHANGED');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
