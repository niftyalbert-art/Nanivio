import type { StreamChannelData, StreamChatMessage } from './streamService';

/** Both HTTP and websocket messages must satisfy the private receiving UI contract. */
export function privateChatMessageEvent(message: StreamChatMessage, channel: StreamChannelData) {
  return {
    type: 'chat:message',
    payload: {
      channelId: message.channelId,
      conversationId: message.channelId,
      members: channel.members,
      title: channel.name,
      isGroup: Boolean(channel.custom?.isGroup),
      message: {
        ...message,
        ...message.nanivio,
        id: message.id,
        senderId: message.userId,
        senderName: message.userName,
        senderAvatar: message.userAvatar,
        senderLang: message.sourceLang || 'en',
        text: message.text,
        translatedText: message.translatedText,
        timestamp: message.createdAt,
        status: 'sent',
      },
    },
  };
}
