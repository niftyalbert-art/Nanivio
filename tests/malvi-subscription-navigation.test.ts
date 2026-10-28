import assert from 'node:assert/strict';
import test from 'node:test';
import { malviAllowanceIsUsedUp, openMalviSubscriptionPlans } from '../src/lib/malviSubscriptionNavigation.ts';

test('only personal allowance exhaustion offers a subscription shortcut', () => {
  assert.equal(malviAllowanceIsUsedUp('Your Malvi allowance is used up. Open Billing to review your plan.'), true);
  for (const message of [null, '', 'Speech provider quota_exceeded.', 'The shared voice budget is exhausted.',
    'Malvi allowance protection is unavailable. No new conversation was started.',
    'The reserved conversation time has ended. Open Billing to review your allowance.']) {
    assert.equal(malviAllowanceIsUsedUp(message), false);
  }
});

test('subscription shortcut closes the session then opens Malvi plans without choosing or purchasing a plan', () => {
  const calls: unknown[] = [];
  openMalviSubscriptionPlans({
    close: () => calls.push('close'),
    setPendingBillingAction: action => calls.push(action),
    setActiveTab: tab => calls.push(tab),
  });
  assert.deepEqual(calls, ['close', { subTab: 'malvi', purpose: 'MALVI_SUBSCRIPTION' }, 'billing']);
});
