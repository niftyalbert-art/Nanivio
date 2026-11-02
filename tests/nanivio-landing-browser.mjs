// Run against the running development app; never signs in or spends provider credits.
import assert from 'node:assert/strict';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

const origin = process.env.LANDING_TEST_URL || (process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://127.0.0.1:5000');
const browser = await launchBrowser();
try {
  const page = await browser.page(origin);
  await page.wait("Boolean(document.querySelector('.nanivio-art-landing h1'))");
  for (const [width, height] of [[360, 800], [390, 844], [768, 1024], [1440, 1000]]) {
    await page.command('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 768,
    });
    assert.ok(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), `${width}: no horizontal overflow`);
    assert.equal(await page.evaluate(`Array.from(document.querySelectorAll('.nanivio-art-landing a[href^="#"]'))
      .every(a=>!!document.getElementById(a.hash.slice(1)))`), true, 'every anchor has a destination');
    assert.equal(await page.evaluate("Array.from(document.images).filter(i=>i.complete && i.naturalWidth===0).length"), 0);
    assert.ok(await page.evaluate(`document.querySelector('.nanivio-art-landing').innerText.trim().split(/\\s+/).length <= 90`), `${width}: artwork leads, not long copy`);
    assert.ok(await page.evaluate('document.documentElement.scrollHeight <= 1700'), `${width}: no long promotional scroll`);
    assert.equal(await page.evaluate("document.querySelectorAll('.nl-faq-item').length"), 0, 'long FAQ removed intentionally');
    assert.ok(await page.evaluate("parseFloat(getComputedStyle(document.querySelector('.nanivio-art-landing h1')).fontSize) <= 40"), `${width}: heading is not oversized`);
    assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.nanivio-art-landing h1')).textTransform !== 'uppercase'"), true, 'heading is not all caps');
    assert.equal(await page.evaluate("document.querySelectorAll('.nl-message').length"), 0, 'sample chat replaced by geometric artwork');
  }
  await page.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.evaluate("document.querySelector('.nl-menu-toggle').click()");
  assert.equal(await page.evaluate("document.querySelector('.nl-menu-toggle').getAttribute('aria-expanded')"), 'true');
  await page.evaluate("document.querySelector('.nl-nav a[href=\"#experience\"]').click()");
  assert.equal(await page.evaluate("document.querySelector('.nl-menu-toggle').getAttribute('aria-expanded')"), 'false');
  await page.evaluate("document.querySelector('.nl-hero-actions button').click()");
  await page.wait("Boolean(document.querySelector('.nanivio-auth input[type=\"email\"]')) && document.querySelectorAll('.nanivio-auth input[type=\"password\"]').length === 2");
  assert.equal(await page.evaluate("document.querySelectorAll('.nanivio-auth input[type=\"password\"]').length"), 2, 'get started opens signup with password confirmation');
  await page.evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Back to Nanivio')).click()");
  await page.wait("Boolean(document.querySelector('.nanivio-art-landing'))");
  await page.evaluate("document.querySelector('.nl-signin').click()");
  await page.wait("document.querySelectorAll('.nanivio-auth input[type=\"password\"]').length === 1 && !document.querySelector('.nanivio-auth input[type=\"email\"]')");
  assert.equal(await page.evaluate("document.querySelectorAll('.nanivio-auth input[type=\"password\"]').length"), 1, 'sign in opens the existing login rather than signup');
  await page.command('Page.navigate', { url: origin + '/admin' });
  await page.wait("Boolean(document.querySelector('.nanivio-auth'))");
  assert.equal(await page.evaluate("Boolean(document.querySelector('.nanivio-art-landing'))"), false, 'admin gateway remains separate');
  console.log(JSON.stringify({ passed: true, viewports: 4, conciseCopy: true, compactPage: true, smallSentenceCaseHeading: true, anchorNavigation: true, mobileMenu: true, signup: true, signIn: true, adminGatewayPreserved: true }));
} finally {
  await browser.close();
}
