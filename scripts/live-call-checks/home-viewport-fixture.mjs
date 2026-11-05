import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { launchBrowser } from './cdp.mjs';

const root = process.cwd();
const artifacts = path.join(root, 'generated-artifacts', 'home-viewport');
const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nanivio-home-fixture-'));
await fs.mkdir(artifacts, { recursive: true, mode: 0o700 });

const fixtureContext = `
import React, { useSyncExternalStore } from 'react';
const accountId = 'fixture-owner-007';
const summary = {
  success: true,
  userId: accountId,
  accounts: { communicationAccount: { wallets: [
    { currency: 'GHS', available: '38.40' },
    { currency: 'USD', available: '4.70' },
  ] } },
  recentTransactions: [{
    id: 'fixture-tx-1', userId: accountId, type: 'TOPUP',
    description: 'Fixture service credit', amount: '12.25', total: '12.25',
    currency: 'GHS', serviceType: 'CREDIT_TOPUP', status: 'COMPLETED',
    timestamp: Date.UTC(2025, 1, 12), createdAt: Date.UTC(2025, 1, 12),
  }],
};
const fakeUser = {
  id: accountId, name: 'Ama Fixture', initials: 'AF',
  email: 'ama.fixture@example.invalid', phoneNumber: '+00000000000',
  nvId: 'NV-DEMO-007', nanivioNumber: 'NV-DEMO-007', role: 'user',
  isOnline: true, preferredLanguage: 'en', myLanguage: 'en',
  country: 'Ghana', state: 'Greater Accra', city: 'Accra',
};
let tab = 'home';
const listeners = new Set();
const setActiveTab = next => {
  tab = next;
  listeners.forEach(listener => listener());
};
const noop = () => {};
const context = {
  currentUser: fakeUser, authUser: { ...fakeUser, verificationStatus: 'VERIFIED' },
  setActiveTab, setPendingBillingAction: noop, signOut: noop,
  start1on1Call: noop, startDirectChatWithUser: noop, setActiveConversationId: noop,
  contacts: [], conversations: [], callLogs: [],
  adminFeatures: { audioCallsEnabled: true, videoCallsEnabled: true, maintenanceMode: false, malviAiAssistantEnabled: false },
  billingSummary: summary, billingSyncError: false, refreshBilling: async () => {},
  myLanguage: 'en', setMyLanguage: noop, appLanguage: 'en', setAppLanguage: noop,
  speakingLanguage: 'en', translationLanguage: 'ak',
  setIsLanguageModalOpen: noop, globalLangpretationEnabled: false, setGlobalLangpretationEnabled: noop,
  currentPlan: null, billingPlans: [], upgradeSubscriptionPlan: async () => {},
  openBillingWithPlan: noop, langpretationMeter: {
    userId: accountId, available: true, status: 'ACTIVE', planName: 'Fixture allowance',
    totalAllowance: 12, remainingAllowance: 8, minutesUsed: 4,
    textCharactersRemaining: 1200, trialRemainingMinutes: 4, subscriptionRemainingMinutes: 4,
  },
  wallets: summary.accounts.communicationAccount.wallets, isSubscribed: false,
  isSettingsModalOpen: false, setIsSettingsModalOpen: noop,
  isEditProfileModalOpen: false, setIsEditProfileModalOpen: noop,
  isFreeTrialActive: false, freeTrialMinutesRemaining: 0, usedLangpretationMinutes: 0,
};
export function useNanivio() {
  const activeTab = useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => tab, () => tab,
  );
  return { ...context, activeTab };
}
`;

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { HomeView } from ${JSON.stringify(path.join(root, 'src/components/home/HomeView.tsx'))};
import { AccountView } from ${JSON.stringify(path.join(root, 'src/components/account/AccountView.tsx'))};
import { BottomNavigationBar } from ${JSON.stringify(path.join(root, 'src/components/BottomNavigationBar.tsx'))};
import { useNanivio } from '../../src/context/NanivioContext';

window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  window.__fixtureRequests = [...(window.__fixtureRequests || []), { url, method: init?.method || 'GET' }];
  return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

