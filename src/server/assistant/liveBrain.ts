import { GoogleGenAI, Modality } from '@google/genai';
import OpenAI from 'openai';
import { LiveWS } from 'openai/resources/live/ws';
import type { WebSocket } from 'ws';
import { AI_DISCLOSURE, liveAvatarService } from './liveAvatarService.ts';
import { getLiveBrainProviderConfig, type LiveBrainProviderId } from './brainProviderConfig.ts';
import { MALVI_SYSTEM_PROMPT } from './malviSystemPrompt.ts';
import { IDLE_MS } from './redisStore.ts';

type BrainEvent = (type: string, payload: Record<string, unknown>) => void;
type BrainConnection = {
  socket: WebSocket;
  owner: string;
  sessionId: string;
  provider: LiveBrainProviderId;
  sendAudio: (base64: string) => void;
  endAudio: () => void;
  close: () => void;
  closeProvider: () => void;
  closed: boolean;
  lastActivityAt: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  frameWindowStartedAt: number;
  framesInWindow: number;
  audioBuffer: Buffer[];
  transcript: string;
  isFirstTurn: boolean;
};

const MAX_INPUT_BYTES = 12_000;
const MAX_OUTPUT_BYTES = 3_000_000;
const activeBySocket = new WeakMap<WebSocket, Map<string, BrainConnection>>();
const activeBySession = new Map<string, BrainConnection>();

function send(socket: WebSocket, type: string, payload: Record<string, unknown>) {
  if (socket.readyState === 1) socket.send(JSON.stringify({ type, payload }));
}

function base64Buffer(value: unknown) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length > 0 ? bytes : null;
}

function hasSpeech(pcm: Buffer) {
  const count = Math.floor(pcm.length / 2);
  if (!count) return false;
  let energy = 0;
  for (let i = 0; i < count; i += 1) {
    const sample = pcm.readInt16LE(i * 2) / 32768;
    energy += sample * sample;
  }
  return Math.sqrt(energy / count) >= 0.009;
}

function resamplePcm16kTo24k(input: Buffer) {
  const inputSamples = Math.floor(input.length / 2);
  const outputSamples = Math.floor(inputSamples * 1.5);
  const output = Buffer.allocUnsafe(outputSamples * 2);
  for (let i = 0; i < outputSamples; i += 1) {
    const position = i * 2 / 3;
    const left = Math.floor(position);
    const right = Math.min(left + 1, inputSamples - 1);
    const fraction = position - left;
    const value = Math.round(input.readInt16LE(left * 2) * (1 - fraction) + input.readInt16LE(right * 2) * fraction);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, value)), i * 2);
  }
  return output;
}

function flushAudio(socket: WebSocket, connection: BrainConnection, ended: boolean) {
  const total = connection.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
  if (!total) {
    if (ended) send(socket, 'malvi:brain_turn_end', { sessionId: connection.sessionId });
    return;
  }
  if (total > MAX_OUTPUT_BYTES) {
    connection.audioBuffer = [];
    send(socket, 'malvi:brain_error', { sessionId: connection.sessionId, message: 'Malvi’s voice response exceeded the safe playback limit.' });
    return;
  }
  const pcm24k = Buffer.concat(connection.audioBuffer, total).toString('base64');
  connection.audioBuffer = [];
  send(socket, 'malvi:brain_audio', {
    sessionId: connection.sessionId,
    pcm24k,
    sampleRate: 24000,
    format: 'pcm_s16le',
    channels: 1,
    ended,
    greeting: connection.isFirstTurn,
    text: connection.transcript,
  });
  connection.isFirstTurn = false;
  if (ended) {
    connection.transcript = '';
    send(socket, 'malvi:brain_turn_end', { sessionId: connection.sessionId });
  }
}

async function connectGemini(
  socket: WebSocket,
  connection: BrainConnection,
  onReady: () => void,
  onFailure: (message: string) => void,
) {
  const provider = getLiveBrainProviderConfig().providers.gemini;
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const session = await client.live.connect({
    model: provider.model,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: MALVI_SYSTEM_PROMPT,
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
    callbacks: {
      onmessage(message) {
        if (connection.closed || socket.readyState !== socket.OPEN) return;
        const serverContent = message.serverContent;
        for (const part of serverContent?.modelTurn?.parts || []) {
          if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/pcm')) {
            const audio = base64Buffer(part.inlineData.data);
            if (audio) connection.audioBuffer.push(audio);
            if (connection.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0) > MAX_OUTPUT_BYTES) {
              onFailure('Malvi’s voice response exceeded the safe playback limit.');
              return;
            }
          }
          if (part.text) {
            connection.transcript += part.text;
            send(socket, 'malvi:brain_caption', { sessionId: connection.sessionId, text: part.text, role: 'assistant' });
          }
        }
        const inputText = serverContent?.inputTranscription?.text;
        if (inputText) send(socket, 'malvi:brain_caption', { sessionId: connection.sessionId, text: inputText, role: 'user' });
        const outputText = serverContent?.outputTranscription?.text;
        if (outputText) {
          connection.transcript += outputText;
          send(socket, 'malvi:brain_caption', { sessionId: connection.sessionId, text: outputText, role: 'assistant' });
        }
        if (serverContent?.interrupted) connection.audioBuffer = [];
        if (serverContent?.turnComplete) flushAudio(socket, connection, true);
      },
      onerror() { onFailure('The selected live voice provider reported an error.'); },
      onclose() { onFailure('The live brain connection closed.'); },
    },
  });
  connection.sendAudio = (base64) => {
    session.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
  };
  connection.endAudio = () => session.sendRealtimeInput({ audioStreamEnd: true });
  connection.closeProvider = () => { void session.close(); };
  if (connection.closed) { connection.closeProvider(); return; }
  onReady();
  // Keep the disclosure audio deterministic when the configured backend speech
  // service is absent: the first generated answer is instructed to identify Malvi.
  session.sendClientContent({
    turns: [{ role: 'user', parts: [{ text: `Before anything else, say this exact sentence aloud: “${AI_DISCLOSURE}”` }] }],
    turnComplete: true,
  });
}

