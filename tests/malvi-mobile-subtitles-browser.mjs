import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Exercise the entire real portal: isolated subtitle tests miss footer overflow.
// No sign-in bypass, media access, or paid provider requests.
const assets = await readdir('dist/assets');
const css = (await Promise.all(assets.filter(name => name.endsWith('.css')).map(name => readFile(`dist/assets/${name}`, 'utf8')))).join('\n');
const bundle = await build({
  stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
    import React, {useState,useRef} from 'react';
    import {createRoot} from 'react-dom/client';
    import {MalviLiveOverlay} from './src/components/malvi/MalviLiveOverlay';
    import {malviAllowanceIsUsedUp,openMalviSubscriptionPlans} from './src/lib/malviSubscriptionNavigation';
    const noop=()=>{};
    function Fixture(){
      const [caption,setCaption]=useState('Malvi reply. '.repeat(100)+'LATEST REPLY');
      const [text,setText]=useState('User speech. '.repeat(100)+'LATEST SPEECH');
      const exhausted=new URLSearchParams(location.search).has('exhausted');
      const [phase,setPhase]=useState(exhausted?'error':'connected');
      const [error,setError]=useState(exhausted?'Your Malvi allowance is used up. Open Billing to review your plan.':null);
      const [navigation,setNavigation]=useState({activeTab:null,pending:null,closed:false});
      const videoRef=useRef(null);
      const attachVideo=React.useCallback(video=>{
        videoRef.current=video;
        if(video)video.poster='/portrait.jpg';
      },[]);
      window.updateCaption=setCaption;
      window.updateTranscript=setText;
      window.changePhase=setPhase;
      window.showExhaustion=()=>{setError('Your Malvi allowance is used up. Open Billing to review your plan.');setPhase('error');};
      window.showProviderFailure=()=>{setError('Speech provider quota_exceeded.');setPhase('error');};
      if(navigation.activeTab==='billing')return <main><h1>Malvi billing destination</h1><pre id="billing-navigation">{JSON.stringify(navigation)}</pre></main>;
      return <MalviLiveOverlay videoRef={videoRef} onVideoElement={attachVideo}
        phase={phase} error={error} secondsRemaining={50} onClose={noop} onRetry={noop}
        onSubscribe={malviAllowanceIsUsedUp(error)?()=>openMalviSubscriptionPlans({
          close:()=>setNavigation(n=>({...n,closed:true})),
          setPendingBillingAction:pending=>setNavigation(n=>({...n,pending})),
          setActiveTab:activeTab=>setNavigation(n=>({...n,activeTab}))
        }):undefined}
        onInterrupt={noop} onPlayAudio={noop} audioBlocked
        caption={caption} userTranscript={text} brainReady microphoneOn
        microphoneError="Please check microphone access." brainProvider="gemini"
        onToggleMicrophone={noop} references={[]} referenceStatus="idle"
        unavailableSources={[]} speaking memoryNotice="Conversation history available." />;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  ` },
  bundle: true, write: false, format: 'iife', loader: { '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' },
});
const server = createServer((req, res) => {
  if (req.url === '/portrait.jpg') {
    res.setHeader('Content-Type', 'image/jpeg');
    void readFile('public/malvi_avatar_v2.jpg').then(image => res.end(image));
    return;
  }
  res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html');
  res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : req.url === '/style.css' ? css :
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>');
});
const preview = process.argv.includes('--preview');
await new Promise(resolve => server.listen(preview ? 5199 : 0, '0.0.0.0', resolve));
if (preview) {
  console.log('Isolated mobile overlay fixture listening on 5199');
} else {
  const browser = await launchBrowser();
  try {
    for (const [width, height] of [[320,568], [360,640], [390,844], [412,915], [844,390], [768,1024], [1024,768], [1440,900], [1920,1080]]) {
      console.log(`Checking full overlay at ${width}x${height}`);
      const page = await browser.page(`http://127.0.0.1:${server.address().port}`);
      await page.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 900 });
      await page.wait("!!document.querySelector('[aria-label=\"Live subtitles\"]')");
      assert.equal(await page.evaluate("getComputedStyle(document.querySelector('[aria-label=\"Malvi live video\"]')).objectFit"), 'contain',
        `${width}x${height}: the entire live portrait fits without face cropping`);
      await page.evaluate(`document.querySelector('[aria-label="Malvi live video"]').poster='/portrait.jpg';true`);
      await page.evaluate('document.fonts.ready.then(()=>true)');
      if (width >= 768) {
        assert.equal(await page.evaluate(`(()=>{
          const v=document.querySelector('[aria-label="Malvi live video"]').getBoundingClientRect();
          const s=document.querySelector('[aria-label="Conversation subtitles"]').getBoundingClientRect();
          const c=document.querySelector('[aria-label="Live session controls"]').getBoundingClientRect();
          return v.right<=s.left+1 && v.right<=c.left+1;
        })()`), true, 'tablet and desktop captions/controls never cover the avatar stage');
      }
      await page.wait("[document.getElementById('malvi-spoken-transcript'),document.getElementById('malvi-user-transcript')].every(el=>el.scrollHeight-el.clientHeight-el.scrollTop<3)");
      const check = async () => {
        const result = await page.evaluate(`(()=>{
          const visible=el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1&&r.height>=24;};
          const texts=[document.getElementById('malvi-spoken-transcript'),document.getElementById('malvi-user-transcript')];
          const controls=document.querySelector('[aria-label="Live session controls"]');
          const close=document.querySelector('[aria-label="End session and close"]');
          const mic=[...controls.querySelectorAll('button')].find(b=>b.textContent.includes('Turn microphone off'));
          return {bothVisible:texts.every(visible),
            latestVisible:texts.every(el=>el.scrollHeight-el.clientHeight-el.scrollTop<3),
            noHorizontalOverflow:texts.every(el=>el.scrollWidth<=el.clientWidth)&&document.documentElement.scrollWidth<=innerWidth,
            closeVisible:visible(close),micVisible:visible(mic),
            controlsScrollable:controls.scrollHeight>controls.clientHeight,
            dialogFits:document.querySelector('[role="dialog"]').getBoundingClientRect().height<=innerHeight+1};
        })()`);
        assert.ok(result.bothVisible && result.noHorizontalOverflow && result.closeVisible && result.dialogFits,
          `${width}x${height}: ${JSON.stringify(result)}`);
        return result;
      };
      const initial = await check();
      assert.ok(initial.latestVisible && initial.micVisible && initial.controlsScrollable,
        `${width}x${height} initial: ${JSON.stringify(initial)}`);
      // Auxiliary details must scroll in their own panel, not move captions away.
      await page.evaluate("document.querySelector('[aria-label=\"Live session controls\"] details').open=true;true");
      await check();
      await page.evaluate("document.querySelector('[aria-label=\"Live session controls\"]').scrollTop=10000;true");
      await check();
      await page.evaluate("window.updateCaption('Updated reply. '.repeat(150)+'NEW REPLY');window.updateTranscript('Updated speech. '.repeat(150)+'NEW SPEECH');true");
      await page.wait("document.getElementById('malvi-user-transcript').textContent.endsWith('NEW SPEECH')");
      await page.wait("[document.getElementById('malvi-spoken-transcript'),document.getElementById('malvi-user-transcript')].every(el=>el.scrollHeight-el.clientHeight-el.scrollTop<3)");
      assert.ok((await check()).latestVisible);
      // Caption absence should not suppress the user's recognition, or vice versa.
      await page.evaluate("window.updateCaption('');true");
      await page.wait("!document.querySelector('[aria-label=\"Live subtitles\"]')");
      assert.ok(await page.evaluate("document.getElementById('malvi-user-transcript').getBoundingClientRect().bottom<=innerHeight"));
      await page.evaluate("window.updateCaption('Malvi response');window.updateTranscript('');true");
      await page.wait("!document.getElementById('malvi-user-transcript')");
      assert.ok(await page.evaluate("document.getElementById('malvi-spoken-transcript').getBoundingClientRect().bottom<=innerHeight"));
      await page.evaluate("window.changePhase('connecting');true");
      await page.wait("!document.querySelector('[aria-label=\"Conversation subtitles\"]')");
      assert.ok(await page.evaluate("!!document.querySelector('[aria-label=\"Session status and feedback\"]')"));
      await page.evaluate('window.showProviderFailure();true');
      await page.wait("!!document.querySelector('[role=\"alert\"]')");
      assert.equal(await page.evaluate("!!document.querySelector('[aria-label=\"Subscribe to Malvi\"]')"), false,
        'provider quota errors must not suggest that buying a plan fixes provider availability');
      await page.evaluate('window.showExhaustion();true');
      await page.wait("!!document.querySelector('[aria-label=\"Subscribe to Malvi\"]')");
      const shortcut = await page.evaluate(`(()=>{
        const button=document.querySelector('[aria-label="Subscribe to Malvi"]');
        const controls=document.querySelector('[aria-label="Live session controls"]');
        const r=button.getBoundingClientRect();
        const f=document.querySelector('[aria-label="Session status and feedback"]').getBoundingClientRect();
        const c=controls.getBoundingClientRect();
        return {height:r.height,visible:r.top>=0&&r.bottom<=innerHeight+1&&r.top>=f.top&&r.bottom<=f.bottom&&r.top>=c.top&&r.bottom<=c.bottom,retry:[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Start a new conversation'))};
      })()`);
      assert.ok(shortcut.visible && shortcut.height>=44 && !shortcut.retry, JSON.stringify(shortcut));
      await page.evaluate("document.querySelector('[aria-label=\"Subscribe to Malvi\"]').click();true");
      await page.wait("!!document.querySelector('#billing-navigation')");
      assert.deepEqual(await page.evaluate("JSON.parse(document.querySelector('#billing-navigation').textContent)"),
        {activeTab:'billing',pending:{subTab:'malvi',purpose:'MALVI_SUBSCRIPTION'},closed:true});
      assert.equal(await page.evaluate("!!document.querySelector('[role=\"dialog\"]')"), false,
        'the live overlay closes so the billing section is accessible');
    }
    console.log(JSON.stringify({ passed: true, viewports: 9, fullOverlay: true, uncroppedPortrait: true, paidProviderRequests: 0 }));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
