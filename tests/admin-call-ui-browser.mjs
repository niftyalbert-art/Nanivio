import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

const assets = await readdir('dist/assets');
const css = (await Promise.all(
  assets.filter(name => name.endsWith('.css')).map(name => readFile(`dist/assets/${name}`, 'utf8')),
)).join('\n');

const fixtureEntry = `
  import React, {useState} from 'react';
  import {createRoot} from 'react-dom/client';
  import {AdminControlCenter} from './src/components/admin/AdminControlCenter';
  import {AdminMalviAdjustment} from './src/components/admin/AdminMalviAdjustment';
  import {ActiveCallModal} from './src/components/calls/ActiveCallModal';

  const fixtureUser = {id:'fixture-user-104', displayName:'Fixture · Ama Serwaa', name:'Fixture · Ama Serwaa', nvId:'NV-FIXTURE-104', role:'USER', myLanguage:'en'};
  const metrics = {totalUsers:821, paidSubscribers:234, unsubscribedUsers:587, malviPaidSubscribers:91, malviTrialUsers:37};
  const planRows = [
    {id:'fixture-voice-monthly',name:'Fixture Voice Monthly',status:'PUBLISHED',published:true},
    {id:'fixture-voice-annual',name:'Fixture Voice Annual',status:'PUBLISHED',published:true},
    {id:'fixture-archived',name:'Fixture Archived Plan',status:'ARCHIVED',published:false}
  ];
  const featureKeys = [
    'nanivioRideEnabled','nanivioDriveEnabled','rideHailingEnabled','driverPartnerAppEnabled','googleMapsSdkEnabled',
    'langpretationEnabled','expertConsultationsEnabled','paidCallsEnabled','expertsEnabled','liveAdsEnabled',
    'commFintechEnabled','langpretationEnabled'
  ];
  const adminFeatures = Object.fromEntries(featureKeys.map(key=>[key,true]));
  const adminPricing = {
    langpretationPerMinuteRateUSD:.15,langpretationPerMinuteRateGHS:2.2,platformExpertCommissionPercent:15,
    fintechTransferFeePercent:1,b2bSeatMonthlyRateUSD:20,freeTierLangpretationMinutes:30,
    langpretationPerMinuteRateEUR:.14,langpretationPerMinuteRateGBP:.12,langpretationPerMinuteRateAED:.55,
    langpretationPerMinuteRateNGN:200,referralBonusMinutes:30,referralBonusCreditUSD:10,
    rideBaseFareGHS:15,ridePerKmRateGHS:5.5,ridePerMinuteRateGHS:1.2,rideSurgeMultiplier:1.2,driverCommissionPercent:15
  };
  window.localStorage.setItem('nanivio_auth_token','isolated-fixture-token');
  window.__fixtureApiCalls = [];
  window.__fixtureAdjustments = [];
  window.__fixtureOverviewCalls = 0;
  window.fetch = async (input, init={}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const method = (init.method || 'GET').toUpperCase();
    window.__fixtureApiCalls.push({path:url.pathname,method});
    if (url.pathname === '/api/admin/malvi/overview' && method === 'GET') {
      window.__fixtureOverviewCalls++;
      const mode = new URLSearchParams(location.search).get('overview') || 'success';
      if (mode === 'loading') await new Promise(resolve=>setTimeout(resolve,500));
      if (mode === 'unavailable' || (mode === 'retry' && window.__fixtureOverviewCalls === 1)) {
        return new Response(JSON.stringify({success:false,message:'Fixture overview temporarily unavailable.'}),{status:503,headers:{'Content-Type':'application/json'}});
      }
      return new Response(JSON.stringify({success:true,metrics}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if (url.pathname === '/api/billing/malvi-plans' && method === 'GET') {
      return new Response(JSON.stringify({success:true,data:{plans:planRows}}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if (url.pathname === '/api/admin/malvi/adjustments' && method === 'POST') {
      const body = JSON.parse(init.body || '{}');
      window.__fixtureAdjustments.push(body);
      if (window.__fixtureAdjustments.length === 1) {
        return new Response(JSON.stringify({success:false,message:'Fixture transient adjustment failure. Retry the same request safely.'}),{status:503,headers:{'Content-Type':'application/json'}});
      }
      return new Response(JSON.stringify({success:true,message:'Fixture adjustment accepted.',result:{requestId:body.requestId,userId:body.userId}}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    return new Response(JSON.stringify({success:false,message:'Blocked by isolated browser fixture.'}),{status:403,headers:{'Content-Type':'application/json'}});
  };
  function Fixture(){
    const query = new URLSearchParams(location.search);
    const initialScreen = query.get('surface') === 'call' ? 'call' : 'admin';
    const [screen,setScreen] = useState(initialScreen);
    const [showAdjustment,setShowAdjustment] = useState(false);
    const [call,setCall] = useState({
      id:'fixture-call-104',type:'video_1on1',status:'calling',
      host:{id:'fixture-admin',name:'Fixture · Kojo Mensah',nvId:'NV-FIXTURE-001',myLanguage:'en',isMuted:false,isCameraOff:false},
      participants:[
        {id:'fixture-admin',name:'Fixture · Kojo Mensah',nvId:'NV-FIXTURE-001',myLanguage:'en',isMuted:false,isCameraOff:false},
        {id:'fixture-user-104',name:'Fixture · Ama Serwaa',nvId:'NV-FIXTURE-104',myLanguage:'fr',isMuted:false,isCameraOff:false}
      ],
      isMuted:false,isVideoOff:false,langpretationEnabled:false,durationSeconds:14
    });
    const setActiveTab = tab => setScreen(tab === 'home' ? 'home' : 'admin');
    window.__adminCallUiFixtureContext = {
      isAdmin:true,authUser:{id:'fixture-admin',role:'ADMIN',name:'Fixture Admin'},currentUser:fixtureUser,
      adminFeatures,updateAdminFeature:()=>{},adminPricing,updateAdminPricing:()=>{},
      activeCall:screen === 'call' ? call : null,endCall:()=>setCall(null),
      toggleCallMute:()=>setCall(value=>({...value,isMuted:!value.isMuted})),
      toggleCallVideo:()=>setCall(value=>({...value,isVideoOff:!value.isVideoOff})),
      toggleCallLangpretation:()=>setCall(value=>({...value,langpretationEnabled:!value.langpretationEnabled})),
      setActiveTab,quickSwitchDemoUser:()=>{},signInWithAdminToken:async()=>{},
      adminExpertsList:[],adminBusinessesList:[],adminDriversList:[],adminUsersList:[],
      onlineUsers:[],start1on1Call:()=>{},globalLangpretationEnabled:true,setGlobalLangpretationEnabled:()=>{},
      setIsLanguageModalOpen:()=>{},messages:[],activeConversationId:null,myLanguage:'en',setMyLanguage:()=>{},
      sendMessage:async()=>{},inCallNotice:null,dismissInCallNotice:()=>{},currentPlan:null,billingSummary:null,
      wallets:[],processLiveSpeechUtterance:()=>{},langpretationMeter:null,agoraStats:null,
      setCallFixture:setCall
    };
    if (screen === 'home') return <main data-fixture-screen="home" className="min-h-screen bg-[#111820] p-8 text-[#f4f1e9]">
      <p className="font-mono text-xs uppercase tracking-widest text-[#e2bb62]">Isolated fixture destination</p>
      <h1 className="mt-2 text-3xl font-bold">Nanivio home preview</h1>
      <button className="mt-6 rounded-lg border border-[#e2bb62] px-4 py-3" onClick={()=>setScreen('admin')}>Return to admin fixture</button>
    </main>;
    if (screen === 'call') return <ActiveCallModal />;
    return <main data-fixture-screen="admin" className="min-h-screen bg-[#0e1115] p-3 text-white sm:p-5">
      <div className="mx-auto mb-3 flex max-w-7xl flex-wrap items-center justify-between gap-2 border border-[#62522f] bg-[#211d15] px-3 py-2 text-[11px] text-[#f2dfad]">
        <span className="font-mono uppercase tracking-wider">Isolated UI fixture · no production account or billing calls</span>
        <button id="fixture-open-adjustment" type="button" onClick={()=>setShowAdjustment(true)} className="min-h-9 border border-[#e2bb62]/60 px-3 font-semibold text-white">Open fixture account · Ama Serwaa</button>
      </div>
      <AdminControlCenter />
      {showAdjustment && <AdminMalviAdjustment user={fixtureUser} onClose={()=>setShowAdjustment(false)} onSuccess={()=>window.dispatchEvent(new Event('nanivio:admin-malvi-adjusted'))} />}
    </main>;
  }
  createRoot(document.getElementById('root')).render(<Fixture/>);
`;

