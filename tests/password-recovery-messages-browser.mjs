import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// All recovery submissions are browser-local fixtures. No real emails or resets.
const origin = process.env.AUTH_DESIGN_TEST_ORIGIN || 'http://127.0.0.1:5000';
const output = 'generated-artifacts/password-recovery-messages';
const cases = [
  { name: 'registered', status: 200, message: 'Your email address is registered with Nanivio. Check your inbox or spam folder for a password reset link. Open the newest link in the same browser you used to request it.' },
  { name: 'unknown', status: 404, message: 'This email address is not registered with Nanivio. Please enter your registered email address or create an account.' },
  { name: 'malformed', status: 400, message: 'Please enter a valid email address.' },
  { name: 'inactive', status: 403, message: 'This email address is registered, but password recovery is unavailable for this account. Please contact Nanivio support.' },
  { name: 'delivery-unconfirmed', status: 503, message: 'We couldn’t confirm sending your password reset link. Please try again shortly.' },
  { name: 'rate-limited', status: 429, message: 'Too many recovery attempts. Please try again later.' },
];
const interception = `(() => {
  const realFetch = window.fetch.bind(window);
  window.__recoverySubmissions = 0;
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url.pathname === '/api/auth/recovery' && method === 'POST') {
      window.__recoverySubmissions++;
      const fixture = window.__recoveryFixture;
      if (!fixture) throw Error('Unexpected recovery submission');
      const body = fixture.status === 200 ? {success:true,message:fixture.message} : {success:false,error:fixture.message};
      return new Response(JSON.stringify(body), {status:fixture.status,headers:{'Content-Type':'application/json'}});
    }
    if (url.pathname === '/api/auth/recovery/session') {
      return new Response(JSON.stringify({success:true,ready:false}), {headers:{'Content-Type':'application/json'}});
    }
    if (!['GET','HEAD'].includes(method)) {
      return new Response(JSON.stringify({success:false,error:'Writes disabled by presentation test'}), {status:503,headers:{'Content-Type':'application/json'}});
    }
    return realFetch(input, init);
  };
})();`;
const popupHeading = `Array.from(document.querySelectorAll('h3')).find(e=>e.textContent.trim()==='Nanivio Account Recovery')`;
const popup = `(${popupHeading})?.closest('.rounded-3xl')`;
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const results = [];
try {
  for (const [width,height] of [[390,844],[1280,900]]) {
    for (const screen of ['popup','reset-page']) {
      const page = await browser.page('about:blank');
      await page.command('Page.addScriptToEvaluateOnNewDocument', {source:interception});
      await page.command('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<600});
      await page.command('Page.navigate', {url:origin+(screen==='popup'?'/':'/reset-password')});
      if (screen==='popup') {
        await page.wait("!!(document.querySelector('#input-signin-password')||document.querySelector('.nl-signin'))");
        await page.evaluate("document.querySelector('.nl-signin')?.click();true");
        await page.wait("!!document.querySelector('#input-signin-password')");
        await page.evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Forgot Password?').click();true");
        await page.wait(`!!(${popupHeading})`);
      } else {
        await page.wait("!!document.querySelector('#recovery-identifier')");
      }
      const root = screen==='popup' ? popup : 'document';
      for (const fixture of cases) {
        await page.evaluate(`window.__recoveryFixture=${JSON.stringify(fixture)};(() => {
          const input=${root}.querySelector(${JSON.stringify(screen==='popup'?'form input':'#recovery-identifier')});
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(fixture.name==='malformed'?'not-an-email':'fixture@example.test')});
          input.dispatchEvent(new Event('input',{bubbles:true}));
          input.dispatchEvent(new Event('change',{bubbles:true}));
        })();true`);
        await page.evaluate(`${root}.querySelector('form button[type="submit"]').click();true`);
        const role = fixture.status===200 ? 'status' : 'alert';
        await page.wait(`!!Array.from(${root}.querySelectorAll('[role="${role}"]')).find(e=>e.textContent.includes(${JSON.stringify(fixture.message)}))`);
        if (fixture.status!==200) {
          assert.equal(await page.evaluate(`!!${root}.querySelector('[role="status"]')`), false, 'An error must not leave a success banner visible');
        }
        assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
        if (fixture.name==='unknown') {
          const {data}=await page.command('Page.captureScreenshot',{format:'png'});
          await writeFile(`${output}/${screen}-${width}.png`,Buffer.from(data,'base64'));
        }
        results.push({screen,width,scenario:fixture.name,passed:true});
      }
      assert.equal(await page.evaluate('window.__recoverySubmissions'), cases.length);
      assert.equal(await page.evaluate("document.body.innerText.includes('We’ll respond the same way whether or not an account matches')"),false);
    }
  }
  const report={passed:true,results,realRecoveryRequests:0,realPasswordUpdates:0};
  await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
