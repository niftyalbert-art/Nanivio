import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSignupEmailSender } from '../src/server/signupEmailDelivery';

const from = 'Nanivio <verify@naniviio.com>';
const accepted = () => Response.json({ id: 'test-accepted-message' });

test('connected delivery needs no raw key and sends only through the connector', async () => {
  let body: any;
  const send = createSignupEmailSender(
    () => ({ RESEND_TRANSPORT: 'connector', RESEND_FROM_EMAIL: from }),
    async () => { throw new Error('Direct request forbidden'); },
    async (payload) => { body = JSON.parse(payload); return accepted(); },
  );
  await send('owner@example.test', '123456');
  assert.equal(body.from, from);
  assert.deepEqual(body.to, ['owner@example.test']);
  assert.match(body.text, /123456/);
});

test('Render defaults to direct delivery with auth, user-agent and timeout', async () => {
  let init: RequestInit | undefined;
  const send = createSignupEmailSender(
    () => ({ RESEND_FROM_EMAIL: from, RESEND_API_KEY: 'test-only-key' }),
    async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      init = options;
      return accepted();
    },
    async () => { throw new Error('Connector forbidden'); },
  );
  await send('owner@example.test', '123456');
  assert.equal((init!.headers as any).Authorization, 'Bearer test-only-key');
  assert.equal((init!.headers as any)['User-Agent'], 'Nanivio');
  assert.equal(init!.redirect, 'error');
  assert.ok(init!.signal);
});

test('missing config and unknown transports fail before a provider request', async () => {
  for (const env of [
    {}, { RESEND_FROM_EMAIL: from },
    { RESEND_TRANSPORT: 'connector' },
    { RESEND_TRANSPORT: 'unknown', RESEND_FROM_EMAIL: from, RESEND_API_KEY: 'test-only' },
  ]) {
    const rejectRequest = async () => { assert.fail('No provider request permitted'); };
    const send = createSignupEmailSender(() => env, rejectRequest, rejectRequest);
    await assert.rejects(send('owner@example.test', '123456'), /not configured/);
  }
});

test('rejection, malformed success and network errors do not fall back or expose details', async () => {
  for (const proxy of [
    async () => Response.json({ message: 'private-provider-details' }, { status: 403 }),
    async () => Response.json({}),
    async () => { throw new Error('private-provider-details'); },
  ]) {
    const send = createSignupEmailSender(
      () => ({ RESEND_TRANSPORT: 'connector', RESEND_FROM_EMAIL: from }),
      async () => { assert.fail('Must not fall back'); },
      proxy,
    );
    await assert.rejects(send('owner@example.test', '123456'),
      { message: 'We could not send your verification email. Please try again later.' });
  }
});
