import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Public presentation only: never submits recovery, signs in or sends email.
const origin = process.env.AUTH_DESIGN_TEST_ORIGIN || (process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://127.0.0.1:5000');
const output = 'generated-artifacts/password-recovery-presentation';
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const heading = `Array.from(document.querySelectorAll('h3')).find(e=>e.textContent.trim()==='Nanivio Account Recovery')`;
const modal = `(${heading})?.closest('.rounded-3xl')`;
const results = [];
try {
  for (const [width, height] of [[390, 844], [1280, 900]]) {
    const page = await browser.page(origin);
    await page.command('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 600,
    });
    await page.wait("!!(document.querySelector('#input-signin-password')||document.querySelector('.nl-signin'))");
    await page.evaluate("document.querySelector('.nl-signin')?.click();true");
    await page.wait("!!document.querySelector('#input-signin-password')");
    const open = `Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Forgot Password?').click();true`;
    await page.evaluate(open);
    await page.wait(`!!(${heading})`);
    assert.equal(await page.evaluate(`${modal}.querySelector('button[type="submit"]').textContent.trim()`), 'Send recovery link');
    assert.equal(await page.evaluate(`!!${modal}.querySelector('button[aria-label="Cancel"][type="button"] svg[aria-hidden="true"]')`), true);
    assert.equal(await page.evaluate(`${modal}.querySelector('button[aria-label="Cancel"]').textContent.trim()`), '');
    assert.equal(await page.evaluate(`!!${modal}.querySelector('form button[type="submit"]')`), true);
    assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
    await new Promise(resolve => setTimeout(resolve, 350));
    const { data } = await page.command('Page.captureScreenshot', { format: 'png' });
    await writeFile(`${output}/popup-${width}.png`, Buffer.from(data, 'base64'));
    await page.evaluate(`${modal}.querySelector('button[aria-label="Cancel"]').click();true`);
    await page.wait(`!(${heading})`);
    await page.evaluate(open);
    await page.wait(`!!(${heading})`);
    assert.equal(await page.evaluate(`${modal}.querySelector('button[type="submit"]').textContent.trim()`), 'Send recovery link');
    results.push({ width, height, label: true, closeIcon: true, closesAndReopens: true, noHorizontalOverflow: true });
  }
  await writeFile(`${output}/report.json`, JSON.stringify({ passed: true, results, recoveryFormsSubmitted: 0 }, null, 2));
  console.log(JSON.stringify({ passed: true, results, recoveryFormsSubmitted: 0 }));
} finally {
  await browser.close();
}
