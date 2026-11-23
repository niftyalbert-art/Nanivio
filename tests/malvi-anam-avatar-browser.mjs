import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Real browser MediaStreams and local adapter, fixture SDK transport only.
// No provider connection, synthesized Malvi speech, human recording or credits.
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    import {MalviAnamAvatarSession} from './src/lib/malviAnamAvatarSession';
    import {authClient} from './src/lib/authClient';
    window.run=async()=>{
      authClient.getToken=()=> 'nanivio-browser-cookie';
      const live=new MalviAnamAvatarSession('fixture-lease','fixture-token');
      let ready=0,closed=0;live.on('ready',()=>ready++);live.on('closed',()=>closed++);
      await live.start();
      const video=document.querySelector('video');live.attach(video);
      if(ready!==1||video.srcObject.getAudioTracks().length!==1||video.srcObject.getVideoTracks().length!==1)
        throw Error('Paired A/V handoff failed');
      live.appendAudio('first',false);live.appendAudio('second',true);
      if(window.fixture.ends!==1||window.fixture.chunks.join(',')!=='first,second')throw Error('Split sequence');
      live.interrupt();
      if(!video.muted||window.fixture.interrupts!==1||window.fixture.ends!==2)throw Error('No immediate local interruption');
      live.appendAudio('next-response',true);
      if(video.muted)throw Error('Fresh output remains muted');
      await live.keepAlive();
      window.fixture.emitClosed();if(closed!==1)throw Error('Connection loss not signalled');
      const tracks=video.srcObject.getTracks();
      await live.stop();
      if(!tracks.every(t=>t.readyState==='ended'))throw Error('Tracks leaked');
      let refused=false;try{live.appendAudio('late',true)}catch{refused=true}
      if(!refused)throw Error('Late output accepted');
      const options=window.fixture.options;
      if(options.disableInputAudio!==true||options.api.retry.maxAttempts!==1||
        options.api.baseUrl!=='/api/assistant/session/fixture-lease/anam'||
        options.metrics.disableClientMetrics!==true)throw Error('Unsafe renderer configuration');
      if(window.fixture.token!=='fixture-token')throw Error('Cookie mode lost its spent renderer token');
      authClient.getToken=()=> 'fixture-nanivio-jwt';
      new MalviAnamAvatarSession('fixture-lease','fixture-token');
      if(window.fixture.token!=='fixture-nanivio-jwt'||
        window.fixture.options.api.baseUrl!=='/api/assistant/session/fixture-lease/anam-bearer')
        throw Error('Existing bearer sign-in cannot authenticate the handoff');
      return {cookieAndBearerHandoff:true,pairedAudioVideo:true,streamedUtterance:true,immediateLocalMute:true,
        lateOutputRefused:true,stoppedTracks:true,providerRequests:0,liveLipSyncVerified:false};
    };` },
  bundle: true, format: 'iife', write: false,
  plugins: [{
    name: 'anam-fixture',
    setup(b) {
      b.onResolve({ filter: /^@anam-ai\/js-sdk$/ }, () => ({ path: 'sdk', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
        export const AnamEvent={CONNECTION_CLOSED:'closed'};
        export function createClient(token,options){
          const listeners={};let streaming=false;
          window.fixture={token,options,chunks:[],ends:0,interrupts:0,emitClosed:()=>listeners.closed?.()};
          return {
            addListener:(event,callback)=>listeners[event]=callback,
            getActiveSessionId:()=>streaming?'fixture-provider':null,isStreaming:()=>streaming,
            async stream(){
              const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
              canvas.getContext('2d').fillRect(0,0,64,64);
              const video=canvas.captureStream(1);
              const context=window.audioContext=new AudioContext(),destination=context.createMediaStreamDestination();
              streaming=true;return [video,destination.stream];
            },
            createAgentAudioInputStream:(config)=>{if(config.sampleRate!==24000||config.channels!==1||
              config.encoding!=='pcm_s16le')throw Error('Voice format changed');
              return{sendAudioChunk:data=>window.fixture.chunks.push(data),endSequence:()=>window.fixture.ends++};},
            interruptPersona:()=>window.fixture.interrupts++,
            async stopStreaming(){streaming=false;await window.audioContext.close();}
          };
        }` }));
    },
  }],
});
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/bundle.js' ? bundle.outputFiles[0].text
    : '<video autoplay playsinline></video><script src="/bundle.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchBrowser();
try {
  const page = await browser.page(`http://127.0.0.1:${server.address().port}`);
  await page.wait('typeof window.run==="function"');
  const result = await page.evaluate('window.run()');
  assert.equal(result.pairedAudioVideo, true);
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
