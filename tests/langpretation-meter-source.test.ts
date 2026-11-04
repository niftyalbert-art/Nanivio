import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildCommunicationMeter, unavailableCommunicationMeter } from '../src/server/langpretationMeter';
import { communicationCreditBalance } from '../src/lib/billingPresentation';

const access = {
  policy: { liveTrialMinutes: 3, callTrialDays: 30, paidTextCharacters: 1000, warningSeconds: 60 },
  trialStartedAt: null, trialEndsAt: null, callSecondsRemaining: null,
  liveTrialSecondsRemaining: 180, translatedSecondsRemaining: 600,
  textCharactersRemaining: 1000, paid: true, paidUntil: '2030-01-31T00:00:00Z', sharedCallMinutes: 20,
};
const subscription = {
  langpretationMinutesQuota: '10', currentPeriodStart: 1893456000000,
  tier: 'individual_premium', planName: 'Personal plan',
};

test('meter separates live trial, paid minutes, text characters and normal calling', () => {
  const meter = buildCommunicationMeter('owner', access as any, subscription as any, 10);
  assert.equal(meter.remainingAllowance, 13);
  assert.equal(meter.totalAllowance, 13);
  assert.equal(meter.monthlyQuota, 10);
  assert.equal(meter.trialRemainingMinutes, 3);
  assert.equal(meter.subscriptionRemainingMinutes, 10);
  assert.equal(meter.textCharactersRemaining, 1000);
  assert.equal(meter.callMinutesRemaining, null);
  assert.equal(meter.fallbackEnabled, false);
  assert.equal(meter.estimatedSavingsAvailable, false);
  assert.equal(meter.channelBreakdownAvailable, false);
});

test('trial quota comes from policy, not a hardcoded 15 minutes; zero and unknown are distinct', () => {
  const trial = buildCommunicationMeter('owner', { ...access, paid: false, policy: { ...access.policy, liveTrialMinutes: 2 },
    liveTrialSecondsRemaining: '45', translatedSecondsRemaining: 600 } as any, subscription as any);
  assert.equal(trial.status, 'TRIAL');
  assert.equal(trial.totalAllowance, 2);
  assert.equal(trial.remainingAllowance, .75);
  assert.equal(trial.minutesUsed, 1.25);
  assert.equal(trial.subscriptionRemainingMinutes, 0);
  assert.equal(trial.monthlyQuota, 0);
  const empty = buildCommunicationMeter('owner', { ...access, paid: false,
    liveTrialSecondsRemaining: 0, policy: { ...access.policy, liveTrialMinutes: 0 } } as any, null);
  assert.equal(empty.status, 'EXHAUSTED');
  assert.equal(empty.totalAllowance, 0);
  assert.equal(unavailableCommunicationMeter('owner').available, false);
  assert.equal(unavailableCommunicationMeter('owner').status, 'UNAVAILABLE');
  const originalGrant = buildCommunicationMeter('owner', { ...access, paid: false,
    policy: { ...access.policy, liveTrialMinutes: 1 }, liveTrialSecondsRemaining: 600 } as any, null, 10, 5);
  assert.equal(originalGrant.totalAllowance, 15, 'An admin default change must not rewrite the original trial grant.');
  assert.equal(originalGrant.minutesUsed, 5);
  assert.throws(() => buildCommunicationMeter('owner', { ...access, textCharactersRemaining: undefined } as any, null));
});

