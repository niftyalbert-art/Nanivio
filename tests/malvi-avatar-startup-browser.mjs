import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Real browser decoding, with no provider/network credits or fake frame callback.
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'js', contents: `
    import { MalviAvatarStartup } from './src/lib/malviAvatarStartup';
    try {
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=480;
      const video=document.querySelector('video'),stream=canvas.captureStream(0);
      video.srcObject=stream;
      const presented=new Promise(resolve=>video.requestVideoFrameCallback(resolve));
      const playing=video.play();
      canvas.getContext('2d').fillRect(0,0,320,480);
      stream.getVideoTracks()[0].requestFrame();
      await playing;await presented;
      // No further frames are requested. Startup must recognize the presented
      // frame rather than waiting indefinitely for another callback.
      const result=window.__result={ready:false,checked:false,frames:video.getVideoPlaybackQuality().totalVideoFrames};
      const startup=new MalviAvatarStartup(()=>{result.ready=true;result.checked=true;},()=>{result.checked=true;},1000);
      startup.observe(video);startup.started();
      stream.getTracks().forEach(track=>track.stop());
    } catch { window.__result={ready:false,checked:true,error:true}; }
  ` },
  bundle: true, write: false, format: 'esm',
});
const server = createServer((req, res) => {
  if (req.url === '/bundle.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(bundle.outputFiles[0].text);
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end('<video muted autoplay playsinline width="320" height="480"></video><script type="module" src="/bundle.js"></script>');
  }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await launchBrowser();
  const page = await browser.page(`http://127.0.0.1:${server.address().port}/`);
  await page.wait('window.__result?.checked===true', 8000);
  const result = await page.evaluate('window.__result');
  assert.ok(result.frames > 0, 'Real browser must decode a frame');
  assert.equal(result.ready, true, 'An already-playing idle frame must satisfy startup');
  console.log('PASS: real decoded idle video satisfies startup without waiting for another frame; no provider credits used.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
