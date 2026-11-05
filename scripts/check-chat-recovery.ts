/**
 * Controlled chat check. Uses only the existing two secret-backed test accounts.
 * Never prints credentials, session tokens, account identities or message content.
 * --provider tests the current server module against the matching live Stream app.
 * Without it, tests authenticated Nanivio HTTP routes at the supplied --target.
 * Creates one clearly labelled test conversation and two synthetic messages.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { upsertStreamChannel, addStreamMessage, getStreamMessages } from '../src/server/streamService.ts';

const target = process.argv.find(a => a.startsWith('--target='))?.slice(9);
if (!target) throw Error('Supply --target=https://naniviio.com or the development origin.');
const origin = new URL(target);
const allowed = ['naniviio.com', 'www.naniviio.com', '127.0.0.1', 'localhost', process.env.REPLIT_DEV_DOMAIN];
if (!allowed.includes(origin.hostname) || (origin.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(origin.hostname)))
  throw Error('Refusing to send test credentials to an unrecognized origin.');
const providerMode = process.argv.includes('--provider');
const nativeFetch = globalThis.fetch;
const report = (step: string, result: Record<string, unknown> = {}) => console.log(JSON.stringify({ step, ...result }));
let stage = 'setup';
let testChannelId = '';
const peers: Array<{ socket: WebSocket; messages: any[] }> = [];
globalThis.fetch = async (input, options) => {
  const response = await nativeFetch(input, options);
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === 'chat.stream-io-api.com' && !response.ok) {
    const detail = await response.clone().json().catch(() => ({})) as any;
    const message = String(detail.message || '').toLowerCase();
    const indicators = [
      ['language', /language/], ['user_context', /user_id|created_by|user context/],
      ['invalid_token', /jwt|signature|token/], ['permissions', /permission|forbidden|not allowed/],
      ['quota', /quota|rate limit|monthly active|concurrent connections/], ['configuration', /disabled|suspended|api key|billing|plan/],
      ['payload_size', /payload|request entity|size.*exceed|exceed.*size|maximum.*size/],
      ['missing_record', /not exist|not found/], ['state', /\bstate\b/],
      ['connection', /connection/], ['invalid_request', /invalid|validation|required|must be/],
    ] as const;
    report('provider_diagnostic', { status: response.status,
      code: typeof detail.code === 'number' ? detail.code : undefined,
      indicators: indicators.filter(([,pattern]) => pattern.test(message)).map(([label]) => label) });
  }
  return response;
};
async function request(path: string, token?: string, body?: unknown) {
  const response = await fetch(new URL(path, origin), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    report('http_failure', { status: response.status, serviceCode: /^CHAT_[A-Z_]+$/.test(data.serviceCode) ? data.serviceCode : undefined });
    throw Error('CONTROLLED_HTTP_CHECK_FAILED');
  }
  return data;
}
async function connectPeer(token: string) {
  const url = new URL('/ws', origin);
  url.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url, { origin: origin.origin, handshakeTimeout: 15000 });
  const peer = { socket, messages: [] as any[] };
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.terminate(); reject(Error('REALTIME_AUTH_TIMEOUT')); }, 20000);
    socket.on('open', () => socket.send(JSON.stringify({ type: 'auth:presence', payload: { token } })));
    socket.on('error', () => { clearTimeout(timeout); reject(Error('REALTIME_TRANSPORT_FAILED')); });
    socket.on('message', raw => {
      let event: any;try { event = JSON.parse(String(raw)); } catch { return; }
      if (event.type === 'auth:error') { clearTimeout(timeout); socket.close(); reject(Error('REALTIME_AUTH_FAILED')); }
      if (event.type === 'auth:presence_ack') { clearTimeout(timeout); resolve(); }
      // Discard unrelated presence/account information and other conversations.
      if (event.type === 'chat:message' && event.payload?.channelId === testChannelId) peer.messages.push(event.payload.message);
    });
  });
  peers.push(peer);
  return peer;
}
async function received(peer: typeof peers[number], id: string, senderId: string, text: string) {
  const until = Date.now() + 12000;
  while (Date.now() < until) {
    if (peer.messages.some(m => m.id === id && m.userId === senderId && m.text === text)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error('REALTIME_RECIPIENT_DID_NOT_RECEIVE_MESSAGE');
}
try {
  for (const key of ['STREAM_API_KEY','STREAM_API_SECRET','NANIVIO_TEST_EMAIL_A','NANIVIO_TEST_PASSWORD_A','NANIVIO_TEST_EMAIL_B','NANIVIO_TEST_PASSWORD_B'])
    assert.ok(process.env[key]?.trim(), 'Required test configuration is missing.');
  const accounts: any[] = [];
  for (const suffix of ['A','B']) {
    stage = `authenticate_${suffix}`;
    const data = await request('/api/auth/signin', undefined, {
      identifier: process.env[`NANIVIO_TEST_EMAIL_${suffix}`], password: process.env[`NANIVIO_TEST_PASSWORD_${suffix}`],
    });
    assert.ok(data.success && data.user?.id && data.session?.token, 'Test authentication did not return a usable session.');
    accounts.push({ user: data.user, token: data.session.token });
    report(stage, { passed: true });
  }
  const [a,b] = accounts;
  assert.notEqual(a.user.id, b.user.id, 'Two distinct test accounts are required.');
  stage = 'matching_provider_app';
  const config = await request('/api/stream/token', a.token, {});
  assert.equal(config.apiKey, process.env.STREAM_API_KEY!.trim(), 'Workspace and target use different Stream apps; no test conversation was created.');
  report(stage, { passed: true });
  const nonce = randomUUID().replaceAll('-', '');
  const draft: any = {
    id: `qa_${nonce}`, type: 'messaging', name: 'Nanivio controlled chat recovery check',
    members: accounts.map(({user}) => ({ userId: user.id, name: user.displayName || user.firstName || 'Test account',
      avatar: user.avatar, nvId: user.nvId, language: user.preferredLanguage, role: 'member' })),
    custom: { isGroup: false, description: 'Temporary conversation belonging only to the two designated test accounts.' },
    updatedAt: Date.now(),
  };
  stage = 'create_private_conversation';
  const channel = providerMode ? await upsertStreamChannel(draft, a.user.id)
    : (await request('/api/stream/channels', a.token, draft)).channel;
  assert.ok(channel?.id && channel.members.length === 2, 'A private two-account conversation was not returned.');
  assert.ok(accounts.every(({user}) => channel.members.some((m: any) => m.userId === user.id)));
  testChannelId = channel.id;
  report(stage, { passed: true });
  const livePeers = new Map<string, typeof peers[number]>();
  if (!providerMode) {
    stage = 'authenticated_realtime_connections';
    for (const account of accounts) livePeers.set(account.user.id, await connectPeer(account.token));
    report(stage, { passed: true, connectedPeers: livePeers.size });
  }
  for (const [sender, receiver, direction] of [[a,b,'A_to_B'],[b,a,'B_to_A']] as const) {
    stage = `send_${direction}`;
    const text = `Nanivio automated chat recovery check ${direction} ${nonce}`;
    const message = providerMode ? await addStreamMessage(channel.id, {
      id: `qa_${randomUUID()}`, channelId: channel.id, userId: sender.user.id,
      userName: sender.user.displayName || 'Test account', text, sourceLang: 'en',
      createdAt: Date.now(), reactions: [],
    }) : (await request(`/api/stream/channels/${channel.id}/messages`, sender.token, {
      text, sourceLang: 'en', userId: receiver.user.id, // HTTP must ignore a spoofed sender.
    })).message;
    assert.equal(message?.userId, sender.user.id, 'Sender must match the authenticated test account.');
    const messages = providerMode ? await getStreamMessages(channel.id, receiver.user.id)
      : (await request(`/api/stream/channels/${channel.id}/messages`, receiver.token)).messages;
    assert.ok(messages.some((m: any) => m.id === message.id && m.userId === sender.user.id && m.text === text),
      'Receiver could not read the actual saved message.');
    if (!providerMode) await received(livePeers.get(receiver.user.id)!, message.id, sender.user.id, text);
    report(stage, { saved: true, readableByReceiver: true, ...(!providerMode ? { realtimeReceived: true } : {}) });
  }
  stage = 'finished';
  report(stage, { passed: true, mode: providerMode ? 'current_server_module' : 'authenticated_http_routes' });
} catch (error: any) {
  // Do not print arbitrary errors or stacks that may include request details.
  report('failed', { stage, name: error?.name, status: error?.status,
    serviceCode: /^CHAT_[A-Z_]+$/.test(error?.serviceCode) ? error.serviceCode : undefined });
  process.exitCode = 1;
} finally {
  for (const peer of peers) peer.socket.close(1000);
  globalThis.fetch = nativeFetch;
}
