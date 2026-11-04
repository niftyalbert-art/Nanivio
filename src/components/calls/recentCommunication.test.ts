import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CallLogRecord, ChatMessage, Conversation, Participant } from '../../types';
import { aggregateRecentCommunications } from '../../lib/recentCommunication';

const person = (id: string, name: string, nvId?: string): Participant => ({
  id, name, nvId, avatar: '', initials: name.slice(0, 2), myLanguage: 'en', role: 'user',
});
const call = (id: string, participantId: string | undefined, callType: 'audio' | 'video', timestamp: number, extra: Partial<CallLogRecord> = {}): CallLogRecord => ({
  id, participantId, participantName: 'Ama', callType, direction: 'incoming', timestamp,
  durationSeconds: 0, hasLangpretation: false, ...extra,
});
const convo = (id: string, peer: Participant, unreadCount: number, lastMessageTime: number, group = false): Conversation => ({
  id, isGroup: group, title: peer.name, avatar: '', participants: [person('me', 'Me'), peer],
  unreadCount, lastMessageTime,
});

describe('aggregateRecentCommunications', () => {
  it('aggregates audio, video and actual unread message counts for one person', () => {
    const messages: ChatMessage[] = Array.from({ length: 4 }, (_, index) => ({
      id: `m${index}`, senderId: 'peer-a', senderName: 'Ama', senderAvatar: '', senderLang: 'en',
      text: 'hello', timestamp: 50 + index, status: 'delivered',
    }));
    const result = aggregateRecentCommunications({
      callLogs: [
        call('a1', 'peer-a', 'audio', 10), call('a2', 'peer-a', 'audio', 20), call('a3', 'peer-a', 'audio', 30),
        call('v1', 'peer-a', 'video', 40), call('v2', 'peer-a', 'video', 45),
      ],
      conversations: [convo('chat-a', person('peer-a', 'Ama'), 0, 55)],
      messages: { 'chat-a': messages }, selfIds: ['me'],
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].audioCount, 3);
    assert.equal(result[0].videoCount, 2);
    assert.equal(result[0].unreadCount, 4);
    assert.equal(result[0].incomingChatCount, 4);
  });

  it('never groups duplicate display names without verified identity', () => {
    const result = aggregateRecentCommunications({
      callLogs: [call('a', 'id-one', 'audio', 10), call('b', 'id-two', 'video', 20)],
      conversations: [], messages: {},
    });
    assert.equal(result.length, 2);
  });

  it('joins canonical IDs and Nanivio number aliases', () => {
    const result = aggregateRecentCommunications({
      callLogs: [call('c1', 'user-1', 'audio', 100, { participantNvId: 'NV 0486-123456' })],
      conversations: [convo('c2', person('different-local-id', 'Ama', '0486123456'), 0, 200)],
      messages: {}, selfIds: ['me'],
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].audioCount, 1);
    assert.equal(result[0].latestTimestamp, 200);
  });

  it('keeps latest activity timestamps stable and deduplicates repeated record IDs', () => {
    const duplicated = call('same', 'peer', 'audio', 20);
    const result = aggregateRecentCommunications({
      callLogs: [duplicated, { ...duplicated, timestamp: 999 }, call('video', 'peer', 'video', 35)],
      conversations: [], messages: {},
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].audioCount, 1);
    assert.equal(result[0].latestAudioTimestamp, 20);
    assert.equal(result[0].latestVideoTimestamp, 35);
    assert.equal(result[0].latestTimestamp, 35);
  });

  it('does not group records missing identifiers by name', () => {
    const result = aggregateRecentCommunications({
      callLogs: [call('anonymous-1', undefined, 'audio', 1), call('anonymous-2', undefined, 'audio', 2)],
      conversations: [], messages: {},
    });
    assert.equal(result.length, 2);
  });

  it('excludes group chats and deduplicates channel aliases', () => {
    const peer = person('peer', 'Ama');
    const first = { ...convo('conv', peer, 3, 100), streamChannelId: 'stream-channel' };
    const duplicate = { ...convo('stream-channel', peer, 3, 100), streamChannelId: 'stream-channel' };
    const result = aggregateRecentCommunications({
      callLogs: [],
      conversations: [first, duplicate, convo('group', peer, 9, 200, true)],
      messages: {}, selfIds: ['me'],
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].unreadCount, 3);
  });

  it('does not mutate input arrays or records', () => {
    const calls = [call('a', 'peer', 'audio', 10)];
    const convos = [convo('chat', person('peer', 'Ama'), 1, 20)];
    const messages: Record<string, ChatMessage[]> = { chat: [] };
    const snapshots = JSON.stringify([calls, convos, messages]);
    aggregateRecentCommunications({ callLogs: calls, conversations: convos, messages, selfIds: ['me'] });
    assert.equal(JSON.stringify([calls, convos, messages]), snapshots);
  });

  it('shows unread direct chats even without calls', () => {
    const result = aggregateRecentCommunications({
      callLogs: [], conversations: [convo('chat-only', person('peer', 'Ama'), 2, 75)],
      messages: {}, selfIds: ['me'],
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].audioCount, 0);
    assert.equal(result[0].unreadCount, 2);
  });
});
