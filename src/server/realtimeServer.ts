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
  getStreamChannelMembers,
  requireStreamChannelMember,
  type StreamChatMessage,
} from './streamService.ts';
import { authDb } from './authDb.ts';
import * as persistentAuth from './persistentAuth.ts';
import { channelRecipients, normalizeChannelId } from './chatPrivacy.ts';
import { privateMessageMedia } from './chatAttachments.ts';
import { callKhayaEngine as khaya, callSunbirdEngine as sunbird } from './translationProviders.ts';
import { translateWithProductionProviders as callProductionTranslation } from './translationRouter.ts';
import { malviLiveBrainController } from './assistant/liveBrain.ts';
import { createNanivioMicGateway } from './assistant/nanivioMicGateway.ts';
const nanivioMicGateway = createNanivioMicGateway(malviLiveBrainController);
import { PalabraLiveGateway, type LangpretationAuthorizer } from './palabraLiveStream.ts';
import { PalabraError } from './palabraSpeech.ts';
import { participantLanguage } from '../shared/participantLanguage.ts';
let langpretationGateway:PalabraLiveGateway|null=null;

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
const ringingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const RING_TIMEOUT_MS = 30_000;

function clearRingingTimer(callId: string) {
  const timer = ringingTimers.get(callId);
  if (timer) clearTimeout(timer);
  ringingTimers.delete(callId);
}

function finishCall(callId: string, endedBy: string, reason?: string) {
  const call = activeCalls.get(callId);
  if (!call) return false;
  langpretationGateway?.endCall(callId);
  clearRingingTimer(callId);
  call.status = 'ended';
  const durationSeconds = call.connectedAt
    ? Math.max(0, Math.floor((Date.now() - call.connectedAt) / 1000))
    : 0;
  for (const id of call.participants) removeAgoraParticipant(call.channelName, id);
  const recipients = new Set([call.caller.id, ...call.participants]);
  if (call.recipientId) recipients.add(call.recipientId);
  else if (call.recipientNvId) recipients.add(call.recipientNvId);
  activeCalls.delete(callId);
  for (const recipient of recipients) {
    sendToUser(recipient, {
      type: 'call:ended',
      payload: { callId, endedBy, reason, durationSeconds },
    });
  }
  return true;
}

