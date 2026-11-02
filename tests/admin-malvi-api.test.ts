import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerAdminMalviMinutes, validateMalviAdjustment } from '../src/server/adminMalviMinutes.ts';

const operation={userId:'fixture-user',direction:'CREDIT',mode:'voice',minutes:10,billingCycle:'MONTHLY',
  reason:'Support credit approved',requestId:'00000000-0000-4000-8000-000000000111'};
test('admin minute input rejects negative, fractional, missing-cycle and unaudited adjustments',()=>{
  assert.equal(validateMalviAdjustment(operation).minutes,10);
  for(const change of [{minutes:-1},{minutes:0},{minutes:1.5},{minutes:525601},{billingCycle:'WEEKLY'},
    {reason:'short'},{requestId:'bad'},{direction:'REFILL'},{mode:'all'},{userId:''}]){
    assert.throws(()=>validateMalviAdjustment({...operation,...change}));
  }
});
test('admin endpoints require the guard, use authenticated actor and never claim success after uncertain RPC delivery',async()=>{
  const app=express();app.use(express.json());
  const calls: any[]=[];
  let failure:any=null;
  const database=()=>({rpc:(name:string,args:any)=>({abortSignal:async()=>{
    calls.push({name,args});
    if(failure) throw Error('fixture connection interrupted');
    return {data:{userId:args.p_user,direction:args.p_direction,mode:args.p_mode,minutes:args.p_minutes,creditBalance:10},error:null};
  }})});
  registerAdminMalviMinutes(app,(req,res,next)=>{
    if(req.headers['x-fixture-role']!=='ADMIN')return void res.status(403).json({error:'Administrator required'});
    next();
  },()=> 'authenticated-admin',database as any);
  const server=await new Promise<any>(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(body:any,admin=true)=>fetch(`${base}/api/admin/malvi/adjustments`,{
    method:'POST',headers:{'Content-Type':'application/json',...(admin?{'x-fixture-role':'ADMIN'}:{})},body:JSON.stringify(body),
  });
  try{
    assert.equal((await post(operation,false)).status,403);
    assert.equal((await post({...operation,minutes:-10})).status,400);
    assert.equal(calls.length,0);
    const success=await post({...operation,p_admin:'forged-admin',adminId:'forged-admin'});
    assert.equal(success.status,200);
    assert.equal((await success.json()).success,true);
    assert.equal(calls[0].args.p_admin,'authenticated-admin');
    assert.equal(calls[0].args.p_user,'fixture-user');
    failure=true;
    const pending=await post(operation);
    const result=await pending.json();
    assert.equal(pending.status,503);
    assert.equal(result.success,false);
    assert.match(result.error,/retry the same request/);
    assert.doesNotMatch(result.error,/no adjustment was made/i);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
