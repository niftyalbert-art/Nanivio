import test from 'node:test';
import assert from 'node:assert/strict';
import { issueBusinessMedia } from '../src/server/assistant/businessMedia.ts';
import type { BusinessRoom } from '../src/types/malviBusiness.ts';

function fixture() {
  let active: any = null, tokenFails = false;
  const reservations: string[] = [], refunds: string[] = [];
  const query: any = {
    select(){return this;},eq(_field:string,owner:string){assert.equal(owner,'owner');return this;},
    like(_field:string,prefix:string){assert.match(prefix,/^biz:room:/);return this;},
    is(){return this;},gt(){return this;},order(){return this;},limit(){return this;},abortSignal(){return this;},
    async maybeSingle(){return {data:active,error:null};},
  };
  const services: any = {
    ready:()=>true,database:()=>({from:()=>query}),
    usage:{
      async reserve(owner:string,id:string){reservations.push(owner);active={lease_id:id,ends_at:new Date(Date.now()+60000).toISOString()};return 60;},
      async finish(id:string){refunds.push(id);},
    },
    token:(input:any)=>{if(tokenFails)throw Error('token failed');return {agoraUid:input.uid,token:'fixture'};},
  };
  const room={id:'room',ownerId:'owner',members:[{id:'owner'},{id:'guest'}]} as BusinessRoom;
  return {services,room,reservations,refunds,failToken:()=>{tokenFails=true;}};
}
test('host and participants share one verified owner reservation; viewer token failure cannot refund it',async()=>{
  const f=fixture();
  const host=await issueBusinessMedia('owner',f.room,undefined,f.services);
  const guest=await issueBusinessMedia('guest',f.room,undefined,f.services);
  assert.equal(host.leaseId,guest.leaseId);
  assert.deepEqual(f.reservations,['owner']);
  assert.equal(guest.uid,'guest');
  f.failToken();
  await assert.rejects(issueBusinessMedia('guest',f.room,undefined,f.services),/token failed/);
  assert.deepEqual(f.refunds,[]);
});
test('a member cannot start another paid reservation before the host; a failed new host token is released',async()=>{
  const f=fixture();
  await assert.rejects(issueBusinessMedia('guest',f.room,undefined,f.services),/owner to start/);
  assert.deepEqual(f.reservations,[]);
  f.failToken();
  await assert.rejects(issueBusinessMedia('owner',f.room,undefined,f.services),/token failed/);
  assert.equal(f.refunds.length,1);
});
