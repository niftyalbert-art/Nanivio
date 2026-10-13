import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import { GoogleGenAI } from '@google/genai';
import {
  registerAgoraParticipant,
  removeAgoraParticipant,
  getActiveAgoraChannels,
} from './agoraService.ts';
import {
  addStreamMessage,
  toggleStreamReaction,
  getStreamChannel,
  type StreamChatMessage,
} from './streamService.ts';
import { authDb } from './authDb.ts';
import * as persistentAuth from './persistentAuth.ts';

export interface ConnectedUser {
  socket: WebSocket;
  userId: string;
  nvId: string;
  name: string;
  avatar?: string;
  role: string;
  myLanguage: string;
  connectedAt: number;
}

export interface ActiveCallState {
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
  recipientId: string;
  recipientNvId?: string;
  status: 'ringing' | 'connected' | 'ended' | 'declined';
  startedAt: number;
  connectedAt?: number;
  participants: string[]; // userIds
}

// In-memory mapping of active WebSocket clients & active calls
const clientsByUserId: Map<string, Set<ConnectedUser>> = new Map();
const clientsByNvId: Map<string, Set<ConnectedUser>> = new Map();
const allSockets: Set<WebSocket> = new Set();
const activeCalls: Map<string, ActiveCallState> = new Map();

async function authenticateRealtimeToken(tokenValue: unknown) {
  const token = typeof tokenValue === 'string' ? tokenValue.trim() : '';
  if (!token) return null;
  try {
    const adminUser = persistentAuth.adminFromToken(token);
    if (adminUser) return adminUser;
    if (await persistentAuth.persistentAuthConfigured()) {
      return await persistentAuth.userFromToken(token);
    }
    if (process.env.NODE_ENV === 'production' || process.env.REQUIRE_PERSISTENT_AUTH === 'true') return null;
    return authDb.validateSession(token);
  } catch {
    return null;
  }
}

function removeConnectedUser(user: ConnectedUser) {
  const byUser = clientsByUserId.get(user.userId);
  byUser?.delete(user);
  if (byUser?.size === 0) clientsByUserId.delete(user.userId);

  for (const [key, users] of clientsByNvId.entries()) {
    users.delete(user);
    if (users.size === 0) clientsByNvId.delete(key);
  }
}

function isCallRecipient(call: ActiveCallState, user: { userId: string; nvId: string }): boolean {
  return (
    call.recipientId === user.userId ||
    (!!call.recipientNvId && !!user.nvId && cleanNumber(call.recipientNvId) === cleanNumber(user.nvId))
  );
}

export function canJoinAgoraCall(userId: string, nvId: string, channelName: string): boolean {
  return Array.from(activeCalls.values()).some((call) =>
    call.channelName === channelName &&
    (
      (call.status === 'connected' && call.participants.includes(userId)) ||
      (call.status === 'ringing' && isCallRecipient(call, { userId, nvId }))
    )
  );
}

// Supported Language Names mapping for Langpretation translation (Authoritative 18 Launch Languages)
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  ar: "Arabic",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  zh: "Mandarin Chinese",
  ja: "Japanese",
  ko: "Korean",
  sw: "Swahili",
  lg: "Luganda",
  ak: "Twi / Akan (Ghana)",
  "tw-ak": "Akuapem Twi (Ghana)",
  fat: "Fante (Ghana)",
  ee: "Ewe (Ghana)",
  gaa: "Ga (Ghana)",
  ha: "Hausa",
};

