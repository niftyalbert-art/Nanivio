import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Render the actual workspace and history code. Only surrounding services and
// unrelated panels are fixtures; no production authentication is bypassed.
const panels = [
  'MalviAvatar', 'MalviVoiceWaveform', 'MalviStage3DVisual', 'MalviLiveAssistant',
  'MalviChatHistoryModal', 'MalviMemoryInspectorModal', 'MalviSubscriptionHub',
  'MalviBusinessCollaborationRoom',
];
const output = await build({
  stdin: {
    loader: 'tsx', resolveDir: process.cwd(),
    contents: `
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {Context} from 'fixture-context';
      import {MalviView} from './src/components/malvi/MalviView';
      import {malviHistoryKey,saveMalviHistory} from './src/lib/malviHistory';
      window.historyKey=malviHistoryKey;
      const message=text=>({id:text,sender:'user',text,timestamp:1});
      if(!localStorage.getItem('fixture-initialized')){
        localStorage.setItem('fixture-initialized','yes');
        localStorage.setItem('fixture-session-owner','a');
        localStorage.setItem('nanivio_malvi_chat_history_v1',JSON.stringify([message('UNOWNED LEGACY SECRET')]));
        saveMalviHistory(localStorage,'a',[message('ACCOUNT A PRIVATE HISTORY')]);
        saveMalviHistory(localStorage,'b',[message('ACCOUNT B PRIVATE HISTORY')]);
      }
      window.requests=[];window.speechRequests=0;
      window.fixtureErrors=[];
      window.addEventListener('error',event=>window.fixtureErrors.push(event.message));
      window.fetch=async(url,options={})=>{
        if(String(url).startsWith('/api/assistant/memory')){
          return new Response(JSON.stringify({success:true,enabled:false,messages:[],hasPrevious:false}));
        }
        if(String(url)==='/api/malvi/chat'){
          // Deliberately ignore abort here: a late transport result must still
          // fail the component's account ownership guard.
          return new Promise(resolve=>window.requests.push({
            body:JSON.parse(options.body),signal:options.signal,
            finish:()=>resolve(new Response(JSON.stringify({success:true,reply:'LATE ACCOUNT A RESPONSE'})))
          }));
        }
        if(String(url).includes('/synthesize'))window.speechRequests++;
        throw new Error('Unexpected fixture request: '+url);
      };
      window.confirm=()=>true;
      function Fixture(){
        const [account,setAccount]=useState('a');
        window.setAccount=(id)=>{
          if(id)localStorage.setItem('fixture-session-owner',id);
          else localStorage.removeItem('fixture-session-owner');
          setAccount(id);
        };
        return <Context.Provider value={{
          isAuthenticated:!!account,
          currentUser:{id:account||'unauthenticated',name:'Fixture user',role:'user'},
          appLanguage:'en',myLanguage:'en',speakingLanguage:'en',translationLanguage:'en',
          wallets:[],experts:[],malviPlans:[],
          currentPlan:{tier:'free',name:'Free',langpretationMinutesRemaining:0,langpretationMinutesQuota:0},
          malviSubscription:{tier:'free',planName:'Free',videoInteractionMinutesRemaining:3},
          refreshBilling:async()=>{},setActiveTab:()=>{},setGlobalLangpretationEnabled:()=>{},setSelectedExpert:()=>{}
        }}><MalviView/></Context.Provider>;
      }
      createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);
    `,
  },
  bundle: true, platform: 'browser', format: 'iife', write: false,
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{
    name: 'malvi-history-isolation',
    setup(build) {
      build.onResolve({ filter: /NanivioContext$|^fixture-context$/ }, () => ({ path: 'context', namespace: 'fixture' }));
      build.onResolve({ filter: /\/authClient$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      build.onResolve({ filter: /\/billingClient$/ }, () => ({ path: 'billing', namespace: 'fixture' }));
      build.onResolve({ filter: new RegExp('/(' + panels.join('|') + ')$') }, args => ({
        path: args.path.split('/').at(-1), namespace: 'fixture',
      }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
        if (args.path === 'context') return { loader: 'tsx', resolveDir: process.cwd(), contents: `import React from 'react';export const Context=React.createContext(null);export const useNanivio=()=>React.useContext(Context);` };
        if (args.path === 'auth') return { contents: `export const authClient={getToken:()=>localStorage.getItem('fixture-session-owner')?'fixture-token':null,getStoredUser:()=>({id:localStorage.getItem('fixture-session-owner')})};` };
        if (args.path === 'billing') return { contents: 'export const billingClient={};' };
        const name = args.path === 'MalviLiveAssistant' ? 'MalviLiveControls' : args.path;
        return { contents: `export const ${name}=()=>null;` };
      });
    },
  }],
});
const server = http.createServer((req, res) => {
  if (req.url === '/fixture.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(output.outputFiles[0].text);
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.page(`http://127.0.0.1:${server.address().port}/`);
  const text = () => page.evaluate('document.body.innerText');
  await page.wait(`document.body.innerText.includes('ACCOUNT A PRIVATE HISTORY')`).catch(async error=>{
    console.error(await page.evaluate('JSON.stringify({text:document.body.innerText,errors:window.fixtureErrors})'));
    throw error;
  });
  assert.doesNotMatch(await text(), /ACCOUNT B PRIVATE HISTORY|UNOWNED LEGACY SECRET/);

  await page.evaluate(`document.querySelector('input[placeholder^="Speak or ask Malvi"]').focus();true`);
  await page.command('Input.insertText', { text: 'A pending question' });
  await page.wait(`!document.querySelector('button[title="Send to Malvi"]').disabled`);
  await page.evaluate(`document.querySelector('button[title="Send to Malvi"]').click();true`);
  await page.wait('window.requests.length===1');

  await page.evaluate(`window.setAccount('b');true`);
  await page.wait(`document.body.innerText.includes('ACCOUNT B PRIVATE HISTORY')`);
  assert.doesNotMatch(await text(), /ACCOUNT A PRIVATE HISTORY|A pending question|UNOWNED LEGACY SECRET/);
  assert.equal(await page.evaluate('window.requests[0].signal.aborted'), true);
  await page.evaluate('window.requests[0].finish();true');
  await page.wait(`!document.body.innerText.includes('LATE ACCOUNT A RESPONSE')`);
  // Drain response JSON and React tasks before inspecting the old callback.
  await page.evaluate('new Promise(resolve=>setTimeout(()=>resolve(true),100))');
  assert.doesNotMatch(await text(), /LATE ACCOUNT A RESPONSE/);
  assert.equal(await page.evaluate('window.speechRequests'), 0);
  assert.equal(await page.evaluate(`localStorage.getItem(window.historyKey('b')).includes('ACCOUNT A')`), false);

  await page.evaluate(`document.querySelector('button[title="Start new conversation & clear history"]').click();true`);
  await page.wait(`!document.body.innerText.includes('ACCOUNT B PRIVATE HISTORY')`);
  assert.ok(await page.evaluate(`localStorage.getItem(window.historyKey('a')).includes('ACCOUNT A PRIVATE HISTORY')`));
  assert.ok(await page.evaluate(`localStorage.getItem('nanivio_malvi_chat_history_v1').includes('UNOWNED LEGACY SECRET')`));

  await page.evaluate(`window.setAccount('a');true`);
  await page.wait(`document.body.innerText.includes('ACCOUNT A PRIVATE HISTORY')`);
  assert.doesNotMatch(await text(), /LATE ACCOUNT A RESPONSE/);
  await page.command('Page.reload');
  await page.wait(`document.body.innerText.includes('ACCOUNT A PRIVATE HISTORY')`);

  // A storage event from another tab must hide the old account immediately,
  // even if the application context has not yet revalidated the new account.
  await page.evaluate(`localStorage.setItem('fixture-session-owner','b');window.dispatchEvent(new StorageEvent('storage',{key:'fixture-session-owner',newValue:'b'}));true`);
  await page.wait(`document.body.innerText.includes('Sign in to open your private Malvi conversation')`);
  assert.doesNotMatch(await text(), /ACCOUNT A PRIVATE HISTORY|ACCOUNT B PRIVATE HISTORY/);
  await page.evaluate(`window.setAccount('b');true`);
  await page.wait(`!!document.querySelector('textarea,input[type="text"]')`);
  assert.doesNotMatch(await text(), /ACCOUNT A PRIVATE HISTORY|ACCOUNT B PRIVATE HISTORY/);

  // Exercise same-account storage-event refresh without changing other owners.
  await page.evaluate(`localStorage.setItem(window.historyKey('b'),JSON.stringify({version:2,owner:'b',messages:[{id:'tab',sender:'user',text:'SAME ACCOUNT TAB UPDATE',timestamp:2}]}));window.dispatchEvent(new StorageEvent('storage',{key:window.historyKey('b')}));true`);
  await page.wait(`document.body.innerText.includes('SAME ACCOUNT TAB UPDATE')`);
  await page.evaluate(`window.setAccount(null);true`);
  await page.wait(`document.body.innerText.includes('Sign in to open your private Malvi conversation')`);
  assert.doesNotMatch(await text(), /SAME ACCOUNT TAB UPDATE|ACCOUNT A PRIVATE HISTORY/);
  console.log(JSON.stringify({
    actualWorkspace: true, strictMode: true, accountSwitchAndReload: true,
    lateResponseDiscarded: true, oldRequestAborted: true, noLateSpeech: true,
    clearOnlyCurrentOwner: true, unownedLegacyUntouched: true,
    mismatchedSessionHidden: true, storageEventRefresh: true, signOutHidesHistory: true,
  }));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
