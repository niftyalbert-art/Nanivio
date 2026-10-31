import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatSendError, chatSendFeedback } from '../src/lib/chatSendFeedback';
import { confirmSavedChat } from '../src/server/chatDelivery';

test('chat feedback explains known failure types without leaking upstream details', () => {
  assert.match(chatSendFeedback(new ChatSendError('connection')), /reconnecting/);
  assert.match(chatSendFeedback(new ChatSendError('session')), /Sign in again/);
  assert.match(chatSendFeedback(new ChatSendError('access')), /no longer have access/);
  assert.match(chatSendFeedback(new ChatSendError('conversation')), /Choose a registered contact/);
  const unknown = chatSendFeedback(new Error('secret provider detail'));
  assert.doesNotMatch(unknown, /secret provider/);
  assert.match(unknown, /Message not sent/);
  assert.match(unknown, /draft is still here/);
});

test('unconfirmed delivery is not labelled definitively unsent or safe to resend', () => {
  const feedback = chatSendFeedback(new ChatSendError('unconfirmed'));
  assert.match(feedback, /not confirmed yet/);
  assert.match(feedback, /avoid sending twice/);
  assert.doesNotMatch(feedback, /Message not sent/);
});

test('saved messages are acknowledged before recipient fanout starts', async () => {
  const order: string[] = [];
  await confirmSavedChat(
    () => { order.push('ack'); },
    async () => { order.push('notify'); },
    () => assert.fail('Unexpected failure'),
  );
  assert.deepEqual(order, ['ack', 'notify']);
});

test('recipient notification failure does not reject an already saved send', async () => {
  let acknowledged = false, reported = false;
  await confirmSavedChat(
    () => { acknowledged = true; },
    async () => { throw new Error('recipient disconnected'); },
    () => { reported = true; },
  );
  assert.equal(acknowledged, true);
  assert.equal(reported, true);
});

test('a failed acknowledgment is not silently treated as a confirmed send', async () => {
  await assert.rejects(confirmSavedChat(
    () => { throw new Error('sender disconnected'); },
    async () => assert.fail('Do not fanout after failed ack'),
    () => assert.fail('Ack failure must propagate'),
  ), /sender disconnected/);
});
