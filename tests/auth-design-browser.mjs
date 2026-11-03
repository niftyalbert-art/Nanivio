import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Public UI only: no sign-in bypass, account creation or verification emails.
const origin = process.env.AUTH_DESIGN_TEST_ORIGIN || (process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : 'http://127.0.0.1:5000');
await mkdir('generated-artifacts/auth-design', { recursive: true });
const browser = await launchBrowser();
async function screenshot(page, path) {
  await new Promise(resolve => setTimeout(resolve, 800));
  const { cssContentSize } = await page.command('Page.getLayoutMetrics');
  const { data } = await page.command('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x:0, y:0, width:cssContentSize.width, height:cssContentSize.height, scale:1 },
  });
  await writeFile(path, Buffer.from(data, 'base64'));
}
try {
  for (const [width, height] of [[390,844], [1440,1000]]) {
    const page = await browser.page(origin);
    await page.command('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 600,
    });
    await page.wait("!!document.querySelector('.nl-signin')");
    await page.evaluate("document.querySelector('.nl-signin').click();true");
    await page.wait("!!document.getElementById('input-signin-password')");
    assert.equal(await page.evaluate("document.getElementById('input-signin-password').type"), 'password');
    assert.equal(await page.evaluate("document.getElementById('input-signin-identifier').required"), true);
    assert.ok(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    await screenshot(page, `generated-artifacts/auth-design/signin-${width}.png`);

    await page.evaluate("document.getElementById('tab-auth-personal').click();true");
    await page.wait("!!document.getElementById('input-personal-firstname')");
    for (const id of ['input-personal-firstname','input-personal-lastname',
      'input-personal-email','input-personal-phone','input-personal-password',
      'input-personal-password-confirm','select-personal-lang','personal-country-selector']) {
      assert.ok(await page.evaluate(`!!document.getElementById(${JSON.stringify(id)})`), id);
    }
    assert.ok(await page.evaluate("document.body.innerText.includes('Verify your email')"));
    assert.ok(await page.evaluate("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Send email code')&&b.disabled)"));
    assert.ok(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    await screenshot(page, `generated-artifacts/auth-design/signup-${width}.png`);
    for (const tab of ['expert','business','signin']) {
      await page.evaluate(`document.getElementById('tab-auth-${tab}').click();true`);
      await page.wait(`document.getElementById('tab-auth-${tab}').getAttribute('aria-pressed')==='true'`);
      assert.ok(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    }
  }
  console.log(JSON.stringify({ passed:true, viewports:2, signIn:true,
    registrationFields:true, accountTabs:true, emailVerificationGuard:true,
    realAccountRequests:0, screenshots:'generated-artifacts/auth-design' }));
} finally {
  await browser.close();
}
