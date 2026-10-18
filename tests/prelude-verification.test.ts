import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OtpService } from '../src/server/otpService';
import { normalizeSignupPhone } from '../src/lib/phoneNumber';
import { PhoneVerification } from '../src/components/auth/PhoneVerification';
import * as auth from '../src/server/persistentAuth';
import { PUBLIC_PHONE_VERIFICATION_ERROR } from '../src/server/preludeErrors';

const phone = '+12025550123';
const otherPhone = '+442079460018';
function fixture() {
  let now = 1_000_000;
  let sendStatus = 'success';
  let checkStatus = 'success';
  let status = 200;
  let id = 'vrf_test';
  let configured = true;
  let networkError = false;
  const calls: { url: string; body: any; headers: any }[] = [];
  const request = (async (url: any, init: any) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    if (networkError) throw new Error('private provider diagnostics');
    return new Response(JSON.stringify({
      status: String(url).endsWith('/check') ? checkStatus : sendStatus, id, channels: ['sms'],
    }), { status });
  }) as typeof fetch;
  const service = new OtpService(request, () => now, () => configured ? 'test-only-not-a-credential' : undefined, () => {});
  return {
    service, calls,
    advance: (ms: number) => { now += ms; },
    sendStatus: (v: string) => { sendStatus = v; },
    checkStatus: (v: string) => { checkStatus = v; },
    status: (v: number) => { status = v; },
    id: (v: string) => { id = v; },
    configured: (v: boolean) => { configured = v; },
    networkError: () => { networkError = true; },
  };
}

test('global phone normalization handles trunk prefixes, shared codes and significant Italian zeros', () => {
  assert.equal(normalizeSignupPhone('020 7946 0018', '+44', 'United Kingdom'), otherPhone);
  assert.equal(normalizeSignupPhone('024 412 3456', '+233', 'Ghana'), '+233244123456');
  assert.equal(normalizeSignupPhone('02 36618 300', '+39', 'Italy'), '+390236618300');
  assert.equal(normalizeSignupPhone('(202) 555-0123', '+1', 'United States'), phone);
  assert.equal(normalizeSignupPhone(otherPhone, '+233', 'Ghana'), otherPhone);
  for (const bad of [undefined, {}, '123', 'abc', '+12345678901234567890', '+12025550123 ext 1']) {
    assert.throws(() => normalizeSignupPhone(bad));
  }
});

test('Prelude receives server-side Bearer auth and SMS preference; proof requires a matching successful check', async () => {
  const f = fixture();
  const sent = await f.service.sendOtp(phone);
  assert.equal(sent.provider, 'prelude');
  assert.equal(f.calls[0].url, 'https://api.prelude.dev/v2/verification');
  assert.deepEqual(f.calls[0].body, {
    target: { type: 'phone_number', value: phone },
    options: { method: 'message', preferred_channel: 'sms', code_size: 6 },
  });
  assert.equal(f.calls[0].headers.Authorization, 'Bearer test-only-not-a-credential');
  assert.equal('demoCode' in sent, false);
  const proof = await f.service.verifyOtp(phone, '123456');
  assert.equal(f.calls[1].url, 'https://api.prelude.dev/v2/verification/check');
  assert.equal(proof.verifiedPhone, phone);
  assert.equal(f.service.validateVerifiedToken(proof.verificationToken, otherPhone), false);
  assert.equal(f.service.validateVerifiedToken(proof.verificationToken, phone), true);
  assert.equal(f.service.validateVerifiedToken(proof.verificationToken, phone), false);
  await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /No active/);
});

