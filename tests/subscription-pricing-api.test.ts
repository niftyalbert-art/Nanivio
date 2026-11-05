import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createBalancedPricingRouter, balancedPricingProposal } from '../src/server/subscriptionPricing.ts';

test('pricing review is administrator-only, immutable and not a purchase or publication API',async()=>{
  const app=express();
  // Fixture-only verified principal. The real app has authentication AND the
  // billing-admin guard before this route; no header-to-admin mapping ships.
  app.use((req,res,next)=>{
    const role=req.get('x-fixture-role');
    if(role)(req as any).billingAdmin={adminRole:role,adminUser:'fixture-admin'};
    next();
  });
  app.use('/proposal',createBalancedPricingRouter());
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as any).port}/proposal`;
  try {
    for (const role of [null,'USER','SUPPORT_ADMIN','CONTENT_ADMIN']) {
      const response=await fetch(base,{headers:role?{'x-fixture-role':role}:{}});
      assert.equal(response.status,403);
    }
    for(const role of ['FINANCE_ADMIN','SUPER_ADMIN']){
      const response=await fetch(base,{headers:{'x-fixture-role':role}});
      assert.equal(response.status,200);
      assert.equal(response.headers.get('cache-control'),'no-store');
      const data=await response.json();
      assert.equal(data.status,'DRAFT');
      assert.equal(data.purchasable,false);
      assert.equal(data.publishBlocked,true);
      assert.equal(data.plans.length,7);
      assert.equal(data.packs.length,10);
      assert.equal(data.blockers.length,8);
      assert.equal(data.plans.find((p:any)=>p.tier==='malvi_basic').monthlyCents,999);
    }
    for(const method of ['POST','PUT','DELETE']){
      assert.equal((await fetch(base,{method,headers:{'x-fixture-role':'SUPER_ADMIN'}})).status,404);
    }
    const changed=balancedPricingProposal();
    changed.plans[0].limits.voiceSeconds=0;
    assert.equal(balancedPricingProposal().plans[0].limits.voiceSeconds,4800);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});