test('actual repository and reservation client reflect reserve, partial settlement, failed-use refund and text consumption using an isolated RPC', async () => {
  const state = { ...access };
  const reservations = new Map<string, { amount: number; source: string; finalized?: boolean; used?: number }>();
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
      export {getPersistentUsageMeter} from './src/server/normalizedBillingRepository.ts';
      export {communicationAccess} from './src/server/communicationAccess.ts';` },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'isolated-allowance-ledger', setup(b) {
      b.onResolve({ filter: /supabaseServer(?:\.ts)?$/ }, () => ({ path: 'db', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: 'export function getServerSupabase(){return {rpc:fixtureRpc,from:fixtureFrom}}',
      }));
    } }],
  });
  const module = { exports: {} as any };
  let pageReads = 0;
  new Function('require', 'module', 'exports', 'fixtureRpc', 'fixtureFrom', result.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports, async (name: string, args: any) => {
      assert.equal(name, 'nanivio_communication_access');
      const p = args.payload;
      assert.equal(p.userId, 'owner');
      let data: any = { success: true };
      if (args.action === 'ACCESS') data = { ...data, ...state };
      if (args.action === 'RESERVE') {
        const source = p.resource === 'text' ? 'textCharactersRemaining'
          : p.resource === 'live' && state.liveTrialSecondsRemaining > 0 ? 'liveTrialSecondsRemaining' : 'translatedSecondsRemaining';
        (state as any)[source] -= p.amount;
        reservations.set(p.eventId, { amount: p.amount, source });
        data = { ...data, amount: p.amount, source };
      }
      if (args.action === 'RELEASE' || args.action === 'COMMIT') {
        const reservation = reservations.get(p.eventId)!;
        if (!reservation.finalized) {
          reservation.used = args.action === 'RELEASE' ? 0 : p.used;
          (state as any)[reservation.source] += reservation.amount - reservation.used!;
          reservation.finalized = true;
        }
      }
      return { data, error: null };
    }, (table: string) => {
      assert.equal(table, 'nanivio_communication_reservations', 'Malvi and old usage logs must not be read.');
      const query: any = {
        select(value: string) { assert.equal(value, 'amount'); return query; },
        eq(field: string, value: string) { assert.equal(value, field === 'user_id' ? 'owner' : 'live_trial'); return query; },
        in(_field: string, values: string[]) { assert.deepEqual(values, ['RESERVED', 'COMMITTED']); return query; },
        order() { return query; },
        range(first: number, last: number) {
          pageReads++;
          const rows = [...reservations.values()].filter(row => row.source === 'liveTrialSecondsRemaining' && (!row.finalized || row.used))
            .map(row => ({ amount: row.finalized ? row.used : row.amount }));
          return Promise.resolve({ data: rows.slice(first, last + 1), error: null });
        },
      };
      return query;
    });
  const api = module.exports;
  const meter = () => api.getPersistentUsageMeter('owner', subscription);
  assert.equal((await meter()).minutesUsed, 0);
  const live = await api.communicationAccess.reserve('owner', 'live', 30);
  assert.equal((await meter()).remainingAllowance, 12.5);
  await api.communicationAccess.commit(live, 10);
  assert.ok(Math.abs((await meter()).minutesUsed - 10 / 60) < .0001);
  const before = (await meter()).remainingAllowance;
  const failed = await api.communicationAccess.reserve('owner', 'note', 45);
  assert.equal((await meter()).subscriptionRemainingMinutes, 9.25);
  await api.communicationAccess.release(failed);
  assert.equal((await meter()).remainingAllowance, before);
  const text = await api.communicationAccess.reserve('owner', 'text', 150);
  await api.communicationAccess.commit(text);
  assert.equal((await meter()).textCharactersRemaining, 850);
  assert.equal((await meter()).remainingAllowance, before, 'Characters must not be converted to voice minutes.');
  for (let i = 0; i < 501; i++) reservations.set(`history-${i}`, { source: 'liveTrialSecondsRemaining', amount: .1, finalized: true, used: .1 });
  state.liveTrialSecondsRemaining -= 50.1;
  state.policy = { ...state.policy, liveTrialMinutes: 0 };
  pageReads = 0;
  const fullHistory = await meter();
  assert.equal(pageReads, 2, 'Trial consumption must not stop at a history page limit.');
  assert.equal(fullHistory.trialQuotaMinutes, 3);
  assert.equal(fullHistory.minutesUsed, 1.0017);
});

test('credit display reads only the owner’s communication wallets, preserving decimal zero and unknown', () => {
  const summary: any = { success: true, userId: 'owner', wallets: [{ currency: 'GHS', available: '12.30' }] };
  assert.equal(communicationCreditBalance(summary, 'owner'), 12.3);
  assert.equal(communicationCreditBalance(summary, 'someone-else'), undefined);
  assert.equal(communicationCreditBalance(null, 'owner'), undefined);
  assert.equal(communicationCreditBalance({ ...summary, wallets: [] }, 'owner'), 0);
  assert.equal(communicationCreditBalance({ ...summary, wallets: [{ currency: 'GHS', available: '0.00' }] }, 'owner'), 0);
  assert.equal(communicationCreditBalance({ ...summary, wallets: [{ currency: 'GHS', available: 'invalid' }] }, 'owner'), undefined);
  const separated = { ...summary, accounts: {
    communicationAccount: { wallets: [{ currency: 'GHS', available: '4.50' }] },
    fintechAccount: { wallets: [{ currency: 'GHS', available: 9999 }] },
  } };
  assert.equal(communicationCreditBalance(separated, 'owner'), 4.5);
});

test('actual meter component renders exhausted and unavailable states without invented savings or foreign-account data', async () => {
  const built = await build({
    entryPoints: ['src/components/billing/LiveLangpretationMeter.tsx'], bundle: true, write: false,
    platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'fixture-view-context', setup(b) {
      b.onResolve({ filter: /NanivioContext$/ }, () => ({ path: 'context', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const useNanivio=()=>fixtureContext;' }));
    } }],
  });
  const render = (meter: any) => {
    const module = { exports: {} as any };
    new Function('require', 'module', 'exports', 'fixtureContext', built.outputFiles[0].text)(
      createRequire(import.meta.url), module, module.exports,
      { currentUser: { id: 'owner' }, langpretationMeter: meter, refreshBilling() {}, setIsMinutesModalOpen() {} });
    return renderToStaticMarkup(React.createElement(module.exports.LiveLangpretationMeter));
  };
  const exhausted = buildCommunicationMeter('owner', { ...access, paid: false, liveTrialSecondsRemaining: 0 } as any, null);
  const html = render(exhausted);
  assert.match(html, /EXHAUSTED/);
  assert.doesNotMatch(html, /Estimated Savings|NaN|Invalid Date|Auto-Switch Enabled/);
  assert.match(html, /Text allowance/);
  assert.match(render(unavailableCommunicationMeter('owner')), /Live allowance unavailable/);
  assert.match(render({ ...exhausted, userId: 'other', planName: 'PRIVATE_PLAN' }), /Live allowance unavailable/);
  assert.doesNotMatch(render({ ...exhausted, userId: 'other', planName: 'PRIVATE_PLAN' }), /PRIVATE_PLAN/);
});
