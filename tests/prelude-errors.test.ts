import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describePreludeFailure, PUBLIC_PHONE_VERIFICATION_ERROR } from '../src/server/preludeErrors';
import { OtpService } from '../src/server/otpService';

test('Prelude errors distinguish credentials, credit, account, destination and request problems', () => {
  const cases: [number, string, RegExp][] = [
    [401, 'invalid_api_key', /configuration needs administrator attention/],
    [401, 'invalid_bearer_token', /configuration needs administrator attention/],
    [400, 'insufficient_balance', /insufficient account credit/],
    [402, 'insufficient_balance', /insufficient account credit/],
    [403, 'suspended_account', /restricted by the provider/],
    [400, 'invalid_phone_number', /Check the number/],
    [400, 'region_blocked_by_customer', /not enabled for this destination/],
    [400, 'invalid_method', /configuration was rejected/],
    [400, 'channels_not_allowed', /account settings/],
    [429, 'rate_limited', /Too many verification requests/],
    [400, 'premature_retry', /Too many verification requests/],
    [400, 'spending_limit_exceeded', /spending limit/],
    [500, 'internal', /temporarily unavailable/],
  ];
  for (const [status, code, expected] of cases) {
    const result = describePreludeFailure(status, { code });
    assert.match(result.message, expected);
    assert.ok(result.message.includes(`Prelude ${status}/${code}`));
    assert.equal(result.diagnostic.code, code);
  }
});

test('safe diagnostics never forward arbitrary provider fields or unknown error codes', () => {
  const secret = 'private-credential-and-phone-do-not-expose';
  for (const payload of [
    undefined, null, [], secret, { code: secret, message: secret, param: secret, request_id: secret },
    { code: 'toString', message: secret }, { code: '__proto__', message: secret },
    { code: 'invalid_api_key', message: secret, headers: { Authorization: secret }, target: secret },
  ]) {
    const result = describePreludeFailure(400, payload);
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(result.diagnostic.requestId, undefined);
  }
  const id = '3d19215e-2991-4a05-a41a-527314e6ff6a';
  const result = describePreludeFailure(400, { code: 'invalid_request', request_id: id });
  assert.equal(result.diagnostic.requestId, id);
  assert.equal(result.message.includes(id), false);
});

test('unknown/non-JSON errors retain HTTP status without assuming missing funds', () => {
  for (const status of [400, 401, 402, 403, 429, 500, 503]) {
    const result = describePreludeFailure(status, undefined);
    assert.equal(result.diagnostic.code, 'unknown_error');
    assert.ok(result.message.includes(`Prelude ${status}/unknown_error`));
    assert.doesNotMatch(result.message, /insufficient account credit/);
  }
});

test('send rejects safely, records only approved diagnostics, and preserves cooldown and proof protections', async () => {
  const secret = 'private-provider-body-must-not-leak';
  const diagnostics: unknown[] = [];
  let calls = 0;
  const service = new OtpService(async () => {
    calls++;
    return new Response(JSON.stringify({
      code: 'invalid_api_key', message: secret, target: secret, request_id: secret,
    }), { status: 401 });
  }, () => 1000, () => 'test-only-key', d => diagnostics.push(d));
  await assert.rejects(() => service.sendOtp('+12025550123'), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
  assert.deepEqual(diagnostics, [{ provider: 'prelude', status: 401, code: 'invalid_api_key', operation: 'send' }]);
  await assert.rejects(() => service.sendOtp('+12025550123'), /Please wait/);
  assert.equal(calls, 1);
  await assert.rejects(() => service.verifyOtp('+12025550123', '123456'), /No active verification/);
  assert.equal(service.validateVerifiedToken('forged', '+12025550123'), false);
  assert.equal(JSON.stringify(diagnostics).includes(secret), false);
});

test('non-JSON upstream failure cannot leak its body or mask HTTP diagnostics', async () => {
  const diagnostics: unknown[] = [];
  const service = new OtpService(async () => new Response('<html>private provider diagnostics</html>', {
    status: 503,
  }), () => 1000, () => 'test-only-key', d => diagnostics.push(d));
  await assert.rejects(() => service.sendOtp('+12025550123'), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
  assert.deepEqual(diagnostics, [{ provider: 'prelude', status: 503, code: 'unknown_error', operation: 'send' }]);
});

test('missing configuration, network errors and blocked sends have private diagnostics and identical public errors', async () => {
  for (const reason of ['not_configured', 'network_error', 'invalid_response', 'blocked', 'challenged', 'shadow_blocked']) {
    const diagnostics: any[] = [];
    const service = new OtpService(async () => {
      if (reason === 'network_error') throw new Error('private transport error');
      if (reason === 'invalid_response') return new Response('not-json');
      return new Response(JSON.stringify({ status: reason, id: 'vrf_test' }));
    }, () => 1000, () => reason === 'not_configured' ? undefined : 'test-only-key', d => diagnostics.push(d));
    await assert.rejects(() => service.sendOtp('+12025550123'), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
    assert.equal(diagnostics[0].code, reason);
    assert.equal(diagnostics[0].operation, 'send');
  }
});

test('provider check errors stay private while preserving the verification attempt budget', async () => {
  const diagnostics: any[] = [];
  let calls = 0;
  const service = new OtpService(async () => {
    calls++;
    return calls === 1 ? new Response(JSON.stringify({ status: 'success', id: 'vrf_test' }))
      : new Response(JSON.stringify({ code: 'insufficient_balance', message: 'private account balance' }), { status: 400 });
  }, () => 1000, () => 'test-only-key', d => diagnostics.push(d));
  await service.sendOtp('+12025550123');
  for (let attempt = 0; attempt < 5; attempt++) {
    await assert.rejects(() => service.verifyOtp('+12025550123', '123456'), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
  }
  await assert.rejects(() => service.verifyOtp('+12025550123', '123456'), /Maximum verification attempts/);
  assert.equal(calls, 6);
  assert.equal(diagnostics.length, 5);
  assert.equal(diagnostics[0].operation, 'check');
  assert.equal(diagnostics[0].code, 'insufficient_balance');
});
