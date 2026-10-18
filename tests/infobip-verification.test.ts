import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OtpService } from '../src/server/otpService';
import { InfobipOtpProvider, type InfobipOtpConfiguration } from '../src/server/infobipOtpProvider';
import { describeInfobipFailure, type InfobipFailureDiagnostic } from '../src/server/infobipErrors';
import { PUBLIC_PHONE_VERIFICATION_ERROR } from '../src/server/preludeErrors';
import { PhoneVerificationDiagnosticStore } from '../src/server/phoneVerificationDiagnostics';
import { PhoneVerificationDiagnosticsView } from '../src/components/admin/AdminPhoneVerificationDiagnostics';

const phone = '+12025550123';
const otherPhone = '+442079460018';
const config: InfobipOtpConfiguration = {
  apiKey: 'test-only-not-a-real-key', baseUrl: 'https://test-account.api.infobip.com',
  applicationId: 'test-application', messageId: 'test-template',
};

function fixture() {
  let now = 1_000_000;
  let settings: InfobipOtpConfiguration = { ...config };
  let id = 'pin_test';
  let responseStatus = 200;
  let response: any;
  let networkError = false;
  let invalidJson = false;
  let verified = true;
  let recipient = phone.slice(1);
  let checkId: string | undefined;
  let legacyCalls = 0;
  const diagnostics: InfobipFailureDiagnostic[] = [];
  const calls: { url: string; init: RequestInit; body: any }[] = [];
  const request = (async (url: any, init: any) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    if (networkError) throw new Error('private upstream body');
    const body = response ?? (String(url).endsWith('/verify')
      ? { pinId: checkId ?? id, msisdn: recipient, verified }
      : { pinId: id, to: recipient, smsStatus: 'MESSAGE_SENT' });
    return new Response(invalidJson ? 'private non-JSON upstream body' : JSON.stringify(body), { status: responseStatus });
  }) as typeof fetch;
  const provider = new InfobipOtpProvider(request, () => settings, d => diagnostics.push(d));
  const service = new OtpService(
    async () => { legacyCalls++; throw new Error('Prelude must never be called'); },
    () => now, () => undefined, () => {}, provider,
  );
  return {
    provider, service, calls, diagnostics, legacyCalls: () => legacyCalls,
    advance: (ms: number) => { now += ms; },
    configure: (value: InfobipOtpConfiguration) => { settings = value; },
    response: (value: any, status = 200) => { response = value; responseStatus = status; },
    id: (value: string) => { id = value; },
    checkId: (value: string) => { checkId = value; },
    recipient: (value: string) => { recipient = value; },
    verified: (value: boolean) => { verified = value; },
    networkError: () => { networkError = true; },
    invalidJson: () => { invalidJson = true; },
  };
}

test('Infobip uses account URL, App authentication, SMS template and matching provider-backed proof', async () => {
  const f = fixture();
  const sent = await f.service.sendOtp(phone);
  assert.equal(sent.provider, 'infobip');
  assert.equal(sent.channel, 'sms');
  assert.equal(f.calls[0].url, `${config.baseUrl}/2fa/2/pin?ncNeeded=false`);
  assert.equal((f.calls[0].init.headers as any).Authorization, `App ${config.apiKey}`);
  assert.equal(f.calls[0].init.redirect, 'error');
  assert.deepEqual(f.calls[0].body, {
    applicationId: config.applicationId, messageId: config.messageId, to: phone.slice(1),
  });
  const result = await f.service.verifyOtp(phone, '123456');
  assert.equal(f.calls[1].url, `${config.baseUrl}/2fa/2/pin/pin_test/verify`);
  assert.deepEqual(f.calls[1].body, { pin: '123456' });
  assert.equal(result.verifiedPhone, phone);
  assert.equal(f.service.validateVerifiedToken(result.verificationToken, otherPhone), false);
  assert.equal(f.service.validateVerifiedToken(result.verificationToken, phone), true);
  assert.equal(f.service.validateVerifiedToken(result.verificationToken, phone), false);
  assert.equal(f.legacyCalls(), 0);
  assert.equal(f.diagnostics.length, 0);
});