const bundle = await build({
  stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: fixtureEntry },
  bundle: true,
  write: false,
  format: 'iife',
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.jpeg': 'dataurl', '.svg': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    name: 'fixture-use-nanivio-alias',
    setup(buildApi) {
      buildApi.onResolve({ filter: /NanivioContext$/ }, () => ({
        path: path.resolve('tests/admin-call-ui-context-mock.ts'),
      }));
    },
  }],
});

const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html');
  res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : req.url === '/style.css' ? css :
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>');
});
const preview = process.argv.includes('--preview');
await new Promise(resolve => server.listen(preview ? 5210 : 0, '0.0.0.0', resolve));
if (preview) {
  console.log('Isolated admin/call UI fixture listening on 5210');
} else {
  const browser = await launchBrowser();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [width,height] of [[390,844],[1440,900]]) {
      const page = await browser.page(`${base}/?overview=success`);
      await page.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
      await page.wait("!!document.querySelector('[data-fixture-screen=\"admin\"] button')");
      await page.wait("document.querySelector('[aria-label=\"Subscriber metrics\"]')?.textContent.includes('821')");
      const adminState = await page.evaluate(`(()=>{
        const metrics=document.querySelector('[aria-label="Subscriber metrics"]');
        const back=[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Return to Nanivio'));
        const rect=back?.getBoundingClientRect();
        return {
          metrics:metrics?.textContent || '',
          returnVisible:!!rect && rect.top>=0 && rect.bottom<=innerHeight && rect.left>=0 && rect.right<=innerWidth,
          overflow:document.documentElement.scrollWidth>innerWidth,
          api:window.__fixtureApiCalls
        };
      })()`);
      assert.ok(adminState.metrics.includes('All accounts') && adminState.metrics.includes('821'), `${width}x${height}: API overview count missing`);
      assert.ok(adminState.metrics.includes('234') && adminState.metrics.includes('587'), `${width}x${height}: expected distinct overview counters`);
      assert.ok(adminState.returnVisible, `${width}x${height}: Return to Nanivio control not visible in viewport`);
      assert.equal(adminState.overflow,false,`${width}x${height}: admin shell has horizontal overflow`);
      assert.ok(adminState.api.some(call=>call.path==='/api/admin/malvi/overview'), 'overview must use the dedicated metrics API');
      assert.equal(adminState.api.some(call=>call.path.includes('/directory') || call.path.includes('/users')),false,'overview must not derive counts from the paginated directory');
      await page.evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Return to Nanivio')).click();true");
      await page.wait("!!document.querySelector('[data-fixture-screen=\"home\"]')");
      assert.equal(await page.evaluate("document.querySelector('[data-fixture-screen=\"home\"] h1').textContent"),'Nanivio home preview');
      await browser.closePage?.(page);
    }

    {
      const page = await browser.page(`${base}/?overview=loading`);
      await page.command('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false});
      await page.wait("!!document.querySelector('[aria-label=\"Subscriber metrics\"] [aria-label=\"Loading metric\"]')");
      await page.wait("document.querySelector('[aria-label=\"Subscriber metrics\"]')?.textContent.includes('821')");
      assert.equal(await page.evaluate("document.querySelectorAll('[aria-label=\"Subscriber metrics\"] [aria-label=\"Loading metric\"]').length"),0,
        'skeleton metrics should be replaced by overview API results');
      await browser.closePage?.(page);
    }

    {
      const page = await browser.page(`${base}/?overview=unavailable`);
      await page.command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      await page.wait("!!document.querySelector('[aria-label=\"Subscriber metrics\"] [role=\"alert\"]')");
      const unavailable = await page.evaluate(`(()=>{
        const section=document.querySelector('[aria-label="Subscriber metrics"]');
        return {text:section.textContent,zero: [...section.querySelectorAll('p')].some(p=>p.textContent.trim()==='0'),retry:!![...section.querySelectorAll('button')].find(b=>b.textContent.trim()==='Retry')};
      })()`);
      assert.ok(unavailable.text.includes('Fixture overview temporarily unavailable.'));
      assert.equal(unavailable.zero,false,'unavailable metrics must not be presented as zero');
      assert.equal(unavailable.retry,true,'unavailable metrics must offer a retry');
      await browser.closePage?.(page);
    }

    {
      const page = await browser.page(`${base}/?overview=retry`);
      await page.command('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false});
      await page.wait("!!document.querySelector('[aria-label=\"Subscriber metrics\"] [role=\"alert\"]')");
      await page.evaluate("[...document.querySelectorAll('[aria-label=\"Subscriber metrics\"] button')].find(b=>b.textContent.trim()==='Retry').click();true");
      await page.wait("document.querySelector('[aria-label=\"Subscriber metrics\"]')?.textContent.includes('821')");
      assert.equal(await page.evaluate("window.__fixtureOverviewCalls"),2,'Retry must refetch the overview API');
      await browser.closePage?.(page);
    }

    {
      const page = await browser.page(`${base}/?overview=success`);
      await page.command('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
      await page.wait("!!document.querySelector('#fixture-open-adjustment')");
      await page.evaluate("document.querySelector('#fixture-open-adjustment').click();true");
      await page.wait("!!document.querySelector('[role=\"dialog\"] select')");
      const fields = await page.evaluate(`(()=>{
        const dialog=document.querySelector('[role="dialog"]');
        const cycle=dialog.querySelector('select');
        return {monthly:cycle.value,cycles:[...cycle.options].map(option=>option.value),plans:[...dialog.querySelectorAll('select')][1].textContent};
      })()`);
      assert.equal(fields.monthly,'MONTHLY');
      assert.deepEqual(fields.cycles,['MONTHLY','ANNUAL']);
      assert.ok(fields.plans.includes('Fixture Voice Monthly') && fields.plans.includes('Fixture Voice Annual'));
      assert.equal(fields.plans.includes('Fixture Archived Plan'),false,'archived plans must not be selectable');
      await page.evaluate(`(()=>{
        const cycle=document.querySelector('[role="dialog"] select');
        cycle.value='ANNUAL';cycle.dispatchEvent(new Event('change',{bubbles:true}));
        const reason=document.querySelector('[role="dialog"] textarea');
        const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
        setter.call(reason,'Fixture adjustment for a documented account correction.');
        reason.dispatchEvent(new Event('input',{bubbles:true}));
        reason.dispatchEvent(new Event('change',{bubbles:true}));
        return true;
      })()`);
      assert.equal(await page.evaluate("document.querySelector('[role=\"dialog\"] select').value"),'ANNUAL');
      await page.evaluate("[...document.querySelectorAll('[role=\"dialog\"] button')].find(b=>b.textContent.includes('Apply credit')).click();true");
      await page.wait("!!document.querySelector('[role=\"dialog\"] [role=\"alert\"]')");
      const firstAttempt = await page.evaluate("window.__fixtureAdjustments[0]");
      assert.equal(firstAttempt.userId,'fixture-user-104');
      assert.equal(firstAttempt.billingCycle,'ANNUAL');
      assert.equal(firstAttempt.direction,'CREDIT');
      assert.equal(firstAttempt.minutes,15);
      assert.equal(firstAttempt.mode,'voice');
      assert.ok(firstAttempt.requestId,'first attempt should carry a requestId');
      await page.evaluate("[...document.querySelectorAll('[role=\"dialog\"] button')].find(b=>b.textContent.includes('Apply credit')).click();true");
      await page.wait("!!document.querySelector('[role=\"dialog\"] [role=\"status\"]')");
      const retryCheck = await page.evaluate("window.__fixtureAdjustments.map(item=>({requestId:item.requestId,billingCycle:item.billingCycle,minutes:item.minutes}))");
      assert.equal(retryCheck.length,2);
      assert.equal(retryCheck[1].requestId,retryCheck[0].requestId,'same payload retry must preserve its idempotency requestId');
      assert.equal(retryCheck[1].billingCycle,'ANNUAL');
      await page.evaluate(`(()=>{
        const dialog=document.querySelector('[role="dialog"]');
        const debit=[...dialog.querySelectorAll('button')].find(button=>button.textContent.trim()==='Debit');
        debit.click();
        return true;
      })()`);
      await page.evaluate(`(()=>{
        const dialog=document.querySelector('[role="dialog"]');
        const review=[...dialog.querySelectorAll('button')].find(button=>button.textContent.includes('Review debit'));
        const submit=[...dialog.querySelectorAll('footer button')].find(button=>button.textContent.includes('Confirm debit'));
        window.__fixtureDebitBeforeReview=submit.disabled;
        review.click();
        return true;
      })()`);
      await page.wait("document.querySelector('[role=\"dialog\"]')?.textContent.includes('Confirm debit · 15 voice minutes?')");
      const confirmation = await page.evaluate(`(()=>{
        const dialog=document.querySelector('[role="dialog"]');
        const submit=[...dialog.querySelectorAll('footer button')].find(button=>button.textContent.includes('Confirm debit'));
        return {before:window.__fixtureDebitBeforeReview,text:dialog.textContent,prompt:dialog.textContent.includes('Confirm debit · 15 voice minutes?'),notYet:[...dialog.querySelectorAll('button')].some(button=>button.textContent.trim()==='Not yet')};
      })()`);
      assert.equal(confirmation.before,true,'debit submit is gated before explicit review');
      assert.equal(confirmation.prompt,true,`debit confirmation must name amount and minutes type: ${confirmation.text}`);
      assert.equal(confirmation.notYet,true,'debit review offers a cancellation action');
      assert.equal(await page.evaluate("window.__fixtureApiCalls.every(call=>['/api/admin/malvi/overview','/api/billing/malvi-plans','/api/admin/malvi/adjustments'].includes(call.path))"),true,
        'admin fixture must not request unrelated providers or financial services');
      await browser.closePage?.(page);
    }

    for (const [width,height] of [[390,844],[1440,900]]) {
      const page = await browser.page(`${base}/?surface=call`);
      await page.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
      await page.wait("!!document.querySelector('#btn-cancel-ringing-call')");
      const controls = await page.evaluate(`(()=>{
        const labels=['Mute microphone','Open keypad','End call','Mute speaker','Turn camera off'];
        const buttons=labels.map(label=>document.querySelector('[aria-label="'+label+'"]'));
        const visible=buttons.every(button=>{
          const r=button?.getBoundingClientRect();
          return !!r && r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth && r.width>=40 && r.height>=40;
        });
        const text=document.body.innerText;
        return {visible,brand:text.toLowerCase().includes('nanivio') && text.includes('Video call'),ringing:text.includes('Ringing'),
          uncluttered:!['Nanivio Telecom Edge','Calling Recipient','LIVE CAMERA PREVIEW','Waiting for recipient to answer'].some(value=>text.includes(value)),
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth,text};
      })()`);
      assert.equal(controls.visible,true,`${width}x${height}: essential ringing video-call controls should remain visible`);
      assert.equal(controls.brand,true,`${width}x${height}: ${controls.text}`);
      assert.equal(controls.ringing,true,`${width}x${height}: ${controls.text}`);
      assert.equal(controls.uncluttered,true,'ringing surface should omit surplus telecom/status copy');
      assert.equal(controls.horizontalOverflow,false);
      assert.deepEqual(await page.evaluate('window.__fixtureApiCalls'),[],'call UI fixture must not make API or financial requests');
      await page.evaluate("document.querySelector('[aria-label=\"Mute microphone\"]').click();true");
      await page.wait("!!document.querySelector('[aria-label=\"Unmute microphone\"]')");
      await page.evaluate("document.querySelector('[aria-label=\"Turn camera off\"]').click();true");
      await page.wait("!!document.querySelector('[aria-label=\"Turn camera on\"]')");
      await page.evaluate("document.querySelector('[aria-label=\"Open keypad\"]').click();true");
      await page.wait("!!document.querySelector('[aria-label=\"Close keypad\"]')");
      await browser.closePage?.(page);
    }

    console.log(JSON.stringify({passed:true,adminViewports:2,overviewStates:['loading','success','unavailable','retry'],adjustmentFields:true,sameRequestIdRetry:true,debitConfirmation:true,callViewports:2,providerRequests:0,financialRequests:0}));
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
