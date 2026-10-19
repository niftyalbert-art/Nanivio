import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OtpService } from '../src/server/otpService';
import { DiditOtpProvider } from '../src/server/diditOtpProvider';
import { describeDiditFailure, type DiditFailureDiagnostic } from '../src/server/diditErrors';
import { PUBLIC_PHONE_VERIFICATION_ERROR } from '../src/server/preludeErrors';
import { PhoneVerificationDiagnosticStore } from '../src/server/phoneVerificationDiagnostics';
import { PhoneVerificationDiagnosticsView } from '../src/components/admin/AdminPhoneVerificationDiagnostics';

const phone = '+12025550123';
const otherPhone = '+442079460018';
const sessionId = '12345678-1234-4234-8234-123456789abc';
const newSessionId = '12345678-1234-4234-8234-123456789abd';

function fixture() {
  let now = 1_000_000;
  let key: string | undefined = 'test-only-not-a-real-key';
  let id = sessionId;
  let status = 200;
  let override: { body: unknown } | undefined;
  let networkError = false;
  let invalidJson = false;
  let checkStatus = 'Approved';
  let legacyCalls = 0;
  const diagnostics: DiditFailureDiagnostic[] = [];
  const calls: { url: string; init: RequestInit; body: any }[] = [];
  const provider = new DiditOtpProvider((async (url: any, init: any) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    if (networkError) throw new Error('private upstream content');
    const body = override ? override.body : String(url).endsWith('/check/')
      ? { request_id: id, status: checkStatus, phone: { status: 'Approved', full_number: phone } }
      : { request_id: id, status: 'Success' };
    return new Response(invalidJson ? 'private non-JSON content' : JSON.stringify(body), { status });
  }) as typeof fetch, () => key, diagnostic => diagnostics.push(diagnostic));
  const service = new OtpService(
    async () => { legacyCalls++; throw new Error('No legacy provider may be called'); },
    () => now, () => undefined, () => {}, provider,
  );
  return {
    service, provider, diagnostics, calls, legacyCalls: () => legacyCalls,
    key: (value: string | undefined) => { key = value; },
    advance: (ms: number) => { now += ms; },
    id: (value: string) => { id = value; },
    checkStatus: (value: string) => { checkStatus = value; },
    response: (body: unknown, httpStatus = 200) => { override = { body }; status = httpStatus; },
    networkError: () => { networkError = true; },
    invalidJson: () => { invalidJson = true; },
  };
}

test('Didit requests SMS with six digits, server authentication and a matching provider-backed proof', async () => {
  const f = fixture();
  const sent = await f.service.sendOtp(phone);
  assert.equal(sent.provider, 'didit');
  assert.equal(sent.channel, 'sms');
  assert.equal(f.calls[0].url, 'https://verification.didit.me/v3/phone/send/');
  assert.equal((f.calls[0].init.headers as any)['x-api-key'], 'test-only-not-a-real-key');
  assert.equal(f.calls[0].init.redirect, 'error');
  assert.ok(f.calls[0].init.signal);
  assert.deepEqual(f.calls[0].body, {
    phone_number: phone,
    options: { preferred_channel: 'sms', code_size: 6, sms_sender_name: 'Nanivio', locale: 'en' },
  });
  const checked = await f.service.verifyOtp(phone, '123456');
  assert.equal(f.calls[1].url, 'https://verification.didit.me/v3/phone/check/');
  assert.deepEqual(f.calls[1].body, { phone_number: phone, code: '123456', enable_social: false });
  assert.equal(checked.verifiedPhone, phone);
  assert.equal(f.service.validateVerifiedToken(checked.verificationToken, otherPhone), false);
  assert.equal(f.service.validateVerifiedToken(checked.verificationToken, phone), true);
  assert.equal(f.service.validateVerifiedToken(checked.verificationToken, phone), false);
  assert.equal(f.legacyCalls(), 0);
  assert.equal(f.diagnostics.length, 0);
});

test('missing or malformed credentials fail closed without a network call or provider fallback', async () => {
  for (const key of [undefined, '', ' test ', 'Bearer key', '"key"', "key'"]) {
    const f = fixture();
    f.key(key);
    await assert.rejects(() => f.service.sendOtp(phone), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
    assert.equal(f.calls.length, 0);
    assert.equal(f.legacyCalls(), 0);
    assert.equal(f.diagnostics[0].provider, 'didit');
    assert.equal(f.diagnostics[0].code, key ? 'invalid_configuration' : 'not_configured');
    await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /No active/);
  }
});

test('blocked or malformed sends, including HTTP 200, never create a challenge', async () => {
  for (const body of [
    null, {}, [], { status: 'Success' }, { status: 'success', request_id: sessionId },
    { status: 'Blocked', request_id: sessionId, reason: 'private reason' },
    { status: 'Success', request_id: '../private' },
  ]) {
    const f = fixture();
    f.response(body);
    await assert.rejects(() => f.service.sendOtp(phone), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
    await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /No active/);
    assert.equal(f.diagnostics.length, 1);
    assert.equal(f.legacyCalls(), 0);
    assert.doesNotMatch(JSON.stringify(f.diagnostics), /private/);
  }
});