test('missing settings fail closed without a network call or any Prelude fallback', async () => {
  for (const field of ['apiKey', 'baseUrl', 'applicationId', 'messageId'] as const) {
    const f = fixture();
    f.configure({ ...config, [field]: undefined });
    await assert.rejects(() => f.service.sendOtp(phone), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
    assert.equal(f.calls.length, 0);
    assert.equal(f.legacyCalls(), 0);
    assert.equal(f.diagnostics[0].provider, 'infobip');
    assert.equal(f.diagnostics[0].code, 'not_configured');
    await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /No active/);
  }
});

test('configuration cannot forward credentials to arbitrary hosts, redirects or paths', async () => {
  for (const baseUrl of [
    'http://test-account.api.infobip.com', 'https://example.invalid',
    'https://test-account.api.infobip.com.example.invalid', 'https://user:pass@test-account.api.infobip.com',
    'https://test-account.api.infobip.com:8443', 'https://test-account.api.infobip.com/2fa',
    'https://test-account.api.infobip.com/?private=1', 'https://test-account.api.infobip.com/#private',
    'not-a-url',
  ]) {
    const f = fixture();
    f.configure({ ...config, baseUrl });
    await assert.rejects(() => f.service.sendOtp(phone), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
    assert.equal(f.diagnostics[0].code, 'invalid_configuration');
    assert.equal(f.calls.length, 0);
  }
  for (const change of [{ apiKey: 'App test' }, { apiKey: ' test ' }, { applicationId: 'bad/id' }, { messageId: ' ' }]) {
    const f = fixture();
    f.configure({ ...config, ...change });
    await assert.rejects(() => f.service.sendOtp(phone), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
    assert.equal(f.calls.length, 0);
  }
});

test('unsent, missing, mismatched or malformed sends never create an active challenge', async () => {
  for (const response of [
    {}, null, { smsStatus: 'MESSAGE_NOT_SENT', pinId: 'pin_test', to: phone.slice(1) },
    { smsStatus: 'UNKNOWN', pinId: 'pin_test', to: phone.slice(1) },
    { smsStatus: 'MESSAGE_SENT', pinId: '', to: phone.slice(1) },
    { smsStatus: 'MESSAGE_SENT', pinId: '../private', to: phone.slice(1) },
    { smsStatus: 'MESSAGE_SENT', pinId: 'pin_test', to: otherPhone.slice(1) },
  ]) {
    const f = fixture();
    // JSON null must not be mistaken for the fixture's default response.
    f.response(response === null ? [] : response);
    await assert.rejects(() => f.service.sendOtp(phone), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
    await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /No active/);
    assert.equal(f.legacyCalls(), 0);
    assert.equal(f.diagnostics.length, 1);
  }
});

test('HTTP, network and non-JSON failures have safe admin diagnostics and identical public errors', async () => {
  const privateValue = 'private-key-phone-code-body';
  for (const status of [400, 401, 402, 403, 429, 500, 503]) {
    const f = fixture();
    f.response({ requestError: { serviceException: { messageId: privateValue, text: privateValue } } }, status);
    await assert.rejects(() => f.service.sendOtp(phone), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
    assert.equal(f.diagnostics[0].status, status);
    assert.equal(f.diagnostics[0].operation, 'send');
    assert.equal(JSON.stringify(f.diagnostics).includes(privateValue), false);
    assert.equal(f.legacyCalls(), 0);
  }
  for (const kind of ['network', 'json'] as const) {
    const f = fixture();
    kind === 'network' ? f.networkError() : f.invalidJson();
    await assert.rejects(() => f.service.sendOtp(phone), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
    assert.equal(f.diagnostics[0].code, kind === 'network' ? 'network_error' : 'invalid_response');
    assert.equal(f.legacyCalls(), 0);
  }
});

test('check requires true verification and matching PIN ID and recipient', async () => {
  for (const response of [
    { verified: true }, { pinId: 'pin_test', msisdn: phone.slice(1), verified: 'true' },
    { pinId: 'different', msisdn: phone.slice(1), verified: true },
    { pinId: 'pin_test', msisdn: otherPhone.slice(1), verified: true },
    { pinId: 'pin_test', msisdn: phone.slice(1), verified: false },
    { pinId: 'pin_test', msisdn: phone.slice(1), verified: true, pinError: 'WRONG_PIN' },
  ]) {
    const f = fixture();
    await f.service.sendOtp(phone);
    f.response(response);
    await assert.rejects(() => f.service.verifyOtp(phone, '123456'));
    assert.equal(f.service.validateVerifiedToken('fabricated', phone), false);
    assert.equal(f.legacyCalls(), 0);
  }
});

test('Infobip preserves cooldown, rate limits, attempts, expiry and concurrent single-use behavior', async () => {
  const f = fixture();
  const sends = await Promise.allSettled([f.service.sendOtp(phone), f.service.sendOtp(phone)]);
  assert.equal(sends.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.calls.length, 1);
  await assert.rejects(() => f.service.sendOtp(phone), /wait/);
  f.verified(false);
  for (let i = 0; i < 5; i++) await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /Invalid or expired/);
  const count = f.calls.length;
  await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /Maximum/);
  assert.equal(f.calls.length, count);
  // Same provider PIN ID cannot reset attempts on resend.
  f.advance(45_000);
  await f.service.sendOtp(phone);
  await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /Maximum/);
  for (let i = 0; i < 4; i++) { f.advance(45_000); await f.service.sendOtp(phone); }
  f.advance(45_000);
  await assert.rejects(() => f.service.sendOtp(phone), /Too many/);

  const success = fixture();
  await success.service.sendOtp(phone);
  const checks = await Promise.allSettled([success.service.verifyOtp(phone, '123456'), success.service.verifyOtp(phone, '123456')]);
  assert.equal(checks.filter(r => r.status === 'fulfilled').length, 1);
  const result = checks.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>;
  success.advance(900_000);
  assert.equal(success.service.validateVerifiedToken(result.value.verificationToken, phone), false);
  const expired = fixture();
  await expired.service.sendOtp(phone);
  expired.advance(300_000);
  await assert.rejects(() => expired.service.verifyOtp(phone, '123456'), /No active/);
});

test('a new Infobip resend challenge invalidates the old provider PIN ID', async () => {
  const f = fixture();
  await f.service.sendOtp(phone);
  f.advance(45_000);
  f.id('pin_new');
  await f.service.sendOtp(phone);
  f.checkId('pin_test');
  await assert.rejects(() => f.service.verifyOtp(phone, '123456'), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
  assert.ok(f.calls[2].url.endsWith('/pin/pin_new/verify'));
});

test('Infobip diagnostics remain sanitized and render the correct provider in the protected admin view', () => {
  const privateValue = 'private-provider-body';
  const store = new PhoneVerificationDiagnosticStore();
  store.record({ provider: 'infobip', status: 403, code: privateValue, requestId: privateValue,
    operation: 'send', message: privateValue, key: privateValue } as any);
  const snapshot = store.snapshot();
  assert.equal(snapshot.events[0].provider, 'infobip');
  assert.equal(snapshot.events[0].code, 'forbidden');
  assert.equal(JSON.stringify(snapshot).includes(privateValue), false);
  const html = renderToStaticMarkup(React.createElement(PhoneVerificationDiagnosticsView, {
    diagnostics: snapshot, loading: false, error: '', onRefresh: () => {},
  }));
  assert.match(html, /Infobip/);
  assert.doesNotMatch(html, /Prelude ·/);
  assert.match(html, /HTTP 403/);
  for (const code of [privateValue, 'toString', '__proto__']) {
    assert.equal(describeInfobipFailure(401, code).diagnostic.code, 'unauthorized');
  }
});

test('application singleton selects Infobip independently of retained Prelude credentials', () => {
  const source = readFileSync(new URL('../src/server/otpService.ts', import.meta.url), 'utf8');
  assert.match(source, /export const otpService = new OtpService\(undefined, undefined, undefined, undefined, new InfobipOtpProvider\(\)\)/);
  const client = readFileSync(new URL('../src/lib/authClient.ts', import.meta.url), 'utf8');
  assert.match(client, /provider: 'infobip'/);
  assert.doesNotMatch(client, /process\.env\.INFOBIP|Authorization:.*App /);
});
