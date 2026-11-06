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
    window.show=(screen)=>{
      root.unmount();root=createRoot(document.getElementById('fixture'));
      root.render(screen==='malvi'?<MalviLiveOverlay videoRef={{current:null}}
        onVideoElement={node=>{if(node)node.poster=MALVI_PROFILE;}} phase="connected" error={null}
        secondsRemaining={180} allowanceSecondsRemaining={180} onClose={()=>{window.__ended=(window.__ended||0)+1;}}
        onInterrupt={()=>{}} onPlayAudio={()=>{}} audioBlocked={false}
        caption="Hello. How can I help you today?" userTranscript="Please explain Nanivio."
        brainReady microphoneOn microphoneError="" brainProvider="gemini"
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
      const aside=document.querySelector('.malvi-live-stage + aside').getBoundingClientRect();
      const header=document.querySelector('.malvi-live-video-details > header').getBoundingClientRect();
      const timer=document.querySelector('.malvi-live-video-details .font-mono').getBoundingClientRect();
      return {width:stage.width,height:stage.height,bottom:stage.bottom,asideTop:aside.top,
        top:stage.top,headerTop:header.top,timerTop:timer.top,availableWidth:scroller.clientWidth,
        asideLeft:aside.left,right:stage.right,scroll:document.documentElement.scrollWidth,viewport:innerWidth,
        fit:getComputedStyle(document.querySelector('.malvi-live-avatar-video')).objectFit};
    })()`);
    assert.ok(layout.width>=layout.availableWidth-1,`Portrait stage spans the scroll viewport width at ${width}x${height}: ${JSON.stringify(layout)}`);
    assert.ok(layout.height>=height*0.9-1,`Video stage covers at least 90% of ${width}x${height}`);
    assert.ok(Math.abs(layout.top)<=1,'Portrait stage starts at the top of the viewport');
    assert.ok(layout.bottom<=layout.asideTop+1,'Entire captions and controls aside is below portrait');
    assert.ok(layout.bottom<=layout.headerTop+1,'Malvi identity, timer, and end control are below portrait');
    assert.ok(layout.bottom<=layout.timerTop+1,'Idle timer is below portrait');
    assert.ok(layout.scroll<=layout.viewport+1,'No horizontal overflow');
    assert.equal(layout.fit,'cover','Portrait fills the video stage without letterboxing or stretching');

    const reachable=await page.evaluate(`(()=>{
      const scroller=document.querySelector('.malvi-live-video-dialog');
      const controls=['[aria-label="End session and close"]','[aria-label="Conversation controls"] button'];
      return controls.map(selector=>{
        const node=document.querySelector(selector);
        node.scrollIntoView({block:'center'});
        const rect=node.getBoundingClientRect();
        return rect.top>=0 && rect.bottom<=innerHeight;
      });
    })()`);
    assert.deepEqual(reachable,[true,true],`End and microphone controls are reachable by scrolling at ${width}x${height}`);
    if(width===390){
      await page.evaluate(`document.querySelector('.malvi-live-video-dialog').scrollTop=0`);
      await page.screenshot('generated-artifacts/malvi-size-mobile.png');
    }
    console.log(JSON.stringify({viewport:`${width}x${height}`,stageWidth:layout.width,stageHeight:layout.height,fit:layout.fit,passed:true}));
  }
  await page.evaluate(`document.querySelector('[aria-label="End session and close"]').click()`);
  assert.equal(await page.evaluate('window.__ended'),1,'End session button invokes the close handler');
  await page.evaluate(`document.querySelector('[aria-label="Conversation controls"] button').click()`);
  assert.equal(await page.evaluate('window.__micToggles'),1,'Microphone control invokes its handler');
  console.log('Calling tabs, contact action handler, and Malvi responsive presentation passed.');
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
