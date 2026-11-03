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
async function chooseAccount(page, mode) {
  await page.evaluate(`(()=>{
    const choice=document.getElementById('select-auth-account-type');
    choice.value=${JSON.stringify(mode)};
    choice.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`);
  await page.wait(`document.getElementById('select-auth-account-type').value===${JSON.stringify(mode)}`);
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
    assert.equal(await page.evaluate("document.getElementById('input-signin-identifier').autocomplete"), 'username');
    assert.equal(await page.evaluate("document.getElementById('input-signin-password').autocomplete"), 'current-password');
    assert.equal(await page.evaluate("document.querySelectorAll('#select-auth-account-type').length"), 1);
    assert.equal(await page.evaluate("!!document.querySelector('.auth-tabs')"), false);
    assert.ok(await page.evaluate("!!document.querySelector('img[src=\"/brand/nanivio-emblem.png\"]')"));
    assert.equal(await page.evaluate("!!document.querySelector('.auth-folded-mark')"), false);
    assert.ok(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    for(const provider of ['google','apple']){
      assert.ok(await page.evaluate(`!!document.getElementById('btn-${provider}-signin')`));
    }
    await screenshot(page, `generated-artifacts/auth-design/signin-${width}.png`);

    await page.evaluate("document.getElementById('btn-auth-signup').click();true");
    await page.wait("!!document.getElementById('input-personal-firstname')");
    for (const id of ['input-personal-firstname','input-personal-lastname',
      'input-personal-email','input-personal-phone','input-personal-password',
      'input-personal-password-confirm','select-personal-lang','personal-country-selector']) {
      assert.ok(await page.evaluate(`!!document.getElementById(${JSON.stringify(id)})`), id);
    }
    assert.ok(await page.evaluate("document.body.innerText.includes('Verify your email')"));
    assert.ok(await page.evaluate("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Send email code')&&b.disabled)"));
    assert.equal(await page.evaluate("document.getElementById('input-personal-email').autocomplete"), 'email');
    assert.equal(await page.evaluate("document.getElementById('input-personal-password').autocomplete"), 'new-password');
    assert.ok(await page.evaluate(`(()=>{
      const panel=document.querySelector('.auth-panel').getBoundingClientRect();
      return Array.from(document.querySelectorAll('.auth-panel input,.auth-panel select')).every(input=>{
        const r=input.getBoundingClientRect();
        return r.left>=panel.left&&r.right<=panel.right;
      });
    })()`), 'registration fields must fit inside the card without clipping');
    await page.evaluate(`(()=>{
      const email=document.getElementById('input-personal-email');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(email,'preferred@example.test');
      email.dispatchEvent(new Event('input',{bubbles:true}));
      return true;
    })()`);
    await page.wait("document.getElementById('input-personal-email').value==='preferred@example.test'");
    await chooseAccount(page, 'signin');
    await chooseAccount(page, 'personal');
    assert.equal(await page.evaluate("document.getElementById('input-personal-email').value"), 'preferred@example.test');
    await page.evaluate(`(()=>{
      const email=document.getElementById('input-personal-email');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(email,'');
      email.dispatchEvent(new Event('input',{bubbles:true}));
      return true;
    })()`);
    assert.ok(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    await screenshot(page, `generated-artifacts/auth-design/signup-${width}.png`);
    for (const tab of ['expert','business','signin']) {
      await chooseAccount(page, tab);
      assert.ok(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
      if(tab!=='signin') assert.ok(await page.evaluate("Array.from(document.querySelectorAll('input[type=\"email\"]')).every(e=>e.autocomplete==='email'&&!e.readOnly)"));
    }
  }
  console.log(JSON.stringify({ passed:true, viewports:2, signIn:true,
    registrationFields:true, singleAccountChooser:true, emailAutofillHints:true,
    preferredEmailEditable:true, officialLogo:true, emailVerificationGuard:true,
    socialButtons:true, signUpLink:true,
    realAccountRequests:0, screenshots:'generated-artifacts/auth-design' }));
} finally {
  await browser.close();
}
