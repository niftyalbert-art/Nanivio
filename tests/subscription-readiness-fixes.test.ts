import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBillingMinutes, billingHistoryDisplay } from '../src/lib/billingPresentation';
import { malviCustomerCopy } from '../src/lib/malviCustomerCopy';
import { privateChatMessageEvent } from '../src/server/chatMessageEvent';
import { startChatHistorySync } from '../src/lib/chatHistorySync';

test('minute display is bounded without modifying purchased allowances or inventing zero', () => {
  assert.equal(formatBillingMinutes(0.000001000000001),' <0.01'.trim());
  assert.equal(formatBillingMinutes('12.345678'),'12.35');
  assert.equal(formatBillingMinutes(0),'0');
  for (const value of [undefined,null,NaN,-1,'']) assert.equal(formatBillingMinutes(value),'Unavailable');
});

test('account history displays persisted transaction fields and handles missing dates honestly', () => {
  const row={transaction_id:'tx',service_type:'MALVI_SUBSCRIPTION',currency:'USD',total:'24.99',created_at:'2026-11-06T10:00:00Z'};
  const view=billingHistoryDisplay(row);
  assert.equal(view.amount,'24.99');assert.equal(view.currency,'USD');
  assert.equal(view.title,'MALVI SUBSCRIPTION');assert.equal(view.id,'tx');
  assert.doesNotMatch(view.time,/Invalid Date|unavailable/);
  assert.equal(billingHistoryDisplay({}).time,'Date unavailable');
  assert.equal(billingHistoryDisplay({}).amount,'Unavailable');
  assert.equal(billingHistoryDisplay({type:'TOPUP',amount:0,timestamp:0,currency:'GHS'}).amount,'0.00');
});

test('published customer descriptions qualify unmeasured claims but preserve benefits and prices', () => {
  const plan={description:'Premium',langpretationCapabilities:'Real-time simultaneous Langpretation assistance',
    features:['Natural voice with zero awkward pauses','Priority neural response routing with sub-second latency','40 live avatar minutes'],
    priceMonthlyUSD:24.99,videoInteractionMinutesLimit:40} as any;
  const safe=malviCustomerCopy(plan);
  assert.doesNotMatch(JSON.stringify(safe),/zero awkward|sub-second|simultaneous/i);
  assert.equal(safe.priceMonthlyUSD,24.99);assert.equal(safe.videoInteractionMinutesLimit,40);
  assert.equal(safe.features[2],plan.features[2]);assert.match(plan.features[0],/zero awkward/);
});

test('HTTP chat events include canonical conversation and verified members for receiving screens', () => {
  const event=privateChatMessageEvent({id:'saved',channelId:'room',userId:'alice',userName:'Alice',text:'Hello',
    createdAt:123,reactions:[],nanivio:{replyTo:{id:'original',senderName:'Bob',text:'Hi'}}} as any,
  {name:'Private',members:[{userId:'alice'},{userId:'bob'}],custom:{isGroup:false}} as any);
  assert.equal(event.payload.conversationId,'room');
  assert.equal(event.payload.channelId,'room');
  assert.ok(event.payload.members.some(member=>member.userId==='bob'));
  assert.equal(event.payload.message.senderId,'alice');
  assert.equal(event.payload.message.userId,'alice');
  assert.equal(event.payload.message.timestamp,123);
  assert.equal(event.payload.message.replyTo?.id,'original');
});

test('durable chat refresh recovers after failure, never overlaps, and stops on cleanup', async () => {
  let calls=0,active=0,maxActive=0,errors=0;
  let recovered!:()=>void;
  const done=new Promise<void>(resolve=>{recovered=resolve;});
  const stop=startChatHistorySync(async()=>{
    active++;maxActive=Math.max(maxActive,active);calls++;
    try {
      await new Promise(resolve=>setTimeout(resolve,5));
      if(calls===1)throw Error('offline');
      recovered();
    } finally {active--;}
  },()=>{errors++;},5);
  try {
    await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(Error('Recovery timed out')),500))]);
    assert.equal(errors,1);assert.equal(maxActive,1);assert.ok(calls>=2);
  } finally {stop();}
  const count=calls;
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(calls,count);
});
