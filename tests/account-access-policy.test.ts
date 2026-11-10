import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { accountMayUseRoute, assertAccountMaySignIn } from '../src/server/accountAccessPolicy';

test('only explicitly active profiles may start a password sign-in', () => {
  assert.doesNotThrow(() => assertAccountMaySignIn('ACTIVE'));
  for (const status of ['DEACTIVATED','SUSPENDED','DELETED','PENDING',null,undefined,'active']) {
    assert.throws(() => assertAccountMaySignIn(status), /not active/);
  }
});

test('inactive accounts cannot restore a normal app session or use feature/profile routes', () => {
  for (const accountStatus of ['DEACTIVATED','SUSPENDED','DELETED',undefined]) {
    for (const [method,path] of [
      ['GET','/api/auth/session'], ['POST','/api/auth/profile/update'],
      ['POST','/api/agora/token'], ['GET','/api/billing/summary'],
      ['POST','/api/translate'], ['GET','/api/contacts'],
      ['POST','/api/stream/channels'], ['POST','/api/malvi/session'],
    ]) assert.equal(accountMayUseRoute({accountStatus},method,path),false,`${accountStatus}: ${path}`);
  }
  assert.equal(accountMayUseRoute(null,'GET','/api/contacts'),false);
  assert.equal(accountMayUseRoute({accountStatus:'ACTIVE'},'GET','/api/contacts'),true);
});

test('authenticated inactive users retain only narrow self-service privacy actions', () => {
  for (const accountStatus of ['DEACTIVATED','SUSPENDED']) {
    for (const method of ['GET','DELETE']) {
      assert.equal(accountMayUseRoute({accountStatus},method,'/api/langpretation/voice-profile'),true);
    }
    assert.equal(accountMayUseRoute({accountStatus},'GET','/api/account-deletion/request'),true);
    for (const method of ['POST','PATCH','PUT']) {
      assert.equal(accountMayUseRoute({accountStatus},method,'/api/langpretation/voice-profile'),false);
    }
    assert.equal(accountMayUseRoute({accountStatus},'GET','/api/langpretation/voice-profile/other-owner'),false);
    assert.equal(accountMayUseRoute({accountStatus},'DELETE','/api/account-deletion/request'),false);
  }
  assert.equal(accountMayUseRoute({accountStatus:'DELETED'},'DELETE','/api/langpretation/voice-profile'),false);
});

test('the actual HTTP identity resolver applies policy to persistent and development users', async () => {
  const source=await readFile('server.ts','utf8');
  const start=source.indexOf('async function getAuthUser(');
  const end=source.indexOf('\nasync function requireAdmin(',start);
  const {code}=await transform(source.slice(start,end),{loader:'ts',target:'es2022',format:'cjs'});
  const make = (user: any, persistent: boolean) => new Function(
    'persistentAuth','authDb','accountMayUseRoute','process',
    `${code}; return request => getAuthUser({
      ...request, headers: { authorization: 'Bearer fixture-token' }, query: {},
    });`,
  )(
    {adminFromToken:()=>null,persistentAuthConfigured:async()=>persistent,userFromToken:async()=>user},
    {validateSession:()=>user},accountMayUseRoute,{env:{}},
  );
  for (const persistent of [true,false]) {
    const blocked=make({id:'fixture-user',accountStatus:'DEACTIVATED'},persistent);
    assert.equal(await blocked({method:'GET',path:'/api/auth/session'}),null);
    assert.equal((await blocked({method:'DELETE',path:'/api/langpretation/voice-profile'})).id,'fixture-user');
    const active=make({id:'fixture-user',accountStatus:'ACTIVE'},persistent);
    assert.equal((await active({method:'GET',path:'/api/billing/summary'})).id,'fixture-user');
  }
});

test('password sign-in rejects inactive records before issuing a provider session', async () => {
  const source=await readFile('src/server/persistentAuth.ts','utf8');
  const start=source.indexOf('export async function signIn(');
  const end=source.indexOf('\nexport async function userFromToken(',start);
  const {code}=await transform(source.slice(start,end).replace('export async','async'),{loader:'ts',target:'es2022',format:'cjs'});
  let issued=0;
  const load=(status: string)=>new Function('serverDb','assertAccountMaySignIn','issueSession','rowToUser',
    `${code}; return signIn;`)(
    ()=>({from:()=>({select:()=>({limit:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'fixture-user',status,email:'fixture@example.test'},error:null})})})})})}),
    assertAccountMaySignIn,async()=>{issued++;return {user:{id:'fixture-user'}};},(row: any)=>row,
  );
  for (const status of ['DEACTIVATED','SUSPENDED','DELETED']) {
    await assert.rejects(load(status)('fixture@example.test','fixture-only-password'),/not active/);
  }
  assert.equal(issued,0);
  await load('ACTIVE')('fixture@example.test','fixture-only-password');
  assert.equal(issued,1);
});

test('missing persisted status is never normalized into active authority', async () => {
  const source=await readFile('src/server/persistentAuth.ts','utf8');
  const start=source.indexOf('function rowToUser(');
  const end=source.indexOf('\nasync function profileByAuthId(',start);
  const {code}=await transform(source.slice(start,end),{loader:'ts',target:'es2022',format:'cjs'});
  const map=new Function(`${code}; return rowToUser;`)();
  for (const status of [null,undefined,'']) {
    assert.equal(map({id:'fixture',status}).accountStatus,'DEACTIVATED');
  }
  assert.equal(map({id:'fixture',status:'ACTIVE'}).accountStatus,'ACTIVE');
});

test('session issuance refuses a database outage or a concurrent deactivation', async () => {
  const source=await readFile('src/server/persistentAuth.ts','utf8');
  const start=source.indexOf('async function issueSession(');
  const end=source.indexOf('\ntype SocialSignup',start);
  const {code}=await transform(source.slice(start,end),{loader:'ts',target:'es2022',format:'cjs'});
  for (const result of [{data:null,error:null},{data:null,error:{message:'private DB detail'}},{data:{id:'fixture'},error:null}]) {
    const filters: any[]=[];
    const query:any={
      update:()=>query,eq:(key: string,value: string)=>{filters.push([key,value]);return query;},
      select:()=>query,maybeSingle:async()=>result,
    };
    const issue=new Function('serverDb','publicDb','passwordEpoch','tokenIssuedAtMs',`${code}; return issueSession;`)(
      ()=>({from:()=>query}),
      ()=>({auth:{signInWithPassword:async()=>({data:{session:{access_token:'fixture-token',expires_in:3600}},error:null})}}),
      async()=>0,()=>1000,
    );
    const attempt=issue('fixture@example.test','fixture-only-password',{id:'fixture'});
    if (result.data) assert.equal((await attempt).token,'fixture-token');
    else await assert.rejects(attempt,/active account could not be confirmed/);
    assert.deepEqual(filters,[['id','fixture'],['status','ACTIVE']]);
  }
});
