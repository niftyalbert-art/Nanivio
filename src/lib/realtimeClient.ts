/**
 * Nanivio Real-Time Telecom WebSocket Client
 * Coordinates live Agora RTC signaling, incoming/outgoing call states, WebRTC peer connections,
 * live Langpretation speech streaming, and GetStream real-time chat broadcasts.
 */

export interface RealtimeUser {
  userId: string;
  nvId: string;
  name: string;
  avatar?: string;
  role: string;
  myLanguage: string;
  online?: boolean;
}

export interface IncomingCallEvent {
  callId: string;
  channelName: string;
  callType: 'audio' | 'video';
  caller: {
    id: string;
    name: string;
    nvId: string;
    avatar?: string;
    myLanguage: string;
    initials?: string;
  };
  timestamp: number;
}

export interface CallSpeechEvent {
  callId: string;
  speakerId: string;
  speakerName: string;
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  timestamp: number;
}

type EventCallback<T = any> = (data: T) => void;

class NanivioRealtimeClient {
  private socket: WebSocket | null = null;
  private currentUser: any = null;
  private isConnecting = false;
  private reconnectTimer: any = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private onlineUsers: RealtimeUser[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      // Auto-connect on startup
      this.connect();
    }
  }

  public connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnecting = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // Re-authenticate if user session is known
        if (this.currentUser) {
          this.send('auth:presence', this.currentUser);
        }
      };

      this.socket.onmessage = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          const { type, payload } = parsed;

          if (type === 'auth:presence_ack' || type === 'presence:update') {
            if (payload?.activeOnlineUsers) {
              this.onlineUsers = payload.activeOnlineUsers;
              this.emit('presence_update', this.onlineUsers);
            }
          }

          this.emit(type, payload);
        } catch (e) {
          console.warn('Realtime client JSON parse error:', e);
        }
      };

      this.socket.onclose = () => {
        this.isConnecting = false;
        this.socket = null;
        // Reconnect after 3 seconds
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 3000);
        }
      };

      this.socket.onerror = (err) => {
        console.warn('Realtime client WebSocket error:', err);
      };
    } catch (err) {
      console.warn('Failed to instantiate WebSocket:', err);
      this.isConnecting = false;
    }
  }

  public send(type: string, payload: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload }));
    } else {
      // Connect and queue
      this.connect();
      setTimeout(() => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ type, payload }));
        }
      }, 500);
    }
  }

  public registerUser(user: {
    id: string;
    nvId?: string;
    name: string;
    avatar?: string;
    role?: string;
    myLanguage?: string;
  }) {
    this.currentUser = {
      userId: user.id,
      nvId: user.nvId || '',
      name: user.name,
      avatar: user.avatar,
      role: user.role || 'CITIZEN',
      myLanguage: user.myLanguage || 'en',
    };
    this.send('auth:presence', this.currentUser);
  }

  // Calling Signaling Actions
  public initiateCall(
    callId: string,
    channelName: string,
    callType: 'audio' | 'video',
    caller: any,
    recipientId: string,
    recipientNvId?: string
  ) {
    this.send('call:initiate', {
      callId,
      channelName,
      callType,
      caller,
      recipientId,
      recipientNvId,
    });
  }

  public acceptCall(callId: string, channelName: string, responder: any, callerId: string) {
    this.send('call:accept', {
      callId,
      channelName,
      responder,
      callerId,
    });
  }

  public declineCall(callId: string, callerId: string, reason?: string) {
    this.send('call:decline', {
      callId,
      callerId,
      reason,
    });
  }

  public endCall(callId: string, channelName?: string, userId?: string, targetUserId?: string) {
    this.send('call:end', {
      callId,
      channelName,
      userId,
      targetUserId,
    });
  }

  public sendSpeech(
    callId: string,
    speakerId: string,
    speakerName: string,
    sourceLang: string,
    text: string,
    targetLang?: string
  ) {
    this.send('call:speech', {
      callId,
      speakerId,
      speakerName,
      sourceLang,
      text,
      targetLang,
    });
  }

  public sendCallSpeech(
    callId: string,
    text: string,
    sourceLang: string,
    targetLang?: string,
    speakerId?: string,
    speakerName?: string
  ) {
    this.send('call:speech', {
      callId,
      speakerId: speakerId || this.currentUser?.id || 'me',
      speakerName: speakerName || this.currentUser?.name || 'Speaker',
      sourceLang,
      text,
      targetLang,
    });
  }

  public sendWebrtcSignal(callId: string, targetUserId: string, signalData: any, senderId: string) {
    this.send('call:webrtc_signal', {
      callId,
      targetUserId,
      signalData,
      senderId,
    });
  }

  // Stream Chat Signaling Actions
  public sendChatMessage(
    channelId: string,
    messageOrText: any,
    sourceLang?: string,
    targetLang?: string,
    userAvatar?: string,
    attachments?: any[]
  ) {
    if (typeof messageOrText === 'object') {
      this.send('chat:message', {
        conversationId: channelId,
        channelId,
        message: messageOrText,
      });
    } else {
      this.send('chat:send', {
        channelId,
        text: messageOrText,
        sourceLang: sourceLang || 'en',
        targetLang,
        userAvatar,
        attachments,
      });
    }
  }

  public sendChatTyping(channelId: string, isTyping: boolean) {
    this.send('chat:typing', {
      channelId,
      isTyping,
    });
  }

  public sendChatReaction(channelId: string, messageId: string, reactionType: string) {
    this.send('chat:reaction', {
      channelId,
      messageId,
      reactionType,
    });
  }

  // Event Subscription Helpers
  public on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  public emit(event: string, data: any) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.warn(`Error in realtime handler for ${event}:`, e);
        }
      });
    }
  }

  public getOnlineUsers(): RealtimeUser[] {
    return this.onlineUsers;
  }
}

export const realtimeClient = new NanivioRealtimeClient();
