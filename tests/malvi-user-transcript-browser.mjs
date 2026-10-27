import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Actual React component and production CSS, without a paid speech session.
const assets = await readdir('dist/assets');
const css = (await Promise.all(assets.filter(name => name.endsWith('.css')).map(name => readFile(`dist/assets/${name}`, 'utf8')))).join('\n');
const bundle = await build({
  stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {MalviUserTranscript} from './src/components/malvi/MalviUserTranscript';
    function Fixture(){
      const [text,setText]=useState('Recognized speech. '.repeat(140)+'LATEST WORDS');
      window.updateTranscript=setText;
      return <main className="flex min-h-[100dvh] flex-col justify-end p-4">
        <MalviUserTranscript text={text}/>
        <button className="min-h-12">Turn microphone off</button>
      </main>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  ` },
  bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
});
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html');
  res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : req.url === '/style.css' ? css :
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchBrowser();
try {
  for (const [width, height] of [[360,640], [390,844], [844,390], [1440,900]]) {
    const page = await browser.page(`http://127.0.0.1:${server.address().port}`);
    await page.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 900 });
    await page.wait("!!document.querySelector('[aria-label=\"Your recognized speech\"]')");
    const metrics = () => page.evaluate(`(()=>{
      const box=document.getElementById('malvi-user-transcript');
      const rect=box.getBoundingClientRect();
      return {height:box.clientHeight, overflow:box.scrollHeight>box.clientHeight,
        latestVisible:box.scrollHeight-box.clientHeight-box.scrollTop<3,
        fits:rect.left>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight,
        wraps:box.scrollWidth<=box.clientWidth,
        pageFits:document.documentElement.scrollWidth<=innerWidth};
    })()`);
    const collapsed = await metrics();
    assert.ok(collapsed.overflow && collapsed.latestVisible && collapsed.fits && collapsed.pageFits);
    await page.evaluate("document.querySelector('[aria-controls=\"malvi-user-transcript\"]').click();true");
    await page.wait("document.querySelector('[aria-expanded=\"true\"]')!==null");
    const expanded = await metrics();
    assert.ok(expanded.height > collapsed.height && expanded.fits);
    await page.evaluate("new Promise(resolve=>{document.getElementById('malvi-user-transcript').scrollTop=0;requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)));})");
    await page.wait("document.getElementById('malvi-user-transcript').scrollTop===0");
    await page.evaluate("window.updateTranscript('Earlier words. '.repeat(250)+'NEW END');true");
    await page.wait("document.getElementById('malvi-user-transcript').textContent.endsWith('NEW END')");
    assert.equal(await page.evaluate("document.getElementById('malvi-user-transcript').scrollTop"), 0, 'Do not pull the reader away from earlier text');
    await page.evaluate("window.updateTranscript('x'.repeat(600));true");
    await page.wait("document.getElementById('malvi-user-transcript').textContent.length===600");
    assert.ok((await metrics()).wraps, 'Long uninterrupted recognition text must wrap');
  }
  console.log(JSON.stringify({ passed: true, viewports: 4, paidProviderRequests: 0 }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
