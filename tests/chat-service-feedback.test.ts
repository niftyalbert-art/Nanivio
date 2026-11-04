import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatSendError, chatSendFeedback } from '../src/lib/chatSendFeedback';
import { CHAT_SERVICE_ERRORS } from '../src/shared/chatServiceErrors';
import { realtimeClient } from '../src/lib/realtimeClient';
import { build } from 'esbuild';
import vm from 'node:vm';
import { createRequire } from 'node:module';

test('chat feedback exposes only application-owned support messages and retains drafts', () => {
  for (const code of Object.keys(CHAT_SERVICE_ERRORS)) {
    const message = chatSendFeedback(new ChatSendError('unavailable', code));
    assert.ok(message.includes(`Support code: ${code}`));
    assert.ok(message.includes('Your draft is still here.'));
  }
  for (const code of ['PRIVATE_UPSTREAM_DETAIL', '__proto__', 'toString', { token: 'PRIVATE' }]) {
    assert.equal(new ChatSendError('unavailable', code).serviceCode, undefined);
    assert.doesNotMatch(chatSendFeedback(new ChatSendError('unavailable', code)), /PRIVATE|__proto__|toString/);
  }
  assert.match(chatSendFeedback(new ChatSendError('access', 'CHAT_CONFIGURATION_REQUIRED')), /no longer have access/);
});

test('matching websocket failure retains the safe service code and does not acknowledge delivery', async () => {
  const client = realtimeClient as any;
  const socket = client.socket, user = client.currentUser;
  let request: any;
  client.currentUser = { userId: 'fixture-self' };
  client.socket = { readyState: WebSocket.OPEN, send: (raw: string) => { request = JSON.parse(raw); } };
  try {
    const pending = client.sendPrivateChatMessage('conversation', 'room', { senderId: 'fixture-self', text: 'Test' });
    client.emit('chat:error', { requestId: request.payload.requestId, code: 'unavailable',
      serviceCode: 'CHAT_CONFIGURATION_REQUIRED', message: 'PRIVATE_PROVIDER_DETAIL' });
    await assert.rejects(pending, (error: unknown) =>
      error instanceof ChatSendError && error.serviceCode === 'CHAT_CONFIGURATION_REQUIRED'
        && !chatSendFeedback(error).includes('PRIVATE'));
  } finally { client.socket = socket; client.currentUser = user; }
});

test('actual channel client retains safe HTTP diagnostics, keeps access errors distinct, and rejects unreadable success responses', async () => {
  const bundle = await build({
    entryPoints: ['src/lib/streamClient.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'fixture-session', setup(b) {
      b.onResolve({ filter: /authClient$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: "export const authClient={getToken:()=> 'fixture-session'};",
      }));
    } }],
  });
  for (const [status, serviceCode, expected] of [
    [503, 'CHAT_CONFIGURATION_REQUIRED', 'unavailable'],
    [502, 'CHAT_PROVIDER_REJECTED', 'unavailable'],
    [504, 'CHAT_PROVIDER_TIMEOUT', 'unavailable'],
    [401, undefined, 'session'],
    [403, undefined, 'access'],
    [200, undefined, 'unavailable'],
  ] as const) {
    const context = vm.createContext({
      module: { exports: {} }, require: createRequire(import.meta.url), console,
      fetch: async (url: string, options: any) => {
        assert.equal(url, '/api/stream/channels');
        assert.equal(options.headers.Authorization, 'Bearer fixture-session');
        return status === 200 ? new Response('<html>PRIVATE_CONTENT</html>')
          : Response.json({ error: 'PRIVATE_PROVIDER_DETAIL', serviceCode }, { status });
      },
    });
    vm.runInContext(bundle.outputFiles[0].text, context);
    const client = (context.module as any).exports.streamClient;
    await assert.rejects(client.createChannel('room', 'Private conversation', [], 'messaging'), (error: any) => {
      assert.equal(error.code, expected);
      assert.equal(error.serviceCode, status === 200 ? 'CHAT_PROVIDER_RESPONSE_INVALID' : serviceCode);
      assert.doesNotMatch(error.message, /PRIVATE/);
      return true;
    });
  }
});
