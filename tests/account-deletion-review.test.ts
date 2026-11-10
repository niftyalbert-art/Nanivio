import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { deletionReviewFilter, readDeletionReview, registerAccountDeletionReview } from '../src/server/accountDeletionReview';

const uuid = (n: number) => `aaaaaaaa-aaaa-4aaa-aaaa-${String(n).padStart(12,'0')}`;
const at = '2026-11-10T00:00:00.000Z';

test('filters reject status arrays, malformed cursors and injected query expressions', () => {
  assert.deepEqual(deletionReviewFilter(undefined,undefined), {status:'pending_review',after:null});
  assert.deepEqual(deletionReviewFilter('all',undefined), {status:'all',after:null});
  for (const status of [[],{},'deleted','pending_review,or(status.eq.completed)']) {
    assert.throws(()=>deletionReviewFilter(status,undefined),/valid deletion-request status/);
  }
  for (const cursor of ['',[],{},'not a cursor','x'.repeat(301),
    Buffer.from(JSON.stringify({id:uuid(1),requestedAt:"2026-11-10T00:00:00Z),status.eq.completed"})).toString('base64url'),
    Buffer.from(JSON.stringify({id:'malicious,query',requestedAt:at})).toString('base64url')]) {
    assert.throws(()=>deletionReviewFilter('all',cursor),/cursor is invalid/);
  }
});

test('real Supabase query is bounded, ordered and drops unrelated private fields', async () => {
  const urls: URL[] = [];
  const db = createClient('https://fixture.invalid','fixture-only-key', {
    auth:{persistSession:false}, global:{fetch: async (url) => {
      urls.push(new URL(String(url)));
      return Response.json(Array.from({length:26},(_,i)=>({
        id:uuid(i+1),owner_id:`fixture-owner-${i+1}`,status:'pending_review',
        requested_at:at,updated_at:at,completed_at:null,
        email:'private@example.test',code_hash:'private-code',provider_secret:'never-return',
      })));
    }},
  });
  const first = await readDeletionReview(deletionReviewFilter(undefined,undefined),()=>db);
  assert.equal(first.items.length,25);
  assert.equal(first.items[0].ownerId,'fixture-owner-1');
  assert.equal(JSON.stringify(first).includes('private@example.test'),false);
  assert.equal(JSON.stringify(first).includes('private-code'),false);
  assert.equal(urls[0].searchParams.get('limit'),'26');
  assert.equal(urls[0].searchParams.get('status'),'eq.pending_review');
  assert.equal(urls[0].searchParams.get('order'),'requested_at.asc,id.asc');
  assert.equal(urls[0].searchParams.get('select'),'id,owner_id,status,requested_at,updated_at,completed_at');
  const nextFilter = deletionReviewFilter('all',first.nextCursor);
  assert.deepEqual(nextFilter.after,{id:uuid(25),requestedAt:at});
  await readDeletionReview(nextFilter,()=>db);
  assert.equal(urls[1].searchParams.has('status'),false);
  assert.equal(urls[1].searchParams.get('or'),
    `(requested_at.gt.${at},and(requested_at.eq.${at},id.gt.${uuid(25)}))`);
});

test('an empty queue has no next page and unavailable storage fails rather than pretending empty', async () => {
  const db = createClient('https://fixture.invalid','fixture-only-key',{
    auth:{persistSession:false},global:{fetch:async()=>Response.json([])},
  });
  assert.deepEqual(await readDeletionReview(deletionReviewFilter('all',undefined),()=>db),{items:[],nextCursor:null});
  await assert.rejects(readDeletionReview(deletionReviewFilter('all',undefined),()=>null),/storage unavailable/);
  const failing=createClient('https://fixture.invalid','fixture-only-key',{
    auth:{persistSession:false},global:{fetch:async()=>Response.json({message:'private database detail'},{status:500})},
  });
  await assert.rejects(readDeletionReview(deletionReviewFilter('all',undefined),()=>failing),/storage unavailable/);
});

test('admin guard runs before storage, user parameters cannot grant access and endpoint is read-only', async () => {
  const app=express();app.use(express.json());
  const reads:any[]=[];
  registerAccountDeletionReview(app,(req,res,next)=>{
    if(req.headers['x-fixture-role']!=='ADMIN')return res.status(403).json({success:false});
    next();
  },async filter=>{reads.push(filter);return {items:[],nextCursor:null};});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`http://127.0.0.1:${(server.address() as any).port}/api/admin/account-deletion/requests`;
  try {
    for (const headers of [{},{'x-fixture-role':'PERSONAL'}]) {
      const denied=await fetch(url+'?role=ADMIN&ownerId=unrelated',{headers});
      assert.equal(denied.status,403);assert.equal(denied.headers.get('cache-control'),'no-store');
    }
    assert.equal(reads.length,0);
    const headers={'x-fixture-role':'ADMIN'};
    const allowed=await fetch(url,{headers});
    assert.equal(allowed.status,200);assert.equal((await allowed.json()).readOnly,true);
    assert.equal(reads.length,1);
    assert.equal((await fetch(url+'?status=bad',{headers})).status,400);
    assert.equal((await fetch(url+'?cursor=bad',{headers})).status,400);
    assert.equal(reads.length,1);
    assert.equal((await fetch(url,{method:'POST',headers})).status,404);
    assert.equal((await fetch(url,{method:'DELETE',headers})).status,404);
    assert.equal(reads.length,1);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('storage errors never disclose private details or claim erasure', async () => {
  const app=express();
  registerAccountDeletionReview(app,(_req,_res,next)=>next(),async()=>{throw Error('PRIVATE_DATABASE_DETAIL');});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    const response=await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/admin/account-deletion/requests`);
    assert.equal(response.status,503);
    const body=await response.text();
    assert.equal(body.includes('PRIVATE_DATABASE_DETAIL'),false);
    assert.match(body,/No account status was changed/);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
