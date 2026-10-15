import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';
import express from 'express';
import ts from 'typescript';
import { redactApplicationSecrets } from '../src/server/applicationPrivacy.ts';
import {
  canManageChannelMembers, canRemoveChannelMember, channelRecipients, isChannelMember,
  normalizeChannelId, requireActiveChatAccount, requireStreamWebhookSignature,
  StreamAccessError, verifyStreamWebhook,
} from '../src/server/chatPrivacy.ts';
import { requireStreamChannelMember } from '../src/server/streamService.ts';
import { ownedChatSnapshot, readPrivateChatCache, writePrivateChatCache } from '../src/lib/privateChatStorage.ts';

// Pure authorization/serialization fixtures, not provider responses, payments,
// signed-in accounts, or evidence of real provider/mobile end-to-end behavior.
test('registration serialization removes nested authentication credentials without changing the authentication input', () => {
  const input = {
    personal: { firstName: 'Fixture', password: 'PUBLIC_TEST_MARKER', confirm_password: 'PUBLIC_TEST_MARKER', country: 'Fixture country' },
    title: 'Qualification retained',
    qualifications: [{ name: 'Certificate retained', PasswordHash: 'PUBLIC_TEST_MARKER', certificateUrl: '/documents/test' }],
    details: { 'access-token': 'PUBLIC_TEST_MARKER', RefreshToken: 'PUBLIC_TEST_MARKER', api_key: 'PUBLIC_TEST_MARKER', PrivateKey: 'PUBLIC_TEST_MARKER', securityAnswer: 'PUBLIC_TEST_MARKER' },
    verified: false, experienceYears: 0, optional: null,
  };
  const original = JSON.stringify(input);
  const safe = redactApplicationSecrets(input);
  assert.equal(JSON.stringify(input), original, 'Authentication input must remain available to Supabase.');
  assert.notEqual(safe, input);
  assert.deepEqual(safe.personal, { firstName: 'Fixture', country: 'Fixture country' });
  assert.deepEqual(safe.qualifications, [{ name: 'Certificate retained', certificateUrl: '/documents/test' }]);
  assert.deepEqual(safe.details, {});
  assert.equal(safe.verified, false);
  assert.equal(safe.experienceYears, 0);
  assert.equal(safe.optional, null);
  assert.equal(JSON.stringify(safe).includes('PUBLIC_TEST_MARKER'), false);
});

