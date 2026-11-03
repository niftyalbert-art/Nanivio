import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { User } from '@supabase/supabase-js';
import { assertSocialIdentity, registerSocialAuthRoutes, completeSocial } from '../src/server/socialAuth';

const identity = {
  id:'provider-user', email:'person@example.test', email_confirmed_at:new Date().toISOString(),
  identities:[{provider:'google'}],
} as User;
test('social login requires an authoritative verified email and the requested linked provider', () => {
  assert.equal(assertSocialIdentity(identity,'google').id,'provider-user');
  assert.throws(()=>assertSocialIdentity(identity,'apple'),/temporarily unavailable/);
  assert.throws(()=>assertSocialIdentity({...identity,identities:[{provider:'apple'}] as User['identities']},'apple'),/temporarily unavailable/);
  assert.throws(()=>assertSocialIdentity({...identity,email_confirmed_at:undefined},'google'));
  assert.throws(()=>assertSocialIdentity({...identity,email:undefined},'google'));
  assert.throws(()=>assertSocialIdentity(identity,'github'));
  assert.throws(()=>assertSocialIdentity(null,'google'));
});
test('social completion does not invent a profile or activate inactive subscribers', async () => {
  let checked='';
  const deps={
    verify:async(token:string,provider:string)=>{checked=token;return assertSocialIdentity(identity,provider);},
    profile:async(_token:string):Promise<any>=>null,
  };
  assert.deepEqual(await completeSocial('checked-token','google',deps),
    {needsRegistration:true,email:'person@example.test'});
  assert.equal(checked,'checked-token');
  for(const status of ['SUSPENDED','DEACTIVATED','PENDING']){
    deps.profile=async()=>({id:'provider-user',accountStatus:status});
    await assert.rejects(completeSocial('checked-token','google',deps),/not active/);
  }
  deps.profile=async()=>({id:'provider-user',accountStatus:'ACTIVE'});
  assert.equal((await completeSocial('checked-token','google',deps)).needsRegistration,false);
  await assert.rejects(completeSocial('checked-token','apple',deps),/temporarily unavailable/);
});
test('social endpoints validate input, preserve onboarding and hide upstream failures', async () => {
  let completeCalls=0;
  const app=express(); app.use(express.json());
  registerSocialAuthRoutes(app,{
    config:async()=>({url:'https://example.test',publicKey:'public-browser-key',google:false,apple:false}),
    complete:async(token,provider)=>{
      completeCalls++;
      if(token==='invalid') throw new Error('private upstream detail');
      assert.equal(provider,'google');
      return {needsRegistration:true,email:'person@example.test'};
    },
  });
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  const post=(body:any)=>fetch(`${origin}/api/auth/social/complete`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
  });
  try{
    const config=await fetch(`${origin}/api/auth/social/config`);
    assert.equal(config.headers.get('cache-control'),'no-store');
    assert.equal((await config.json()).google,false);
    assert.equal((await post({provider:'github',accessToken:'token'})).status,400);
    assert.equal((await post({provider:'google'})).status,400);
    const apple=await post({provider:'apple',accessToken:'valid'});
    assert.equal(apple.status,403);
    assert.match((await apple.json()).error,/temporarily unavailable/);
    assert.equal(completeCalls,0);
    const failed=await post({provider:'google',accessToken:'invalid'});
    assert.equal(failed.status,401);
    assert.ok(!(await failed.text()).includes('private upstream'));
    const onboarding=await post({provider:'google',accessToken:'valid'});
    assert.equal(onboarding.status,200);
    assert.deepEqual(await onboarding.json(),{needsRegistration:true,email:'person@example.test'});
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
