import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStreamDeletionTransport} from '../src/server/accountDeletionStream';
import {identityDeletionAdapter} from '../src/server/accountDeletionAdapters';

test('Stream requests prune only the named user/content and explicitly preserve conversation channels and files',async()=>{
  const sent:any[]=[];
  const transport=createStreamDeletionTransport(async(...args)=>{sent.push(args);return {task_id:'fixture-task'};});
  assert.deepEqual(await transport.startPruning('owner-A'),{operationId:'fixture-task'});
  assert.deepEqual(sent,[['/users/delete','POST',{
    user_ids:['owner-A'],user:'pruning',messages:'pruning',conversations:'keep',files:false,
  }]]);
  assert.equal(JSON.stringify(sent).includes('"hard"'),false);
});
test('Stream binds completion to saved task and owner and does not mistake pending, malformed or failed tasks for completion',async()=>{
  let response:any={task_id:'fixture-task',status:'running'},users:any={users:[]};
  const paths:string[]=[];
  const transport=createStreamDeletionTransport(async path=>{
    paths.push(path);return path.startsWith('/tasks/')?response:users;
  });
  assert.equal(await transport.check('fixture-task','owner-A'),'pending');
  assert.equal(paths.length,1);
  response={task_id:'wrong-task',status:'completed'};
  await assert.rejects(transport.check('fixture-task','owner-A'),/UNCONFIRMED/);
  response={task_id:'fixture-task',status:'completed'};
  users={users:[{id:'owner-A'}]};assert.equal(await transport.check('fixture-task','owner-A'),'failed');
  users={users:[]};assert.equal(await transport.check('fixture-task','owner-A'),'completed');
  const query=JSON.parse(decodeURIComponent(paths.at(-1)!.split('payload=')[1]));
  assert.deepEqual(query.filter_conditions,{id:{$eq:'owner-A'}});
  users={};await assert.rejects(transport.check('fixture-task','owner-A'),/UNCONFIRMED/);
  response={task_id:'fixture-task',status:'completed',error:{code:'fixture'}};
  assert.equal(await transport.check('fixture-task','owner-A'),'failed');
});

function identityFixture() {
  const target='11111111-1111-4111-8111-111111111111';
  const profile:any={id:'owner-A',status:'DEACTIVATED',erased_at:'2026-11-10T00:00:00Z',auth_user_id:target};
  const identities=new Set([target,'other-owner-identity']);
  const calls:string[]=[];
  const fixture={profile,identities,calls,clearFails:false,deleteIgnored:false,wrongMissing:false};
  const db:any={
    from(table:string) {
      assert.equal(table,'nanivio_users');
      let patch:any;const filters:any[]=[];
      const query:any={
        select(){return query;},eq(key:string,value:any){filters.push([key,value]);return query;},
        abortSignal(){return query;},update(value:any){patch=value;return query;},
        async maybeSingle(){
          assert.ok(filters.some(([key,value])=>key==='id'&&value==='owner-A'));
          if(patch){
            if(fixture.clearFails)return {data:null,error:{message:'fixture checkpoint unavailable'}};
            assert.ok(filters.some(([key,value])=>key==='auth_user_id'&&value===target));
            Object.assign(profile,patch);
          }
          return {data:{...profile},error:null};
        },
      };
      return query;
    },
    auth:{admin:{
      async getUserById(id:string) {
        calls.push('get:'+id);
        if(fixture.wrongMissing)return {data:{user:null},error:{status:404,code:'route_not_found'}};
        return identities.has(id)?{data:{user:{id}},error:null}
          :{data:{user:null},error:{status:404,code:'user_not_found'}};
      },
      async deleteUser(id:string,soft:boolean) {
        calls.push('delete:'+id);assert.equal(soft,false);
        if(!fixture.deleteIgnored)identities.delete(id);
        return {data:{user:{id}},error:null};
      },
    }},
  };
  return {...fixture,fixture,adapter:identityDeletionAdapter(db)};
}
test('identity removal targets immutable owner identity and verifies absence before clearing the mapping',async()=>{
  const {fixture,adapter}=identityFixture();
  assert.equal((await adapter.run({ownerId:'owner-A'} as any)).verified,true);
  assert.equal(fixture.profile.auth_user_id,null);
  assert.equal(fixture.identities.has('other-owner-identity'),true);
  assert.equal(fixture.calls.filter(call=>call.startsWith('delete:')).length,1);
  assert.equal((await adapter.run({ownerId:'owner-A'} as any)).verified,true);
  assert.equal(fixture.calls.filter(call=>call.startsWith('delete:')).length,1);
});
test('identity deletion acceptance, generic 404 and unfrozen profiles cannot be recorded as confirmed removal',async()=>{
  for(const mode of ['deleteIgnored','wrongMissing','active'] as const) {
    const {fixture,adapter}=identityFixture();
    if(mode==='active')fixture.profile.status='ACTIVE';
    else fixture[mode]=true;
    await assert.rejects(adapter.run({ownerId:'owner-A'} as any));
    assert.ok(fixture.profile.auth_user_id);
  }
});
test('a failed identity checkpoint can safely retry without deleting another identity or repeating the remote removal',async()=>{
  const {fixture,adapter}=identityFixture();fixture.clearFails=true;
  await assert.rejects(adapter.run({ownerId:'owner-A'} as any));
  assert.ok(fixture.profile.auth_user_id);
  fixture.clearFails=false;
  assert.equal((await adapter.run({ownerId:'owner-A'} as any)).verified,true);
  assert.equal(fixture.calls.filter(call=>call.startsWith('delete:')).length,1);
});
