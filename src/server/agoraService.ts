import crypto from 'crypto';
import { RtcTokenBuilder } from 'agora-token';

export interface AgoraTokenOptions {
  appId?: string;
  appCertificate?: string;
  channelName: string;
  uid: string | number;
  role?: 'publisher' | 'subscriber';
  expireTimeSeconds?: number;
}

export interface AgoraChannelSession {
  channelName: string;
  callType: 'audio' | 'video';
  createdAt: number;
  participants: Array<{
    uid: string | number;
    name: string;
    role: 'publisher' | 'subscriber';
    joinedAt: number;
    audioTrackActive: boolean;
    videoTrackActive: boolean;
  }>;
}

// In-memory active Agora channels tracking
const activeAgoraChannels: Map<string, AgoraChannelSession> = new Map();

/**
 * Generates an Agora RTC Token.
 * Generates a signed production Agora RTC token. Missing production credentials are a hard failure.
 */
export function normalizeAgoraUid(uid: string | number): number {
  if (typeof uid === 'number' && Number.isFinite(uid) && uid > 0) return Math.floor(uid) >>> 0;
  const hash = crypto.createHash('sha256').update(String(uid)).digest();
  const n = hash.readUInt32BE(0) >>> 0;
  return n === 0 ? 1 : n;
}

export function generateAgoraRtcToken(options: AgoraTokenOptions): {
  token: string;
  appId: string;
  channelName: string;
  uid: string | number;
  agoraUid: number;
  expiresAt: number;
  isMock: boolean;
} {
  const appId = options.appId || process.env.AGORA_APP_ID || '';
  const appCertificate = options.appCertificate || process.env.AGORA_APP_CERTIFICATE || '';
  const channelName = options.channelName;
  const uid = options.uid;
  const agoraUid = normalizeAgoraUid(uid);
  const expireDuration = Math.min(Math.max(options.expireTimeSeconds || 3600, 300), 86400);
  const privilegeExpiredTs = Math.floor(Date.now() / 1000) + expireDuration;

  if (!appId || !appCertificate) {
    throw new Error('Agora production credentials are not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE.');
  }

  const role = options.role === 'subscriber' ? 2 : 1;
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    agoraUid,
    role,
    privilegeExpiredTs
  );

  return {
    token,
    appId,
    channelName,
    uid,
    agoraUid,
    expiresAt: privilegeExpiredTs * 1000,
    isMock: false,
  };
}

export function registerAgoraParticipant(
  channelName: string,
  callType: 'audio' | 'video',
  participant: { uid: string | number; name: string; role?: 'publisher' | 'subscriber' }
) {
  let session = activeAgoraChannels.get(channelName);
  if (!session) {
    session = {
      channelName,
      callType,
      createdAt: Date.now(),
      participants: [],
    };
    activeAgoraChannels.set(channelName, session);
  }

  const existingIdx = session.participants.findIndex(p => String(p.uid) === String(participant.uid));
  const newEntry = {
    uid: participant.uid,
    name: participant.name,
    role: participant.role || 'publisher',
    joinedAt: Date.now(),
    audioTrackActive: true,
    videoTrackActive: callType === 'video',
  };

  if (existingIdx >= 0) {
    session.participants[existingIdx] = newEntry;
  } else {
    session.participants.push(newEntry);
  }

  return session;
}

export function removeAgoraParticipant(channelName: string, uid: string | number) {
  const session = activeAgoraChannels.get(channelName);
  if (session) {
    session.participants = session.participants.filter(p => String(p.uid) !== String(uid));
    if (session.participants.length === 0) {
      activeAgoraChannels.delete(channelName);
    }
  }
}

export function getActiveAgoraChannels(): AgoraChannelSession[] {
  return Array.from(activeAgoraChannels.values());
}
