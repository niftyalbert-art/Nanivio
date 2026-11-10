import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { build, transform } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { registerPasswordRecoveryRoutes } from '../src/server/passwordRecoveryRoutes';
import { createRecoveryProvider } from '../src/server/passwordRecoveryProvider';
import { AccountAccessAuthority } from '../src/server/accountAccessAuthority';
import { tokenIssuedAtMs } from '../src/server/passwordRecoveryStore';

const previousSecret = process.env.SESSION_SECRET;
process.env.SESSION_SECRET = 'isolated-recovery-cookie-fixture-only';
after(() => { if (previousSecret) process.env.SESSION_SECRET = previousSecret; else delete process.env.SESSION_SECRET; });

async function fixture(t: any) {
  const app = express(); app.use(express.json());
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const caps = new Map<string, any>(), calls: string[] = [];
  let active = true, limited = false, failure = '', wrongOwner = false;
  const store = {
    async ready() {},
    async reserve(id: string, owner: string | null, _ip: string, expires: number) {
      if (limited) return false;
      caps.set(id, { owner, purpose: 'pkce', expires }); return true;
    },
    async resetCapability(id: string, owner: string, expires: number) { caps.set(id, { owner, expires, purpose: 'reset' }); },
    async consume(id: string, purpose: string) {
      const row = caps.get(id);
      if (!row || row.used || row.expires <= Date.now() || row.purpose !== purpose) return null;
      row.used = true;
      if (purpose === 'reset') calls.push('durable-epoch');
      return row.owner;
    },
    async valid(id: string) { const row = caps.get(id); return !!row && !row.used && row.expires > Date.now(); },
    async owner(authId: string) { return active && authId === 'fixture-auth' ? 'fixture-owner' : null; },
  };
  registerPasswordRecoveryRoutes(app, {
    origin, store, find: async identifier => identifier === 'fixture@example.test'
      ? { id: 'fixture-owner', email: identifier, accountStatus: active ? 'ACTIVE' : 'DEACTIVATED' } : null,
    provider: () => ({
      async send(_email, _challenge, redirect) { calls.push('send'); assert.equal(redirect, origin + '/reset-password'); if (failure === 'send') throw Error('private provider detail'); },
      async exchange(_code, verifier) { calls.push('exchange'); assert.ok(verifier.length >= 43); if (failure === 'exchange') throw Error('private detail'); return { authId: wrongOwner ? 'other-auth' : 'fixture-auth', token: 'fixture-provider-token', expiresIn: 3600 }; },
      async update(token, password, authId) { calls.push('update'); assert.equal(token, 'fixture-provider-token'); assert.equal(authId, 'fixture-auth'); assert.ok(password.length >= 8); if (failure === 'update') throw Error('uncertain provider update'); },
      async revoke() { calls.push('revoke'); if (failure === 'revoke') throw Error('uncertain provider logout'); },
    }),
  });
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const jar = new Map<string, string>();
  async function call(path: string, body?: object, options: { origin?: string; cookie?: string } = {}) {
    const response = await fetch(origin + path, {
      method: body ? 'POST' : 'GET',
      headers: { Origin: options.origin || origin, 'Content-Type': 'application/json',
        Cookie: options.cookie ?? [...jar].map(([name,value]) => `${name}=${value}`).join('; ') },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(';')[0], split = pair.indexOf('=');
      if (pair.slice(split + 1)) jar.set(pair.slice(0,split), pair.slice(split + 1));
      else jar.delete(pair.slice(0,split));
    }
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  async function ready() {
    assert.equal((await call('/api/auth/recovery', { identifier: 'fixture@example.test' })).status, 200);
    assert.equal((await call('/api/auth/recovery/exchange', { code: 'fixture-email-code' })).status, 200);
  }
  return { call, ready, calls, caps, jar, setActive: (value: boolean) => { active = value; },
    setLimited: () => { limited = true; }, fail: (value: string) => { failure = value; }, mismatch: () => { wrongOwner = true; } };
}

test('known, unknown and inactive accounts get the same neutral recovery response without exposed identifiers', async t => {
  const f = await fixture(t);
  const known = await f.call('/api/auth/recovery', { identifier: 'fixture@example.test' });
  const unknown = await f.call('/api/auth/recovery', { identifier: 'unknown@example.test' });
  f.setActive(false);
  const inactive = await f.call('/api/auth/recovery', { identifier: 'fixture@example.test' });
  assert.deepEqual(known.data, unknown.data); assert.deepEqual(unknown.data, inactive.data);
  assert.deepEqual(f.calls, ['send']);
  assert.equal(JSON.stringify(known.data).includes('fixture'), false);
  assert.match(known.headers.getSetCookie()[0], /HttpOnly/);
  assert.match(known.headers.getSetCookie()[0], /SameSite=Lax/);
});
test('recovery inputs, cross-origin requests, rate limits and unsupported tokens fail before a password update', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('/api/auth/recovery', {})).status, 400);
  assert.equal((await f.call('/api/auth/recovery', { identifier: [] })).status, 400);
  assert.equal((await f.call('/api/auth/recovery', { identifier: 'fixture@example.test' }, { origin: 'https://attacker.test' })).status, 403);
  assert.equal((await f.call('/api/auth/reset-password', { newPassword: 'safe-fixture-value', accessToken: 'ordinary-login-token' })).status, 400);
  f.setLimited();
  assert.equal((await f.call('/api/auth/recovery', { identifier: 'fixture@example.test' })).status, 429);
  assert.deepEqual(f.calls, []);
});
test('only a matching PKCE exchange enables a reset; provider tokens never appear in JSON', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('/api/auth/recovery/session')).data.ready, false);
  assert.equal((await f.call('/api/auth/recovery/exchange', { code: 'any-code' })).status, 400);
  await f.ready();
  assert.equal((await f.call('/api/auth/recovery/session')).data.ready, true);
  const reset = await f.call('/api/auth/reset-password', { newPassword: 'fixture-new-password' });
  assert.equal(reset.status, 200);
  assert.deepEqual(f.calls, ['send','exchange','durable-epoch','update','revoke']);
  assert.equal(JSON.stringify(reset.data).includes('fixture-provider-token'), false);
  assert.equal((await f.call('/api/auth/recovery/session')).data.ready, false);
  assert.equal((await f.call('/api/auth/reset-password', { newPassword: 'fixture-new-password' })).status, 400);
});
test('captured reset-cookie replay and concurrent submissions cause exactly one password update', async t => {
  const f = await fixture(t); await f.ready();
  const cookie = [...f.jar].map(([k,v]) => `${k}=${v}`).join('; ');
  const results = await Promise.all([1,2].map(() => f.call('/api/auth/reset-password', { newPassword: 'fixture-new-password' }, { cookie })));
  assert.deepEqual(results.map(r => r.status).sort(), [200,400]);
  assert.equal(f.calls.filter(v => v === 'update').length, 1);
  assert.equal((await f.call('/api/auth/reset-password', { newPassword: 'fixture-new-password' }, { cookie })).status, 400);
});
test('wrong-owner and tampered cookies cannot become recovery authority', async t => {
  const f = await fixture(t);
  await f.call('/api/auth/recovery', { identifier: 'fixture@example.test' });
  const name = [...f.jar.keys()][0];
  const tampered = `${name}=invalid-cookie`;
  assert.equal((await f.call('/api/auth/recovery/exchange', { code: 'code' }, { cookie: tampered })).status, 400);
  f.mismatch();
  assert.equal((await f.call('/api/auth/recovery/exchange', { code: 'code' })).status, 400);
  assert.equal(f.calls.includes('update'), false);
});
test('weak passwords preserve the capability; expired or deactivated identities cannot reset', async t => {
  const f = await fixture(t); await f.ready();
  assert.equal((await f.call('/api/auth/reset-password', { newPassword: 'short' })).status, 400);
  assert.equal((await f.call('/api/auth/recovery/session')).data.ready, true);
  for (const row of f.caps.values()) if (row.purpose === 'reset') row.expires = 0;
  assert.equal((await f.call('/api/auth/reset-password', { newPassword: 'fixture-new-password' })).status, 400);
  await f.ready(); f.setActive(false);
  assert.equal((await f.call('/api/auth/reset-password', { newPassword: 'fixture-new-password' })).status, 400);
  assert.equal(f.calls.includes('update'), false);
});
for (const failure of ['update','revoke']) test(`${failure} uncertainty never reports success or reuses the capability`, async t => {
  const f = await fixture(t); await f.ready(); f.fail(failure);
  const cookie = [...f.jar].map(([k,v]) => `${k}=${v}`).join('; ');
  const result = await f.call('/api/auth/reset-password', { newPassword: 'fixture-new-password' });
  assert.equal(result.status, 503); assert.match(result.data.error, /may have changed/);
  assert.equal((await f.call('/api/auth/reset-password', { newPassword: 'fixture-new-password' }, { cookie })).status, 400);
  assert.equal(f.calls.filter(v => v === 'update').length, 1);
});
test('an email-provider rejection does not leak account existence or fall back to another sender', async t => {
  const f = await fixture(t); f.fail('send');
  const known = await f.call('/api/auth/recovery', { identifier: 'fixture@example.test' });
  const unknown = await f.call('/api/auth/recovery', { identifier: 'unknown@example.test' });
  assert.equal(known.status, 200); assert.deepEqual(known.data, unknown.data);
  assert.equal(f.calls.filter(v => v === 'send').length, 1);
});
test('shared password epochs invalidate existing browser/native socket authority but preserve newer sessions and other owners', async () => {
  let epoch = 0; const ended: string[] = [];
  const authority = new AccountAccessAuthority(async () => new Map([['A',epoch],['B',0]]));
  const old = authority.watch('A', () => ended.push('old'), 1000);
  const other = authority.watch('B', () => ended.push('other'), 1000);
  assert.equal(await old.allowed(), true); epoch = 2000;
  const fresh = authority.watch('A', () => ended.push('fresh'), 3000);
  await authority.refresh();
  assert.equal(await old.allowed(), false); assert.equal(await fresh.allowed(), true);
  assert.equal(await other.allowed(), true); assert.deepEqual(ended, ['old']);
  old.dispose(); fresh.dispose(); other.dispose();
  assert.equal(tokenIssuedAtMs('not-a-token'), 0);
  assert.equal(tokenIssuedAtMs(`header.${Buffer.from('{"iat":123}').toString('base64url')}.signature`), 123000);
});
test('HTTP authentication rejects old provider JWTs after a reset, allows newer sessions and fails closed on shared-store outages', async () => {
  const source = await readFile('src/server/persistentAuth.ts','utf8');
  const start = source.indexOf('export async function userFromToken(');
  const end = source.indexOf('\nexport async function updateProfile',start);
  const { code } = await transform(source.slice(start,end).replace(/^export /,''), {loader:'ts',format:'cjs'});
  const jwt = (iat:number) => `header.${Buffer.from(JSON.stringify({iat})).toString('base64url')}.fixture`;
  const profile = {id:'fixture-owner'};
  let cutoff = 2000, providerValid = true, unavailable = false;
  const load = new Function('publicDb','profileByAuthId','passwordEpoch','tokenIssuedAtMs',code+';return userFromToken;');
  const user = load(()=>({auth:{getUser:async()=>({data:{user:providerValid?{id:'fixture-auth'}:null},error:providerValid?null:{}})}}),
    async()=>profile,async()=>{if(unavailable)throw Error('fixture outage');return cutoff;},tokenIssuedAtMs);
  assert.equal(await user(jwt(1)),null);
  assert.equal(await user(jwt(2)),null);
  assert.deepEqual(await user(jwt(3)),profile);
  providerValid=false;assert.equal(await user(jwt(3)),null);
  providerValid=true;unavailable=true;await assert.rejects(user(jwt(3)),/outage/);
});
test('Supabase transport uses PKCE, user-scoped password update and explicit global provider logout without retries', async () => {
  const calls: any[] = [];
  const provider = createRecoveryProvider({ SUPABASE_URL: 'https://fixture.supabase.test', SUPABASE_ANON_KEY: 'fixture-public', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service' }, async (url,init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(String(url).includes('/token?')
      ? { user: { id: 'auth-fixture' }, access_token: 'fixture-token', expires_in: 3600 }
      : { id: 'auth-fixture' }), { status: 200 });
  });
  await provider.send('fixture@example.test','fixture-challenge','https://fixture.test/reset-password');
  await provider.exchange('fixture-code','fixture-verifier');
  await provider.update('fixture-token','fixture-password','auth-fixture');
  await provider.revoke('fixture-token');
  assert.equal(calls.length, 4);
  assert.equal(JSON.parse(calls[0].init.body).code_challenge_method, 's256');
  assert.equal(calls[2].init.method, 'PUT');
  assert.equal(calls[2].init.headers.apikey, 'fixture-public');
  assert.equal(calls[3].init.headers.apikey, 'fixture-service');
  assert.match(calls[3].url, /logout\?scope=global/);
  const broken = createRecoveryProvider({ SUPABASE_URL:'https://fixture.test',SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture' }, async () => new Response('private detail',{status:500}));
  await assert.rejects(broken.update('token','password','uid'), /not confirmed/);
});
test('frontend exchanges once, strips URL credentials and never persists usable recovery tokens', async () => {
  const bundle = await build({ entryPoints:['src/lib/passwordRecovery.ts'],bundle:true,platform:'node',format:'cjs',write:false });
  const module = { exports: {} as any }; const calls: any[] = [], history: string[] = [];
  new Function('module','exports','fetch','window',bundle.outputFiles[0].text)(module,module.exports,
    async (url: string,init: any) => { calls.push({url,init}); return {ok:true,json:async()=>({success:true,ready:true})}; },
    { location:{search:'?code=fixture-secret-code',hash:''},history:{replaceState:(_state:any,_title:string,url:string)=>history.push(url)} });
  const first = module.exports.initializePasswordRecovery(), second = module.exports.initializePasswordRecovery();
  assert.equal(first, second); assert.deepEqual(await first, {ready:true});
  assert.equal(calls.length, 1); assert.equal(calls[0].url, '/api/auth/recovery/exchange');
  assert.deepEqual(history, ['/reset-password']);
  const source = await readFile('src/lib/passwordRecovery.ts','utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  const app = await readFile('src/App.tsx','utf8');
  assert.ok(app.indexOf('<PasswordResetPage') < app.indexOf('<NanivioProvider>',app.indexOf('export default function App')));
});
test('legacy bearer fragments and provider error URLs are scrubbed and refused before any exchange', async () => {
  const bundle = await build({entryPoints:['src/lib/passwordRecovery.ts'],bundle:true,platform:'node',format:'cjs',write:false});
  for(const location of [{search:'',hash:'#access_token=fixture&type=recovery'},{search:'?error=expired',hash:''}]){
    const module={exports:{} as any};const scrubbed:string[]=[];
    new Function('module','exports','fetch','window',bundle.outputFiles[0].text)(module,module.exports,
      ()=>{throw Error('must not call provider');},{location,history:{replaceState:(_s:any,_t:string,url:string)=>scrubbed.push(url)}});
    await assert.rejects(module.exports.initializePasswordRecovery(),/invalid or expired/);
    assert.deepEqual(scrubbed,['/reset-password']);
  }
});
