// Isolated real-component presentation check. No login bypass or provider calls.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

const result = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {CommunicationSpaceView} from './src/components/calls/CommunicationSpaceView';
    import {MalviLiveOverlay} from './src/components/malvi/MalviLiveOverlay';
    import {MALVI_PROFILE} from './src/lib/malviIdentity';
    const peer={id:'fixture-peer',name:'Sample contact',initials:'SC',myLanguage:'ar',nvId:'NV123456'};
    const values={currentUser:{id:'fixture-self',name:'Sample user',myLanguage:'en'},authUser:{id:'fixture-self'},
      contacts:[peer],experts:[],conversations:[],messages:{},adminFeatures:{},
      callLogs:[{id:'sample-call',participantId:peer.id,participantName:peer.name,
        participantNvId:peer.nvId,type:'audio',direction:'incoming',status:'missed',timestamp:Date.now(),duration:0}],
      start1on1Call:(_peer,type)=>{window.__action=type;},
      startDirectChatWithUser:()=>{window.__action='chat';return 'sample-chat';},
      clearCallLogs:()=>{},setActiveTab:()=>{},setActiveConversationId:()=>{}};
    window.__fixtureContext=new Proxy(values,{get:(target,key)=>key in target?target[key]:(()=>{})});
    let root=createRoot(document.getElementById('fixture'));
     window.show=(screen,options={})=>{
      root.unmount();root=createRoot(document.getElementById('fixture'));
        root.render(screen==='malvi'?<MalviLiveOverlay videoRef={{current:null}}
          onVideoElement={node=>{if(node)node.poster=MALVI_PROFILE;}} error={options.error??null}
          secondsRemaining={180} allowanceSecondsRemaining={options.allowance===undefined?180:options.allowance}
          allowanceUnavailable={options.unavailable??false} languageCode={options.languageCode??'en'}
          onOpenBilling={options.billing===false?undefined:()=>{window.__billing=(window.__billing||0)+1;}}
          phase={options.phase||'connected'}
          onClose={()=>{window.__ended=(window.__ended||0)+1;}}
          onSubscribe={options.subscribe===false?undefined:()=>{window.__subscribed=(window.__subscribed||0)+1;}}
          onRetry={()=>{window.__retried=(window.__retried||0)+1;}}
        onInterrupt={()=>{}} onPlayAudio={()=>{}} audioBlocked={false}
        caption="Hello. How can I help you today?" userTranscript="Please explain Nanivio."
         brainReady={options.brainReady??true} microphoneOn={options.microphoneOn??false} microphoneError="" brainProvider="gemini"
        onToggleMicrophone={()=>{window.__micToggles=(window.__micToggles||0)+1;}} references={[]} referenceStatus="" unavailableSources={[]}/>
        :<div className="nanivio-app nv-theme-dark"><CommunicationSpaceView/></div>);
    };
    window.show('calls');
  ` },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  loader: { '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'fixture-context', setup(builder) {
    builder.onResolve({filter:/context\/NanivioContext$/},()=>({path:'context',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useNanivio=()=>window.__fixtureContext;',loader:'js'}));
  }}],
});
const cssName = (await readdir('dist/assets')).find(name=>name.endsWith('.css'));
const css = await readFile(`dist/assets/${cssName}`, 'utf8');
const server = createServer((_req,res)=>{
  res.setHeader('Content-Type','text/html');
  res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="margin:0;background:#101214"><div id="fixture"></div><script>${result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script></body></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser = await launchBrowser();
try {
  const page = await browser.page(`http://127.0.0.1:${server.address().port}`);
  await page.wait('!!document.querySelector(".nv-call-tabs")');
  await mkdir('generated-artifacts',{recursive:true});
  const colours=await page.evaluate(`Array.from(document.querySelectorAll('.nv-call-tabs button svg')).map(node=>getComputedStyle(node).color)`);
  assert.equal(new Set(colours).size,5,'Each calling tab has a distinct accent');
  for(const label of ['Recent','Contacts','Keypad','Groups','Specialists']){
    await page.evaluate(`Array.from(document.querySelectorAll('.nv-call-tabs button')).find(node=>node.textContent.includes(${JSON.stringify(label)})).click()`);
    await page.wait(`Array.from(document.querySelectorAll('.nv-call-tabs button.is-active')).some(node=>node.textContent.includes(${JSON.stringify(label)}))`);
    assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,`${label} fits mobile width`);
    if(label==='Contacts'){
      const actions=await page.evaluate(`Array.from(document.querySelectorAll('.nv-specialists-list article > button')).map(node=>getComputedStyle(node).backgroundColor)`);
      assert.equal(new Set(actions).size,3,'Contact audio/video/chat actions are distinct');
      await page.evaluate(`document.querySelector('[aria-label="Audio call Sample contact"]').click()`);
      assert.equal(await page.evaluate('window.__action'),'audio');
      await page.screenshot('generated-artifacts/calls-colours-mobile.png');
    }
  }
  await page.evaluate(`window.show('malvi')`);
  await page.wait('!!document.querySelector(".malvi-live-stage")');
  for(const [width,height] of [[390,844],[360,640],[844,390],[1366,900]]){
    await page.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<640});
     const layout=await page.evaluate(`(()=>{
      const scroller=document.querySelector('.malvi-live-video-dialog');
      scroller.scrollTop=0;
      const stage=document.querySelector('.malvi-live-stage').getBoundingClientRect();
       const portrait=document.querySelector('.malvi-live-avatar-video').getBoundingClientRect();
       const actions=document.querySelector('.malvi-live-primary-actions').getBoundingClientRect();
       const microphone=document.querySelector('[data-malvi-primary-microphone]').getBoundingClientRect();
       const end=document.querySelector('[aria-label="End session and close"]').getBoundingClientRect();
       const aside=document.querySelector('.malvi-live-video-details').getBoundingClientRect();
      const header=document.querySelector('.malvi-live-video-details > header').getBoundingClientRect();
      const timer=document.querySelector('.malvi-live-video-details .font-mono').getBoundingClientRect();
       return {width:stage.width,height:stage.height,bottom:stage.bottom,asideTop:aside.top,
        top:stage.top,headerTop:header.top,timerTop:timer.top,availableWidth:scroller.clientWidth,
        asideLeft:aside.left,right:stage.right,scroll:document.documentElement.scrollWidth,viewport:innerWidth,
         fit:getComputedStyle(document.querySelector('.malvi-live-avatar-video')).objectFit,
         actionTop:actions.top,actionBottom:actions.bottom,micTop:microphone.top,micBottom:microphone.bottom,
         endTop:end.top,endBottom:end.bottom,portraitBottom:portrait.bottom,actionHeight:actions.height};
    })()`);
    assert.ok(layout.width>=layout.availableWidth-1,`Portrait stage spans the scroll viewport width at ${width}x${height}: ${JSON.stringify(layout)}`);
    assert.ok(layout.height>=Math.min(height*0.9,height-76)-1,`Video stage uses available hero space at ${width}x${height}`);
    assert.ok(Math.abs(layout.top)<=1,'Portrait stage starts at the top of the viewport');
    assert.ok(layout.bottom<=layout.actionTop+1,'Primary action row is directly below the portrait');
    assert.ok(layout.portraitBottom<=layout.actionTop+1,'Primary action row never overlaps the portrait');
    assert.ok(layout.actionBottom<=height+1,'Primary action row is inside the initial viewport without scrolling');
    assert.ok(layout.micTop>=layout.actionTop && layout.micBottom<=height+1,'Microphone button is fully visible initially');
    assert.ok(layout.endTop>=layout.actionTop && layout.endBottom<=height+1,'End-session button is fully visible initially');
    assert.ok(layout.actionBottom<=layout.asideTop+1,'Scrollable metadata starts below primary actions');
    assert.ok(layout.actionHeight>=44,'Primary action row reserves enough height for accessible controls');
    assert.ok(await page.evaluate(`document.querySelector('[data-malvi-primary-microphone]').textContent.includes('Start speaking')`),'Muted microphone action says Start speaking');
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-testid="malvi-stage-reminder"],[data-testid="malvi-stage-subscription"]').length`),0,'Healthy allowance has no stage overlay');
    assert.equal(await page.evaluate(`document.querySelectorAll('.malvi-live-video-details [data-testid="malvi-allowance-notice"]').length`),1,'Healthy timer remains below the image');
    assert.equal(await page.evaluate(`document.querySelectorAll('.malvi-live-video-details [aria-label="End session and close"]').length`),0,'No duplicate end-session control remains in lower video details');
    assert.equal(await page.evaluate(`document.querySelectorAll('.malvi-live-video-details [data-malvi-primary-microphone]').length`),0,'No duplicate microphone control remains in lower video details');
    assert.ok(layout.scroll<=layout.viewport+1,'No horizontal overflow');
    assert.equal(layout.fit,'cover','Portrait fills the video stage without letterboxing or stretching');
    if(width===390){
      await page.screenshot('generated-artifacts/malvi-size-mobile.png');
    }
    console.log(JSON.stringify({viewport:`${width}x${height}`,stageWidth:layout.width,stageHeight:layout.height,fit:layout.fit,passed:true}));
  }
  for (const [width,height] of [[390,844],[360,640],[844,390],[1366,900]]) {
    await page.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<640});
    for (const allowance of [61,null]) {
      await page.evaluate(`window.show('malvi',{allowance:${allowance}})`);
      assert.equal(await page.evaluate(`document.querySelectorAll('[data-testid="malvi-stage-reminder"]').length`),0,'Above-threshold or unknown allowance does not trigger an overlay');
      assert.equal(await page.evaluate(`document.querySelectorAll('.malvi-live-video-details [data-testid="malvi-allowance-notice"]').length`),1,'Above-threshold or unknown allowance remains in the details area');
    }
    for (const [allowance, expected] of [[60,'low'],[30,'urgent'],[0,'exhausted']]) {
      await page.evaluate(`window.show('malvi',{allowance:${allowance}})`);
      await page.wait(`!!document.querySelector('[data-testid="malvi-stage-reminder"]')`);
      const overlay=await page.evaluate(`(()=>{
        const card=document.querySelector('[data-testid="malvi-stage-reminder"]');
        const stage=document.querySelector('.malvi-live-stage').getBoundingClientRect();
        const actions=document.querySelector('.malvi-live-primary-actions').getBoundingClientRect();
        const cardRect=card.getBoundingClientRect();
        return {text:card.textContent,inside:cardRect.top>=stage.top && cardRect.bottom<=stage.bottom,
          stageBottom:stage.bottom,actionsTop:actions.top,actionBottom:actions.bottom,
          actionVisible:actions.bottom<=innerHeight+1,details:document.querySelectorAll('.malvi-live-video-details [data-testid="malvi-allowance-notice"]').length};
      })()`);
      assert.ok(overlay.text.length>0,`${expected} warning has localized content`);
      assert.equal(overlay.inside,true,`${expected} warning fits within video stage at ${width}x${height}`);
      assert.ok(overlay.stageBottom<=overlay.actionsTop+1,`${expected} warning does not overlap primary action row`);
      assert.ok(overlay.actionVisible,`${expected} primary row remains visible at ${width}x${height}`);
      assert.equal(overlay.details,0,`${expected} warning is not duplicated below the image`);
      if(width===390 && allowance===60) await page.screenshot('generated-artifacts/malvi-centred-reminder-mobile.png');
    }
    await page.evaluate(`window.show('malvi',{unavailable:true,allowance:null})`);
    await page.wait(`!!document.querySelector('[data-testid="malvi-stage-reminder"]')`);
    const unavailable=await page.evaluate(`({
      text:document.querySelector('[data-testid="malvi-stage-reminder"]').textContent,
      actionsBottom:document.querySelector('.malvi-live-primary-actions').getBoundingClientRect().bottom,
      details:document.querySelectorAll('.malvi-live-video-details [data-testid="malvi-allowance-notice"]').length
    })`);
    assert.match(unavailable.text,/unavailable/i,'Unavailable allowance is explicitly identified, not shown as zero');
    assert.equal(unavailable.details,0,'Unavailable reminder is not duplicated below');
    assert.ok(unavailable.actionsBottom<=height+1,'Unavailable warning leaves primary controls visible');
    if(width===844){
      await page.evaluate(`window.show('malvi',{unavailable:true,allowance:null,languageCode:'ar'})`);
      await page.wait(`document.querySelector('[data-testid="malvi-stage-reminder"]')?.getAttribute('dir')==='rtl'`);
      const arabic=await page.evaluate(`({
        dir:document.querySelector('[data-testid="malvi-stage-reminder"]').getAttribute('dir'),
        text:document.querySelector('[data-testid="malvi-stage-reminder"]').textContent
      })`);
      assert.equal(arabic.dir,'rtl','Arabic allowance overlay uses RTL direction');
      assert.match(arabic.text,/[\u0600-\u06ff]/,'Arabic allowance overlay uses localized Arabic copy');
    }
    await page.evaluate(`window.show('malvi',{phase:'error',subscribe:true})`);
    await page.wait(`!!document.querySelector('[data-testid="malvi-stage-subscription"]')`);
    const subscription=await page.evaluate(`({
      stage:!!document.querySelector('.malvi-live-stage [role="alert"]'),
      footer:!!document.querySelector('.malvi-live-video-details [role="region"][aria-label="Session status and feedback"]'),
      duplicated:document.querySelectorAll('[data-testid="malvi-stage-subscription"]').length,
      actionsBottom:document.querySelector('.malvi-live-primary-actions').getBoundingClientRect().bottom,
      details:document.querySelectorAll('.malvi-live-video-details [data-testid="malvi-allowance-notice"]').length
    })`);
    assert.equal(subscription.stage,true,'Subscription-required error is announced in the stage');
    assert.equal(subscription.footer,false,'Subscription prompt is not duplicated in the footer');
    assert.equal(subscription.duplicated,1,'Subscription prompt appears exactly once');
    assert.equal(subscription.details,0,'Subscription error does not retain allowance notice below');
    assert.ok(subscription.actionsBottom<=height+1,'Subscription prompt leaves primary row visible');
    const subscriptionsBefore = await page.evaluate('window.__subscribed||0');
    await page.evaluate(`document.querySelector('[data-testid="malvi-stage-subscription"] button').click()`);
    assert.equal(await page.evaluate('window.__subscribed'),subscriptionsBefore+1,'Centered subscription CTA invokes the existing callback');
    await page.evaluate(`window.show('malvi',{phase:'error',subscribe:false,error:'network failure'})`);
    assert.ok(await page.evaluate(`document.querySelector('.malvi-live-video-details [role="alert"]')?.textContent.includes('couldn’t connect')`),'Ordinary connection error remains in the lower status presentation');
    const retriesBefore = await page.evaluate('window.__retried||0');
    await page.evaluate(`document.querySelector('.malvi-live-video-details [role="alert"] button')?.click()`);
    assert.equal(await page.evaluate('window.__retried'),retriesBefore+1,'Ordinary error retry callback remains available');
  }
   await page.evaluate(`window.show('malvi')`);
   await page.wait(`!!document.querySelector('[data-malvi-primary-microphone]:not(:disabled)')`);
   await page.evaluate(`document.querySelector('[data-malvi-primary-microphone]').click()`);
   assert.equal(await page.evaluate('window.__micToggles'),1,'Primary Start speaking button invokes the microphone toggle handler');
   await page.evaluate(`window.show('malvi',{microphoneOn:true})`);
   await page.wait(`document.querySelector('[data-malvi-primary-microphone]')?.textContent.includes('Pause microphone')`);
   await page.evaluate(`document.querySelector('[data-malvi-primary-microphone]').click()`);
   assert.equal(await page.evaluate('window.__micToggles'),2,'Active microphone control invokes the same toggle handler to pause capture');
   await page.evaluate(`document.querySelector('[aria-label="End session and close"]').click()`);
  assert.equal(await page.evaluate('window.__ended'),1,'End session button invokes the close handler');
   await page.evaluate(`window.show('malvi',{phase:'connecting',brainReady:false,microphoneOn:false})`);
   await page.wait(`document.querySelector('.malvi-live-video-dialog')?.textContent.includes('Joining your conversation')`);
   const startup=await page.evaluate(`({
     microphoneDisabled:document.querySelector('[data-malvi-primary-microphone]').disabled,
     microphoneLabel:document.querySelector('[data-malvi-primary-microphone]').textContent.trim(),
     endDisabled:document.querySelector('[aria-label="End session and close"]').disabled,
     actionsBottom:document.querySelector('.malvi-live-primary-actions').getBoundingClientRect().bottom,
     viewportHeight:innerHeight
   })`);
   assert.equal(startup.microphoneDisabled,true,'Microphone remains disabled until the brain and session are ready');
   assert.match(startup.microphoneLabel,/Start speaking/,'Disabled startup control still clearly names the action');
   assert.equal(startup.endDisabled,false,'End session remains available during startup');
   assert.ok(startup.actionsBottom<=startup.viewportHeight,'Both startup actions remain within the initial viewport');
  console.log('Calling tabs, contact action handler, and Malvi responsive presentation passed.');
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
