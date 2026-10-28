// Actual navbar/launcher; isolated context, no sign-in bypass or provider calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'tsx',
    contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {Navbar} from './src/components/Navbar.tsx';
      import {MalviFloatingWidget} from './src/components/malvi/MalviFloatingWidget.tsx';
      window.__tab=location.search.includes('home')?'home':'chat';
      function App(){
        return <div className="nanivio-app nv-theme-dark flex h-[100dvh] flex-col">
          <Navbar/>
          <main className="flex min-h-0 flex-1 flex-col pb-[72px]">
            <div className="min-h-0 flex-1 overflow-auto">Chat message space</div>
            <form className="flex shrink-0 gap-2 p-3" onSubmit={e=>e.preventDefault()}>
              <textarea aria-label="Message" className="min-h-11 min-w-0 flex-1"/>
              <button type="submit" className="min-h-11 px-4">Send</button>
            </form>
          </main>
          <nav aria-label="Bottom navigation fixture" className="fixed bottom-0 z-40 h-[72px] w-full">Navigation</nav>
          <MalviFloatingWidget/>
        </div>;
      }
      createRoot(document.getElementById('root')).render(<App/>);
    `,
  },
  bundle: true, write: false, platform: 'browser', format: 'esm', logLevel: 'silent',
  loader: { '.png': 'dataurl', '.jpg': 'dataurl' },
  plugins: [{
    name: 'launcher-fixture',
    setup(b) {
      b.onResolve({ filter: /context\/NanivioContext$/ }, () => ({ path: 'context', namespace: 'fixture' }));
      b.onResolve({ filter: /common\/PWAInstallButton$/ }, () => ({ path: 'install', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
        loader: 'js',
        contents: path === 'install'
          ? 'export const PWAInstallButton=()=>null;'
          : `export const useNanivio=()=>({
            activeTab:window.__tab||'chat',setActiveTab:tab=>{window.__selectedTab=tab;},
            adminFeatures:{malviAiAssistantEnabled:!location.search.includes('disabled'),maintenanceMode:false},
            myLanguage:'en',setIsLanguageModalOpen:()=>{},globalLangpretationEnabled:false,
            setGlobalLangpretationEnabled:()=>{},currentUser:{initials:'T',name:'Test'}
          });`,
      }));
    },
  }],
});
const cssFile = (await fs.readdir('dist/assets')).find(f => f.endsWith('.css'));
const css = await fs.readFile('dist/assets/' + cssFile, 'utf8');
const app = express();
app.get('/bundle.js', (_q, r) => r.type('js').send(bundle.outputFiles[0].text));
app.get('/style.css', (_q, r) => r.type('css').send(css));
app.use((_q, r) => r.type('html').send(`<!doctype html><html><head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="/style.css"></head><body style="margin:0">
  <div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const browser = await launchBrowser();
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.page(origin);
  await page.wait("Boolean(document.querySelector('[aria-label=\"Open Malvi\"]'))");
  for (const [width, height] of [[360, 800], [390, 844], [768, 900], [1440, 900], [390, 400]]) {
    await page.command('Emulation.setDeviceMetricsOverride', {
      width, height, mobile: width < 768, deviceScaleFactor: 1,
    });
    const geometry = await page.evaluate(`(()=>{
      const buttons=document.querySelectorAll('[aria-label="Open Malvi"]');
      const b=buttons[0],t=document.querySelector('textarea'),s=document.querySelector('button[type=submit]');
      const r=b.getBoundingClientRect(),q=t.getBoundingClientRect(),u=s.getBoundingClientRect();
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      const thit=document.elementFromPoint(q.x+q.width/2,q.y+q.height/2);
      const overlaps=x=>r.left<x.right&&r.right>x.left&&r.top<x.bottom&&r.bottom>x.top;
      return {count:buttons.length,inHeader:!!b.closest('header'),clickable:b===hit||b.contains(hit),
        typingClickable:t===thit,overlaps:overlaps(q)||overlaps(u),height:r.height,width:r.width};
    })()`);
    assert.equal(geometry.count, 1, `${width}: one launcher, not duplicate floating buttons`);
    assert.equal(geometry.inHeader, true);
    assert.equal(geometry.overlaps, false, `${width}: launcher never covers composer/send`);
    assert.equal(geometry.clickable, true, `${width}: launcher receives pointer events`);
    assert.equal(geometry.typingClickable, true, `${width}: composer receives pointer events`);
    assert.ok(geometry.height >= 44 && geometry.width >= 44, 'accessible touch target');
    await page.evaluate("document.querySelector('textarea').focus()");
    await page.command('Input.insertText', { text: 'Test message' });
    assert.ok(await page.evaluate("document.querySelector('textarea').value.includes('Test message')"));
  }
  const point = await page.evaluate(`(()=>{
    const r=document.querySelector('[aria-label="Open Malvi"]').getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2};
  })()`);
  await page.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await page.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  assert.equal(await page.evaluate('window.__selectedTab'), 'malvi');
  await page.command('Page.navigate', { url: origin + '/?home' });
  await page.wait("Boolean(document.querySelector('[aria-label=\"Open Malvi\"]'))");
  await page.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, mobile: false, deviceScaleFactor: 1 });
  assert.equal(await page.evaluate(`(()=>{
    const b=document.querySelector('[aria-label="Open Malvi"]'),r=b.getBoundingClientRect();
    const n=document.querySelector('nav').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return r.bottom<=n.top&&(hit===b||b.contains(hit));
  })()`), true, 'desktop floating launcher stays above bottom navigation outside Chat');
  await page.command('Page.navigate', { url: origin + '/?disabled' });
  await page.wait("Boolean(document.querySelector('textarea'))");
  assert.equal(await page.evaluate("document.querySelectorAll('[aria-label=\"Open Malvi\"]').length"), 0);
  console.log(JSON.stringify({ passed: true, viewports: 5, typingClear: true, launcherClick: true, adminDisableRespected: true }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