test('HTTP failures and upstream payloads never disclose secrets, phone reports or attempted codes', async () => {
  const privateValue = 'private-key-phone-code-body';
  for (const [status, code] of [
    [400, 'request_rejected'], [401, 'unauthorized'], [402, 'insufficient_balance'],
    [403, 'forbidden'], [429, 'rate_limited'], [500, 'provider_unavailable'], [502, 'provider_unavailable'],
  ] as const) {
    const f = fixture();
    f.response({ detail: privateValue, phone: { lifecycle: [{ code_tried: privateValue }] } }, status);
    await assert.rejects(() => f.service.sendOtp(phone), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
    assert.equal(f.diagnostics[0].code, code);
    assert.equal(f.diagnostics[0].status, status);
    assert.equal(f.diagnostics[0].operation, 'send');
    assert.equal(JSON.stringify(f.diagnostics).includes(privateValue), false);
    assert.equal(f.legacyCalls(), 0);
  }
});

test('network and non-JSON failures are sanitized and do not fall back', async () => {
  for (const kind of ['network', 'json']) {
    const f = fixture();
    kind === 'network' ? f.networkError() : f.invalidJson();
    await assert.rejects(() => f.service.sendOtp(phone), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
    assert.equal(f.diagnostics[0].code, kind === 'network' ? 'network_error' : 'invalid_response');
    assert.equal(f.legacyCalls(), 0);
  }
});

test('only Approved with the original session ID and matching approved phone report succeeds', async () => {
  for (const body of [
    {}, null, { status: 'Approved' },
    { status: 'Approved', request_id: newSessionId, phone: { status: 'Approved', full_number: phone } },
    { status: 'Approved', request_id: sessionId, phone: { status: 'Approved', full_number: otherPhone } },
    { status: 'Approved', request_id: sessionId, phone: { status: 'Declined', full_number: phone } },
    { status: 'Success', request_id: sessionId },
  ]) {
    const f = fixture();
    await f.service.sendOtp(phone);
    f.response(body);
    await assert.rejects(() => f.service.verifyOtp(phone, '123456'), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
    assert.equal(f.diagnostics[0].operation, 'check');
    assert.equal(f.service.validateVerifiedToken('fabricated', phone), false);
  }
});

test('Failed, Declined and Expired or Not Found never approve, even with unrelated response UUIDs', async () => {
  for (const status of ['Failed', 'Declined', 'Expired or Not Found']) {
    const f = fixture();
    await f.service.sendOtp(phone);
    f.response({ status, request_id: newSessionId });
    await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /Invalid or expired/);
    assert.equal(f.diagnostics.length, 0);
    assert.equal(f.service.validateVerifiedToken('fabricated', phone), false);
  }
});

test('Didit limits wrong-code checks to three, and Retry does not reset attempts or expiry', async () => {
  const f = fixture();
  await f.service.sendOtp(phone);
  f.checkStatus('Failed');
  for (let i = 0; i < 3; i++) await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /Invalid or expired/);
  const count = f.calls.length;
  await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /Maximum/);
  assert.equal(f.calls.length, count);
  f.advance(45_000);
  f.response({ status: 'Retry', request_id: sessionId });
  await f.service.sendOtp(phone);
  await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /Maximum/);
  f.advance(255_000);
  await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /No active/);
});

test('send cooldown, phone rate limit and concurrency guards remain active', async () => {
  const f = fixture();
  const sends = await Promise.allSettled([f.service.sendOtp(phone), f.service.sendOtp(phone)]);
  assert.equal(sends.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.calls.length, 1);
  await assert.rejects(() => f.service.sendOtp(phone), /wait/);
  for (let i = 0; i < 5; i++) { f.advance(45_000); await f.service.sendOtp(phone); }
  f.advance(45_000);
  await assert.rejects(() => f.service.sendOtp(phone), /Too many/);
});

test('new resend sessions invalidate old IDs and simultaneous checks cannot duplicate proofs', async () => {
  const f = fixture();
  await f.service.sendOtp(phone);
  f.advance(45_000);
  f.id(newSessionId);
  await f.service.sendOtp(phone);
  f.id(sessionId);
  await assert.rejects(() => f.service.verifyOtp(phone, '123456'), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
  f.id(newSessionId);
  const results = await Promise.allSettled([f.service.verifyOtp(phone, '123456'), f.service.verifyOtp(phone, '123456')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const approved = results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<any>;
  f.advance(900_000);
  assert.equal(f.service.validateVerifiedToken(approved.value.verificationToken, phone), false);
});

test('Didit operational diagnostics are sanitized and render in the protected admin view', () => {
  const privateValue = 'private-phone-key-code-body';
  const store = new PhoneVerificationDiagnosticStore();
  store.record({ provider: 'didit', status: 403, code: privateValue, requestId: privateValue,
    operation: 'send', message: privateValue, phone: privateValue } as any);
  const snapshot = store.snapshot();
  assert.equal(snapshot.events[0].provider, 'didit');
  assert.equal(snapshot.events[0].code, 'forbidden');
  assert.doesNotMatch(JSON.stringify(snapshot), /private-phone-key-code-body/);
  const html = renderToStaticMarkup(React.createElement(PhoneVerificationDiagnosticsView, {
    diagnostics: snapshot, loading: false, error: '', onRefresh: () => {},
  }));
  assert.match(html, /Didit is the signup SMS provider/);
  assert.match(html, /Didit ·/);
  assert.match(html, /HTTP 403/);
  for (const code of [privateValue, 'toString', '__proto__']) {
    assert.equal(describeDiditFailure(401, code).diagnostic.code, 'unauthorized');
  }
  assert.equal(describeDiditFailure(403, undefined, sessionId).diagnostic.requestId, sessionId);
});

test('the application selects Didit, with no browser key exposure or legacy singleton fallback', () => {
  const source = readFileSync(new URL('../src/server/otpService.ts', import.meta.url), 'utf8');
  assert.match(source, /new OtpService\(undefined, undefined, undefined, undefined, new DiditOtpProvider\(\)\)/);
  assert.doesNotMatch(source, /new InfobipOtpProvider/);
  const client = readFileSync(new URL('../src/lib/authClient.ts', import.meta.url), 'utf8');
  assert.match(client, /provider: 'didit'/);
  assert.doesNotMatch(client, /DIDIT_API_KEY|x-api-key/);
});