function FixtureApp() {
  const { activeTab } = useNanivio();
  return <div data-active-tab={activeTab} className={activeTab === 'home' ? 'fixture-app fixture-home-app nv-theme-dark' : 'fixture-app nv-theme-dark'}>
    <header className="fixture-header" aria-label="Fixture Nanivio header">
      <strong>Nanivio</strong><span>Ghana · Global</span>
    </header>
    <main id="fixture-main" className={activeTab === 'home' ? 'fixture-home-main home-main' : 'fixture-account-main'}>
      {activeTab === 'home' ? <HomeView /> : <AccountView />}
    </main>
    <BottomNavigationBar />
  </div>;
}
createRoot(document.getElementById('root')).render(<FixtureApp />);
`;

const sourceAlias = {
  name: 'fixture-context-only',
  setup(api) {
    api.onResolve({ filter: /(?:^|\/)context\/NanivioContext$/ }, () => ({
      path: 'fixture-context',
      namespace: 'nanivio-fixture',
    }));
    api.onLoad({ filter: /.*/, namespace: 'nanivio-fixture' }, () => ({
      contents: fixtureContext,
      loader: 'tsx',
      resolveDir: root,
    }));
  },
};

const result = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: 'home-viewport-entry.tsx', loader: 'tsx' },
  bundle: true, write: false, outfile: path.join(bundleDir, 'fixture.js'), format: 'iife', platform: 'browser', target: ['chrome120'],
  jsx: 'automatic', sourcemap: false, logLevel: 'silent', plugins: [sourceAlias],
  loader: { '.css': 'css' },
});
const jsFile = result.outputFiles.find(file => file.path.endsWith('.js'));
const cssFile = result.outputFiles.find(file => file.path.endsWith('.css'));
assert.ok(jsFile, 'esbuild produced fixture JavaScript');
assert.ok(cssFile, 'esbuild included the real HomeView CSS');
await fs.writeFile(path.join(bundleDir, 'fixture.js'), jsFile.contents, { mode: 0o600 });
await fs.writeFile(path.join(bundleDir, 'fixture.css'), cssFile.contents, { mode: 0o600 });

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>
*{box-sizing:border-box}
html,body,#root{margin:0;width:100%;min-height:100%;background:#121417;color:#f2f0ea;font-family:system-ui,sans-serif}
body{min-width:320px;overflow-x:hidden}
.fixture-app{display:flex;flex-direction:column;min-height:100dvh;width:100%;overflow-x:hidden;background:#121417}
.fixture-home-app{height:100dvh;max-height:100dvh;min-height:100dvh}
.fixture-header{height:68px;flex:0 0 68px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;background:#fbf9f2;color:#23352b;border-bottom:1px solid #d9d4c8}
.fixture-header span{font-size:11px;letter-spacing:.08em}
.fixture-home-main{display:flex;flex:1;min-height:0;overflow:hidden;padding-bottom:calc(4.5rem + env(safe-area-inset-bottom))}
.fixture-account-main{flex:1;min-height:0;overflow:visible;padding-bottom:calc(5rem + env(safe-area-inset-bottom))}
#nanivio-bottom-navigation{position:fixed!important;left:0!important;right:0!important;bottom:0!important;z-index:40!important;display:block!important;background:#fbf9f2!important;padding:4px 0 max(4px,env(safe-area-inset-bottom))!important;box-shadow:0 -4px 16px #0002!important}
#nanivio-bottom-navigation>div:first-child{display:none!important}
#nanivio-bottom-navigation>div:nth-child(2){display:flex;align-items:center;max-width:1100px;margin:auto;padding:0 5px}
#nanivio-bottom-navigation>div:nth-child(2)>div:nth-child(2){display:flex;align-items:center;justify-content:space-around;gap:3px;overflow:hidden;width:100%;padding:2px}
#nanivio-bottom-navigation>div:nth-child(2)>div:nth-child(2)>button{display:flex;align-items:center;justify-content:center;gap:5px;min-width:0;min-height:48px;padding:6px 8px;border:1px solid transparent;border-radius:14px;background:transparent;color:#53675b;font-size:12px;font-weight:700}
#nanivio-bottom-navigation>div:nth-child(2)>button{display:none!important}
#nanivio-bottom-navigation>div:nth-child(2)>div:nth-child(2)>button{flex-direction:column}
#nanivio-bottom-navigation .leading-tight>span:last-child{display:none}
#nanivio-bottom-navigation>div:nth-child(2)>div:nth-child(2)>button>div{display:flex;align-items:center;justify-content:center}
#nanivio-bottom-navigation button{cursor:pointer}
#nanivio-bottom-navigation [role=menu]{z-index:60;position:absolute;bottom:100%;right:12px;width:224px;max-height:60dvh;overflow:auto;background:#fbf9f2;color:#34443a;border:1px solid #d9d4c8;border-radius:16px;padding:8px}
.home-dashboard{box-sizing:border-box}
.fixture-account-main .account-home-sections{margin-top:0}
.fixture-account-main .home-activity,.fixture-account-main .home-find,.fixture-account-main .home-language-note,.fixture-account-main .home-services{margin-top:1.25rem}
.fixture-account-main .home-services{padding-bottom:1rem}
.fixture-account-main .home-services-heading{margin-bottom:.75rem}
</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/' || pathname === '/fixture') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
    return;
  }
  if (pathname === '/fixture.js' || pathname === '/fixture.css') {
    const name = pathname.slice(1);
    response.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/css' });
    response.end(await fs.readFile(path.join(bundleDir, name)));
    return;
  }
  response.writeHead(404);
  response.end('not found');
});

const listen = server.listen(0, '127.0.0.1');
await new Promise((resolve, reject) => {
  listen.once('listening', resolve);
  listen.once('error', reject);
});
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await launchBrowser();
const checks = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const record = (name, passed, details = {}) => {
  checks.push({ name, passed, ...details });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${details.reason ? ` — ${details.reason}` : ''}`);
  if (!passed) console.log(JSON.stringify(details));
};

