import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

const fixture = await build({
  stdin: { contents: `
    import React from 'react';import{createRoot}from'react-dom/client';
    import{MalviInputWorkspace}from'./src/components/malvi/MalviInputWorkspace.tsx';
    window.inputs=[];window.searches=[];window.ipCalls=0;window.gps=[];window.stops=0;
    window.clipboardText='';window.rejectCopy=false;window.micDenied=false;window.deferMic=false;
    window.recordChunks=0;
    const NativeRecorder=window.MediaRecorder;
    window.MediaRecorder=class extends NativeRecorder{
      constructor(stream,options){super(stream,options);this.addEventListener('dataavailable',event=>{if(event.data.size)window.recordChunks++});}
    };
    window.setShow=null;window.fixtureErrors=[];window.pending=[];window.delayInput=false;
    window.addEventListener('error',e=>window.fixtureErrors.push(e.message));
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{
      if(window.rejectCopy)throw Error('denied');window.clipboardText=text;
    }},configurable:true});
    Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(ok,bad)=>window.gps.push({ok,bad})},configurable:true});
    const getAudio=async()=>{
      const ctx=new AudioContext();await ctx.resume();const tone=ctx.createOscillator();
      const target=ctx.createMediaStreamDestination();tone.connect(target);tone.start();
      const stream=target.stream;for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{window.stops++;stop();tone.stop();ctx.close().catch(()=>{});};}
      return stream;
    };
    Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{
      if(window.micDenied)throw new DOMException('Permission denied','NotAllowedError');
      const stream=await getAudio();if(window.deferMic)return new Promise(resolve=>{window.resolveMic=()=>resolve(stream)});return stream;
    }},configurable:true});
    const realFetch=window.fetch.bind(window);
    window.fetch=async(url,opts={})=>{
      if(String(url).startsWith('https://ipwho.is/')){window.ipCalls++;return new Response(JSON.stringify({success:true,latitude:5.5,longitude:-0.1,city:'Approximate city',country:'Ghana'}));}
      if(url==='/api/assistant/input'){
        const request={body:JSON.parse(opts.body),signal:opts.signal};window.inputs.push(request);
        const answer=()=>new Response(JSON.stringify({success:true,answer:'A distinct copyable answer for '+request.body.prompt,
          limitations:['Fixture: provider inference was not called.'],processed:request.body.attachment?{name:request.body.attachment.name,kind:request.body.attachment.mimeType.split('/')[0]}:undefined}));
        if(window.delayInput)return new Promise(resolve=>window.pending.push(()=>resolve(answer())));
        return answer();
      }
      if(url==='/api/assistant/media/research'){
        const body=JSON.parse(opts.body);window.searches.push(body);const video=body.kind==='videos';
        return new Response(JSON.stringify({success:true,items:[{kind:video?'video':'image',title:'Licensed fixture asset',
          mimeType:video?'video/webm':'image/png',url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/fixture.'+(video?'webm':'png'),
          sourceUrl:'https://commons.wikimedia.org/wiki/File:Fixture',attribution:'Fixture author',license:'CC BY 4.0'}],limitation:'Public Commons fixture only.'}));
      }
      return realFetch(url,opts);
    };
    function App(){const[show,setShow]=React.useState(true);window.setShow=setShow;return show?<MalviInputWorkspace language="en"/>:<p>Workspace closed</p>}
    createRoot(document.getElementById('root')).render(<App/>);
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, platform: 'browser', format: 'iife', write: false,
  plugins: [{ name: 'fixture-auth', setup(b) {
    b.onResolve({ filter: /\/authClient$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: "export const authClient={getToken:()=> 'fixture-only-token'};" }));
  } }],
});
const assets = await fs.readdir('dist/assets');
const css = await fs.readFile(`dist/assets/${assets.find(name => name.endsWith('.css'))}`, 'utf8');
const server = http.createServer((req, res) => {
  if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(fixture.outputFiles[0].text); }
  else if (req.url === '/fixture.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
  else res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser, page;
try {
  browser = await launchBrowser();
  page = await browser.page(`http://127.0.0.1:${server.address().port}/`);
  const click = async text => {
    const point = await page.evaluate(`(()=>{
      const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)}));
      button.scrollIntoView({block:'center'});const r=button.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};
    })()`);
    await page.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await page.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  const fill = async (selector, text) => {
    await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();true`);
    await page.command('Input.insertText', { text });
  };
  const upload = (name, type, bytes) => page.evaluate(`(()=>{
    const file=new File([new Uint8Array(${JSON.stringify(bytes)})],${JSON.stringify(name)},{type:${JSON.stringify(type)}});
    const transfer=new DataTransfer();transfer.items.add(file);const input=document.querySelector('input[type="file"]');
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;
  })()`);
  await page.wait(`!!document.querySelector('#malvi-input-prompt')`);
  assert.equal(await page.evaluate('window.inputs.length+window.searches.length+window.ipCalls+window.gps.length'), 0);
  await fill('#malvi-workspace-media-query', 'Accra architecture');
  await click('Images');
  await page.wait('window.searches.length===1');
  await page.wait(`document.body.innerText.includes('CC BY 4.0')`);
  assert.equal(await page.evaluate('window.inputs.length'), 0);
  assert.equal(await page.evaluate(`document.querySelector('video')?.autoplay||false`), false);

  await fill('input[placeholder="City, address, or place"]', 'Tema & airport');
  await fill('input[placeholder="Enter an origin"]', 'Accra');
  const maps = new URL(await page.evaluate(`[...document.querySelectorAll('a')].find(a=>a.textContent.includes('Driving directions')).href`));
  assert.equal(maps.hostname, 'www.google.com');
  assert.equal(maps.searchParams.get('destination'), 'Tema & airport');
  assert.equal(maps.searchParams.get('origin'), 'Accra');

  await click('GPS');
  await page.wait('window.gps.length===1');
  await page.evaluate(`window.gps[0].bad({code:1,PERMISSION_DENIED:1,TIMEOUT:3});true`);
  await page.wait(`document.body.innerText.toLowerCase().includes('permission')`);
  assert.equal(await page.evaluate('window.inputs.length'), 0);
  await click('GPS');
  await page.wait('window.gps.length===2');
  await page.evaluate(`window.gps[1].ok({coords:{latitude:5.6037,longitude:-0.187,accuracy:12}});true`);
  await page.wait(`document.body.innerText.includes('GPS location ready')`);
  // A manually entered origin must never be silently replaced by shared GPS.
  const gpsMaps = new URL(await page.evaluate(`[...document.querySelectorAll('a')].find(a=>a.textContent.includes('Driving directions')).href`));
  assert.equal(gpsMaps.searchParams.get('origin'), 'Accra');
  await click('Remove location');
  await click('IP');
  await page.wait('window.ipCalls===1');
  await page.wait(`document.body.innerText.includes('Approximate IP location ready')`);
  const ipMaps = new URL(await page.evaluate(`[...document.querySelectorAll('a')].find(a=>a.textContent.includes('Driving directions')).href`));
  assert.equal(ipMaps.searchParams.get('origin'), 'Accra');
  await click('Remove location');

  await fill('#malvi-input-prompt', 'Review my notes');
  await upload('notes.txt', 'text/plain', [...Buffer.from('A real local text attachment')]);
  assert.equal(await page.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Send to AI')).disabled`), true);
  await page.evaluate(`document.querySelector('input[type="checkbox"]').click();true`);
  await click('Send to AI');
  await page.wait('window.inputs.length===1');
  await page.wait(`!!document.querySelector('section[aria-label="Malvi answer"] textarea')`);
  assert.equal(await page.evaluate('window.inputs[0].body.consent'), true);
  assert.equal(await page.evaluate('window.inputs[0].body.attachment.mimeType'), 'text/plain');
  assert.equal(await page.evaluate('atob(window.inputs[0].body.attachment.data)'), 'A real local text attachment');
  assert.equal(await page.evaluate('window.inputs[0].body.location===undefined'), true);
  await click('Copy answer');
  await page.wait(`window.clipboardText.includes('Review my notes')`);
  await page.evaluate('window.rejectCopy=true;true');
  await click('Copied');
  await page.wait(`document.body.innerText.includes('manually')||document.body.innerText.includes('selected')`);
  assert.equal(await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), true);
  await fs.mkdir('generated-artifacts', { recursive: true });
  await page.screenshot('generated-artifacts/malvi-workspace-mobile.jpg');

  await click('Reset workspace');
  await page.evaluate('window.delayInput=true;true');
  await fill('#malvi-input-prompt', 'Ignore my cancelled request');
  await page.evaluate(`document.querySelector('input[type="checkbox"]').click();true`);
  await click('Send to AI');
  await page.wait('window.pending.length===1');
  await click('Cancel request');
  assert.equal(await page.evaluate('window.inputs[1].signal.aborted'), true);
  await page.evaluate('window.pending.shift()();true');
  await page.wait(`![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Send to AI')).disabled`);
  assert.equal(await page.evaluate(`!!document.querySelector('section[aria-label="Malvi answer"]')`), false);
  await click('Reset workspace');

  await page.evaluate('window.micDenied=true;true');
  await click('Record voice');
  await page.wait(`!!document.querySelector('[role="alert"]')`);
  await page.evaluate('window.micDenied=false;true');
  await click('Record voice');
  await page.wait(`document.body.innerText.includes('Stop ·')`);
  await page.wait('window.recordChunks>0');
  await click('Stop ·');
  await page.wait(`document.body.innerText.includes('malvi-recording.wav')`);
  assert.equal(await page.evaluate('window.stops>=1'), true);
  assert.equal(await page.evaluate(`!!document.querySelector('audio[controls]')`), true);
  await click('Reset workspace');
  await page.evaluate('window.deferMic=true;true');
  await click('Record voice');
  await page.wait(`typeof window.resolveMic==='function'`);
  await click('Reset workspace');
  const before = await page.evaluate('window.stops');
  await page.evaluate('window.resolveMic();true');
  await page.wait(`window.stops>${before}`);
  assert.equal(await page.evaluate(`document.body.innerText.includes('Stop ·')`), false);

  await page.evaluate('window.setShow(false);true');
  await page.wait(`document.body.innerText.includes('Workspace closed')`);
  assert.deepEqual(await page.evaluate('window.fixtureErrors'), []);
  console.log(JSON.stringify({ realComponents: true, mobile: true, explicitConsent: true, copyAndFallback: true,
    noAutomaticGpsIpOrAi: true, mediaBeforeInference: true, mapsEncoded: true, gpsAndIpSeparated: true,
    cancelledReplyDiscarded: true, realMediaRecorderToWav: true, lateMicStopped: true, paidCalls: false }));
} catch (error) {
  if (page) console.error(await page.evaluate('JSON.stringify({text:document.body.innerText,errors:window.fixtureErrors})'));
  throw error;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