let genAiInstance: GoogleGenAI | null = null;
async function callProductionTranslation(text:string, sourceLang:string, targetLang:string):Promise<{text:string;provider:string}|null>{
  if(sourceLang===targetLang) return {text,provider:'direct-passthrough'};
  const ghana=new Set(['ak','tw-ak','fat','ee','gaa','ha']);
  const east=new Set(['sw','lg']);
  const key=process.env.AZURE_TRANSLATOR_KEY;
  const endpoint=(process.env.AZURE_TRANSLATOR_ENDPOINT||'https://api.cognitive.microsofttranslator.com').replace(/\/$/,'');
  const region=process.env.AZURE_TRANSLATOR_REGION;
  const azure=async(input:string,a:string,b:string)=>{ if(!key)return null; const params=new URLSearchParams({'api-version':'3.0',to:b}); if(a!=='auto')params.set('from',a); const h:any={'Ocp-Apim-Subscription-Key':key,'Content-Type':'application/json'}; if(region)h['Ocp-Apim-Subscription-Region']=region; const r=await fetch(`${endpoint}/translate?${params}`,{method:'POST',headers:h,body:JSON.stringify([{text:input}]),signal:AbortSignal.timeout(5000)}); if(!r.ok)return null; const d:any=await r.json(); const t=d?.[0]?.translations?.[0]?.text; return t?{text:String(t),provider:'azure-translator'}:null; };
  const khaya=async(input:string,a:string,b:string)=>{ const k=process.env.KHAYA_API_KEY; if(!k)return null; const r=await fetch(process.env.KHAYA_TRANSLATION_URL||'https://translation-api.ghananlp.org/v1/translate',{method:'POST',headers:{'Content-Type':'application/json','Ocp-Apim-Subscription-Key':k},body:JSON.stringify({in:input,lang:`${a}-${b}`}),signal:AbortSignal.timeout(5000)}); if(!r.ok)return null; const d:any=await r.json(); const t=d?.translation||d?.out||d?.text; return t?{text:String(t).trim(),provider:'khaya-ghana-nlp'}:null; };
  const sunbird=async(input:string,a:string,b:string)=>{ const k=process.env.SUNBIRD_API_KEY; if(!k)return null; const r=await fetch(process.env.SUNBIRD_TRANSLATION_URL||'https://api.sunbird.ai/tasks/nmt',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${k}`},body:JSON.stringify({source_language:a,target_language:b,text:input}),signal:AbortSignal.timeout(5000)}); if(!r.ok)return null; const d:any=await r.json(); const t=d?.output?.translated_text||d?.translated_text; return t?{text:String(t).trim(),provider:'sunbird-makerere'}:null; };
  const direct=ghana.has(sourceLang)||ghana.has(targetLang)?await khaya(text,sourceLang,targetLang):east.has(sourceLang)||east.has(targetLang)?await sunbird(text,sourceLang,targetLang):await azure(text,sourceLang,targetLang);
  if(direct)return direct;
  if(sourceLang!=='en'&&targetLang!=='en'){
    const toEn=ghana.has(sourceLang)?await khaya(text,sourceLang,'en'):east.has(sourceLang)?await sunbird(text,sourceLang,'en'):await azure(text,sourceLang,'en');
    if(toEn){
      const fromEn=ghana.has(targetLang)?await khaya(toEn.text,'en',targetLang):east.has(targetLang)?await sunbird(toEn.text,'en',targetLang):await azure(toEn.text,'en',targetLang);
      if(fromEn)return {text:fromEn.text,provider:`${toEn.provider}+${fromEn.provider}`};
    }
  }
  return null;
}

function getAI(): GoogleGenAI | null {
  if (!genAiInstance && process.env.GEMINI_API_KEY) {
    genAiInstance = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAiInstance;
}

function broadcastToAll(message: any, excludeSocket?: WebSocket) {
  const jsonStr = JSON.stringify(message);
  for (const client of allSockets) {
    if (client !== excludeSocket && client.readyState === WebSocket.OPEN) {
      try {
        client.send(jsonStr);
      } catch (e) {
        console.warn('WebSocket broadcast error:', e);
      }
    }
  }
}

function cleanNumber(str: string): string {
  if (!str) return '';
  let c = str.trim();
  if (c.toLowerCase().startsWith('sip:')) c = c.slice(4).split('@')[0];
  if (c.toUpperCase().startsWith('NV-')) c = c.substring(3);
  else if (c.toUpperCase().startsWith('NV')) c = c.substring(2);
  return c.replace(/[^0-9a-zA-Z]/g, '');
}

function sendToUser(userIdOrNvId: string, message: any): boolean {
  if (!userIdOrNvId) return false;
  const jsonStr = JSON.stringify(message);
  let sent = false;
  const cleaned = cleanNumber(userIdOrNvId);

  const targets = new Set<ConnectedUser>();

  // 1. Direct match on userId
  const byUser = clientsByUserId.get(userIdOrNvId);
  if (byUser) {
    byUser.forEach((c) => targets.add(c));
  }

  // 2. Direct match on nvId
  const byNv = clientsByNvId.get(userIdOrNvId);
  if (byNv) {
    byNv.forEach((c) => targets.add(c));
  }

  // 3. Cleaned number variations
  if (cleaned) {
    const byClean = clientsByNvId.get(cleaned);
    if (byClean) byClean.forEach((c) => targets.add(c));

    const byPrefixed = clientsByNvId.get(`NV-${cleaned}`);
    if (byPrefixed) byPrefixed.forEach((c) => targets.add(c));

    const byUserClean = clientsByUserId.get(cleaned);
    if (byUserClean) byUserClean.forEach((c) => targets.add(c));
  }

  for (const client of targets) {
    if (client.socket.readyState === WebSocket.OPEN) {
      try {
        client.socket.send(jsonStr);
        sent = true;
      } catch (e) {
        console.warn('WebSocket send error:', e);
      }
    }
  }

  return sent;
}

export function getActiveConnectedUsersList() {
  const uniqueUsers: Array<{
    userId: string;
    nvId: string;
    name: string;
    avatar?: string;
    role: string;
    myLanguage: string;
    online: boolean;
  }> = [];

  const seenIds = new Set<string>();
  for (const [userId, userSet] of clientsByUserId.entries()) {
    if (seenIds.has(userId)) continue;
    for (const u of userSet) {
      if (u.socket.readyState === WebSocket.OPEN) {
        seenIds.add(userId);
        uniqueUsers.push({
          userId: u.userId,
          nvId: u.nvId,
          name: u.name,
          avatar: u.avatar,
          role: u.role,
          myLanguage: u.myLanguage,
          online: true,
        });
        break;
      }
    }
  }
  return uniqueUsers;
}

export function broadcastStreamChatMessage(message: StreamChatMessage) {
  broadcastToAll({
    type: 'chat:message',
    payload: {
      channelId: message.channelId,
      message,
    },
  });
}

export function broadcastStreamReaction(channelId: string, message: StreamChatMessage) {
  broadcastToAll({
    type: 'chat:reaction_updated',
    payload: {
      channelId,
      message,
    },
  });
}

export function setupRealtimeServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('error', (err) => {
    console.warn('[Realtime WSS Warning]', err?.message || err);
  });

  wss.on('connection', (socket: WebSocket) => {
    allSockets.add(socket);
    let currentUser: ConnectedUser | null = null;
    let messageChain: Promise<void> = Promise.resolve();

    // Heartbeat ping/pong
    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
      }
    }, 25000);

    socket.on('message', (data: string) => {
      messageChain = messageChain.then(async () => {
        try {
          if (socket.readyState !== WebSocket.OPEN) return;
          const raw = data.toString();
          const parsed = JSON.parse(raw);
          const { type, payload } = parsed;

        if (type !== 'auth:presence' && !currentUser) {
          socket.send(JSON.stringify({
            type: 'auth:error',
            payload: { message: 'Authentication required.' },
          }));
          return;
        }

        switch (type) {
          // -------------------------------------------------------------
          // 1. PRESENCE / USER AUTHENTICATION
          // -------------------------------------------------------------
          case 'auth:presence': {
            const user = await authenticateRealtimeToken(payload?.token);
            if (socket.readyState !== WebSocket.OPEN) return;
            if (!user?.id) {
              socket.send(JSON.stringify({
                type: 'auth:error',
                payload: { message: 'Authentication required.' },
              }));
              socket.close(4401, 'Authentication required');
              return;
            }
            if (currentUser && currentUser.userId !== String(user.id)) {
              socket.close(4403, 'Authenticated identity cannot change');
              return;
            }

            if (currentUser) removeConnectedUser(currentUser);
            const name = String(user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User');
            const nvId = String(user.nvId || '');

            currentUser = {
              socket,
              userId: String(user.id),
              nvId,
              name,
              avatar: user.avatar || undefined,
              role: String(user.role || 'PERSONAL'),
              myLanguage: String(user.preferredLanguage || 'en'),
              connectedAt: Date.now(),
            };

            // Register in lookup maps
            if (!clientsByUserId.has(currentUser.userId)) {
              clientsByUserId.set(currentUser.userId, new Set());
            }
            clientsByUserId.get(currentUser.userId)!.add(currentUser);

            if (nvId) {
              const rawNv = String(nvId).trim();
              const cleanNv = cleanNumber(rawNv);

              const keysToIndex = new Set([rawNv, cleanNv, `NV-${cleanNv}`].filter(Boolean));
              for (const k of keysToIndex) {
                if (!clientsByNvId.has(k)) {
                  clientsByNvId.set(k, new Set());
                }
                clientsByNvId.get(k)!.add(currentUser);
              }
            }

            // Confirm presence to current client
            socket.send(
              JSON.stringify({
                type: 'auth:presence_ack',
                payload: {
                  status: 'ONLINE',
                  activeOnlineUsers: getActiveConnectedUsersList(),
                },
              })
            );

            // Broadcast presence update
            broadcastToAll({
              type: 'presence:update',
              payload: {
                activeOnlineUsers: getActiveConnectedUsersList(),
              },
            });
            break;
          }

          // -------------------------------------------------------------
          // 2. LIVE CALL INITIATION (CALLER -> RECEIVER)
          // -------------------------------------------------------------
          case 'call:initiate': {
            const {
              callId,
              channelName,
              callType,
              recipientId,
              recipientNvId,
            } = payload || {};
            const caller = currentUser && {
              id: currentUser.userId,
              name: currentUser.name,
              nvId: currentUser.nvId,
              avatar: currentUser.avatar,
              myLanguage: currentUser.myLanguage,
              initials: currentUser.name.slice(0, 2).toUpperCase(),
            };

            if (
              !currentUser ||
              !callId ||
              !caller ||
              (!recipientId && !recipientNvId) ||
              (recipientId && String(recipientId) === currentUser.userId) ||
              (recipientNvId && currentUser.nvId && cleanNumber(String(recipientNvId)) === cleanNumber(currentUser.nvId)) ||
              !['audio', 'video'].includes(callType)
            ) {
              socket.send(
                JSON.stringify({
                  type: 'call:error',
                  payload: { message: 'Invalid call initiation payload.' },
                })
              );
              return;
            }

            if (activeCalls.has(String(callId))) {
              socket.send(JSON.stringify({
                type: 'call:error',
                payload: { message: 'A call with this ID is already active.' },
              }));
              return;
            }

            const callSession: ActiveCallState = {
              callId: String(callId),
              channelName: channelName || `nanivio_call_${callId}`,
              callType,
              caller,
              recipientId: recipientId ? String(recipientId) : '',
              recipientNvId: recipientNvId ? String(recipientNvId) : undefined,
              status: 'ringing',
              startedAt: Date.now(),
              participants: [currentUser.userId],
            };
            activeCalls.set(callSession.callId, callSession);

            // Register Agora room on server
            registerAgoraParticipant(callSession.channelName, callSession.callType, {
              uid: caller.id,
              name: caller.name,
              role: 'publisher',
            });

            // Deliver incoming call to recipient if online
            let delivered = false;
            if (recipientId) {
              delivered = sendToUser(recipientId, {
                type: 'call:incoming',
                payload: {
                  callId,
                  channelName: callSession.channelName,
                  callType: callSession.callType,
                  caller,
                  timestamp: Date.now(),
                },
              });
            }

            if (!delivered && recipientNvId) {
              delivered = sendToUser(recipientNvId, {
                type: 'call:incoming',
                payload: {
                  callId,
                  channelName: callSession.channelName,
                  callType: callSession.callType,
                  caller,
                  timestamp: Date.now(),
                },
              });
            }

            // Acknowledge call is ringing to caller
            socket.send(
              JSON.stringify({
                type: 'call:ringing',
                payload: {
                  callId,
                  channelName: callSession.channelName,
                  deliveredToLiveRecipient: delivered,
                },
              })
            );
            break;
          }

          // -------------------------------------------------------------
          // 3. CALL ACCEPT (RECEIVER -> CALLER)
          // -------------------------------------------------------------
          case 'call:accept': {
            const { callId } = payload || {};
            const callSession = activeCalls.get(String(callId || ''));
            if (!currentUser || !callSession || callSession.status !== 'ringing' || !isCallRecipient(callSession, currentUser)) {
              socket.send(JSON.stringify({
                type: 'call:error',
                payload: { message: 'This account is not the recipient of an active call.' },
              }));
              return;
            }

            const responder = {
              id: currentUser.userId,
              name: currentUser.name,
              nvId: currentUser.nvId,
              avatar: currentUser.avatar,
              myLanguage: currentUser.myLanguage,
              initials: currentUser.name.slice(0, 2).toUpperCase(),
            };
            callSession.status = 'connected';
            callSession.connectedAt = Date.now();
            if (!callSession.participants.includes(currentUser.userId)) {
              callSession.participants.push(currentUser.userId);
            }
            registerAgoraParticipant(callSession.channelName, callSession.callType, {
              uid: currentUser.userId,
              name: currentUser.name,
              role: 'publisher',
            });

            sendToUser(callSession.caller.id, {
              type: 'call:accepted',
              payload: {
                callId: callSession.callId,
                channelName: callSession.channelName,
                callType: callSession.callType,
                responder,
                connectedAt: callSession.connectedAt,
              },
            });

            socket.send(JSON.stringify({
              type: 'call:connected',
              payload: {
                callId: callSession.callId,
                channelName: callSession.channelName,
                callType: callSession.callType,
                caller: callSession.caller,
                connectedAt: callSession.connectedAt,
              },
            }));
            break;
          }

          // -------------------------------------------------------------
          // 4. CALL DECLINE (RECEIVER -> CALLER)
          // -------------------------------------------------------------
          case 'call:decline': {
            const { callId, reason } = payload || {};
            const callSession = activeCalls.get(String(callId || ''));
            if (!currentUser || !callSession || callSession.status !== 'ringing' || !isCallRecipient(callSession, currentUser)) {
              socket.send(JSON.stringify({
                type: 'call:error',
                payload: { message: 'This account is not the recipient of an active call.' },
              }));
              return;
            }
            callSession.status = 'declined';
            sendToUser(callSession.caller.id, {
              type: 'call:declined',
              payload: {
                callId: callSession.callId,
                reason: typeof reason === 'string' ? reason.slice(0, 240) : 'Recipient declined the call.',
              },
            });
            activeCalls.delete(callSession.callId);
            break;
          }

          // -------------------------------------------------------------
          // 5. CALL END / HANGUP (EITHER PARTY)
          // -------------------------------------------------------------
          case 'call:end': {
            const { callId } = payload || {};
            const callSession = activeCalls.get(String(callId || ''));
            if (!currentUser || !callSession || !callSession.participants.includes(currentUser.userId)) {
              socket.send(JSON.stringify({
                type: 'call:error',
                payload: { message: 'This account is not a participant in that call.' },
              }));
              return;
            }
            removeAgoraParticipant(callSession.channelName, currentUser.userId);
            callSession.status = 'ended';
            const durationSeconds = callSession.connectedAt
              ? Math.max(0, Math.floor((Date.now() - callSession.connectedAt) / 1000))
              : 0;
            for (const participantId of callSession.participants) {
              if (participantId !== currentUser.userId) {
                sendToUser(participantId, {
                  type: 'call:ended',
                  payload: { callId: callSession.callId, endedBy: currentUser.userId, durationSeconds },
                });
              }
            }
            if (callSession.recipientId && !callSession.participants.includes(callSession.recipientId)) {
              sendToUser(callSession.recipientId, {
                type: 'call:ended',
                payload: { callId: callSession.callId, endedBy: currentUser.userId },
              });
            } else if (callSession.recipientNvId && !callSession.participants.some((id) => id === callSession.recipientNvId)) {
              sendToUser(callSession.recipientNvId, {
                type: 'call:ended',
                payload: { callId: callSession.callId, endedBy: currentUser.userId },
              });
            }
            activeCalls.delete(callSession.callId);
            break;
          }

          // -------------------------------------------------------------
          // 6. WEBRTC DIRECT P2P SIGNALING (OFFER, ANSWER, ICE)
          // -------------------------------------------------------------
          case 'call:webrtc_signal': {
            const { callId, targetUserId, signalData } = payload || {};
            const callSession = activeCalls.get(String(callId || ''));
            if (
              !currentUser ||
              !callSession ||
              callSession.status !== 'connected' ||
              !callSession.participants.includes(currentUser.userId) ||
              !signalData
            ) {
              return;
            }
            const targetId = String(targetUserId || callSession.participants.find((id) => id !== currentUser.userId) || '');
            if (!targetId || targetId === currentUser.userId || !callSession.participants.includes(targetId)) return;
            sendToUser(targetId, {
              type: 'call:webrtc_signal',
              payload: { callId: callSession.callId, senderId: currentUser.userId, signalData },
            });
            break;
          }

          // -------------------------------------------------------------
          // 7. IN-CALL REAL-TIME SPEECH & LANGPRETATION TRANSLATION
          // -------------------------------------------------------------
          case 'call:speech': {
            // Deprecated: a client-supplied text payload is not an audio source and must
            // never be treated as live speech in production. Real call Langpretation is
            // driven by microphone ASR -> MT -> provider TTS on the media path.
            return;
          }

          // -------------------------------------------------------------
          // 8. STREAM CHAT LIVE MESSAGING & TYPING
          // -------------------------------------------------------------
          case 'chat:send': {
            const { channelId, text, sourceLang, targetLang, userAvatar, attachments } = payload || {};
            if (!channelId || !text || !currentUser) return;

            let translatedText: string | undefined;
            if (sourceLang && targetLang && sourceLang !== targetLang) {
              const translated = await callProductionTranslation(text, sourceLang, targetLang);
              if (!translated?.text) return;
              translatedText = translated.text;
            } else { translatedText = text; }

            const newMsg: StreamChatMessage = await addStreamMessage(channelId, {
              id: `msg_ws_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              channelId,
              userId: currentUser.userId,
              userName: currentUser.name,
              userAvatar: currentUser.avatar,
              text,
              translatedText: translatedText !== text ? translatedText : undefined,
              sourceLang: sourceLang || currentUser.myLanguage,
              targetLang,
              createdAt: Date.now(),
              reactions: [],
              attachments,
            });

            broadcastStreamChatMessage(newMsg);
            break;
          }

          case 'chat:message': {
            if (payload && payload.conversationId && payload.message) {
              const message = payload.message && typeof payload.message === 'object'
                ? {
                    ...payload.message,
                    senderId: currentUser?.userId,
                    senderName: currentUser?.name,
                    senderAvatar: currentUser?.avatar || '',
                    senderLang: currentUser?.myLanguage || 'en',
                  }
                : null;
              if (!message) return;
              broadcastToAll(
                {
                  type: 'chat:message',
                  payload: {
                    conversationId: payload.conversationId,
                    message,
                  },
                },
                socket
              );
            }
            break;
          }

          case 'chat:typing': {
            const { channelId, isTyping } = payload || {};
            if (channelId && currentUser) {
              broadcastToAll(
                {
                  type: 'chat:typing_indicator',
                  payload: {
                    channelId,
                    userId: currentUser.userId,
                    userName: currentUser.name,
                    isTyping: !!isTyping,
                  },
                },
                socket
              );
            }
            break;
          }

          case 'chat:reaction': {
            const { channelId, messageId, reactionType } = payload || {};
            if (channelId && messageId && reactionType && currentUser) {
              const updated = await toggleStreamReaction(
                channelId,
                messageId,
                reactionType,
                currentUser.userId,
                currentUser.name
              );
              if (updated) {
                broadcastStreamReaction(channelId, updated);
              }
            }
            break;
          }

          default:
            break;
        }
        } catch (err) {
          console.error('WebSocket message processing error:', err);
        }
      });
    });

    socket.on('close', () => {
      clearInterval(pingInterval);
      allSockets.delete(socket);

      if (currentUser) {
        removeConnectedUser(currentUser);

        // Broadcast presence update on disconnect
        broadcastToAll({
          type: 'presence:update',
          payload: {
            activeOnlineUsers: getActiveConnectedUsersList(),
          },
        });
      }
    });

    socket.on('error', (err) => {
      console.warn('WebSocket socket error:', err);
    });
  });

  return wss;
}

