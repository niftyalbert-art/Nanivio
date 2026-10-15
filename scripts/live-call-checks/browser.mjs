import crypto from 'node:crypto';
import { launchBrowser } from './cdp.mjs';
import { peer } from './suite.mjs';

export async function runBrowserChecks({ accounts, origin, outputDirectory }) {
  const checks = [];
  const pages = [];
  const sockets = [];
  const check = (name, passed, detail = {}) => checks.push({ name, passed, ...detail });
  const browser = await launchBrowser();
  let phase = 'sign-in';
  try {
    for (const account of accounts) {
      const page = await browser.page(origin);
      pages.push(page);
      await page.wait('document.body && document.body.innerText.length > 0');
      // Dismiss the actual introduction; do not inject sessions or bypass auth.
      await new Promise(resolve => setTimeout(resolve, 1200));
      await page.evaluate("document.querySelector('#root')?.firstElementChild?.click()");
      await page.wait("Boolean(document.getElementById('input-signin-identifier'))");
      await page.evaluate(`(() => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        for (const [id, value] of ${JSON.stringify([
          ['input-signin-identifier', account.user.nvId],
          ['input-signin-password', account.password],
        ])}) {
          const input = document.getElementById(id);
          set.call(input, value);
          input.dispatchEvent(new Event('input', {bubbles:true}));
        }
        document.getElementById('input-signin-password').closest('form').requestSubmit();
      })()`);
      await page.wait("!document.getElementById('input-signin-identifier') && Boolean(document.querySelector('nav'))", 35000);
      check(`Account ${account.label}: mobile browser signs in using the actual form`, true);
      const accountButton = await page.evaluate(`(() => {
        const button = [...document.querySelectorAll('button')].find(b =>
          /^(account|my account)$/i.test(b.innerText.trim()) || /account/i.test(b.getAttribute('title') || ''));
        if (button) { button.click(); return true; }
        return false;
      })()`);
      if (accountButton) {
        await new Promise(resolve => setTimeout(resolve, 800));
        await page.screenshot(`${outputDirectory}/account-${account.label.toLowerCase()}-mobile.png`);
      }
      const layout = await page.evaluate(`({
        width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        accountVisible: document.body.innerText.includes('Nanivio QA'),
        buttons: [...document.querySelectorAll('button')].map(b => ({
          text:b.innerText.trim().slice(0,60),title:b.getAttribute('title'),label:b.getAttribute('aria-label')
        })).filter(b => b.text || b.title || b.label).slice(-22)
      })`);
      check(`Account ${account.label}: signed-in 390px Account layout has no horizontal overflow`,
        accountButton && layout.accountVisible && layout.scrollWidth <= layout.width, { layout });
    }
    phase = 'authenticated-translation-adapters';
    for (const [provider, className, targetLang] of [
      ['khaya', 'KhayaMtProvider', 'ak'], ['sunbird', 'SunbirdMtProvider', 'lg'],
    ]) {
      const result = await pages[0].evaluate(`(async()=>{
        const actualFetch=window.fetch;
        const requests=[];
        window.fetch=async(...args)=>{
          const response=await actualFetch(...args);
          if(String(args[0]).includes('/api/translate'))requests.push({
            status:response.status,authenticated:Boolean(args[1]?.headers?.Authorization)
          });
          return response;
        };
        let returnedTranslation=false;
        try{
          const module=await import('/src/lib/translator-engine/mt/${provider}.ts');
          await new module.${className}().translate('A live authenticated translation check.','en','${targetLang}');
          returnedTranslation=true;
        }catch{}
        finally{window.fetch=actualFetch;}
        return {requests,returnedTranslation};
      })()`);
      check(`${provider}: real adapter request includes authentication`,
        result.requests.length === 1 && result.requests[0].authenticated &&
        result.requests[0].status !== 401, result);
      check(`${provider}: unavailable provider is not presented as a successful translation`,
        result.returnedTranslation === false);
    }
    phase = 'devices';
    const deviceKinds = await pages[0].evaluate(`navigator.mediaDevices.enumerateDevices().then(d=>d.map(x=>x.kind))`);
    check('Physical microphone and camera are available to this test browser',
      deviceKinds.includes('audioinput') && deviceKinds.includes('videoinput'), { deviceKinds, syntheticMediaUsed: false });

    phase = 'missed-call';
    const a = peer(origin, accounts[0]);
    const b = peer(origin, accounts[1]);
    sockets.push(a, b);
    await Promise.all([a.connect(), b.connect()]);
    const missedId = `qa_${crypto.randomUUID()}`;
    a.send('call:initiate', { callId: missedId, callType: 'audio', recipientNvId: accounts[1].user.nvId });
    await b.wait('call:incoming', missedId);
    await b.wait('call:ended', missedId, 35000);
    await new Promise(resolve => setTimeout(resolve, 600));
    const missedControl = await pages[1].evaluate(`(() => {
      const button = document.getElementById('nav-tab-calls');
      if (button) { button.click(); return true; }
      return false;
    })()`);
    if (missedControl) {
      await pages[1].wait("Boolean(document.querySelector('[role=dialog][aria-labelledby=\"missed-calls-title\"]'))");
      await pages[1].screenshot(`${outputDirectory}/missed-calls-mobile.png`);
      const modal = await pages[1].evaluate(`(() => {
        const dialog=document.querySelector('[aria-labelledby="missed-calls-title"]');
        const r=dialog.getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,
          showsCaller:dialog.innerText.includes('Nanivio QA A'),
          showsActualNumber:dialog.innerText.includes(${JSON.stringify(accounts[0].user.nvId)}),
          missedLabels:[...dialog.querySelectorAll('span')].filter(e=>e.textContent.trim()==='MISSED').length};
      })()`);
      check('A real unanswered invitation creates visible missed-call history', modal.showsCaller, { modal });
      check('A single unanswered invitation creates exactly one missed-call entry', modal.missedLabels === 1);
      check('Missed-call dialog fits the 390x844 mobile viewport',
        modal.left >= 0 && modal.right <= 390 && modal.top >= 0 && modal.bottom <= 844);
      await pages[1].evaluate("document.querySelector('[aria-label=\"Close missed calls\"]').click()");
    } else {
      check('A real unanswered invitation creates visible missed-call history', false,
        { detail: 'No missed-call control was found after the actual server timeout.' });
    }

    phase = 'agora-provider-join';
    for (const callType of ['audio', 'video']) {
    const callId = `qa_${crypto.randomUUID()}`;
    const channelName = `nanivio_call_${callId}`;
    a.send('call:initiate', { callId, channelName, callType, recipientNvId: accounts[1].user.nvId });
    await b.wait('call:incoming', callId);
    b.send('call:accept', { callId });
    await a.wait('call:accepted', callId);
    for (let i = 0; i < pages.length; i++) {
      const result = await pages[i].evaluate(`(async () => {
        try {
          const {authClient}=await import('/src/lib/authClient.ts');
          const response=await fetch('/api/agora/token',{method:'POST',
            headers:{'Content-Type':'application/json',Authorization:'Bearer '+authClient.getToken()},
            body:JSON.stringify({channelName:${JSON.stringify(channelName)}})});
          const token=await response.json();
          if(!response.ok) return {joined:false,tokenStatus:response.status};
          const {default:RTC}=await import('/node_modules/.vite/deps/agora-rtc-sdk-ng.js');
          const client=RTC.createClient({mode:'rtc',codec:'vp8'});
          window.__liveQaAgoraClient=client;
          await client.join(token.appId,${JSON.stringify(channelName)},token.token,token.agoraUid);
          return {joined:client.connectionState==='CONNECTED',state:client.connectionState,publishedMedia:false};
        } catch(error) { return {joined:false,errorCode:error.code||error.name}; }
      })()`);
      check(`${callType}: account ${accounts[i].label} actually joins the Agora provider channel`, result.joined === true, result);
    }
    for (const page of pages) {
      await page.evaluate('window.__liveQaAgoraClient?.leave().then(()=>true)').catch(() => {});
    }
    a.send('call:end', { callId });
    }
    return { origin: 'workspace-browser', checks, notVerified: ['Physical media playback', 'Quota consumption during real media'] };
  } catch (error) {
    check(`Browser phase ${phase} completed`, false, { detail: error.message });
    if (pages.length) {
      await pages.at(-1).screenshot(`${outputDirectory}/browser-blocked.png`).catch(() => {});
      const visibleButtons = await pages.at(-1).evaluate(`({
        headings:[...document.querySelectorAll('h1,h2,h3')].map(e=>e.innerText).slice(0,10),
        buttons:[...document.querySelectorAll('button')].map(b=>({text:b.innerText.slice(0,60),title:b.title,label:b.getAttribute('aria-label')})).slice(-20),
        signinVisible:Boolean(document.getElementById('input-signin-identifier'))
      })`).catch(() => null);
      check('Diagnostic UI state captured without credentials', Boolean(visibleButtons), { visibleButtons });
    }
    return { origin: 'workspace-browser', checks, blocked: phase };
  } finally {
    for (const connection of sockets) connection.socket.close();
    await browser.close();
  }
}
