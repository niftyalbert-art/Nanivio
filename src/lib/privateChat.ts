import type { ChatMessage, Conversation, SupportedLanguageCode } from '../types';
import { streamClient, type StreamChannelData } from './streamClient';
import { realtimeClient } from './realtimeClient';

// Deduplicate only in-flight creation, never cache membership or permissions.
const channelCreation = new Map<string, Promise<StreamChannelData>>();

export function linkedPrivateConversation(conversation: Conversation, channel: StreamChannelData): Conversation {
  return {
    ...conversation, streamChannelId: channel.id,
    title: conversation.isGroup ? channel.name : conversation.title,
    groupDescription: conversation.isGroup ? channel.custom?.description || '' : conversation.groupDescription,
    participants: channel.members.map(member => {
      const existing = conversation.participants.find(p => p.id === member.userId || (member.nvId && p.nvId === member.nvId));
      return {
        ...existing, id: member.userId, name: member.name, avatar: member.avatar || existing?.avatar || '',
        nvId: member.nvId || existing?.nvId || '',
        myLanguage: (member.language || existing?.myLanguage || 'en') as SupportedLanguageCode,
        role: existing?.role || 'user',
      };
    }),
    ...(conversation.isGroup ? { groupAdmins: channel.members.filter(m => m.role === 'admin').map(m => m.userId) } : {}),
  };
}

export async function privateConversationChannel(conversation: Conversation, senderId: string): Promise<StreamChannelData> {
  const key = `${senderId}:${conversation.id}`;
  let creation = conversation.streamChannelId ? undefined : channelCreation.get(key);
  if (!creation) {
    creation = (async () => {
      const channel = await streamClient.createChannel(
        conversation.streamChannelId || conversation.id,
        conversation.title || 'Private conversation',
        conversation.participants.map(participant => ({
          userId: participant.id, name: participant.name, nvId: participant.nvId || participant.nanivioNumber,
          avatar: participant.avatar, language: participant.myLanguage, role: 'member',
        })),
        'messaging', { isGroup: Boolean(conversation.isGroup), description: conversation.groupDescription || '' },
      );
      if (!channel) throw new Error('Private channel could not be verified. Participants must be registered accounts.');
      return channel;
    })();
    if (!conversation.streamChannelId) channelCreation.set(key, creation);
    const cleanup = () => { if (channelCreation.get(key) === creation) channelCreation.delete(key); };
    creation.then(cleanup, cleanup);
  }
  return creation;
}

export async function publishPrivateMessage(conversation: Conversation, channelId: string, message: ChatMessage) {
  return realtimeClient.sendPrivateChatMessage(conversation.id, channelId, message);
}
