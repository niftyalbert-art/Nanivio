// Browser checks for the shared presentation layer. No application data or auth bypass.
import assert from 'node:assert/strict';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

const response = await fetch(`${process.env.NANIVIO_TEST_URL || 'http://127.0.0.1:5000'}/src/index.css?direct`);
assert.ok(response.ok);
const css = await response.text();
const browser = await launchBrowser();
try {
  const page = await browser.page('about:blank');
  const { frameTree } = await page.command('Page.getFrameTree');
  const samples = [
    ['contacts', 'bg-[#0c1424] border border-slate-800 text-slate-300'],
    ['settings', 'bg-[#0b1424] border border-slate-700 text-slate-400'],
    ['billing', 'bg-slate-900 border border-slate-800 text-white'],
    ['account', 'bg-white border border-slate-200 text-slate-900'],
    ['legacy-green', 'bg-emerald-50 border border-emerald-200 text-emerald-800'],
    ['services', 'bg-[#080d1a] border border-slate-700 text-white'],
    ['admin', 'bg-slate-800 border border-slate-700 text-slate-300'],
  ];
  await page.command('Page.setDocumentContent', {
    frameId: frameTree.frame.id,
    html: `<html><head><style>${css}</style></head><body>
      <div class="nanivio-app nv-theme-dark">
        ${samples.map(([id, classes]) => `<section id="${id}" class="${classes}">Presentation fixture</section>`).join('')}
        <button id="primary-green" class="bg-emerald-600 text-white">Continue</button>
        <button id="primary-blue" class="bg-blue-600 text-white">Continue</button>
        <button id="danger" class="bg-red-600 text-white">End call</button>
        <span id="success" class="text-emerald-400">Verified</span>
        <div id="overlay" class="backdrop-blur-md bg-black/80">Dialog overlay</div>
        <img id="media" alt="Isolated media fixture" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='20' height='20' fill='red'/%3E%3C/svg%3E">
      </div>
      <div class="nanivio-auth"><button id="auth-primary" class="bg-emerald-600 text-white">Sign in</button></div>
    </body></html>`,
  });
  const result = await page.evaluate(`(()=>{
    const style=id=>{const s=getComputedStyle(document.getElementById(id));
      return {background:s.backgroundColor,color:s.color,backgroundImage:s.backgroundImage,
        filter:s.filter,backdrop:s.backdropFilter};};
    const root=getComputedStyle(document.querySelector('.nv-theme-dark'));
    return {gold:root.getPropertyValue('--nv-gold').trim(),text:root.getPropertyValue('--nv-text').trim(),
      probes:Object.fromEntries(${JSON.stringify(samples.map(([id]) => id))}.map(id=>[id,style(id)])),
      green:style('primary-green'),blue:style('primary-blue'),auth:style('auth-primary'),
      danger:style('danger'),success:style('success'),overlay:style('overlay'),media:style('media')};
  })()`);
  assert.equal(result.gold, '#e2bb62', 'Shared action gold must match Calls');
  assert.equal(result.text, '#f4f1e9', 'Shared white text must match Calls');
  const gold = 'rgb(226, 187, 98)';
  for (const [destination, probe] of Object.entries(result.probes)) {
    const rgb = probe.background.match(/\d+/g)?.map(Number);
    assert.ok(rgb && Math.max(...rgb.slice(0, 3)) < 65, `${destination} retained a bright or coloured legacy surface: ${probe.background}`);
    assert.equal(probe.backgroundImage, 'none', `${destination} retained a competing gradient`);
  }
  for (const [name, button] of Object.entries({ green: result.green, blue: result.blue, auth: result.auth })) {
    assert.equal(button.background, gold, `${name} primary action does not match Calls`);
    assert.notEqual(button.color, 'rgb(255, 255, 255)', 'Gold buttons need dark readable text');
  }
  assert.notEqual(result.danger.background, gold, 'Destructive action lost its distinct colour');
  assert.notEqual(result.success.color, gold, 'Verified status lost its distinct colour');
  assert.equal(result.overlay.backdrop, 'none', 'Blurred overlays must not return');
  assert.equal(result.media.filter, 'none', 'The theme must not recolour shared media');
  console.log(JSON.stringify({ sharedCallsPalette: true, themedLegacySurfaces: Object.keys(result.probes), semanticStatesDistinct: true, mediaUnfiltered: true }, null, 2));
} finally {
  await browser.close();
}
