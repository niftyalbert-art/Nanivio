/**
 * Nanivio Real-Time Telecom WebSocket Client
 * Coordinates live Agora RTC signaling, incoming/outgoing call states, WebRTC peer connections,
 * live Langpretation speech streaming, and GetStream real-time chat broadcasts.
 */
import { authClient } from './authClient';
import { ChatSendError } from './chatSendFeedback';

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
  private presenceReady = false;
  private isConnecting = false;
  private reconnectTimer: any = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private onlineUsers: RealtimeUser[] = [];
  private pendingCallEnds = new Map<string, { payload: any; userId: string; expiresAt: number }>();

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
    this.presenceReady = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.socket = new WebSocket(wsUrl);
      const openingSocket = this.socket;

      this.socket.onopen = () => {
        if (this.socket !== openingSocket) return;
        this.isConnecting = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // Re-authenticate if user session is known
        if (this.currentUser) {
          this.sendPresence();
        }
      };

      this.socket.onmessage = (event: MessageEvent) => {
        if (this.socket !== openingSocket) return;
        try {
          const parsed = JSON.parse(event.data);
          const { type, payload } = parsed;
          if (type === 'call:ended' && payload?.callId) this.pendingCallEnds.delete(payload.callId);
          // Retry hang-ups only after the socket has authenticated, never via
          // the generic one-shot 500ms queue that can silently drop them.
          if (type === 'auth:presence_ack') {
            this.presenceReady = payload?.status === 'ONLINE';
            this.flushPendingCallEnds();
          }

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

      const closingSocket = this.socket;
      this.socket.onclose = () => {
        if (this.socket !== closingSocket) return;
        this.presenceReady = false;
        this.isConnecting = false;
        this.socket = null;
        this.emit('connection:lost', {});
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
      // OPEN is not authenticated: wait for the presence acknowledgement so
      // the server does not discard brain startup during identity verification.
      if (type === 'malvi:brain_start' && !this.presenceReady) return false;
      if(type.startsWith('langpretation:')&&this.socket.bufferedAmount>128000)return false;
      this.socket.send(JSON.stringify({ type, payload }));
      return true;
    } else {
      // Brain startup must not use the generic one-shot 500ms queue: a slow
      // connection could drop it and leave a working avatar permanently silent.
      // The session-scoped caller retries until OPEN, or cancels on close.
      if (type === 'malvi:brain_start') { this.connect(); return false; }
      // Live microphone frames must never be delayed/replayed after reconnect.
      // Let the caller stop capture and show the disconnected state instead.
      if (type === 'malvi:brain_audio' || type.startsWith('nanivio:mic_') || type.startsWith('langpretation:')) return false;
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
    if (this.currentUser && this.currentUser.userId !== user.id) {
      this.pendingCallEnds.clear();
      this.presenceReady = false;
    }
    this.currentUser = {
      userId: user.id,
      nvId: user.nvId || '',
      name: user.name,
      avatar: user.avatar,
      role: user.role || 'CITIZEN',
      myLanguage: user.myLanguage || 'en',
    };
    this.sendPresence();
  }

  private sendPresence() {
    const token = authClient.getToken();
    if (!token || !this.currentUser) return;
    this.send('auth:presence', { ...this.currentUser, token });
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
    const payload = {
      callId,
      channelName,
      userId,
      targetUserId,
    };
    this.pendingCallEnds.set(callId, { payload, userId: this.currentUser?.userId || userId || '',
      expiresAt: Date.now() + 60_000 });
    if (this.pendingCallEnds.size > 64) this.pendingCallEnds.delete(this.pendingCallEnds.keys().next().value!);
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'call:end', payload }));
    else this.connect();
  }

  private flushPendingCallEnds() {
    for (const [id, entry] of this.pendingCallEnds) {
      if (entry.expiresAt <= Date.now() || entry.userId !== this.currentUser?.userId) {
        this.pendingCallEnds.delete(id);
      } else if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'call:end', payload: entry.payload }));
      }
    }
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
    attachments?: any[],
    langpretationEnabled = false
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
        langpretationEnabled,
      });
    }
  }

  public sendChatTyping(channelId: string, isTyping: boolean) {
    this.send('chat:typing', {
      channelId,
      isTyping,
    });
  }

  public sendPrivateChatMessage(conversationId: string, channelId: string, message: any): Promise<string> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.currentUser?.userId !== message.senderId) {
      this.connect();
      return Promise.reject(new ChatSendError('connection'));
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timeout); offAck(); offError(); };
      const offAck = this.on('chat:message_ack', data => {
        if (data?.requestId !== requestId || data.channelId !== channelId) return;
        cleanup();
        resolve(data.savedMessageId);
      });
      const offError = this.on('chat:error', data => {
        if (data?.requestId !== requestId) return;
        cleanup();
        reject(new ChatSendError(data.code === 'access' ? 'access' : 'unavailable', data.serviceCode));
      });
      // An acknowledgment timed out does not prove the server failed to save.
      const timeout = setTimeout(() => { cleanup(); reject(new ChatSendError('unconfirmed')); }, 20000);
      try {
        this.socket!.send(JSON.stringify({ type: 'chat:message', payload: { requestId, conversationId, channelId, message } }));
      } catch {
        cleanup();
        reject(new ChatSendError('connection'));
      }
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
