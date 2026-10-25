import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Isolated real components with fake APIs and synthetic media. No production
// auth changes, paid AI calls, actual user camera or real account data.
const bundle = await build({
  stdin: { loader:'tsx',resolveDir:process.cwd(),contents:`
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {MalviContinuityControls} from './src/components/malvi/MalviContinuityControls';
    import {MalviLiveOverlay} from './src/components/malvi/MalviLiveOverlay';
    window.calls=[];window.enabled=false;window.deleted=false;window.stopped=0;window.pendingCamera=null;
    window.confirm=()=>true;
    window.fetch=async(path,options={})=>{
      const body=options.body?JSON.parse(options.body):{};
      window.calls.push({path,method:options.method||'GET',body});
      if(String(path).includes('/memory')){
        if(options.method==='PUT')window.enabled=body.enabled;
        if(options.method==='DELETE'){window.enabled=false;window.deleted=true;}
        return new Response(JSON.stringify({success:true,enabled:window.enabled,hasPrevious:window.enabled,messages:window.enabled?[{id:'own',role:'user',text:'OUR SAVED BLUE BICYCLE',created_at:'2026-10-24'}]:[]}));
      }
      if(String(path).includes('/research'))return new Response(JSON.stringify({
        success:true,answer:'A public research answer.',verified:true,checkedAt:'2026-10-24T12:00:00Z',
        results:[{source:'Web',title:'Example source',url:'https://example.com',caveat:'Public evidence only'}],
        citations:[{text:'A supported claim.',urls:['https://example.com']}],
        searchSuggestions:'<script>parent.injected=true</script><a href="https://example.com">Search suggestions</a>',
        limitation:'No private social access.'
      }));
      if(String(path).includes('/vision'))return new Response(JSON.stringify({success:true}));
      throw Error('Unexpected fixture request');
    };
    const syntheticStream=()=>{
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
      canvas.getContext('2d').fillRect(0,0,640,480);
      const stream=canvas.captureStream(10);
      const track=stream.getVideoTracks()[0],stop=track.stop.bind(track);
      track.stop=()=>{window.stopped++;stop();};
      return stream;
    };
    navigator.mediaDevices.getUserMedia=async()=>{
      if(window.deferCamera)return new Promise(resolve=>window.pendingCamera=()=>resolve(syntheticStream()));
      return syntheticStream();
    };
    function Fixture(){
      const [overlay,setOverlay]=useState(false),[session,setSession]=useState('11111111-1111-4111-8111-111111111111');
      window.openOverlay=()=>setOverlay(true);window.closeOverlay=()=>setOverlay(false);window.changeSession=()=>setSession('22222222-2222-4222-8222-222222222222');
      return <><MalviContinuityControls/>{overlay&&<MalviLiveOverlay activeSessionId={session} videoRef={{current:null}} onVideoElement={()=>{}} phase="connected" error={null} secondsRemaining={60} onClose={()=>setOverlay(false)} onInterrupt={()=>{}} onPlayAudio={()=>{}} audioBlocked={false} brainReady={true} microphoneOn={false} microphoneError="" brainProvider="gemini" onToggleMicrophone={()=>{}} references={[]} referenceStatus="idle" unavailableSources={[]}/>}</>;
    }
    createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);
  `},
  bundle:true,platform:'browser',format:'iife',write:false,
  loader:{'.png':'dataurl'},
  define:{'process.env.NODE_ENV':'"development"'},
  plugins:[{name:'fixture-auth',setup(build){
    build.onResolve({filter:/\/authClient$/},()=>({path:'auth',namespace:'fixture'}));
    build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const authClient={getToken:()=> 'test-only-token'};"}));
  }}],
});
const assets = await fs.readdir('dist/assets');
const css = await fs.readFile(`dist/assets/${assets.find(name=>name.endsWith('.css'))}`,'utf8');
const server = http.createServer((req,res)=>{
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}
  else if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(css);}
  else res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.page(`http://127.0.0.1:${server.address().port}/`);
  await page.wait(`!!document.querySelector('[role="switch"]:not(:disabled)')`);
  await page.evaluate(`document.querySelector('[role="switch"]').click();true`);
  await page.wait('window.enabled===true');
  await page.wait(`document.body.innerText.includes('Future text and voice transcripts will be saved')`);
  // Inspect account history using the real control, not synthetic state setters.
  await page.evaluate(`[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-expanded')==='false').click();true`);
  await page.wait(`document.body.innerText.includes('OUR SAVED BLUE BICYCLE')`);
  await page.evaluate(`document.querySelector('[role="switch"]').click();true`);
  await page.wait('window.enabled===false');
  await page.wait(`![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Delete saved history')).disabled`);
  await page.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Delete saved history')).click();true`);
  await page.wait('window.deleted===true');

  // Research form may be in an initially closed details section.
  await page.evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true);true`);
  await page.evaluate(`document.querySelector('textarea').focus();true`);
  await page.command('Input.insertText',{text:'NASA public missions'});
  await page.evaluate(`document.querySelector('textarea').closest('form').requestSubmit();true`);
  await page.wait(`document.body.innerText.includes('A public research answer.')`);
  assert.equal(await page.evaluate(`!!window.injected`),false);
  assert.equal(await page.evaluate(`document.querySelector('iframe').sandbox.contains('allow-scripts')`),false);
  assert.equal(await page.evaluate(`document.querySelector('iframe').sandbox.contains('allow-same-origin')`),false);
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth<=window.innerWidth+1`),true);

  await page.evaluate('window.openOverlay();true');
  await page.wait(`!!document.querySelector('[role="dialog"]')`);
  await page.evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true);true`);
  const cameraButton = `[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Allow camera preview'))`;
  await page.evaluate(`${cameraButton}.click();true`);
  await page.wait(`!![...document.querySelectorAll('video')].find(v=>v.srcObject)`);
  assert.equal(await page.evaluate(`window.calls.some(c=>c.path.includes('/vision'))`),false);
  await page.wait(`![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Share this view')).disabled`);
  await page.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Share this view')).click();true`);
  await page.wait(`window.calls.some(c=>c.path.includes('/vision'))`);
  assert.equal(await page.evaluate(`window.calls.find(c=>c.path.includes('/vision')).body.consent`),true);
  await page.evaluate('window.closeOverlay();true');
  await page.wait('window.stopped>=1');

  // A late permission result from an old session must stop its track.
  await page.evaluate('window.deferCamera=true;window.openOverlay();true');
  await page.wait(`!!document.querySelector('[role="dialog"]')`);
  await page.evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true);${cameraButton}.click();true`);
  await page.wait('typeof window.pendingCamera==="function"');
  await page.evaluate('window.changeSession();true');
  await page.evaluate('window.pendingCamera();true');
  await page.wait('window.stopped>=2');
  assert.equal(await page.evaluate(`!![...document.querySelectorAll('video')].find(v=>v.srcObject)`),false);
  console.log(JSON.stringify({mobileControls:true,consent:true,deleteWhileDisabled:true,research:true,sandboxedSuggestions:true,snapshotExplicit:true,cameraStopped:true,staleCameraStopped:true,paidCalls:false}));
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
