import type { WebSocket } from 'ws';
import {
  isMicId, isNanivioMicStart, NANIVIO_MIC_BYTES, NANIVIO_MIC_EVENTS,
  type NanivioMicStatus,
} from '../../shared/nanivioMicProtocol.ts';

interface BrainInput {
  inputReadiness(socket: WebSocket, owner: string, sessionId: string): { provider: string; language: string } | null;
  audio(socket: WebSocket, owner: string, sessionId: string, encoded: unknown, current?: () => boolean): Promise<boolean>;
  endAudio(socket: WebSocket, owner: string, sessionId: string): void;
}
type Stream = { owner: string; streamId: string; sequence: number; received: number; inFlight: number; tail: Promise<void> };

/**
 * Cloud gateway for web/native adapters. It reuses the authenticated app socket
 * and its existing owned live session; opening a mic never creates a provider.
 */
export function createNanivioMicGateway(brain: BrainInput) {
  const sockets = new WeakMap<WebSocket, Map<string, Stream>>();
  function status(socket: WebSocket, sessionId: string, streamId: string, details: Omit<NanivioMicStatus, 'sessionId' | 'streamId' | 'version'>) {
    if (socket.readyState === 1) socket.send(JSON.stringify({
      type: NANIVIO_MIC_EVENTS.status, payload: { sessionId, streamId, version: 1, ...details },
    }));
  }
  function error(socket: WebSocket, sessionId: string, streamId: string, code: string, message: string) {
    status(socket, sessionId, streamId, { state: 'error', code, message });
  }
  function stop(socket: WebSocket, owner: string, payload: any) {
    if (!isMicId(payload?.sessionId) || !isMicId(payload?.streamId)) return;
    const map = sockets.get(socket), stream = map?.get(payload.sessionId);
    if (!stream || stream.owner !== owner || stream.streamId !== payload.streamId) return;
    map!.delete(payload.sessionId); // Invalidate pending provider delivery before ending audio.
    try { brain.endAudio(socket, owner, payload.sessionId); } catch { /* Provider may already be closed. */ }
    status(socket, payload.sessionId, payload.streamId, { state: 'stopped' });
  }
  return {
    start(socket: WebSocket, owner: string, payload: unknown) {
      if (!isNanivioMicStart(payload)) {
        const value = payload as any;
        if (isMicId(value?.sessionId) && isMicId(value?.streamId)) error(socket, value.sessionId, value.streamId, 'PROTOCOL_INVALID', 'Nanivio Mic requires mono PCM16 at 16 kHz and protocol version 1.');
        return;
      }
      const ready = brain.inputReadiness(socket, owner, payload.sessionId);
      if (!ready) { error(socket, payload.sessionId, payload.streamId, 'SESSION_NOT_READY', 'The live brain session is not ready for this account. Start a new conversation.'); return; }
      let map = sockets.get(socket);
      if (!map) { map = new Map(); sockets.set(socket, map); }
      for (const [oldSession, oldStream] of map) {
        if (!brain.inputReadiness(socket, oldStream.owner, oldSession)) {
          stop(socket, oldStream.owner, { sessionId: oldSession, streamId: oldStream.streamId });
        }
      }
      if (map.size && !map.has(payload.sessionId)) {
        error(socket, payload.sessionId, payload.streamId, 'MIC_ALREADY_ACTIVE', 'Stop the current Nanivio Mic stream before opening another.');
        return;
      }
      const previous = map.get(payload.sessionId);
      if (previous && (previous.owner !== owner || previous.streamId !== payload.streamId)) {
        error(socket, payload.sessionId, payload.streamId, 'MIC_ALREADY_ACTIVE', 'Stop the current Nanivio Mic stream before opening another.'); return;
      }
      if (!previous) map.set(payload.sessionId, { owner, streamId: payload.streamId, sequence: 0, received: 0, inFlight: 0, tail: Promise.resolve() });
      status(socket, payload.sessionId, payload.streamId, { state: 'ready', ...ready });
    },
    async audio(socket: WebSocket, owner: string, payload: any) {
      if (!isMicId(payload?.sessionId) || !isMicId(payload?.streamId)) return;
      const map = sockets.get(socket), stream = map?.get(payload.sessionId);
      if (!stream || stream.owner !== owner || stream.streamId !== payload.streamId) {
        error(socket, payload.sessionId, payload.streamId, 'MIC_NOT_ACTIVE', 'Nanivio Mic is not active for this connection.'); return;
      }
      const current = () => map?.get(payload.sessionId) === stream && socket.readyState === 1;
      const reject = (code: string, message: string) => {
        stop(socket, owner, payload); error(socket, payload.sessionId, payload.streamId, code, message);
      };
      if (!Number.isSafeInteger(payload.sequence) || payload.sequence !== stream.sequence + 1
        || typeof payload.audio !== 'string' || payload.audio.length !== 8536
        || !/^[A-Za-z0-9+/]+==$/.test(payload.audio)
        || Buffer.from(payload.audio, 'base64').length !== NANIVIO_MIC_BYTES) {
        reject('FRAME_INVALID', 'Nanivio Mic received an invalid or out-of-order audio frame. Reconnect to retry.'); return;
      }
      if (stream.inFlight >= 3) { reject('INPUT_BUSY', 'Nanivio Mic could not deliver audio fast enough. Reconnect to retry.'); return; }
      stream.sequence = payload.sequence; stream.inFlight++;
      const work = stream.tail.then(async () => {
      try {
        if (!current()) return;
        const delivered = await brain.audio(socket, owner, payload.sessionId, payload.audio, current);
        if (!current()) return;
        if (!delivered) { reject('DELIVERY_FAILED', 'The selected brain stopped accepting microphone audio. Reconnect to retry.'); return; }
        stream.received++;
        if (stream.received === 1 || stream.received % 5 === 0) status(socket, payload.sessionId, payload.streamId, {
          state: 'receiving', lastSequence: payload.sequence, receivedFrames: stream.received,
        });
      } catch {
        if (current()) reject('DELIVERY_FAILED', 'Nanivio Mic could not deliver audio to the selected brain.');
      } finally { stream.inFlight--; }
      });
      stream.tail = work.catch(() => {});
      await work;
    },
    stop,
    stopSession(socket: WebSocket, owner: string, sessionId: string) {
      const stream = sockets.get(socket)?.get(sessionId);
      if (stream) stop(socket, owner, { sessionId, streamId: stream.streamId });
    },
    closeSocket(socket: WebSocket) {
      for (const [sessionId, stream] of sockets.get(socket) || []) stop(socket, stream.owner, { sessionId, streamId: stream.streamId });
      sockets.delete(socket);
    },
  };
}
