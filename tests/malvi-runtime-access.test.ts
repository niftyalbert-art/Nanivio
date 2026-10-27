import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { requireBillingAdmin } from '../src/server/billingAccess.ts';
import { createMalviRuntimeRouter } from '../src/server/malviRuntimeLimits.ts';
import { registerAssistantRoutes } from '../src/server/assistant/routes.ts';

test('runtime safety settings reject anonymous, customer and non-finance writes before storage', async () => {
  const app=express();app.use(express.json());
  app.use('/api/admin/billing',(req:any,_res,next)=>{
    const role=req.header('x-fixture-role');
    if(role)req.authUser={id:'fixture-finance',role:role==='USER'?'USER':'ADMIN',accountStatus:'ACTIVE',adminSubRole:role};
    next();
  },requireBillingAdmin);
  app.use('/api/admin/billing/malvi-runtime',createMalviRuntimeRouter());
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const payload={expectedVersion:0,reason:'Reviewed actual quotas',live_minutes_monthly:1,research_monthly:1,analyses_monthly:1,upload_mib_monthly:1};
    for(const role of ['','USER','SUPPORT_ADMIN','BILLING_ADMIN']) {
      const response=await fetch(origin+'/api/admin/billing/malvi-runtime/save',{
        method:'POST',headers:{'content-type':'application/json',...(role?{'x-fixture-role':role}:{})},body:JSON.stringify(payload),
      });
      assert.equal(response.status,role?403:401);
    }
    for(const role of ['SUPER_ADMIN','FINANCE_ADMIN']) {
      const response=await fetch(origin+'/api/admin/billing/malvi-runtime/save',{
        method:'POST',headers:{'content-type':'application/json','x-fixture-role':role},
        body:JSON.stringify({...payload,updated_by:'spoofed-client-identity'}),
      });
      assert.equal(response.status,400,'audit actor is server-owned; invalid input never reaches storage');
    }
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});

test('new customer voice and read-only clock endpoints require application authentication', async () => {
  const app=express();app.use(express.json());
  registerAssistantRoutes(app,(_req,res)=>{res.status(401).json({success:false,error:'Sign in'});},()=>true,false);
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  try {
    for(const [method,path] of [['POST','/voice'],['GET','/session/00000000-0000-0000-0000-000000000000/clock']]) {
      const response=await fetch(origin+'/api/assistant'+path,{method});
      assert.equal(response.status,401);
    }
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});