async function connectOpenAI(
  socket: WebSocket,
  connection: BrainConnection,
  onReady: () => void,
  onFailure: (message: string) => void,
) {
  const provider = getLiveBrainProviderConfig().providers.openai;
  const live = new LiveWS(new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, maxRetries: 0 }));
  let started = false;
  let outputTimer: ReturnType<typeof setTimeout> | null = null;
  const timeout = setTimeout(() => onFailure('The selected live voice provider did not become ready.'), 12_000);
  live.on('event', (event: any) => {
    if (!event || connection.closed || socket.readyState !== socket.OPEN) return;
    if (event.type === 'session.started') {
      if (!started) {
        started = true;
        clearTimeout(timeout);
        onReady();
      }
    } else if (event.type === 'session.output_audio.delta' && typeof event.delta === 'string') {
      const audio = base64Buffer(event.delta);
      if (audio) connection.audioBuffer.push(audio);
      if (connection.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0) > MAX_OUTPUT_BYTES) {
        onFailure('Malvi’s voice response exceeded the safe playback limit.');
        return;
      }
      if (outputTimer) clearTimeout(outputTimer);
      outputTimer = setTimeout(() => flushAudio(socket, connection, true), 700);
    } else if (event.type === 'session.output_transcript.delta' && typeof event.delta === 'string') {
      connection.transcript += event.delta;
      send(socket, 'malvi:brain_caption', { sessionId: connection.sessionId, text: event.delta, role: 'assistant' });
    } else if (event.type === 'session.input_transcript.delta' && typeof event.delta === 'string') {
      send(socket, 'malvi:brain_caption', { sessionId: connection.sessionId, text: event.delta, role: 'user' });
    } else if (event.type === 'session.closed') {
      onFailure('The live brain session ended.');
    } else if (typeof event.type === 'string' && event.type.includes('error')) {
      onFailure('The selected live voice provider could not process the conversation.');
    }
  });
  live.on('error', () => onFailure('The selected live voice provider could not connect.'));
  live.socket.on('open', () => {
    live.send({
      type: 'session.start',
      session: {
        model: provider.model,
        instructions: MALVI_SYSTEM_PROMPT,
        audio: { format: { type: 'audio/pcm', rate: 24000 }, output: { voice: process.env.MALVI_OPENAI_VOICE || 'marin' } },
      },
    } as any);
  });
  live.socket.on('close', () => {
    clearTimeout(timeout);
    if (started) onFailure('The live brain connection closed.');
  });
  connection.sendAudio = (base64) => {
    const pcm16 = base64Buffer(base64);
    if (!pcm16) return;
    const pcm24k = resamplePcm16kTo24k(pcm16).toString('base64');
    live.send({ type: 'session.input_audio.append', audio: pcm24k } as any);
  };
  connection.endAudio = () => {};
  connection.closeProvider = () => {
    clearTimeout(timeout);
    if (outputTimer) clearTimeout(outputTimer);
    live.close();
  };
}

