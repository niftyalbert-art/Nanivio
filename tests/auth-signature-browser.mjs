import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Isolated successful-auth UI fixture, not an authentication bypass in the app.
// Uses the real uploaded media and real signature component; zero paid APIs.
const assets=await readdir('dist/assets');
const css=(await Promise.all(assets.filter(name=>name.endsWith('.css')).map(name=>readFile(`dist/assets/${name}`,'utf8')))).join('\n');
const video=await readFile('attached_assets/7fa9a39190244f62ad3b118c4449b4fe_1792033302425.mp4');
const bundle=await build({
  stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {NanivioCelebrationVideoEffect} from './src/components/common/NanivioCelebrationVideoEffect';
    import {prepareNanivioSignature} from './src/lib/nanivioSignatureMedia';
    window.__warm=prepareNanivioSignature();window.__completed=0;window.__plays=0;
    window.__nativePlay=window.__warm.play.bind(window.__warm);
    window.__warm.play=()=>{window.__plays++;return window.__nativePlay();};
    function Fixture(){
      const[authenticated,setAuthenticated]=useState(false);
      const[mode,setMode]=useState('signin');
      return authenticated?<NanivioCelebrationVideoEffect mode={mode}
        onComplete={()=>{window.__completed++;setAuthenticated(false);}}/>:
        <main style={{padding:24,color:'white'}}>
          <h1>Isolated signature layout fixture</h1>
          <select id="mode" value={mode} onChange={e=>setMode(e.target.value)}><option>signin</option><option>signup</option></select>
          <button id="success" onClick={()=>setAuthenticated(true)} style={{padding:20}}>Simulate successful authentication</button>
        </main>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `},
  bundle:true,write:false,format:'esm',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},
});
const server=createServer((req,res)=>{
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}
  else if(req.url==='/styles.css'){res.setHeader('Content-Type','text/css');res.end(css);}
  else if(req.url?.startsWith('/attached_assets/7fa9a39190244f62ad3b118c4449b4fe_1792033302425.mp4')){
    res.setHeader('Content-Type','video/mp4');res.setHeader('Content-Length',video.length);res.end(video);
  }else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body style="background:#101214"><div id="root"></div><script type="module" src="/app.js"></script></body></html>');}
});
await new Promise(resolve=>server.listen(5201,'127.0.0.1',resolve));
let browser;
try{
  browser=await launchBrowser();
  const page=await browser.page('http://127.0.0.1:5201');
  await page.wait('!!window.__warm && window.__warm.readyState>=1');
  assert.equal(await page.evaluate('window.__plays'),0);
  assert.equal(await page.evaluate('window.__warm.paused'),true);
  assert.equal(await page.evaluate('document.querySelectorAll("video").length'),0);
  const click=async selector=>{
    const point=await page.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await page.command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await page.command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  };
  await click('#success');
  await page.wait('!!document.querySelector("video") && !window.__warm.paused && window.__warm.currentTime>0.05');
  assert.equal(await page.evaluate('document.querySelector("video")===window.__warm'),true);
  assert.equal(await page.evaluate('!window.__warm.muted && window.__warm.volume===1 && !window.__warm.controls && window.__warm.playsInline'),true);
  assert.equal(await page.evaluate('document.querySelectorAll("video").length'),1);
  await page.evaluate('window.__warm.currentTime=window.__warm.duration-0.15');
  await page.wait('window.__completed===1 && !!document.querySelector("#success")');
  // Exercise a genuine play rejection path without weakening browser policy.
  await page.evaluate('window.__warm.play=()=>Promise.reject(new DOMException("Gesture required","NotAllowedError"))');
  await click('#success');
  await page.wait('Array.from(document.querySelectorAll("button")).some(b=>b.textContent.includes("Play Nanivio signature"))');
  assert.equal(await page.evaluate('window.__warm.paused'),true);
  assert.equal(await page.evaluate('window.__warm.muted'),false);
  await page.evaluate('window.__warm.play=window.__nativePlay');
  await click('button');
  await page.wait('!window.__warm.paused && window.__warm.currentTime>0.05');
  await page.evaluate('window.__warm.currentTime=window.__warm.duration-0.15');
  await page.wait('window.__completed===2 && !!document.querySelector("#success")');
  console.log(JSON.stringify({passed:true,reusedPreparedVideo:true,preAuthPlayback:false,soundEnabled:true,blockedPlaybackRequiresGesture:true,completionCount:2,paidProviderRequests:0}));
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
