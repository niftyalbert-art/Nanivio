import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLivePaystackPayment, paystackLiveConfigurationError } from '../src/server/paystackPaymentSafety.ts';

test('missing, test, public and malformed configuration cannot create real checkout', () => {
  for (const key of [undefined, '', 'sk_test_fixture', 'pk_live_fixture', 'invalid']) {
    assert.ok(paystackLiveConfigurationError(key));
  }
  assert.equal(paystackLiveConfigurationError('sk_live_fixture'), null);
});

test('test or unknown transaction mode cannot grant benefits even when Paystack reports success', () => {
  for (const domain of ['test', '', undefined, null]) {
    assert.throws(() => assertLivePaystackPayment({ domain, status: 'success', amount: 1000, currency: 'GHS' }));
  }
});

test('card and mobile money require completed live payment, not a pending authorization', () => {
  for (const channel of ['card', 'mobile_money']) {
    for (const status of ['pending', 'ongoing', 'abandoned', 'failed', 'reversed', undefined]) {
      assert.throws(() => assertLivePaystackPayment({ domain: 'live', channel, status, amount: 1000, currency: 'GHS' }));
    }
    assert.doesNotThrow(() => assertLivePaystackPayment({
      domain: 'live', channel, status: 'success', amount: 1000, currency: 'GHS',
    }));
  }
});

test('missing or invalid settlement amounts cannot reach fulfillment', () => {
  for (const amount of [0, -1, 1.5, undefined, '1000', NaN, Infinity]) {
    assert.throws(() => assertLivePaystackPayment({ domain: 'live', status: 'success', amount, currency: 'GHS' }));
  }
});