test('historical application payloads and malicious JSON keys are sanitized recursively', () => {
  const input = JSON.parse('{"personal":{"PASSWORD":"PUBLIC_TEST_MARKER","name":"Retained"},"nested":[{"newPassword":"PUBLIC_TEST_MARKER","id":2}],"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
  assert.deepEqual(redactApplicationSecrets(input), { personal: { name: 'Retained' }, nested: [{ id: 2 }] });
  assert.equal(({} as any).polluted, undefined);
  const cyclic: any = {}; cyclic.child = cyclic;
  assert.throws(() => redactApplicationSecrets(cyclic), /cycles/);
  let deep: any = {}; for (let index = 0; index < 70; index++) deep = { child: deep };
  assert.throws(() => redactApplicationSecrets(deep), /deeply nested/);
});

test('only exact member account IDs authorize channel access', () => {
  const members = [{ userId: 'account-alice' }, { userId: 'account-bob' }];
  assert.equal(isChannelMember('account-alice', members), true);
  for (const id of ['', 'account-mallory', 'NV-ALICE', 'ACCOUNT-ALICE']) assert.equal(isChannelMember(id, members), false);
});

test('private fan-out selects members only, including multiple authenticated tabs, never aliases or unrelated clients', () => {
  const aliceTab = {}, aliceOtherTab = {}, bob = {}, unrelated = {}, alias = {}, anonymous = {};
  const authenticated = new Map([
    ['account-alice', new Set([aliceTab, aliceOtherTab])], ['account-bob', new Set([bob])],
    ['account-mallory', new Set([unrelated])], ['NV-ALICE', new Set([alias])],
  ]);
  const recipients = channelRecipients([{ userId: 'account-alice' }, { userId: 'account-bob' }, { userId: 'account-alice' }], authenticated);
  assert.equal(recipients.size, 3);
  for (const expected of [aliceTab, aliceOtherTab, bob]) assert.equal(recipients.has(expected), true);
  for (const excluded of [unrelated, alias, anonymous]) assert.equal(recipients.has(excluded), false);
  assert.equal(channelRecipients([], authenticated).size, 0);
});

test('membership changes use authoritative channel authority, not application-wide admin or request roles', () => {
  const owner = { userId: 'owner', role: 'member' };
  const moderator = { userId: 'moderator', role: 'admin' };
  const member = { userId: 'member', role: 'member' };
  assert.equal(canManageChannelMembers(owner, 'owner'), true);
  assert.equal(canManageChannelMembers(moderator, 'owner'), true);
  assert.equal(canManageChannelMembers(member, 'owner'), false);
  assert.equal(canManageChannelMembers({ userId: 'global-admin', role: 'SUPER_ADMIN' }, 'owner'), false);
  assert.equal(canManageChannelMembers({ userId: '', role: 'admin' }, 'owner'), false);
  assert.equal(canRemoveChannelMember(member, 'member', 'owner'), true, 'A member may leave.');
  assert.equal(canRemoveChannelMember(member, 'another', 'owner'), false);
  assert.equal(canRemoveChannelMember(moderator, 'another', 'owner'), true);
  assert.equal(canRemoveChannelMember(moderator, 'owner', 'owner'), false, 'Only the creator may remove themselves.');
  assert.equal(canRemoveChannelMember(owner, 'owner', 'owner'), true);
});

test('invalid channel IDs cannot change the provider URL or channel type', () => {
  assert.equal(normalizeChannelId('messaging:nv_room-123'), 'nv_room-123');
  for (const id of ['', '../room', 'room/other', 'room?query=1', 'livestream:room', 'messaging:messaging:room', 'a'.repeat(65)]) {
    assert.throws(() => normalizeChannelId(id), StreamAccessError);
  }
});

test('an absent actor is rejected before any provider configuration or request is used', async () => {
  await assert.rejects(requireStreamChannelMember('private-room', ''), (error: any) => error.status === 401);
});

test('webhook verification checks exact signed bytes, key, and signature length without throwing', () => {
  const body = Buffer.from('{"type":"unit.crypto.fixture","value":"unchanged"}');
  const publicFixtureKey = 'PUBLIC_UNIT_TEST_SIGNING_KEY_NOT_A_PROVIDER_CREDENTIAL';
  const signature = createHmac('sha256', publicFixtureKey).update(body).digest('hex');
  assert.equal(verifyStreamWebhook(body, signature, publicFixtureKey), true);
  assert.equal(verifyStreamWebhook(body, signature.toUpperCase(), publicFixtureKey), true);
  assert.equal(verifyStreamWebhook(Buffer.from(`${body} `), signature, publicFixtureKey), false);
  assert.equal(verifyStreamWebhook(body, signature, `${publicFixtureKey}_different`), false);
  for (const bad of ['', 'a', 'x'.repeat(64), signature.slice(1), `${signature},${signature}`]) assert.equal(verifyStreamWebhook(body, bad, publicFixtureKey), false);
  assert.equal(verifyStreamWebhook(undefined, signature, publicFixtureKey), false);
  assert.equal(verifyStreamWebhook(body, signature, ''), false);
});

test('Express preserves the uncompressed signed JSON bytes for plain and gzip webhook requests', async () => {
  const publicFixtureKey = 'PUBLIC_UNIT_TEST_SIGNING_KEY_NOT_A_PROVIDER_CREDENTIAL';
  const body = Buffer.from('{"type":"unit.crypto.fixture"}');
  const signature = createHmac('sha256', publicFixtureKey).update(body).digest('hex');
  const app = express();
  app.use(express.json({ verify: (req, _res, buffer) => { (req as any).rawBody = Buffer.from(buffer); } }));
  app.post('/signature-fixture', (req, res) => {
    res.sendStatus(verifyStreamWebhook((req as any).rawBody, req.get('x-signature') || '', publicFixtureKey) ? 204 : 401);
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}/signature-fixture`;
    for (const compressed of [false, true]) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': signature, ...(compressed ? { 'Content-Encoding': 'gzip' } : {}) },
        body: compressed ? gzipSync(body) : body,
      });
      assert.equal(response.status, 204);
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('real HTTP requests without an active verified principal cannot enter private account handlers', async () => {
  const app = express();
  let handlersEntered = 0;
  app.use((req, _res, next) => {
    if (req.get('x-unit-inactive') === 'true') (req as any).authUser = { id: 'inactive-fixture', accountStatus: 'SUSPENDED' };
    next();
  });
  app.use('/private-account-fixture', requireActiveChatAccount, (_req, res) => { handlersEntered++; res.sendStatus(204); });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}/private-account-fixture`;
    for (const inactive of [false, true]) for (const method of ['GET', 'HEAD', 'POST']) {
      const response = await fetch(url, { method, headers: inactive ? { 'x-unit-inactive': 'true' } : {} });
      assert.equal(response.status, 403);
    }
    assert.equal(handlersEntered, 0);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('real HTTP unsigned webhook requests stop before the processing handler', async () => {
  const app = express();
  let processed = 0;
  app.use(express.json({ verify: (req, _res, buffer) => { (req as any).rawBody = Buffer.from(buffer); } }));
  app.post('/webhook-fixture', requireStreamWebhookSignature, (_req, res) => { processed++; res.sendStatus(204); });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}/webhook-fixture`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"type":"unit.invalid.signature"}',
    });
    assert.ok([401, 503].includes(response.status));
    assert.equal(processed, 0);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('actual private Stream routes register authentication and active-account guards; webhook registers its signature guard', () => {
  const text = source('server.ts');
  const file = ts.createSourceFile('server.ts', text, ts.ScriptTarget.Latest, true);
  const routes = new Map<string, string[]>();
  for (const statement of file.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
    const call = statement.expression;
    if (!ts.isPropertyAccessExpression(call.expression) || call.expression.expression.getText(file) !== 'app') continue;
    if (!ts.isStringLiteral(call.arguments[0])) continue;
    routes.set(`${call.expression.name.text} ${call.arguments[0].text}`, call.arguments.slice(1).map(arg => arg.getText(file)));
  }
  const privateRoutes = [
    'get /api/stream/config', 'post /api/stream/token', 'get /api/stream/channels', 'post /api/stream/channels',
    'get /api/stream/channels/:channelId', 'get /api/stream/channels/:channelId/messages',
    'post /api/stream/channels/:channelId/messages', 'post /api/stream/channels/:channelId/reactions',
    'post /api/stream/channels/:channelId/members/remove', 'post /api/stream/channels/:channelId/members/moderate',
    'get /api/realtime/active-users',
  ];
  for (const path of privateRoutes) assert.deepEqual(routes.get(path)?.slice(0, 2), ['requireAuthenticatedUser', 'requireActiveChatAccount'], path);
  assert.equal(routes.get('get /api/stream/logs')?.[0], 'requireAdmin');
  assert.equal(routes.get('post /api/stream/webhook')?.[0], 'requireStreamWebhookSignature');
  assert.match(text, /getStreamChannel\(req\.params\.channelId, authenticatedUserId\(req\)\)/);
  assert.match(text, /getStreamMessages\(req\.params\.channelId, authenticatedUserId\(req\)\)/);
  const sendRoute = routes.get('post /api/stream/channels/:channelId/messages')!.at(-1)!;
  const memberCheck = sendRoute.indexOf('requireStreamChannelMember(');
  assert.ok(memberCheck >= 0);
  for (const provider of ['callKhayaEngine(', 'callSunbirdEngine(', 'translateWithProductionProviders(']) {
    assert.ok(sendRoute.indexOf(provider) > memberCheck, provider);
  }
});

test('actual service and realtime paths enforce membership and private fan-out, including the legacy message route', () => {
  const service = source('src/server/streamService.ts');
  for (const functionName of ['getStreamChannel', 'getStreamMessages', 'addStreamMessage']) {
    const file = ts.createSourceFile('streamService.ts', service, ts.ScriptTarget.Latest, true);
    const fn = file.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === functionName) as ts.FunctionDeclaration;
    assert.match(fn.body!.getText(file), /await requireStreamChannelMember\(/, functionName);
  }
  assert.match(service, /id = `nv_\$\{crypto\.randomUUID\(\)/, 'Creation cannot collide with a caller-chosen existing ID.');
  assert.match(service, /filter_conditions: \{ cid:.*members:/);
  assert.match(service, /filter_conditions: \{ id: userId \}/, 'Use the documented GetStream member identity filter.');
  assert.match(service, /}, message\.userId\)/, 'Provider write uses the verified actor token, not a server-only bypass.');
  assert.doesNotMatch(service, /getStreamMessages\(channelId\)/);
  const realtime = source('src/server/realtimeServer.ts');
  for (const type of ['chat:send', 'chat:message', 'chat:typing', 'chat:reaction']) {
    const start = realtime.indexOf(`case '${type}':`);
    const end = realtime.indexOf('\n          case ', start + 1);
    const body = realtime.slice(start, end === -1 ? realtime.indexOf('\n          default:', start) : end);
    assert.ok(start !== -1, type);
    assert.doesNotMatch(body, /broadcastToAll\(/, type);
    assert.match(body, /requireStreamChannelMember|toggleStreamReaction/, type);
  }
  assert.match(realtime, /channelRecipients\(members, clientsByUserId\)/);
  assert.match(realtime, /conversationId: channelId/);
  assert.match(realtime, /members: await getStreamChannelMembers\(channelId\)/);
  assert.match(realtime, /type: 'chat:message_ack'/);
});

test('actual registration, persistence, historical read and review code all sanitize application payloads', () => {
  const auth = source('src/server/persistentAuth.ts');
  assert.match(auth, /return sanitizeApplicationFields\(redactApplicationSecrets\(value\)\)/,
    'Every persistence sanitizer composes both main-project and task credential protections.');
  assert.match(auth, /payload:sanitizeApplication\(\{\.\.\.application,userId:id,nvId\}\)/);
  for (const type of ['Expert', 'Business', 'Driver']) assert.match(auth, new RegExp(`register${type}.*application=sanitizeApplication`));
  assert.match(auth, /sanitizeApplication\(r\.payload\)/);
  assert.match(auth, /const payload=sanitizeApplication\(\{\.\.\.\(data\.payload/);
  assert.match(auth, /password:input\.password/, 'The real authentication provider still receives the separate password input.');
  assert.doesNotMatch(auth, /payload:application[,}]/);
});

test('browser private chat requests carry Nanivio authentication and wait for a real server acknowledgment', () => {
  const client = source('src/lib/streamClient.ts');
  assert.match(client, /authClient\.getToken\(\)/);
  assert.match(client, /Authorization: `Bearer \$\{token\}`/);
  assert.equal((client.match(/headers: streamHeaders\(\)/g) || []).length, 9);
  const realtime = source('src/lib/realtimeClient.ts');
  assert.match(realtime, /this\.currentUser\?\.userId !== message\.senderId/);
  assert.match(realtime, /this\.on\('chat:message_ack'/);
  assert.match(realtime, /this\.on\('chat:error'/);
  assert.match(realtime, /acknowledgment timed out/);
  const context = source('src/context/NanivioContext.tsx');
  assert.equal((context.match(/await sendPrivateConversationMessage\(/g) || []).length, 4);
  assert.doesNotMatch(context, /realtimeClient\.sendChatMessage\(/);
  assert.doesNotMatch(context, /Message received on secure Nanivio line/);
  assert.match(context, /data\.members\.some\(.*member\.userId === currentUser\.id/);
  assert.match(context, /streamClient\.removeChannelMember\(/);
  assert.match(context, /streamClient\.moderateChannelMember\(/);
  assert.match(source('src/components/chat/ChatView.tsx'), /msg\.status === 'failed'/);
  assert.doesNotMatch(context, /localStorage\.(getItem|setItem)\('nanivio_chat_(conversations|messages)'/);
  assert.match(context, /if \(chatOwnerId !== currentUser\.id\) return/);
});

test('cached chats are isolated by account and unowned legacy browser caches are never imported or changed', () => {
  const values = new Map<string, string>([
    ['nanivio_chat_conversations', '[{"id":"legacy-unowned"}]'],
    ['nanivio_chat_messages', '{"legacy-unowned":[{"text":"PUBLIC_HISTORY_FIXTURE"}]}'],
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const conversation = { id: 'room', participants: [{ id: 'account-alice' }] } as any;
  const snapshot = { conversations: [conversation], messages: { room: [{ id: 'message', text: 'PUBLIC_HISTORY_FIXTURE' }] as any } };
  assert.deepEqual(readPrivateChatCache('account-alice', storage), { conversations: [], messages: {} });
  writePrivateChatCache('account-alice', snapshot, storage);
  assert.deepEqual(readPrivateChatCache('account-alice', storage), snapshot);
  assert.deepEqual(readPrivateChatCache('account-bob', storage), { conversations: [], messages: {} });
  assert.deepEqual(ownedChatSnapshot('account-bob', snapshot), { conversations: [], messages: {} });
  assert.equal(values.get('nanivio_chat_conversations'), '[{"id":"legacy-unowned"}]');
  assert.equal(values.get('nanivio_chat_messages'), '{"legacy-unowned":[{"text":"PUBLIC_HISTORY_FIXTURE"}]}');
  writePrivateChatCache('unauthenticated', snapshot, storage);
  assert.deepEqual(readPrivateChatCache('unauthenticated', storage), { conversations: [], messages: {} });
  values.set('nanivio_private_chat:account-alice', 'invalid JSON');
  assert.deepEqual(readPrivateChatCache('account-alice', storage), { conversations: [], messages: {} });
});