try {
  const appSource = await fs.readFile(path.join(root, 'src/App.tsx'), 'utf8');
  assert.doesNotMatch(appSource, /NanivioLandingPage|Back to Nanivio/);
  assert.ok(appSource.includes("window.location.pathname === '/auth/callback'"));
  assert.match(appSource, /isAdminRoute && !isAuthenticated/);
  assert.match(appSource, /isAuthenticated && activeCelebrationEffect\?\.show/);
  assert.match(appSource, /if \(!isAuthenticated\)\s*\{\s*return/);
  record('Direct-auth entry retains callback, admin gateway, and post-auth signature routing', true);

  const page = await browser.page(origin);
  page.on?.('Runtime.exceptionThrown', event => console.error('BROWSER EXCEPTION', JSON.stringify(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text)));
  page.on?.('Runtime.consoleAPICalled', event => {
    if (event.type === 'error') console.error('BROWSER CONSOLE ERROR', event.args?.map(arg => arg.value || arg.description).join(' '));
  });
  await page.wait("document.querySelector('.home-dashboard h1#home-title')?.textContent?.includes('Ama')");
  await sleep(200);

  for (const viewport of [
    { width: 390, height: 844, mobile: true },
    { width: 320, height: 568, mobile: true },
    { width: 1440, height: 900, mobile: false },
  ]) {
    await page.command('Emulation.setDeviceMetricsOverride', {
      width: viewport.width, height: viewport.height, deviceScaleFactor: 1,
      mobile: viewport.mobile,
    });
    await sleep(180);
    const snapshot = await page.evaluate(`(() => {
      const root = document.querySelector('.home-dashboard');
      const nodes = [...document.querySelectorAll('.home-shortcut')];
      const balances = [...document.querySelectorAll('.home-wallet-amount')];
      const insideViewport = el => {
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 24 || r.left < -1 || r.top < -1 ||
            r.right > innerWidth + 1 || r.bottom > innerHeight + 1) return false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const s = getComputedStyle(p), r = p.getBoundingClientRect();
          if ((s.overflowY === 'hidden' || s.overflowY === 'clip') && (el.getBoundingClientRect().bottom > r.bottom + 1 || el.getBoundingClientRect().top < r.top - 1)) return false;
          if ((s.overflowX === 'hidden' || s.overflowX === 'clip') && (el.getBoundingClientRect().right > r.right + 1 || el.getBoundingClientRect().left < r.left - 1)) return false;
        }
        return true;
      };
      return {
        viewport: [innerWidth, innerHeight],
        documentScroll: [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight],
        bodyScroll: [document.body.scrollWidth > innerWidth, document.body.scrollHeight > innerHeight],
        homeScroll: [root.scrollWidth > root.clientWidth, root.scrollHeight > root.clientHeight],
        shortcuts: nodes.map(el => ({label: el.querySelector('strong')?.textContent, visible: insideViewport(el)})),
        balanceText: [...document.querySelectorAll('.home-wallet-amount strong')].map(el => el.textContent),
        balancesVisible: balances.length > 0 && balances.every(insideViewport),
        manageVisible: insideViewport(document.querySelector('.home-wallet-footer button')),
        homeRect: root ? [root.clientWidth, root.clientHeight] : null,
      };
    })()`);
    const name = `${viewport.width}x${viewport.height}`;
    await page.screenshot(path.join(artifacts, `home-${viewport.width}x${viewport.height}.png`));
    const noScroll = snapshot.documentScroll.every(value => !value)
      && snapshot.bodyScroll.every(value => !value)
      && snapshot.homeScroll.every(value => !value);
    const essentialShortcuts = ['Chat', 'Call', 'Langpretation', 'Send credits', 'My credits', 'More'];
    const visibleShortcuts = snapshot.shortcuts.filter(item => essentialShortcuts.includes(item.label) && item.visible).length;
    const allShortcutsVisible = essentialShortcuts.every(label => snapshot.shortcuts.some(item => item.label === label && item.visible));
    const balancesOkay = snapshot.balanceText.includes('38.40 credits')
      && snapshot.balanceText.includes('4.70 credits')
      && snapshot.balancesVisible && snapshot.manageVisible;
    record(`${name} Home/document has no vertical or horizontal scroll`, noScroll, { snapshot });
    record(`${name} essential shortcuts and owned balances are fully visible`, allShortcutsVisible && balancesOkay, {
      snapshot, visibleShortcuts,
    });
  }

  await page.command('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await page.evaluate(`document.querySelector('#nanivio-bottom-navigation button[aria-haspopup="menu"]')?.click()`);
  await page.wait("document.querySelector('#nanivio-bottom-navigation [role=menu]')?.textContent?.includes('Account')");
  await page.evaluate(`([...document.querySelectorAll('#nanivio-bottom-navigation [role=menuitem]')].find(item => item.textContent.includes('Account')))?.click()`);
  console.log('Account nav result', JSON.stringify(await page.evaluate(`({
    tab: document.querySelector('.fixture-app')?.dataset.activeTab,
    menu: document.querySelector('#nanivio-bottom-navigation [role=menu]')?.textContent,
    titles: [...document.querySelectorAll('[id^="account-home-"]')].map(el => el.id),
    text: document.body.innerText.slice(0, 500),
  })`)));
  await page.wait("!!document.querySelector('#account-home-activity-title') && !!document.querySelector('#account-home-find-title') && !!document.querySelector('#account-home-services-title')");
  await page.evaluate(`document.querySelector('#account-home-services-title').scrollIntoView({block:'center'})`);
  await sleep(200);
  const accountReachability = await page.evaluate(`(() => ({
    activeAccount: document.querySelector('#account-home-activity-title') !== null,
    activity: !!document.querySelector('#account-home-activity-title'),
    personLookup: !!document.querySelector('#account-home-find-title'),
    langpretation: !!document.querySelector('.home-language-note'),
    verifiedServices: !!document.querySelector('#account-home-services-title'),
    servicesHeadingVisible: (() => { const r=document.querySelector('#account-home-services-title').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })(),
    accountScrollable: document.documentElement.scrollHeight > innerHeight || document.querySelector('#fixture-main').scrollHeight > document.querySelector('#fixture-main').clientHeight,
    fakeServiceRequests: (window.__fixtureRequests || []).filter(request => request.url.includes('/api/services/')).length,
  }))()`);
  await page.screenshot(path.join(artifacts, 'account-relocated-sections.png'));
  record('Bottom-nav More opens Account and relocated sections are reachable', Object.values(accountReachability).filter(value => typeof value === 'boolean').every(Boolean), {
    snapshot: accountReachability,
  });

  const report = { fixture: 'real HomeView and AccountView with fake context/HTTP only', checks, artifacts };
  await fs.writeFile(path.join(artifacts, 'results.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  if (checks.some(check => !check.passed)) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(bundleDir, { recursive: true, force: true });
}