test('missing credentials, upstream denial, malformed responses, blocks and network errors fail closed', async () => {
  const missing = fixture();
  missing.configured(false);
  await assert.rejects(() => missing.service.sendOtp(phone), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
  assert.equal(missing.calls.length, 0);
  for (const code of [401, 403, 429, 500]) {
    const f = fixture();
    f.status(code);
    await assert.rejects(() => f.service.sendOtp(phone));
    await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /No active/);
  }
  for (const status of ['blocked', 'challenged', 'shadow_blocked', 'unknown']) {
    const f = fixture();
    f.sendStatus(status);
    await assert.rejects(() => f.service.sendOtp(phone), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
  }
  const invalid = new OtpService(async () => new Response('not json'), Date.now, () => 'test');
  await assert.rejects(() => invalid.sendOtp(phone), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
  const network = fixture();
  network.networkError();
  await assert.rejects(() => network.service.sendOtp(phone), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
});

test('wrong, expired, mismatched and unconfigured checks cannot issue proofs', async () => {
  for (const status of ['failure', 'expired_or_not_found', 'transaction_missing', 'unknown']) {
    const f = fixture();
    await f.service.sendOtp(phone);
    f.checkStatus(status);
    await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /Invalid or expired/);
  }
  const mismatch = fixture();
  await mismatch.service.sendOtp(phone);
  mismatch.id('vrf_different');
  await assert.rejects(() => mismatch.service.verifyOtp(phone, '123456'));
  const missing = fixture();
  await missing.service.sendOtp(phone);
  missing.configured(false);
  await assert.rejects(() => missing.service.verifyOtp(phone, '123456'), { message: PUBLIC_PHONE_VERIFICATION_ERROR });
  const expired = fixture();
  await expired.service.sendOtp(phone);
  expired.advance(300_000);
  await assert.rejects(() => expired.service.verifyOtp(phone, '123456'), /No active/);
  const proof = fixture();
  await proof.service.sendOtp(phone);
  const verified = await proof.service.verifyOtp(phone, '123456');
  proof.advance(900_000);
  assert.equal(proof.service.validateVerifiedToken(verified.verificationToken, phone), false);
});

test('cooldowns, resend budgets and verification attempts are enforced before provider calls', async () => {
  const f = fixture();
  await f.service.sendOtp(phone);
  await assert.rejects(() => f.service.sendOtp(phone), /wait/);
  f.checkStatus('failure');
  for (let i = 0; i < 5; i++) await assert.rejects(() => f.service.verifyOtp(phone, '123456'));
  f.advance(45_000);
  f.sendStatus('retry');
  await f.service.sendOtp(phone);
  const count = f.calls.length;
  await assert.rejects(() => f.service.verifyOtp(phone, '123456'), /Maximum/);
  assert.equal(f.calls.length, count);
  for (let i = 0; i < 4; i++) { f.advance(45_000); await f.service.sendOtp(phone); }
  f.advance(45_000);
  await assert.rejects(() => f.service.sendOtp(phone), /Too many/);
  await assert.rejects(() => f.service.sendOtp(otherPhone, 'whatsapp'), /SMS only/);
});

test('concurrent sends/checks allow only one provider operation and one proof', async () => {
  const f = fixture();
  const sends = await Promise.allSettled([f.service.sendOtp(phone), f.service.sendOtp(phone)]);
  assert.equal(sends.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.calls.length, 1);
  const checks = await Promise.allSettled([f.service.verifyOtp(phone, '123456'), f.service.verifyOtp(phone, '123456')]);
  assert.equal(checks.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.calls.length, 2);
});

test('all registration roles reject absent or fabricated proof before contacting Supabase', async () => {
  const personal = { email: 'offline@example.invalid', password: 'offline-test-password',
    phoneNumber: phone, callingCode: '+1', country: 'United States', verificationToken: 'forged' } as any;
  await assert.rejects(() => auth.registerPersonal(personal), /Verify your phone/);
  await assert.rejects(() => auth.registerExpert({ personal } as any), /Verify your phone/);
  await assert.rejects(() => auth.registerBusiness({ personal } as any), /Verify your phone/);
  await assert.rejects(() => auth.registerDriver({ personal } as any), /Verify your phone/);
});

test('verification UI covers every signup form and has no sandbox code or Twilio dependency', () => {
  const screen = readFileSync(new URL('../src/components/auth/NanivioAuthScreen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /verificationPanel\(personalPhone/);
  assert.match(screen, /verificationPanel\(expertPhone/);
  assert.equal((screen.match(/verificationPanel\(bizPhone/g) || []).length, 2);
  assert.equal((screen.match(/const verificationToken = proofFor/g) || []).length, 3);
  assert.doesNotMatch(screen, /demoCode|otpSandboxCode|Twilio/);
  const html = renderToStaticMarkup(React.createElement(PhoneVerification, {
    phone, callingCode: '+1', country: 'United States', verified: false, onVerified: () => {},
  }));
  assert.match(html, /Send verification code/);
  assert.doesNotMatch(html, /test-only|demoCode/);
});
