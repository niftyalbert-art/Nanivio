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
            const { callId, speakerId, speakerName, sourceLang, text, targetLang } = payload || {};
            if (!text || !callId) return;

            let translatedText = text;
            const destLang = targetLang || (currentUser?.myLanguage === 'ak' ? 'fr' : 'ak');

            if (sourceLang !== destLang) {
              const ai = getAI();
              if (ai) {
                try {
                  const targetName = LANGUAGE_NAMES[destLang] || destLang;
                  const prompt = `You are a real-time voice translation engine for Nanivio Langpretation. Translate this spoken utterance into ${targetName}. Provide ONLY the final translated sentence with no commentary:\n\n"${text}"`;
                  const result = await ai.models.generateContent({
                    model: 'gemini-3.8-flash',
                    contents: prompt,
                  });
                  if (result.text) translatedText = result.text.trim().replace(/^"|"$/g, '');
                } catch (e) {
                  console.warn('Langpretation live speech translation fallback:', e);
                }
              }
            }

            const transcriptPayload = {
              callId,
              speakerId: speakerId || currentUser?.userId,
              speakerName: speakerName || currentUser?.name,
              originalText: text,
              translatedText,
              sourceLang,
              targetLang: destLang,
              timestamp: Date.now(),
            };

            // Broadcast to call participants
            const callSession = activeCalls.get(callId);
            if (callSession) {
              for (const pId of callSession.participants) {
                sendToUser(pId, {
                  type: 'call:speech_transcript',
                  payload: transcriptPayload,
                });
              }
            } else {
              broadcastToAll({
                type: 'call:speech_transcript',
                payload: transcriptPayload,
              });
            }
            break;
          }

          // -------------------------------------------------------------
          // 8. STREAM CHAT LIVE MESSAGING & TYPING
          // -------------------------------------------------------------
          case 'chat:send': {
            const { channelId, text, sourceLang, targetLang, userAvatar, attachments } = payload || {};
            if (!channelId || !text || !currentUser) return;

            let translatedText = text;
            if (sourceLang && targetLang && sourceLang !== targetLang) {
              const ai = getAI();
              if (ai) {
                try {
                  const targetName = LANGUAGE_NAMES[targetLang] || targetLang;
                  const prompt = `Translate this chat message into ${targetName}. Output ONLY the direct translation:\n\n"${text}"`;
                  const result = await ai.models.generateContent({
                    model: 'gemini-3.8-flash',
                    contents: prompt,
                  });
                  if (result.text) translatedText = result.text.trim().replace(/^"|"$/g, '');
                } catch (e) {
                  console.warn('Stream chat translation warning:', e);
                }
              }
            }

            const newMsg: StreamChatMessage = addStreamMessage(channelId, {
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
              const updated = toggleStreamReaction(
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
