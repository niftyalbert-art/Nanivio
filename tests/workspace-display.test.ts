import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { billingNumber, formatBillingAmount, normalizeBillingTransaction } from '../src/lib/billingPresentation.ts';
import { billingClient } from '../src/lib/billingClient.ts';

test('financial display accepts database decimal strings and preserves zero', () => {
  assert.equal(formatBillingAmount('12.50'), '12.50');
  assert.equal(formatBillingAmount(0), '0.00');
  assert.equal(formatBillingAmount('0.00'), '0.00');
  assert.equal(formatBillingAmount(-12.5), '-12.50');
  assert.equal(formatBillingAmount(1234.567), '1,234.57');
  for (const invalid of [undefined, null, '', ' ', 'bad', Infinity, NaN, {}, true]) {
    assert.equal(billingNumber(invalid), undefined);
    assert.equal(formatBillingAmount(invalid), 'Unavailable');
  }
});

test('saved transaction fields and dates match the billing display contract without modifying the row', () => {
  const raw = Object.freeze({
    transaction_id: 'saved-id', reference_id: 'saved-reference', user_id: 'test-user',
    service_type: 'SUBSCRIPTION', usage_type: 'PLAN', total: '12.50',
    quantity: '1', unit_price: '12.50', created_at: '2026-10-14T12:00:00Z',
  });
  const result = normalizeBillingTransaction(raw);
  assert.equal(result.transactionId, 'saved-id');
  assert.equal(result.referenceId, 'saved-reference');
  assert.equal(result.serviceType, 'SUBSCRIPTION');
  assert.equal(result.quantity, 1);
  assert.equal(result.unitPrice, 12.5);
  assert.equal(result.total, 12.5);
  assert.equal(result.createdAt, Date.parse(raw.created_at));
  assert.equal(raw.total, '12.50');
  assert.equal(formatBillingAmount(normalizeBillingTransaction({ total: null }).total), 'Unavailable');
  assert.equal(formatBillingAmount(normalizeBillingTransaction({ total: 'broken' }).total), 'Unavailable');
});

test('canonical transaction values take precedence over legacy aliases', () => {
  const result = normalizeBillingTransaction({
    transactionId: 'canonical', transaction_id: 'legacy', total: 0, createdAt: 123,
    created_at: '2026-10-14T12:00:00Z',
  });
  assert.equal(result.transactionId, 'canonical');
  assert.equal(result.total, 0);
  assert.equal(result.createdAt, 123);
});

test('billing summary adapts persisted transaction rows at the real client boundary', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true, recentTransactions: [{ transaction_id: 'saved', total: '7.25' }],
  }), { headers: { 'Content-Type': 'application/json' } });
  try {
    const summary = await billingClient.getSummary();
    assert.equal(summary.recentTransactions[0].transactionId, 'saved');
    assert.equal(summary.recentTransactions[0].total, 7.25);
  } finally {
    globalThis.fetch = original;
  }
});

test('empty live catalogs cannot fall through to a duplicate unguarded player or promo header', () => {
  const source = readFileSync(new URL('../src/components/services/LiveServices4KVideoHub.tsx', import.meta.url), 'utf8');
  assert.equal(source.match(/ref=\{screenContainerRef\}/g)?.length, 1);
  assert.equal(source.match(/selectedChannel\.resolution/g)?.length, 1);
  assert.match(source, /\{selectedChannel \? \(/);
  assert.match(source, /currentPromo\?\.badgeLabel \?\? 'No featured businesses available'/);
  assert.equal(source.match(/disabled=\{activePromos\.length < 2\}/g)?.length, 2);
  assert.match(source, /No verified live 4K broadcast channels are currently available/);
});

test('billing overview uses authoritative wallet paths and no invented fallback balances', () => {
  const source = readFileSync(new URL('../src/components/billing/UniversalBillingHub.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /accounts\?\.(communication|fintech)\?/);
  assert.doesNotMatch(source, /3,450\.00|1,255\.50|\|\| 380\.0|\|\| 3450|\|\| 1255\.5|\|\| 50\.0/);
  assert.match(source, /formatBillingAmount\(tx\.total\)/);
});
