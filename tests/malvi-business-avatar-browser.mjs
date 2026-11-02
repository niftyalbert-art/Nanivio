import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';
const entry = `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {BusinessAvatarPublisher} from './src/components/malvi/BusinessAvatarPublisher';
window.__fixture={published:0,left:0,spoken:[],stopped:0,joined:0};
const root=createRoot(document.getElementById('root'));
function Fixture(){
 const [room,setRoom]=useState({id:'fixture-room',ownerId:'fixture-owner',meetingOpen:true,copilotEnabled:true,meetingLanguage:'en',messages:[]});
 window.__reply=()=>setRoom(r=>({...r,messages:[...r.messages,{id:'reply-'+r.messages.length,kind:'assistant',text:'Grounded fixture reply'}]}));
 window.__unmount=()=>root.unmount();
 return <BusinessAvatarPublisher room={room} leaseId="fixture-escrow"/>;
}
root.render(<Fixture/>);`;
const sdk = `
export const SessionEvent={SESSION_STREAM_READY:'ready',SESSION_DISCONNECTED:'disconnected'};
export class MalviLiveAvatarSession{
 constructor(){this.events={};this.ctx=null;}
 on(event,fn){this.events[event]=fn;}
 async start(){const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;
 canvas.getContext('2d').fillRect(0,0,100,100);this.ctx=new AudioContext();
 this.stream=new MediaStream([...canvas.captureStream(10).getVideoTracks(),...this.ctx.createMediaStreamDestination().stream.getAudioTracks()]);
 this.events.ready?.();}
 attach(video){video.srcObject=this.stream;}
 async stop(){window.__fixture.stopped++;this.stream?.getTracks().forEach(t=>t.stop());await this.ctx?.close().catch(()=>{});}
 appendAudio(audio,ended){window.__fixture.spoken.push({bytes:atob(audio).length,ended});}
 interrupt(){}async keepAlive(){}
}`;
const rtc = `
export default{
 createClient:()=>({on(){},async join(){window.__fixture.joined++;},async publish(tracks){window.__fixture.published=tracks.length;},
 async unpublish(){window.__fixture.published=0;},async leave(){window.__fixture.left++;}}),
 createCustomVideoTrack:({mediaStreamTrack})=>({stop(){mediaStreamTrack.stop();},close(){mediaStreamTrack.stop();}}),
 createCustomAudioTrack:({mediaStreamTrack})=>({stop(){mediaStreamTrack.stop();},close(){mediaStreamTrack.stop();}})
};`;
const bundle = await build({
  stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'isolated-media-fixtures', setup(api) {
    api.onResolve({ filter: /agora-rtc-sdk-ng$/ }, () => ({ path: 'rtc', namespace: 'fixture' }));
    api.onResolve({ filter: /(?:@heygen\/liveavatar-web-sdk|malviLiveAvatarSession)$/ }, () => ({ path: 'sdk', namespace: 'fixture' }));
    api.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'rtc' ? rtc : sdk, loader: 'js' }));
  } }],
});
let ends = 0, held = null, hold = false;
function avatar() { return { session: { id: 'fixture-session', sessionToken: 'not-a-real-token', hardDeadline: Date.now()+60000 },
  media: { appId: 'fixture', token: 'fixture', channelName: 'fixture', uid: 42 }, endsAt: Date.now()+60000 }; }
const server = createServer(async (req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); return res.end(bundle.outputFiles[0].text); }
  if (req.url.startsWith('/api/')) {
    for await (const _ of req) {}
    res.setHeader('content-type', 'application/json');
    if (req.url.endsWith('/avatar')) {
      if (hold) { held = res; return; }
      return res.end(JSON.stringify(avatar()));
    }
    if (req.url.endsWith('/avatar/end')) ends++;
    if (req.url.endsWith('/speak')) {
      const wav=Buffer.alloc(2444);wav.write('RIFF');
      return res.end(JSON.stringify({audioBase64:wav.toString('base64'),mimeType:'audio/wav',excerpt:false,nextOffset:null}));
    }
    return res.end('{}');
  }
  res.setHeader('content-type', 'text/html');
  res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/bundle.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await launchBrowser();
try {
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const width of [390,1280]){
    const page=await browser.page(base);
    await page.command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<500});
    await page.wait("!!document.querySelector('button')");
    await page.evaluate("document.querySelector('button').click();true");
    await page.wait('window.__fixture.published===2');
    await page.evaluate('window.__reply();true');
    await page.wait('window.__fixture.spoken.length===1');
    assert.equal(await page.evaluate('window.__fixture.spoken[0].ended'),true);
    assert.equal(await page.evaluate('window.__fixture.spoken[0].bytes'),2400);
    await page.evaluate('window.__reply();true');
    await page.wait('window.__fixture.spoken.length===2');
    await page.evaluate("document.querySelector('button').click();true");
    await page.wait('window.__fixture.left>=1 && window.__fixture.published===0');
  }
  const before=ends;
  hold=true;
  const pending=await browser.page(base);
  await pending.wait("!!document.querySelector('button')");
  await pending.evaluate("document.querySelector('button').click();true");
  for(let n=0;n<100&&!held;n++)await new Promise(r=>setTimeout(r,20));
  assert.ok(held,'expected pending create request');
  await pending.evaluate('window.__unmount();true');
  held.end(JSON.stringify(avatar()));held=null;
  for(let n=0;n<100&&ends===before;n++)await new Promise(r=>setTimeout(r,20));
  assert.ok(ends>before,'unmount must stop even a late paid session response');
  assert.equal(await pending.evaluate('window.__fixture.joined'),0);
  console.log(JSON.stringify({passed:true,viewports:2,publishedSynchronizedAudioAndVideo:true,queuedReplies:true,
    stopCleanup:true,lateCreateCleanup:true,realProviderRequests:0}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
