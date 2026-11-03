// Actual components, isolated context and directory fixtures. No accounts or live calls.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'tsx',
    contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {HomeView} from './src/components/home/HomeView';
      import {CallsView} from './src/components/calls/CallsView';
      import {BottomNavigationBar} from './src/components/BottomNavigationBar';
      import {Navbar} from './src/components/Navbar';
      import {TransferValueModal} from './src/components/billing/TransferValueModal';
      import {ErrorBoundary} from './src/components/common/ErrorBoundary';
      const me={id:'fixture-self',name:'Fixture Self',nvId:'0486111111',initials:'FS',role:'user',
        preferredLanguage:'en',myLanguage:'en',country:'Ghana'};
      window.__dialerPeer={id:'fixture-peer',name:'Fixture Peer',nvId:'0486222222',
        initials:'FP',role:'user',myLanguage:'en'};
      window.__homeCallsActions=[];
      const record=(name,...args)=>window.__homeCallsActions.push({name,args});
      const noop=()=>{};
      const values={
        currentUser:me,authUser:me,myLanguage:'en',activeTab:'calls',
        contacts:[],conversations:[],experts:[],callLogs:[{
          id:'fixture-missed',direction:'missed',callType:'audio',timestamp:Date.now(),
          participantId:'fixture-peer',participantNvId:'0486222222',participantName:'Fixture Peer',
          durationSeconds:0,hasLangpretation:false
        }],
        currentPlan:{tier:'free',groupCallLimit:4,langpretationMinutesRemaining:0,langpretationMinutesQuota:0},
        billingSummary:null,globalLangpretationEnabled:false,
        adminFeatures:{audioCallsEnabled:true,videoCallsEnabled:true},
        isSubscribed:false,isFreeTrialActive:false,freeTrialMinutesRemaining:0,usedLangpretationMinutes:0,
        malviSubscription:null,isSettingsModalOpen:false,isEditProfileModalOpen:false,
        setActiveTab:(tab)=>{record('navigate',tab);window.__renderHomeCallsFixture(tab)},
        setActiveConversationId:noop,setGlobalLangpretationEnabled:noop,
        clearCallLogs:()=>record('clearLogs'),
        start1on1Call:(...args)=>record('call',...args),
        startGroupCall:(...args)=>record('group',...args),
        startDirectChatWithUser:(...args)=>record('chat',...args),
        startFreeTrial:noop,
        setPendingBillingAction:action=>record('billingAction',action),
      };
      window.__homeCallsValue=values;
      let root;
      window.__renderHomeCallsFixture=(tab)=>{
        values.activeTab=tab;root?.unmount();root=createRoot(document.getElementById('fixture-root'));
        root.render(<div className="nanivio-app nv-theme-dark min-h-[100dvh] flex flex-col w-full max-w-full">
          <Navbar/>
          <main className="nanivio-main flex-1 pb-24 w-full max-w-full">
            <ErrorBoundary fallbackTitle="Fixture screen failure">
              {tab==='home'?<HomeView/>:tab==='calls'?<CallsView/>:tab==='credit-transfer'
                ?<TransferValueModal isOpen onClose={noop} onSuccess={noop}
                    defaultMode="INTERNAL" communicationBalance={20} fintechBalance={999}/>
                :<div data-destination={tab}/>}
            </ErrorBoundary>
          </main><BottomNavigationBar/>
        </div>);
      };
    `,
  },
  bundle: true, write: false, outdir: '/tmp/nanivio-home-browser-bundle', format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{
    name: 'isolated-home-calls',
    setup(builder) {
      builder.onResolve({ filter: /context\/NanivioContext$/ }, () => ({ path: 'context', namespace: 'fixture' }));
      builder.onResolve({ filter: /utils\/userLookup$/ }, () => ({ path: 'directory', namespace: 'fixture' }));
      builder.onResolve({ filter: /lib\/authClient$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      builder.onResolve({ filter: /malvi\/MalviFloatingWidget$/ }, () => ({ path: 'header-assistant', namespace: 'fixture' }));
      builder.onResolve({ filter: /lib\/billingClient$/ }, args => args.importer.endsWith('TransferValueModal.tsx')
        ? { path: 'credit-client', namespace: 'fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
        loader: 'js',
        contents: path === 'context'
          ? 'export const useNanivio=()=>window.__homeCallsValue;'
          : path === 'directory'
          ? `export const normalizeNanivioNumber=value=>value;
             export async function lookupNanivioUser(number){
               window.__lookupCount=(window.__lookupCount||0)+1;
               await new Promise(resolve=>setTimeout(resolve,80));
               if(window.__lookupFails)throw new Error('Fixture directory unavailable');
               return number==='0486222222'?window.__dialerPeer:null;
             }`
          : path === 'header-assistant'
          ? 'export const MalviFloatingWidget=()=>null;'
          : path === 'credit-client'
          ? `export const billingClient={
              transferPeerToPeer:async payload=>{window.__creditRequests.push(payload);throw new Error('Fixture transfer stopped before posting');},
              transferFintechToCommunication:async()=>{throw new Error('Cash transfer must never be called');}
            };`
          : 'export const authClient={getLiveVerifiedExperts:async()=>[],getLiveVerifiedBusinesses:async()=>[]};',
      }));
    },
  }],
});

const base = process.env.NANIVIO_TEST_URL || 'http://127.0.0.1:5000';
const response = await fetch(`${base}/src/index.css?direct`);
assert.ok(response.ok, 'Running stylesheet unavailable');
const css = await response.text() + '\n' + bundle.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n');
const screenshotDirectory = process.env.NANIVIO_SCREENSHOT_DIR;
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
const brandResponse = await fetch(`${base}/brand/nanivio-emblem.png`);
assert.ok(brandResponse.ok, 'Official Nanivio emblem must remain available');
const emblem = Buffer.from(await brandResponse.arrayBuffer());
// A real isolated HTML origin keeps image loading faithful without signing in,
// altering authentication, or loading the app's provider connections.
const fixtureServer = createServer((request, response) => {
  if (request.url === '/brand/nanivio-emblem.png') {
    response.setHeader('Content-Type', 'image/png');
    response.end(emblem);
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="fixture-root"></div></body></html>`);
  }
});
await new Promise(resolve => fixtureServer.listen(0, '127.0.0.1', resolve));
const browser = await launchBrowser();
try {
  const page = await browser.page(`http://127.0.0.1:${fixtureServer.address().port}/`);
  await page.wait(`!!document.getElementById('fixture-root')`);
  await page.evaluate(bundle.outputFiles.find(file => file.path.endsWith('.js')).text);
  const settle = () => new Promise(resolve => setTimeout(resolve, 150));
  const report = [];
  for (const [width, height] of [[320, 640], [390, 844], [390, 480], [768, 1024], [1366, 900]]) {
    await page.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await page.evaluate(`window.__renderHomeCallsFixture('home');true`);
    await settle();
    assert.equal(await page.evaluate(`document.body.textContent.includes('Fixture screen failure')`), false, 'Home crashed');
    assert.ok(await page.evaluate(`document.querySelector('h1')?.textContent.length>0`), 'Home needs a real screen heading');
    assert.ok(await page.evaluate(`(()=>{const style=getComputedStyle(document.querySelector('.nv-home-hero'));
      return style.borderTopWidth==='0px' && style.borderRadius==='0px';})()`), 'Home must be a screen, not a bordered promotional card');
    assert.ok(await page.evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), `Home overflow at ${width}`);
    if (screenshotDirectory && width === 390 && height === 844) await page.screenshot(join(screenshotDirectory, 'home-mobile.png'));
    await page.evaluate(`document.querySelector('#nav-tab-calls').click();true`);
    await settle();
    assert.equal(await page.evaluate(`document.body.textContent.includes('Fixture screen failure')`), false, 'Calls crashed');
    assert.ok(await page.evaluate(`!!document.querySelector('input[type="tel"]')`), 'Calls must open directly to the dialer');
    assert.equal(await page.evaluate(`document.body.textContent.includes('Missed Calls') && !!document.querySelector('[role="dialog"]')`), false, 'Missed-call popup must not interrupt direct dialing');
    assert.ok(await page.evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), `Calls overflow at ${width}`);
    if (width < 768) {
      assert.ok(await page.evaluate(`(()=>{const tabs=[...document.querySelectorAll('.nv-call-tabs button')];
        return tabs.length===5 && tabs.every(button=>{const text=button.querySelector('span').getBoundingClientRect();
          const bounds=button.getBoundingClientRect();return text.left>=bounds.left-1 && text.right<=bounds.right+1;});})()`), 'Mobile call tabs must show complete labels');
    }
    assert.equal(await page.evaluate(`/Membership & Plans|Subscription Plans|Plans & Top-Ups|Upgrade Plan|Purchase Minutes/.test(document.querySelector('main').textContent)`), false, 'Billing promotions remain in Calls');
    const buttons = await page.evaluate(`(()=>{const buttons=[...document.querySelectorAll('main button')];
      return {audio:buttons.some(b=>/audio call/i.test(b.textContent+' '+b.getAttribute('aria-label'))),
        video:buttons.some(b=>/video call/i.test(b.textContent+' '+b.getAttribute('aria-label')))};})()`);
    assert.ok(buttons.audio && buttons.video, 'Dialer needs labeled audio and video choices');
    if (screenshotDirectory && width === 390 && height === 844) await page.screenshot(join(screenshotDirectory, 'calls-mobile.png'));
    await page.evaluate(`(()=>{const more=[...document.querySelectorAll('#nanivio-bottom-navigation button')]
      .find(b=>b.textContent.trim()==='More');if(!more)throw new Error('More button missing');more.click();return true;})()`);
    await settle();
    assert.ok(await page.evaluate(`!!document.querySelector('[aria-label="More destinations"]')`), 'More menu unavailable');
    await page.evaluate(`(()=>{const billing=[...document.querySelectorAll('[aria-label="More destinations"] button')]
      .find(b=>/Billing/.test(b.textContent));if(!billing)throw new Error('Billing missing from More');billing.click();return true;})()`);
    await settle();
    assert.equal(await page.evaluate(`window.__homeCallsValue.activeTab`), 'billing', 'More → Billing did not navigate');
    report.push({ width, height, home: true, directDialer: true, billingUnderMore: true });
  }
  await page.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.evaluate(`window.__renderHomeCallsFixture('calls');true`);
  await settle();
  assert.ok(await page.evaluate(`document.querySelector('[aria-label="Start audio call"]').disabled &&
    document.querySelector('[aria-label="Start video call"]').disabled`), 'Empty dialer must not start calls');
  await page.evaluate(`document.querySelector('[aria-label="Enter 2"]').click();true`);
  await settle();
  assert.equal(await page.evaluate(`document.querySelector('input[type="tel"]').value`), '2');
  await page.evaluate(`document.querySelector('[aria-label="Delete last digit"]').click();true`);
  await settle();
  assert.equal(await page.evaluate(`document.querySelector('input[type="tel"]').value`), '');
  const enterNumber = async (number) => {
    await page.evaluate(`(()=>{const input=document.querySelector('input[type="tel"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(number)});
      input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    await settle();
  };
  await enterNumber('0486222222');
  await page.evaluate(`document.querySelector('[aria-label="Clear number"]').click();true`);
  await settle();
  assert.equal(await page.evaluate(`document.querySelector('input[type="tel"]').value`), '');
  for (const mode of ['audio', 'video']) {
    await enterNumber('0486222222');
    const before = await page.evaluate(`window.__homeCallsActions.filter(a=>a.name==='call').length`);
    await page.evaluate(`(()=>{const button=document.querySelector('[aria-label="Start ${mode} call"]');
      button.click();button.click();return true;})()`);
    await settle();
    const calls = await page.evaluate(`window.__homeCallsActions.filter(a=>a.name==='call')`);
    assert.equal(calls.length, before + 1, 'Repeated taps must not create duplicate calls');
    assert.equal(calls.at(-1).args[0].id, 'fixture-peer', 'Call must use the directory result');
    assert.equal(calls.at(-1).args[1], mode);
  }
  const completed = await page.evaluate(`window.__homeCallsActions.filter(a=>a.name==='call').length`);
  await enterNumber('0000000000');
  await page.evaluate(`document.querySelector('[aria-label="Start audio call"]').click();true`);
  await settle();
  assert.equal(await page.evaluate(`window.__homeCallsActions.filter(a=>a.name==='call').length`), completed, 'Unknown numbers must not place a call');
  await page.evaluate(`window.__homeCallsValue.adminFeatures.videoCallsEnabled=false;
    window.__renderHomeCallsFixture('calls');true`);
  await settle();
  await enterNumber('0486222222');
  assert.ok(await page.evaluate(`document.querySelector('[aria-label="Start video call"]').disabled`), 'Administrator-disabled video must stay disabled');
  await page.evaluate(`window.__lookupFails=true;document.querySelector('[aria-label="Start audio call"]').click();true`);
  await settle();
  assert.equal(await page.evaluate(`window.__homeCallsActions.filter(a=>a.name==='call').length`), completed, 'Failed lookup must not fabricate a successful call');
  assert.ok(await page.evaluate(`document.querySelector('main').textContent.includes('unavailable')`), 'Lookup failure must be visible');
  await page.evaluate(`window.__lookupFails=false;window.__renderHomeCallsFixture('home');true`);
  await settle();
  await page.evaluate(`(()=>{const input=document.querySelector('main form input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'0486222222');
    input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  await settle();
  await page.evaluate(`document.querySelector('main form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));true`);
  await settle();
  await page.evaluate(`document.querySelector('[aria-label="Open chat"]').click();true`);
  assert.equal(await page.evaluate(`window.__homeCallsActions.filter(a=>a.name==='chat').at(-1)?.args[0].id`), 'fixture-peer', 'Home search must open the real direct-chat action');
  await page.evaluate(`window.__homeCallsValue.contacts=[{...window.__dialerPeer,preferredLanguage:'en',createdAt:1}];
    window.__renderHomeCallsFixture('calls');true`);
  await settle();
  await page.evaluate(`(()=>{const tab=[...document.querySelectorAll('nav[aria-label="Calls"] button')].find(b=>b.textContent==='Contacts');tab.click();return true;})()`);
  await settle();
  await page.evaluate(`document.querySelector('[aria-label="Chat with Fixture Peer"]').click();true`);
  assert.equal(await page.evaluate(`window.__homeCallsActions.filter(a=>a.name==='chat').at(-1)?.args[0].id`), 'fixture-peer', 'Calls contacts must start a real chat, not select an unrelated conversation ID');
  await page.evaluate(`(()=>{const tab=[...document.querySelectorAll('nav[aria-label="Calls"] button')].find(b=>b.textContent==='Groups');tab.click();return true;})()`);
  await settle();
  await page.evaluate(`document.querySelector('button[aria-label="Fixture Peer"]').click();true`);
  await settle();
  await page.evaluate(`document.querySelector('.nv-group-launch').click();true`);
  const group = await page.evaluate(`window.__homeCallsActions.filter(a=>a.name==='group').at(-1)`);
  assert.equal(group.args[0].length, 1, 'Group launch lost the selected contact');
  assert.equal(group.args[0][0].id, 'fixture-peer');
  assert.equal(group.args[1], 'audio');
  await page.evaluate(`(()=>{const tab=[...document.querySelectorAll('nav[aria-label="Calls"] button')].find(b=>b.textContent==='Recent');tab.click();return true;})()`);
  await settle();
  assert.ok(await page.evaluate(`document.querySelector('main').textContent.includes('Fixture Peer') &&
    document.querySelector('main').textContent.includes('Missed')`), 'Missed-call history must remain available');
  await page.evaluate(`window.__homeCallsValue.authUser={...window.__homeCallsValue.authUser,nvId:null};
    window.__homeCallsValue.currentUser={...window.__homeCallsValue.currentUser,nvId:null,nanivioNumber:null};
    window.__renderHomeCallsFixture('home');true`);
  await settle();
  assert.equal(await page.evaluate(`document.body.textContent.includes('0486000000')`), false, 'Home must not invent an NV number');
  assert.ok(await page.evaluate(`document.body.textContent.includes('Not assigned')`), 'Missing NV number needs an honest state');
  // The dashboard changes presentation, not financial state or destinations.
  await page.evaluate(`window.__homeCallsValue.billingSummary={
    userId:'fixture-self',accounts:{fintechAccount:{wallets:[{currency:'GHS',available:999}]},communicationAccount:{wallets:[
      {currency:'GHS',available:0},{currency:'USD',available:'12.50'}
    ]}},recentTransactions:[
      {transaction_id:'older',user_id:'fixture-self',provider_name:'Earlier payment',created_at:'2026-10-01T10:00:00Z',total_amount:'4.20',currency:'GHS',status:'COMPLETED'},
      {transactionId:'newer',userId:'fixture-self',providerName:'Newest payment',createdAt:'2026-11-01T10:00:00Z',total:0,currency:'GHS',status:'PENDING'},
      {transactionId:'foreign',userId:'another-owner',providerName:'Other account private payment',createdAt:Date.now(),total:999,currency:'USD',status:'COMPLETED'}
    ]};window.__renderHomeCallsFixture('home');true`);
  await settle();
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.home-wallet-amount > span')].map(node=>node.textContent)`), ['GHS', 'USD'], 'Never sum different currencies');
  assert.ok(await page.evaluate(`document.querySelector('.home-wallet-amount strong').textContent.includes('0.00')`), 'Known zero must remain a real zero');
  assert.ok(await page.evaluate(`document.querySelectorAll('.home-wallet-amount strong')[1].textContent.includes('12.50')`), 'Decimal strings render as amounts');
  assert.equal(await page.evaluate(`/fintech|send money/i.test(document.querySelector('main').textContent)`), false, 'Home offers Nanivio credits, not money transfers');
  assert.equal(await page.evaluate(`document.querySelector('.home-activity-main strong').textContent`), 'Newest payment', 'ISO dates must sort newest first');
  assert.equal(await page.evaluate(`document.querySelector('.home-activity').textContent.includes('Other account private payment')`), false, 'Foreign activity must never appear');
  await page.evaluate(`document.querySelector('[aria-label="Hide credit balances"]').click();true`);
  await settle();
  assert.ok(await page.evaluate(`[...document.querySelectorAll('.home-wallet-amount strong')].every(node=>node.textContent==='••••••')`), 'Hide all displayed currency balances');
  await page.evaluate(`document.querySelector('[aria-label="Show credit balances"]').click();true`);
  await settle();
  assert.ok(await page.evaluate(`document.querySelectorAll('.home-wallet-amount strong')[1].textContent.includes('12.50')`));
  for (const [label, destination, billingTab] of [
    ['Chat','chat'],['Call','calls'],['Langpretation','chat'],
    ['Send credits','billing','transfer'],['My credits','billing','overview'],
    ['Contacts','contacts'],['NV Number','nvnumber'],['Services','services'],['Malvi','malvi'],
  ]) {
    await page.evaluate(`window.__renderHomeCallsFixture('home');true`);
    await settle();
    const secondary = ['Contacts','NV Number','Services','Malvi'].includes(label);
    if (secondary) {
      await page.evaluate(`[...document.querySelectorAll('.home-shortcut')].find(button=>button.querySelector('strong').textContent==='More').click();true`);
      await settle();
      assert.equal(await page.evaluate(`document.querySelector('[aria-controls="home-more-shortcuts"]').getAttribute('aria-expanded')`), 'true');
    }
    await page.evaluate(`[...document.querySelectorAll('.home-shortcut')].find(button=>button.querySelector('strong').textContent===${JSON.stringify(label)}).click();true`);
    await settle();
    assert.equal(await page.evaluate('window.__homeCallsValue.activeTab'), destination, `${label} must retain a working destination`);
    if (billingTab) assert.equal(await page.evaluate(`window.__homeCallsActions.filter(action=>action.name==='billingAction').at(-1).args[0].subTab`), billingTab);
  }
  for (const scenario of ['other-summary', 'switching-account', 'unknown-amount', 'empty-wallet']) {
    await page.evaluate(`window.__homeCallsValue.authUser={...window.__homeCallsValue.authUser,id:${JSON.stringify(scenario === 'switching-account' ? 'new-owner' : 'fixture-self')}};
      window.__homeCallsValue.billingSummary={userId:${JSON.stringify(scenario === 'other-summary' ? 'another-owner' : 'fixture-self')},
        accounts:{communicationAccount:{wallets:${scenario === 'empty-wallet' ? '[]' : "[{currency:'GHS',available:'   '}]"} }},
        recentTransactions:[]};window.__renderHomeCallsFixture('home');true`);
    await settle();
    assert.equal(await page.evaluate(`document.querySelectorAll('.home-wallet-amount').length`), 0, `${scenario}: never manufacture a zero or display another owner's money`);
    assert.equal(await page.evaluate(`document.querySelectorAll('.home-activity-row').length`), 0, 'No invented activity');
  }
  await page.evaluate(`window.__homeCallsValue.authUser={...window.__homeCallsValue.authUser,id:'fixture-self'};
    window.__homeCallsValue.billingSummary={userId:'fixture-self',accounts:{fintechAccount:{wallets:[{currency:'GHS',available:999}]}},wallets:[{currency:'GHS',available:888}],recentTransactions:[]};
    window.__renderHomeCallsFixture('home');true`);
  await settle();
  assert.equal(await page.evaluate(`document.querySelectorAll('.home-wallet-amount').length`), 0, 'Legacy fintech or generic balances must never masquerade as Nanivio credits');
  await page.evaluate(`window.__creditRequests=[];window.__renderHomeCallsFixture('credit-transfer');true`);
  await settle();
  assert.ok(await page.evaluate(`document.querySelector('main').textContent.includes('Send Nanivio credits')`));
  assert.equal(await page.evaluate(`/Fintech Wallet|Between My Wallets|Ama Serwaa|Expert Amina|Yaw Boateng/.test(document.querySelector('main').textContent)`), false, 'Credit transfers expose neither cash options nor invented recipients');
  for (const [selector, value] of [['input[type="text"]','0486222222'],['input[type="number"]','5']]) {
    await page.evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});
      input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    await settle();
  }
  await page.evaluate(`document.querySelector('main form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));true`);
  await page.wait('window.__creditRequests.length===1');
  assert.equal(await page.evaluate('window.__creditRequests[0].accountType'), 'COMMUNICATION', 'P2P must debit service credits, never cash');
  assert.equal(await page.evaluate('window.__creditRequests[0].amount'), 5);
  assert.equal(await page.evaluate('window.__creditRequests[0].toIdentifier'), '0486222222');
  assert.equal(await page.evaluate('window.__creditRequests.length'), 1);
  await page.evaluate(`
    window.__homeCallsValue.billingSummary={userId:'fixture-self',accounts:{communicationAccount:{wallets:[{currency:'GHS',available:0}]}},recentTransactions:[]};
    window.__renderHomeCallsFixture('home');true`);
  await settle();
  if (screenshotDirectory) {
    await page.wait(`Array.from(document.querySelectorAll('header img')).every(image=>image.complete && image.naturalWidth>0)`);
    for (const [width, height, name] of [[390,844,'home-mobile.png'],[1366,900,'home-desktop.png']]) {
      await page.command('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<768});
      await settle();
      await page.screenshot(join(screenshotDirectory,name));
    }
  }
  console.log(JSON.stringify({ isolatedFixture: true, report, keypadAndDirectoryActions: true, homeAndContactChat: true, groupLaunch: true, missedHistory: true, adminGates: true, noInventedId: true }, null, 2));
} finally {
  await browser.close();
  fixtureServer.closeAllConnections();
  await new Promise(resolve => fixtureServer.close(resolve));
}
