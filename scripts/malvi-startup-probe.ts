// One owner-approved, bounded renderer session. No user account, microphone,
// brain session or allowance changes; credentials stay in process memory.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { launchBrowser } from './live-call-checks/cdp.mjs';
import { liveAvatarRequest } from '../src/server/assistant/liveAvatarService';

async function main() {
  if (!process.env.HEYGEN_API_KEY || !process.env.AVATAR_ID) {
    console.log(JSON.stringify({ success: false, blocked: 'avatar_configuration_missing', providerSessionStarted: false }));
    return;
  }
  let sessionId: string | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  let server: ReturnType<typeof createServer> | undefined;
  try {
    const info = await liveAvatarRequest('/v1/sessions/token', {
      mode: 'LITE', avatar_id: process.env.AVATAR_ID,
      video_settings: { quality: 'high', encoding: 'H264' }, max_session_duration: 30,
    });
    sessionId = info.session_id;
    const bundle = await build({
      stdin: { contents: `
        import { SessionEvent } from '@heygen/liveavatar-web-sdk';
        import { MalviLiveAvatarSession } from './src/lib/malviLiveAvatarSession';
        import { MalviAvatarStartup } from './src/lib/malviAvatarStartup';
        import { playMalviAvatar } from './src/lib/malviAvatarPlayback';
        const p=window.__probe={success:false,checked:false,streamReady:false,sdkStarted:false,playBlocked:false};
        const t=performance.now(),video=document.querySelector('video');
        const stats=()=>{p.elapsedMs=Math.round(performance.now()-t);p.frames=video.getVideoPlaybackQuality?.().totalVideoFrames||0;p.width=video.videoWidth;p.height=video.videoHeight;p.readyState=video.readyState;p.paused=video.paused;p.muted=video.muted;p.videoTracks=video.srcObject?.getVideoTracks().length||0;p.audioTracks=video.srcObject?.getAudioTracks().length||0;};
        const startup=new MalviAvatarStartup(()=>{stats();p.success=true;p.checked=true;},()=>{stats();p.failure='playout_deadline';p.checked=true;});
        const {token}=await(await fetch('/session')).json();
        const live=new MalviLiveAvatarSession(token,{autoKeepAlive:false,voiceChat:{defaultMuted:true}});
        live.voiceChat.start=async()=>{};
        window.__stop=async()=>{startup.cancel();await live.stop();};
        live.on(SessionEvent.SESSION_STREAM_READY,()=>{
          p.streamReady=true;p.streamReadyMs=Math.round(performance.now()-t);
          live.attach(video);startup.observe(video);
          void playMalviAvatar(video).catch(()=>{p.playBlocked=true;});
        });
        live.on(SessionEvent.SESSION_DISCONNECTED,()=>{if(!p.checked){stats();p.failure='disconnected';p.checked=true;}});
        try{await live.start();p.sdkStarted=true;await live.voiceChat.stop();startup.started();}
        catch{if(!p.checked){stats();p.failure='sdk_start_failed';p.checked=true;startup.cancel();}}
      `, loader: 'js', resolveDir: process.cwd() },
      bundle: true, write: false, format: 'esm', define: { 'process.env.NODE_ENV': '"production"' },
    });
    server = createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (req.url === '/session') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ token: info.session_token })); }
      else if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
      else { res.setHeader('Content-Type', 'text/html'); res.end('<video autoplay playsinline></video><script type="module" src="/bundle.js"></script>'); }
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    browser = await launchBrowser();
    const page = await browser.page(`http://127.0.0.1:${(server.address() as any).port}/`);
    await page.wait('window.__probe?.checked===true', 25_000);
    console.log(JSON.stringify({ actualProvider: true, microphoneUsed: false, ...await page.evaluate('window.__probe') }));
    await page.evaluate('window.__stop().then(()=>true).catch(()=>false)');
  } catch {
    console.log(JSON.stringify({ success: false, providerTokenIssued: Boolean(sessionId), error: 'Bounded startup probe could not complete; no credentials logged.' }));
  } finally {
    await browser?.close();
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (sessionId) await liveAvatarRequest('/v1/sessions/stop', { session_id: sessionId, reason: 'USER_CLOSED' }).catch(() => {
      console.log(JSON.stringify({ cleanupConfirmed: false, providerHardLimitSeconds: 30 }));
    });
  }
}
void main();
