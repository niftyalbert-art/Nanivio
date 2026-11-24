// Browser checks for the shared presentation layer. No application data or auth bypass.
import assert from 'node:assert/strict';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';
import { loadPresentationStyles } from '../scripts/live-call-checks/presentation-styles.mjs';

const css = await loadPresentationStyles(process.env.NANIVIO_TEST_URL || 'http://127.0.0.1:5000');
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
    ['chat', 'bg-slate-950 border border-slate-800 text-white'],
    ['malvi', 'bg-[#0c1424] border border-slate-800 text-slate-300'],
    ['nvnumber', 'bg-slate-900 border border-slate-700 text-white'],
    ['ride', 'bg-slate-800 border border-slate-700 text-slate-300'],
    ['calls', 'bg-[#0b1424] border border-slate-800 text-white'],
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
        <span id="warning" class="text-amber-400">Connection warning</span>
        <div id="overlay" class="backdrop-blur-md bg-black/80">Dialog overlay</div>
        <img id="media" alt="Isolated media fixture" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='20' height='20' fill='red'/%3E%3C/svg%3E">
      </div>
      <div class="nanivio-auth"><button id="auth-primary" class="bg-emerald-600 text-white">Sign in</button></div>
    </body></html>`,
  });
  const result = await page.evaluate(`(()=>{
    // CSS Color 4 computed values may be oklch(), not rgb().
    const channels=color=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
      const context=canvas.getContext('2d');context.fillStyle=color;context.fillRect(0,0,1,1);
      return [...context.getImageData(0,0,1,1).data];
    };
    const style=id=>{const s=getComputedStyle(document.getElementById(id));
      return {background:s.backgroundColor,color:s.color,backgroundImage:s.backgroundImage,
        backgroundChannels:channels(s.backgroundColor),foregroundChannels:channels(s.color),
        filter:s.filter,backdrop:s.backdropFilter};};
    const root=getComputedStyle(document.querySelector('.nv-theme-dark'));
    return {gold:root.getPropertyValue('--nv-gold').trim(),text:root.getPropertyValue('--nv-text').trim(),
      probes:Object.fromEntries(${JSON.stringify(samples.map(([id]) => id))}.map(id=>[id,style(id)])),
      green:style('primary-green'),blue:style('primary-blue'),auth:style('auth-primary'),
      danger:style('danger'),success:style('success'),warning:style('warning'),overlay:style('overlay'),media:style('media'),
      base:root.getPropertyValue('--nv-bg').trim()};
  })()`);
  assert.equal(result.base.toLowerCase(), '#090c18', 'All pages need the approved preview’s aurora base');
  assert.ok(result.text, 'The shared readable foreground token must remain available');
  assert.ok(!['#e2bb62', '#e9e1d1'].includes(result.gold.toLowerCase()), 'Compatibility action token must no longer restore the old gold/cream palette');
  const legacyActions = new Set(['rgb(226, 187, 98)', 'rgb(233, 225, 209)', 'rgb(240, 209, 132)']);
  for (const [destination, probe] of Object.entries(result.probes)) {
    const rgb = probe.background.match(/\d+/g)?.map(Number);
    assert.ok(rgb && Math.max(...rgb.slice(0, 3)) < 100, `${destination} retained a bright legacy surface: ${probe.background}`);
  }
  for (const [name, button] of Object.entries({ green: result.green, blue: result.blue, auth: result.auth })) {
    assert.ok(!legacyActions.has(button.background), `${name} primary action retained the old warm palette`);
    assert.notEqual(button.background, result.danger.background, `${name} primary action must remain distinct from ending a call`);
  }
  const danger = result.danger.backgroundChannels;
  assert.ok(danger[0] >= 160 && danger[0] > danger[1] && danger[0] > danger[2], 'Destructive actions must retain a red background');
  assert.notEqual(result.success.color, result.warning.color, 'Success and warning states must remain distinct');
  assert.notEqual(result.success.color, result.probes.billing.color, 'Success status needs a distinct semantic foreground');
  const success = result.success.foregroundChannels;
  const warning = result.warning.foregroundChannels;
  assert.ok(success[1] > success[0] && success[1] > success[2], 'Success should remain green, not become a primary action accent');
  assert.ok(warning[0] >= warning[1] && warning[1] > warning[2], 'Warnings should remain amber, not become a primary action accent');
  assert.equal(result.media.filter, 'none', 'The theme must not recolour shared media');
  console.log(JSON.stringify({ sharedAuroraPalette: true, themedLegacySurfaces: Object.keys(result.probes), semanticStatesDistinct: true, mediaUnfiltered: true }, null, 2));
} finally {
  await browser.close();
}
