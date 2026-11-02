// Owner-approved, one short actual renderer check. No application account,
// allowance changes, brain session or microphone capture. Tokens remain only
// in process/browser memory and are never logged or saved.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { launchBrowser } from './live-call-checks/cdp.mjs';
import { liveAvatarRequest } from '../src/server/assistant/liveAvatarService';
const missing = ['HEYGEN_API_KEY', 'AVATAR_ID'].filter(name => !process.env[name]);
if (missing.length) {
  console.log(JSON.stringify({ success: false, blocked: 'avatar_configuration_missing', missing, providerSessionStarted: false }));
} else {
  let sessionId: string | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  let server: ReturnType<typeof createServer> | undefined;
  try {
    const info = await liveAvatarRequest('/v1/sessions/token', {
      mode: 'LITE', avatar_id: process.env.AVATAR_ID, video_settings: { quality: 'medium', encoding: 'H264' }, max_session_duration: 30,
    });
    sessionId = info.session_id;
    const bundle = await build({
      stdin: { contents: `
        import {LiveAvatarSession,SessionEvent} from '@heygen/liveavatar-web-sdk';
        window.__avatarProbe={ready:false,videoFrames:0,audioTracks:0,failed:false};
        const info=await(await fetch('/session')).json();
        const session=new LiveAvatarSession(info.token,{autoKeepAlive:false,voiceChat:{defaultMuted:true}});
        window.__stopAvatar=()=>session.stop();
        const video=document.querySelector('video');
        session.on(SessionEvent.SESSION_STREAM_READY,()=>{session.attach(video);window.__avatarProbe.ready=true;});
        try{
          await session.start();session.attach(video);
          setTimeout(()=>{const stream=video.srcObject;window.__avatarProbe.videoFrames=video.getVideoPlaybackQuality?.().totalVideoFrames||0;window.__avatarProbe.audioTracks=stream?.getAudioTracks().length||0;window.__avatarProbe.videoTracks=stream?.getVideoTracks().length||0;window.__avatarProbe.checked=true;},5000);
        }catch{window.__avatarProbe.failed=true;window.__avatarProbe.checked=true;}`,
        loader: 'js', resolveDir: process.cwd() },
      bundle: true, write: false, format: 'esm', define: { 'process.env.NODE_ENV': '"production"' },
    });
    server = createServer((req, res) => {
      if (req.url === '/session') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ token: info.session_token })); }
      if (req.url === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); return res.end(bundle.outputFiles[0].text); }
      res.setHeader('content-type', 'text/html');
      res.end('<video muted autoplay playsinline></video><script type="module" src="/bundle.js"></script>');
    });
    await new Promise<void>(r => server!.listen(0, '127.0.0.1', r));
    browser = await launchBrowser();
    const page = await browser.page(`http://127.0.0.1:${(server.address() as any).port}/`);
    await page.wait('window.__avatarProbe?.checked===true', 22000);
    const result = await page.evaluate('window.__avatarProbe');
    console.log(JSON.stringify({ success: result.ready && result.videoFrames > 0, actualNetwork: true,
      providerSessionStarted: true, renderedVideoFrames: result.videoFrames, attachedVideoTracks: result.videoTracks,
      attachedAudioTracks: result.audioTracks, microphoneUsed: false, lipSyncVerified: false, sharedRtcPublishingVerified: false }));
    await page.evaluate('window.__stopAvatar?.().then(()=>true).catch(()=>false)');
  } catch {
    console.log(JSON.stringify({ success: false, providerSessionStarted: Boolean(sessionId), error: 'The brief avatar startup check could not complete.', credentialsLogged: false }));
  } finally {
    await browser?.close();
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (sessionId) await liveAvatarRequest('/v1/sessions/stop', { session_id: sessionId, reason: 'USER_CLOSED' }).catch(() => {
      console.log(JSON.stringify({ cleanupConfirmed: false, providerHardLimitSeconds: 30 }));
    });
  }
}