/**
 * Authoritatively terminates a call session from the server.
 * Kicks participants from Agora media channel, notifies them via WebSocket with SYSTEM_BILLING_ENGINE reason,
 * and clears the active call registry.
 */
export function forceServerTerminateCall(callId: string, reason: string): boolean {
  const callSession = activeCalls.get(callId);
  if (callSession) {
    callSession.status = 'ended';
    if (callSession.channelName) {
      for (const pId of callSession.participants) {
        removeAgoraParticipant(callSession.channelName, pId);
      }
    }
    for (const pId of callSession.participants) {
      sendToUser(pId, {
        type: 'call:ended',
        payload: {
          callId,
          endedBy: 'SYSTEM_BILLING_ENGINE',
          reason,
          durationSeconds: callSession.connectedAt
            ? Math.floor((Date.now() - callSession.connectedAt) / 1000)
            : 0,
        },
      });
    }
    if (callSession.recipientId && !callSession.participants.includes(callSession.recipientId)) {
      sendToUser(callSession.recipientId, {
        type: 'call:ended',
        payload: {
          callId,
          endedBy: 'SYSTEM_BILLING_ENGINE',
          reason,
        },
      });
    }
    activeCalls.delete(callId);
    return true;
  }

  // Fallback broadcast in case participants were registered with alternative call ids
  broadcastToAll({
    type: 'call:ended',
    payload: {
      callId,
      endedBy: 'SYSTEM_BILLING_ENGINE',
      reason,
    },
  });
  return false;
}
