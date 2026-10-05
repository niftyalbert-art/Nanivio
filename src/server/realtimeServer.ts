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

    // Heartbeat ping/pong
    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
      }
    }, 25000);

    socket.on('message', async (data: string) => {
      try {
        const raw = data.toString();
        const parsed = JSON.parse(raw);
        const { type, payload } = parsed;

        switch (type) {
          // -------------------------------------------------------------
          // 1. PRESENCE / USER AUTHENTICATION
          // -------------------------------------------------------------
          case 'auth:presence': {
            const { userId, nvId, name, avatar, role, myLanguage } = payload || {};
            if (!userId) return;

            currentUser = {
              socket,
              userId,
              nvId: nvId || '',
              name: name || 'User',
              avatar,
              role: role || 'CITIZEN',
              myLanguage: myLanguage || 'en',
              connectedAt: Date.now(),
            };

            // Register in lookup maps
            if (!clientsByUserId.has(userId)) {
              clientsByUserId.set(userId, new Set());
            }
            clientsByUserId.get(userId)!.add(currentUser);

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
              caller,
              recipientId,
              recipientNvId,
            } = payload || {};

            if (!callId || !caller || (!recipientId && !recipientNvId)) {
              socket.send(
                JSON.stringify({
                  type: 'call:error',
                  payload: { message: 'Invalid call initiation payload.' },
                })
              );
              return;
            }

            const callSession: ActiveCallState = {
              callId,
              channelName: channelName || `nanivio_call_${callId}`,
              callType: callType || 'video',
              caller,
              recipientId,
              recipientNvId,
              status: 'ringing',
              startedAt: Date.now(),
              participants: [caller.id],
            };
            activeCalls.set(callId, callSession);

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
            const { callId, channelName, responder, callerId } = payload || {};
            const callSession = activeCalls.get(callId);

            if (callSession) {
              callSession.status = 'connected';
              callSession.connectedAt = Date.now();
              if (responder?.id && !callSession.participants.includes(responder.id)) {
                callSession.participants.push(responder.id);
              }

              // Register responder in Agora room
              if (responder) {
                registerAgoraParticipant(channelName || callSession.channelName, callSession.callType, {
                  uid: responder.id,
                  name: responder.name,
                  role: 'publisher',
                });
              }

              // Notify Caller that call was accepted
              const targetCallerId = callerId || callSession.caller.id;
              sendToUser(targetCallerId, {
                type: 'call:accepted',
                payload: {
                  callId,
                  channelName: channelName || callSession.channelName,
                  callType: callSession.callType,
                  responder,
                  connectedAt: callSession.connectedAt,
                },
              });

              // Confirm to responder
              socket.send(
                JSON.stringify({
                  type: 'call:connected',
                  payload: {
                    callId,
                    channelName: channelName || callSession.channelName,
                    callType: callSession.callType,
                    caller: callSession.caller,
                    connectedAt: callSession.connectedAt,
                  },
                })
              );
            }
            break;
          }

          // -------------------------------------------------------------
          // 4. CALL DECLINE (RECEIVER -> CALLER)
          // -------------------------------------------------------------
          case 'call:decline': {
            const { callId, callerId, reason } = payload || {};
            const callSession = activeCalls.get(callId);

            if (callSession) {
              callSession.status = 'declined';
              const targetCallerId = callerId || callSession.caller.id;
              sendToUser(targetCallerId, {
                type: 'call:declined',
                payload: {
                  callId,
                  reason: reason || 'Recipient is unavailable or declined the call.',
                },
              });
              activeCalls.delete(callId);
            }
            break;
          }

          // -------------------------------------------------------------
          // 5. CALL END / HANGUP (EITHER PARTY)
          // -------------------------------------------------------------
          case 'call:end': {
            const { callId, channelName, userId } = payload || {};
            const callSession = activeCalls.get(callId);

            if (channelName && userId) {
              removeAgoraParticipant(channelName, userId);
            }

            if (callSession) {
              callSession.status = 'ended';
              // Notify all other participants in the call
              for (const pId of callSession.participants) {
                if (pId !== userId) {
                  sendToUser(pId, {
                    type: 'call:ended',
                    payload: {
                      callId,
                      endedBy: userId,
                      durationSeconds: callSession.connectedAt
                        ? Math.floor((Date.now() - callSession.connectedAt) / 1000)
                        : 0,
                    },
                  });
                }
              }
              // Also notify recipient if not in participants
              if (callSession.recipientId && !callSession.participants.includes(callSession.recipientId)) {
                sendToUser(callSession.recipientId, {
                  type: 'call:ended',
                  payload: { callId, endedBy: userId },
                });
              }
              activeCalls.delete(callId);
            } else if (callId) {
              // Fallback broadcast
              broadcastToAll(
                {
                  type: 'call:ended',
                  payload: { callId, endedBy: userId },
                },
                socket
              );
            }
            break;
          }

          // -------------------------------------------------------------
          // 6. WEBRTC DIRECT P2P SIGNALING (OFFER, ANSWER, ICE)
          // -------------------------------------------------------------
          case 'call:webrtc_signal': {
            const { callId, targetUserId, signalData, senderId } = payload || {};
            if (signalData) {
              let delivered = false;
              if (targetUserId) {
                delivered = sendToUser(targetUserId, {
                  type: 'call:webrtc_signal',
                  payload: {
                    callId,
                    senderId: senderId || currentUser?.userId,
                    signalData,
                  },
                });
              }

              // Fallback to activeCall session participant if targetUserId lookup was missed
              if (!delivered && callId) {
                const session = activeCalls.get(callId);
                if (session) {
                  const currentId = senderId || currentUser?.userId;
                  const otherParty = session.caller.id === currentId
                    ? session.recipientId || session.recipientNvId
                    : session.caller.id;
                  if (otherParty) {
                    sendToUser(otherParty, {
                      type: 'call:webrtc_signal',
                      payload: {
                        callId,
                        senderId: currentId,
                        signalData,
                      },
                    });
                  }
                }
              }
            }
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
              userAvatar: userAvatar || currentUser.avatar,
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
              broadcastToAll(
                {
                  type: 'chat:message',
                  payload: {
                    conversationId: payload.conversationId,
                    message: payload.message,
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

    socket.on('close', () => {
      clearInterval(pingInterval);
      allSockets.delete(socket);

      if (currentUser) {
        const byUser = clientsByUserId.get(currentUser.userId);
        if (byUser) {
          byUser.delete(currentUser);
          if (byUser.size === 0) clientsByUserId.delete(currentUser.userId);
        }

        if (currentUser.nvId) {
          const byNv = clientsByNvId.get(currentUser.nvId);
          if (byNv) {
            byNv.delete(currentUser);
            if (byNv.size === 0) clientsByNvId.delete(currentUser.nvId);
          }
        }

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
