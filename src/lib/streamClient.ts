/**
 * Nanivio GetStream (Stream Chat) Client & Webhook Synchronization Engine
 * Coordinates real-time messaging, channels, typing indicators, and Langpretation integration.
 */

export interface StreamReaction {
  type: string;
  userId: string;
  userName: string;
  timestamp: number;
}

export interface StreamChatMessage {
  id: string;
  channelId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  translatedText?: string;
  targetLang?: string;
  sourceLang?: string;
  createdAt: number;
  reactions: StreamReaction[];
  attachments?: Array<{
    type: 'image' | 'audio' | 'file';
    url: string;
    name?: string;
    size?: string;
  }>;
  isVoiceNote?: boolean;
  voiceNoteDuration?: number;
}

export interface StreamChannelMember {
  userId: string;
  name: string;
  avatar?: string;
  language?: string;
  role: 'admin' | 'member' | 'guest';
  online?: boolean;
}

export interface StreamChannelData {
  id: string;
  type: string;
  name: string;
  members: StreamChannelMember[];
  custom?: Record<string, any>;
  lastMessage?: string;
  lastMessageAt?: number;
  updatedAt: number;
  unreadCount?: number;
}

export interface StreamEventLog {
  id: string;
  type: string;
  channelId?: string;
  userId?: string;
  payload: any;
  timestamp: number;
}

export interface StreamClientState {
  status: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';
  apiKey: string;
  userId: string;
  userName: string;
  userToken: string;
  activeChannelId: string | null;
  unreadCount: number;
  lastSyncTimestamp: number;
}

class NanivioStreamClient {
  private status: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' = 'DISCONNECTED';
  private apiKey = 'nanivio_stream_key';
  private userId: string | null = null;
  private userName = 'User';
  private token: string | null = null;
  private activeChannelId: string | null = null;
  private listeners: Set<(state: StreamClientState) => void> = new Set();

  public async connectUser(userId: string, name: string): Promise<StreamClientState> {
    this.status = 'CONNECTING';
    this.userId = userId;
    this.userName = name;
    this.notify();

    try {
      const res = await fetch('/api/stream/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate Stream Chat token');
      }

      const data = await res.json();
      this.token = data.token;
      this.apiKey = data.apiKey;
      this.status = 'CONNECTED';
    } catch (err) {
      this.status = 'DISCONNECTED';
      this.token = null;
      throw err;
    }

    this.notify();
    return this.getState();
  }

  public setActiveChannel(channelId: string) {
    this.activeChannelId = channelId;
    this.notify();
  }

  public async fetchChannels(): Promise<StreamChannelData[]> {
    try {
      const res = await fetch('/api/stream/channels');
      if (!res.ok) return [];
      const data = await res.json();
      return data.channels || [];
    } catch (e) {
      console.warn('Failed to fetch Stream channels:', e);
      return [];
    }
  }

  public async fetchMessages(channelId: string): Promise<StreamChatMessage[]> {
    try {
      const res = await fetch(`/api/stream/channels/${channelId}/messages`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.messages || [];
    } catch (e) {
      console.warn('Failed to fetch Stream messages:', e);
      return [];
    }
  }

  public async sendMessage(
    channelId: string,
    text: string,
    senderLang: string,
    targetLang: string,
    userAvatar?: string,
    attachments?: Array<{ type: 'image' | 'audio' | 'file'; url: string; name?: string; size?: string }>
  ): Promise<StreamChatMessage | null> {
    try {
      const res = await fetch(`/api/stream/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          userName: this.userName,
          userAvatar,
          text,
          sourceLang: senderLang,
          targetLang: targetLang,
          attachments,
        }),
      });

      if (!res.ok) throw new Error('Failed to post stream message');
      const data = await res.json();
      this.notify();
      return data.message;
    } catch (e) {
      console.warn('Stream message post warning:', e);
      return null;
    }
  }

  public async toggleReaction(
    channelId: string,
    messageId: string,
    reactionType: string
  ): Promise<StreamChatMessage | null> {
    try {
      const res = await fetch(`/api/stream/channels/${channelId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          reactionType,
          userId: this.userId,
          userName: this.userName,
        }),
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.message;
    } catch (e) {
      console.warn('Failed to toggle Stream reaction:', e);
      return null;
    }
  }

  public async createChannel(
    id: string,
    name: string,
    members: StreamChannelMember[],
    type = 'messaging',
    custom = {}
  ): Promise<StreamChannelData | null> {
    try {
      const res = await fetch('/api/stream/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, members, type, custom }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.channel;
    } catch (e) {
      console.warn('Failed to create Stream channel:', e);
      return null;
    }
  }

  public async fetchLogs(): Promise<StreamEventLog[]> {
    try {
      const res = await fetch('/api/stream/logs');
      if (!res.ok) return [];
      const data = await res.json();
      return data.logs || [];
    } catch (e) {
      return [];
    }
  }

  public subscribe(callback: (state: StreamClientState) => void): () => void {
    this.listeners.add(callback);
    callback(this.getState());
    return () => this.listeners.delete(callback);
  }

  public getState(): StreamClientState {
    return {
      status: this.status,
      apiKey: this.apiKey,
      userId: this.userId || '',
      userName: this.userName,
      userToken: this.token || '',
      activeChannelId: this.activeChannelId,
      unreadCount: 0,
      lastSyncTimestamp: Date.now(),
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((cb) => cb(state));
  }
}

export const streamClient = new NanivioStreamClient();

