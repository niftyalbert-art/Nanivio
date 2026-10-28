// Run against the running development app; never signs in or spends provider credits.
import assert from 'node:assert/strict';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

const origin = process.env.LANDING_TEST_URL || (process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://127.0.0.1:5000');
const browser = await launchBrowser();
try {
  const page = await browser.page(origin);
  await page.wait("Boolean(document.querySelector('.nanivio-landing h1'))");
  for (const [width, height] of [[360, 800], [390, 844], [768, 1024], [1440, 1000]]) {
    await page.command('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 768,
    });
    assert.ok(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), `${width}: no horizontal overflow`);
    assert.equal(await page.evaluate(`Array.from(document.querySelectorAll('.nanivio-landing a[href^="#"]'))
      .every(a=>!!document.getElementById(a.hash.slice(1)))`), true, 'every anchor has a destination');
    assert.equal(await page.evaluate("Array.from(document.images).filter(i=>i.complete && i.naturalWidth===0).length"), 0);
  }
  await page.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.evaluate("document.querySelector('.nl-menu-toggle').click()");
  assert.equal(await page.evaluate("document.querySelector('.nl-menu-toggle').getAttribute('aria-expanded')"), 'true');
  await page.evaluate("document.querySelector('.nl-nav a[href=\"#malvi\"]').click()");
  assert.equal(await page.evaluate("document.querySelector('.nl-menu-toggle').getAttribute('aria-expanded')"), 'false');
  await page.evaluate("document.querySelectorAll('.nl-faq-item button')[1].click()");
  assert.equal(await page.evaluate("document.querySelectorAll('.nl-faq-item button')[1].getAttribute('aria-expanded')"), 'true');
  await page.evaluate("document.querySelector('.nl-hero-actions button').click()");
  await page.wait("Boolean(document.querySelector('.nanivio-auth'))");
  assert.ok(await page.evaluate("document.body.innerText.includes('Create Personal') || document.body.innerText.includes('Full Name') || document.body.innerText.includes('Full name')"), 'get started opens existing signup');
  await page.evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Back to Nanivio')).click()");
  await page.wait("Boolean(document.querySelector('.nanivio-landing'))");
  await page.evaluate("document.querySelector('.nl-signin').click()");
  await page.wait("Boolean(document.querySelector('input[type=\"password\"]'))");
  assert.ok(await page.evaluate("document.body.innerText.includes('Sign In to Nanivio')"), 'sign in opens existing login');
  await page.command('Page.navigate', { url: origin + '/admin' });
  await page.wait("Boolean(document.querySelector('.nanivio-auth'))");
  assert.equal(await page.evaluate("Boolean(document.querySelector('.nanivio-landing'))"), false, 'admin gateway remains separate');
  console.log(JSON.stringify({ passed: true, viewports: 4, anchorNavigation: true, mobileMenu: true, faq: true, signup: true, signIn: true, adminGatewayPreserved: true }));
} finally {
  await browser.close();
}