function createConnection(socket: WebSocket, userId: string, sessionId: string): BrainConnection {
  const connection: BrainConnection = {
    socket,
    owner: userId,
    sessionId,
    provider: 'gemini',
    sendAudio: () => {},
    endAudio: () => {},
    closed: false,
    closeProvider: () => {},
    close: () => {
      if (connection.closed) return;
      connection.closed = true;
      if (connection.idleTimer) clearTimeout(connection.idleTimer);
      connection.audioBuffer = [];
      connection.closeProvider();
    },
    lastActivityAt: 0,
    idleTimer: null,
    frameWindowStartedAt: 0,
    framesInWindow: 0,
    audioBuffer: [],
    transcript: '',
    isFirstTurn: true,
  };
  const providerConfig = getLiveBrainProviderConfig();
  if (!providerConfig.configured || !providerConfig.selectedProvider) {
    throw new Error(providerConfig.missing[0] ? `Live brain setup required: ${providerConfig.missing[0]}.` : 'Choose gemini or openai in MALVI_BRAIN_PROVIDER.');
  }
  connection.provider = providerConfig.selectedProvider;
  const fail = (message: string) => {
    if (connection.closed) return;
    send(socket, 'malvi:brain_error', { sessionId, message });
    connection.close();
    activeBySession.delete(sessionId);
    activeBySocket.get(socket)?.delete(sessionId);
  };
  const ready = () => send(socket, 'malvi:brain_ready', { sessionId, provider: providerConfig.selectedProvider });
  if (connection.provider === 'gemini') void connectGemini(socket, connection, ready, fail).catch(() => fail('Gemini Live could not connect.'));
  else void connectOpenAI(socket, connection, ready, fail).catch(() => fail('OpenAI GPT-Live could not connect.'));
  return connection;
}

export const malviLiveBrainController = {
  async start(socket: WebSocket, userId: string, sessionId: string) {
    try {
      await liveAvatarService.owned(userId, sessionId);
      const existing = activeBySocket.get(socket)?.get(sessionId);
      if (existing) return;
      const current = activeBySession.get(sessionId);
      if (current) throw new Error('This live session already has an active brain connection.');
      const connection = createConnection(socket, userId, sessionId);
      if (!activeBySocket.has(socket)) activeBySocket.set(socket, new Map());
      activeBySocket.get(socket)!.set(sessionId, connection);
      activeBySession.set(sessionId, connection);
      connection.lastActivityAt = Date.now();
      connection.idleTimer = setTimeout(() => {
        void this.stopSession(userId, sessionId);
      }, IDLE_MS + 1000);
    } catch (error) {
      send(socket, 'malvi:brain_error', {
        sessionId,
        message: error instanceof Error ? error.message : 'The live brain could not start.',
      });
    }
  },
  async audio(socket: WebSocket, userId: string, sessionId: string, encoded: unknown) {
    const connection = activeBySocket.get(socket)?.get(sessionId);
    if (!connection || connection.owner !== userId) {
      send(socket, 'malvi:brain_error', { sessionId, message: 'The live brain session is not active for this account.' });
      return;
    }
    if (typeof encoded !== 'string' || encoded.length > Math.ceil(MAX_INPUT_BYTES / 3) * 4 + 4) {
      send(socket, 'malvi:brain_error', { sessionId, message: 'The microphone audio frame exceeded the safe size limit.' });
      return;
    }
    const now = Date.now();
    if (now - connection.frameWindowStartedAt >= 1000) {
      connection.frameWindowStartedAt = now;
      connection.framesInWindow = 0;
    }
    connection.framesInWindow += 1;
    if (connection.framesInWindow > 12) {
      send(socket, 'malvi:brain_error', { sessionId, message: 'The microphone is sending audio too quickly. Turn it off and try again.' });
      return;
    }
    const pcm = base64Buffer(encoded);
    if (!pcm || pcm.length > MAX_INPUT_BYTES || pcm.length % 2 !== 0) {
      send(socket, 'malvi:brain_error', { sessionId, message: 'The microphone audio frame was invalid.' });
      return;
    }
    if (hasSpeech(pcm) && Date.now() - connection.lastActivityAt > 1000) {
      try {
        const activity = await liveAvatarService.activity(userId, sessionId);
        send(socket, 'malvi:brain_activity', { sessionId, idleDeadline: activity.idleDeadline });
        connection.lastActivityAt = Date.now();
        if (connection.idleTimer) clearTimeout(connection.idleTimer);
        connection.idleTimer = setTimeout(() => {
          void this.stopSession(userId, sessionId);
        }, IDLE_MS + 1000);
      } catch {
        send(socket, 'malvi:brain_error', { sessionId, message: 'The live session timed out. End it and start a new conversation.' });
        await this.stopSession(userId, sessionId);
        return;
      }
    }
    connection.sendAudio(pcm.toString('base64'));
  },
  endAudio(socket: WebSocket, userId: string, sessionId: string) {
    const connection = activeBySocket.get(socket)?.get(sessionId);
    if (connection?.owner === userId) connection.endAudio();
  },
  async stopSession(userId: string, sessionId: string) {
    const connection = activeBySession.get(sessionId);
    if (!connection || connection.owner !== userId) return;
    connection.close();
    activeBySession.delete(sessionId);
    activeBySocket.get(connection.socket)?.delete(sessionId);
  },
  closeSocket(socket: WebSocket) {
    const connections = activeBySocket.get(socket);
    if (!connections) return;
    for (const [sessionId, connection] of connections) {
      connection.close();
      activeBySession.delete(sessionId);
    }
    connections.clear();
    activeBySocket.delete(socket);
  },
};

export { getLiveBrainProviderConfig, hasSpeech, resamplePcm16kTo24k };
