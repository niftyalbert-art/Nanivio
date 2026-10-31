import test from 'node:test';
import assert from 'node:assert/strict';
import { realtimeClient } from '../src/lib/realtimeClient';
import { ChatSendError } from '../src/lib/chatSendFeedback';

test('private send waits for the matching persisted-message acknowledgment', async () => {
  const client = realtimeClient as any;
  const previousSocket = client.socket, previousUser = client.currentUser;
  let request: any;
  client.currentUser = { userId: 'fixture-self' };
  client.socket = { readyState: WebSocket.OPEN, send: (raw: string) => { request = JSON.parse(raw); } };
  try {
    let confirmed = false;
    const pending = realtimeClient.sendPrivateChatMessage('local-conversation', 'canonical-room', {
      id: 'client-message', senderId: 'fixture-self', text: 'Fixture only',
    }).then(id => { confirmed = true; return id; });
    realtimeClient.emit('chat:message_ack', { requestId: 'unrelated', channelId: 'canonical-room', savedMessageId: 'wrong' });
    realtimeClient.emit('chat:message_ack', { requestId: request.payload.requestId, channelId: 'wrong-room', savedMessageId: 'wrong' });
    await Promise.resolve();
    assert.equal(confirmed, false);
    realtimeClient.emit('chat:message_ack', {
      requestId: request.payload.requestId, channelId: 'canonical-room', savedMessageId: 'persisted-message',
    });
    assert.equal(await pending, 'persisted-message');
  } finally {
    client.socket = previousSocket;
    client.currentUser = previousUser;
  }
});

test('a rejected private message returns safe typed feedback and never confirms success', async () => {
  const client = realtimeClient as any;
  const previousSocket = client.socket, previousUser = client.currentUser;
  let request: any;
  client.currentUser = { userId: 'fixture-self' };
  client.socket = { readyState: WebSocket.OPEN, send: (raw: string) => { request = JSON.parse(raw); } };
  try {
    const pending = realtimeClient.sendPrivateChatMessage('fixture-conversation', 'fixture-room', {
      senderId: 'fixture-self', text: 'Fixture only',
    });
    realtimeClient.emit('chat:error', { requestId: request.payload.requestId, message: 'private provider detail' });
    await assert.rejects(pending, error => error instanceof ChatSendError && error.code === 'unavailable');
  } finally {
    client.socket = previousSocket;
    client.currentUser = previousUser;
  }
});