async function authenticateRealtimeToken(tokenValue: unknown) {
  const token = typeof tokenValue === 'string' ? tokenValue.trim() : '';
  if (!token) return null;
  try {
    const adminUser = persistentAuth.adminFromToken(token);
    if (adminUser) return adminUser.accountStatus === 'ACTIVE' ? adminUser : null;
    if (await persistentAuth.persistentAuthConfigured()) {
      const user = await persistentAuth.userFromToken(token);
      return user?.accountStatus === 'ACTIVE' ? user : null;
    }
    if (process.env.NODE_ENV === 'production' || process.env.REQUIRE_PERSISTENT_AUTH === 'true') return null;
    const user = authDb.validateSession(token);
    return user?.accountStatus === 'ACTIVE' ? user : null;
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

/** Unlike room admission, paid interpretation is unavailable while ringing. */
export function canTranslateLiveCall(userId: string, callId: string): boolean {
  const call = activeCalls.get(callId);
  return Boolean(call && call.status === 'connected' && call.participants.includes(userId));
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
  // General presence/control events go only to authenticated sockets.
  const authenticatedSockets = new Set([...clientsByUserId.values()].flatMap(users => [...users].map(user => user.socket)));
  for (const client of authenticatedSockets) {
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

async function broadcastToChannel(channelId: string, event: any, excludeSocket?: WebSocket) {
  const members = await getStreamChannelMembers(channelId);
  const recipients = channelRecipients(members, clientsByUserId);
  const json = JSON.stringify(event);
  for (const recipient of recipients) {
    if (recipient.socket !== excludeSocket && recipient.socket.readyState === WebSocket.OPEN) recipient.socket.send(json);
  }
}

export async function broadcastStreamChatMessage(message: StreamChatMessage) {
  await broadcastToChannel(message.channelId, {
    type: 'chat:message',
    payload: {
      channelId: message.channelId,
      message,
    },
  });
}

export async function broadcastStreamReaction(channelId: string, message: StreamChatMessage) {
  await broadcastToChannel(channelId, {
    type: 'chat:reaction_updated',
    payload: {
      channelId,
      message,
    },
  });
}

export function setupRealtimeServer(httpServer: HttpServer,options?:{authorizeLangpretation:LangpretationAuthorizer}) {
  langpretationGateway=new PalabraLiveGateway({
    authorize:options?.authorizeLangpretation||(async()=>{throw new Error('Translation authorization unavailable.');}),
    remote:(callId,speakerId,event,payload)=>{
      const call=activeCalls.get(callId);
      if(!call||call.status!=='connected'||!call.participants.includes(speakerId))return false;
      let sent=false;
      const message=JSON.stringify({type:event,payload});
      for(const id of call.participants.filter(id=>id!==speakerId)){
        for(const target of clientsByUserId.get(id)||[]){
          if(target.socket.readyState===WebSocket.OPEN&&target.socket.bufferedAmount<256000){
            target.socket.send(message);sent=true;
          }
        }
      }
      return sent;
    }
  });
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('error', (err) => {
    console.warn('[Realtime WSS Warning]', err?.message || err);
  });

  wss.on('connection', (socket: WebSocket) => {
    allSockets.add(socket);
    let currentUser: ConnectedUser | null = null;
    const translationPeer={closed:false,send:(type:string,payload:any)=>{
      if(socket.readyState===WebSocket.OPEN&&socket.bufferedAmount<512000)socket.send(JSON.stringify({type,payload}));
    }};
    let messageChain: Promise<void> = Promise.resolve();

    // Heartbeat ping/pong
    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
      }
    }, 25000);

    socket.on('message', (data: string) => {
      messageChain = messageChain.then(async () => {
        let chatRequestId: string | undefined;
        try {
          if (socket.readyState !== WebSocket.OPEN) return;
          const raw = data.toString();
          const parsed = JSON.parse(raw);
          const { type, payload } = parsed;
          if (typeof type === 'string' && type.startsWith('chat:') && typeof payload?.requestId === 'string') chatRequestId = payload.requestId;

        if (type !== 'auth:presence' && !currentUser) {
          socket.send(JSON.stringify({
            type: 'auth:error',
            payload: { message: 'Authentication required.' },
          }));
          return;
        }

        switch (type) {
          case 'langpretation:start': {
            try { await langpretationGateway!.start(translationPeer,currentUser!.userId,payload); }
            catch(error){translationPeer.send('langpretation:stopped',{
              callId:payload?.callId,streamId:payload?.streamId,
              message:error instanceof PalabraError?error.message:'Live translation could not be authorized.'
            });}
            break;
          }
          case 'langpretation:audio':
            langpretationGateway?.audio(translationPeer,payload);break;
          case 'langpretation:stop':
            langpretationGateway?.stopStream(translationPeer,payload?.streamId);break;
          case 'langpretation:receiver_ready':
            if(canTranslateLiveCall(currentUser!.userId,payload?.callId))
              langpretationGateway?.acknowledgeReceiver(payload.callId,payload.speakerId,payload.streamId,currentUser!.userId);
            break;
          case 'langpretation:playback_error':
            if(canTranslateLiveCall(currentUser!.userId,payload?.callId))
              langpretationGateway?.stopSpeaker(payload.callId,payload.speakerId);
            break;
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
              myLanguage: participantLanguage(payload?.myLanguage, user.preferredLanguage),
              connectedAt: Date.now(),
            };
            for(const call of activeCalls.values()){
              if(call.caller.id===currentUser.userId)call.caller.myLanguage=currentUser.myLanguage;
            }

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

          case 'malvi:brain_start': {
            if (typeof payload?.sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(payload.sessionId)) {
              socket.send(JSON.stringify({ type: 'malvi:brain_error', payload: { message: 'Invalid live session.' } }));
              break;
            }
            await malviLiveBrainController.start(socket, currentUser.userId, payload.sessionId, payload.language);
            break;
          }

          case 'malvi:brain_language': {
            if (typeof payload?.sessionId === 'string' && /^[a-f0-9-]{36}$/i.test(payload.sessionId)) {
              await malviLiveBrainController.language(socket, currentUser.userId, payload.sessionId, payload.language);
            }
            break;
          }
          case 'nanivio:mic_start': {
            nanivioMicGateway.start(socket, currentUser.userId, payload);
            break;
          }
          case 'nanivio:mic_audio': {
            await nanivioMicGateway.audio(socket, currentUser.userId, payload);
            break;
          }
          case 'nanivio:mic_stop': {
            nanivioMicGateway.stop(socket, currentUser.userId, payload);
            break;
          }
          case 'malvi:brain_audio': {
            if (typeof payload?.sessionId === 'string') {
              await malviLiveBrainController.audio(socket, currentUser.userId, payload.sessionId, payload.audio);
            }
            break;
          }

          case 'malvi:brain_audio_end': {
            if (typeof payload?.sessionId === 'string') {
              malviLiveBrainController.endAudio(socket, currentUser.userId, payload.sessionId);
            }
            break;
          }

          case 'malvi:brain_interrupt': {
            if (typeof payload?.sessionId === 'string') {
              malviLiveBrainController.interrupt(socket, currentUser.userId, payload.sessionId);
            }
            break;
          }
          case 'malvi:brain_stop': {
            if (typeof payload?.sessionId === 'string') {
              nanivioMicGateway.stopSession(socket, currentUser.userId, payload.sessionId);
              await malviLiveBrainController.stopSession(currentUser.userId, payload.sessionId);
            }
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
            const ringingTimer = setTimeout(() => {
              if (activeCalls.get(callSession.callId)?.status === 'ringing') {
                finishCall(callSession.callId, 'SYSTEM', 'NO_ANSWER');
              }
            }, RING_TIMEOUT_MS);
            ringingTimer.unref();
            ringingTimers.set(callSession.callId, ringingTimer);

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
            clearRingingTimer(callSession.callId);
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
            clearRingingTimer(callSession.callId);
            for (const id of callSession.participants) removeAgoraParticipant(callSession.channelName, id);
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
            finishCall(callSession.callId, currentUser.userId);
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
            await requireStreamChannelMember(channelId, currentUser.userId);

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

            await broadcastStreamChatMessage(newMsg);
            break;
          }

          case 'chat:message': {
            if (payload && payload.conversationId && payload.message) {
              const channelId = normalizeChannelId(payload.channelId || '');
              await requireStreamChannelMember(channelId, currentUser!.userId);
              const channel = await getStreamChannel(channelId, currentUser!.userId);
              if (!channel) throw new Error('Private channel unavailable.');
              const message = payload.message && typeof payload.message === 'object'
                ? {
                    ...payload.message,
                    senderId: currentUser?.userId,
                    senderName: currentUser?.name,
                    senderAvatar: currentUser?.avatar || '',
                    senderLang: currentUser?.myLanguage || 'en',
                    status: 'sent',
                    reactions: [],
                  }
                : null;
              if (!message) return;
              const originalMessageId = String(message.id || '');
              const nanivio = privateMessageMedia(message);
              Object.assign(message, nanivio);
              const attachments: NonNullable<StreamChatMessage['attachments']> = nanivio.mediaUrl ? [{
                type: nanivio.mediaType === 'image' ? 'image' as const : 'file' as const,
                url: nanivio.mediaUrl, name: nanivio.mediaFileName, size: nanivio.mediaFileSize,
              }] : nanivio.voiceNote ? [{
                type: 'audio' as const, url: nanivio.voiceNote.audioBlobUrl!,
                name: 'Voice note',
              }] : [];
              if (nanivio.voiceNote?.translatedAudioUrl) attachments.push({
                type: 'audio', url: nanivio.voiceNote.translatedAudioUrl, name: 'Translated voice note',
              });
              const saved = await addStreamMessage(channelId, {
                id: originalMessageId, channelId, userId: currentUser!.userId, userName: currentUser!.name,
                userAvatar: currentUser!.avatar, text: String(message.text || ''),
                sourceLang: currentUser!.myLanguage, createdAt: Date.now(), reactions: [],
                attachments, nanivio, isVoiceNote: nanivio.isVoiceNote, voiceNoteDuration: nanivio.voiceNote?.duration,
              });
              message.id = saved.id;
              // A canonical provider channel ID, not a caller-chosen local
              // conversation ID, binds the receiving UI to the right room.
              await broadcastToChannel(channelId,
                {
                  type: 'chat:message',
                  payload: {
                    conversationId: channelId,
                    channelId,
                    members: await getStreamChannelMembers(channelId),
                    title: channel.name,
                    isGroup: channel.custom?.isGroup,
                    message,
                  },
                },
                socket
              );
              socket.send(JSON.stringify({
                type: 'chat:message_ack',
                payload: { requestId: chatRequestId, channelId, messageId: originalMessageId, savedMessageId: saved.id, status: 'sent' },
              }));
            }
            break;
          }

          case 'chat:typing': {
            const { channelId, isTyping } = payload || {};
            if (channelId && currentUser) {
              await requireStreamChannelMember(channelId, currentUser.userId);
              await broadcastToChannel(channelId,
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
                await broadcastStreamReaction(channelId, updated);
              }
            }
            break;
          }

          default:
            break;
        }
        } catch (err) {
          if (chatRequestId && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'chat:error', payload: { requestId: chatRequestId, message: 'Private chat request could not be authorized or completed.' } }));
          }
          console.warn('WebSocket request could not be completed.');
        }
      });
    });

    socket.on('close', () => {
      translationPeer.closed=true;langpretationGateway?.stop(translationPeer);
      clearInterval(pingInterval);
      allSockets.delete(socket);
      nanivioMicGateway.closeSocket(socket);
      malviLiveBrainController.closeSocket(socket);

      if (currentUser) {
        removeConnectedUser(currentUser);
        // Another tab/device may still own this identity. Only the last
        // disconnected session ends its calls.
        const stillOnline = [...(clientsByUserId.get(currentUser.userId) || [])]
          .some(client => client.socket.readyState === WebSocket.OPEN);
        if (!stillOnline) {
          for (const call of [...activeCalls.values()]) {
            if (call.caller.id === currentUser.userId || isCallRecipient(call, currentUser)) {
              finishCall(call.callId, currentUser.userId, 'PARTICIPANT_DISCONNECTED');
            }
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
  clearRingingTimer(callId);
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
