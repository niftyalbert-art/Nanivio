import { GoogleGenAI, Modality, StartSensitivity, EndSensitivity, type Session } from '@google/genai';
import OpenAI from 'openai';
import { LiveWS } from 'openai/resources/live/ws';
import type { WebSocket } from 'ws';
import { liveAvatarService } from './liveAvatarService.ts';
import { getLiveBrainProviderConfig, type LiveBrainProviderId } from './brainProviderConfig.ts';
import { buildMalviLiveInstructions, malviLanguageInstruction, malviGreetingInstruction } from './malviSystemPrompt.ts';
import { getMalviLanguage, malviLanguageCoverage } from '../../lib/malviLanguages.ts';
import { IDLE_MS } from './redisStore.ts';
import { REFERENCE_TOOL_NAME, REFERENCE_TOOL_DESCRIPTION, REFERENCE_TOOL_PARAMETERS } from './referenceTools.ts';
import { createGeminiReferenceBridge, createOpenAIReferenceBridge } from './referenceToolBridges.ts';
import { createMalviSpeechQueue, MAX_SPEECH_TEXT } from './malviSpeech.ts';
import { malviOpeningBoundary } from './malviResponsePacing.ts';
import { assertMalviVoiceLanguage, malviVoiceSetup, type MalviVoiceProvider } from './malviVoiceConfig.ts';
import { GeminiNativeVoice } from './geminiNativeVoice.ts';
import { MALVI_GEMINI_VOICE, malviGeminiVoiceDirection } from './geminiVoiceStyle.ts';
import { appendConversationMemory, conversationMemoryContext, readConversationMemory, MEMORY_TOOL, type MemoryState } from './conversationMemory.ts';
import { createConversationTools } from './conversationTools.ts';
import { WEB_TOOL } from './webResearch.ts';
import { MEDIA_TOOL } from './mediaResearch.ts';
import { MAPS_TOOL } from './mapTools.ts';
import { VISION_INSTRUCTION } from './visionInput.ts';
import { AssistantError } from './redisStore.ts';

type BrainEvent = (type: string, payload: Record<string, unknown>) => void;
type BrainConnection = {
  socket: WebSocket;
  owner: string;
  sessionId: string;
  provider: LiveBrainProviderId;
  language: string;
  ready: boolean;
  changeLanguage: (code: string) => void;
  sendAudio: (base64: string) => void;
  endAudio: () => void;
  close: () => void;
  closeProvider: () => void;
  closed: boolean;
  lastActivityAt: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  hardTimer: ReturnType<typeof setTimeout> | null;
  frameWindowStartedAt: number;
  framesInWindow: number;
  speech: ReturnType<typeof createMalviSpeechQueue>;
  speechProvider: MalviVoiceProvider;
  nativeVoice: GeminiNativeVoice;
  playbackUntil: number;
  outputLanguage: string | null;
  transcript: string;
  openingSent: boolean;
  outputCharacters: number;
  outputGeneration: number;
  startedAt: number;
  isFirstTurn: boolean;
  research: ReturnType<typeof createConversationTools>;
  memory: MemoryState;
  memoryUser: string;
  memoryAssistant: string;
  memoryTurn: number;
  memoryWrites: Promise<unknown>;
  sendVision: (image: { data: string; mimeType: string }) => void;
  visionAt: number;
};

const MAX_INPUT_BYTES = 12_000;
const activeBySocket = new WeakMap<WebSocket, Map<string, BrainConnection>>();
const activeBySession = new Map<string, BrainConnection>();

function saveMemoryTurn(connection: BrainConnection) {
  const user = connection.memoryUser.trim(), assistant = connection.memoryAssistant.trim();
  connection.memoryUser = ''; connection.memoryAssistant = '';
  if (!connection.memory.enabled || !user) return; // Do not archive an unsolicited greeting.
  const turn = ++connection.memoryTurn;
  const events = [
    { key: `${connection.sessionId}:${turn}:user`, role: 'user' as const, text: user },
    { key: `${connection.sessionId}:${turn}:assistant`, role: 'assistant' as const, text: assistant },
  ];
  // Never put a database round-trip on the speech/playback path.
  connection.memoryWrites = connection.memoryWrites.then(() =>
    appendConversationMemory(connection.owner, connection.memory.generation, events)).catch(() => {
      send(connection.socket, 'malvi:brain_memory', { sessionId: connection.sessionId, status: 'unavailable',
        message: 'This turn could not be saved to account memory.' });
    });
}

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

function acceptsOutput(connection: BrainConnection) {
  if (!connection.outputLanguage) {
    connection.outputLanguage = connection.language;
    connection.openingSent = false;
    connection.outputCharacters = 0;
  }
  return connection.outputLanguage === connection.language;
}

async function flushAudio(socket: WebSocket, connection: BrainConnection, ended: boolean, boundary?: number) {
  if (connection.outputLanguage && connection.outputLanguage !== connection.language) {
    connection.transcript = '';
    if (ended) connection.outputLanguage = null;
    return;
  }
  const text = boundary ? connection.transcript.slice(0, boundary) : connection.transcript;
  const language = connection.language;
  const generation = connection.outputGeneration;
  connection.transcript = boundary ? connection.transcript.slice(boundary) : '';
  if (!text.trim()) {
    if (connection.outputLanguage && !connection.openingSent) throw new Error('Malvi’s brain did not provide the transcript required for her ElevenLabs voice.');
    if (ended) connection.outputLanguage = null;
    if (ended) send(socket, 'malvi:brain_turn_end', { sessionId: connection.sessionId });
    return;
  }
  if (ended) connection.outputLanguage = null;
  else connection.openingSent = true;
  const requestedAt = Date.now();
  const audio = await connection.speech.speak(text, language);
  if (!audio || connection.closed || connection.language !== language || generation !== connection.outputGeneration) return;
  if (connection.isFirstTurn) console.info('[Malvi] First voice timing', {
    provider: connection.provider, sinceBrainStartMs: Date.now() - connection.startedAt,
    synthesisMs: Date.now() - requestedAt,
  });
  const pcm24k = audio.toString('base64');
  connection.playbackUntil = Math.max(Date.now(), connection.playbackUntil) + audio.length / 48;
  send(socket, 'malvi:brain_audio', {
    sessionId: connection.sessionId,
    language,
    pcm24k,
    sampleRate: 24000,
    format: 'pcm_s16le',
    channels: 1,
    ended,
    greeting: connection.isFirstTurn,
    text,
    alignment: audio.alignment,
    durationMs: audio.length / 48,
    speechProvider: 'elevenlabs',
  });
  connection.isFirstTurn = false;
  if (ended) {
    send(socket, 'malvi:brain_turn_end', { sessionId: connection.sessionId });
  }
}

function flushNativeAudio(socket: WebSocket, connection: BrainConnection, ended = true) {
  if (connection.outputLanguage && connection.outputLanguage !== connection.language) {
    connection.nativeVoice.cancel();
    connection.transcript = '';
    connection.outputLanguage = null;
    return;
  }
  const audio = connection.nativeVoice.finish(connection.transcript, ended);
  connection.transcript = '';
  if (ended) connection.outputLanguage = null;
  if (!audio) {
    if (ended) send(socket, 'malvi:brain_turn_end', { sessionId: connection.sessionId });
    return;
  }
  connection.playbackUntil = Math.max(Date.now(), connection.playbackUntil) + audio.durationMs;
  send(socket, 'malvi:brain_audio', {
    ...audio, sessionId: connection.sessionId, language: connection.language,
    sampleRate: 24000, format: 'pcm_s16le', channels: 1, ended,
    greeting: connection.isFirstTurn, speechProvider: 'gemini', streaming: true,
  });
  connection.isFirstTurn = false;
  if (ended) send(socket, 'malvi:brain_turn_end', { sessionId: connection.sessionId });
}

function flushOpening(socket: WebSocket, connection: BrainConnection, failed: (message: string) => void) {
  if (connection.openingSent) return;
  const boundary = malviOpeningBoundary(connection.transcript);
  if (!boundary) return;
  void flushAudio(socket, connection, false, boundary).catch(error =>
    failed(error instanceof Error ? error.message : 'Malvi’s opening voice could not complete.'));
}

async function connectGemini(
  socket: WebSocket,
  connection: BrainConnection,
  onReady: () => void,
  onFailure: (message: string) => void,
) {
  const provider = getLiveBrainProviderConfig().providers.gemini;
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const handleReferences = createGeminiReferenceBridge(connection.research, response => session.sendToolResponse(response), () => connection.closed);
  const session: Session = await client.live.connect({
    model: provider.model,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: buildMalviLiveInstructions(connection.language, connection.provider)
        + conversationMemoryContext(connection.memory)
        + (connection.speechProvider === 'gemini' ? `\n\n${malviGeminiVoiceDirection(connection.language)}` : ''),
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: connection.speechProvider === 'gemini' ? MALVI_GEMINI_VOICE : 'Kore' } } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
          prefixPaddingMs: 40,
          silenceDurationMs: 250,
        },
      },
      tools: [{ functionDeclarations: [{
        name: REFERENCE_TOOL_NAME, description: REFERENCE_TOOL_DESCRIPTION, parametersJsonSchema: REFERENCE_TOOL_PARAMETERS,
      }, MEMORY_TOOL, WEB_TOOL, MEDIA_TOOL, MAPS_TOOL] }],
    },
    callbacks: {
      onmessage(message) {
        if (connection.closed || socket.readyState !== socket.OPEN) return;
        void handleReferences(message).catch(() => onFailure('The reference tool response could not reach the selected brain.'));
        const serverContent = message.serverContent;
        if (serverContent?.interrupted) {
          saveMemoryTurn(connection);
          connection.outputGeneration++;
          connection.speech.cancel(); connection.playbackUntil = 0;
          connection.nativeVoice.cancel();
          connection.transcript = ''; connection.outputLanguage = null;
          send(socket, 'malvi:brain_interrupted', { sessionId: connection.sessionId });
          return;
        }
        for (const part of serverContent?.modelTurn?.parts || []) {
          if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/pcm')) {
            // Native output is only retained after explicit voice selection.
            if (acceptsOutput(connection) && connection.speechProvider === 'gemini') {
              try { connection.nativeVoice.append(part.inlineData.data, part.inlineData.mimeType); }
              catch (error) { onFailure((error as Error).message); return; }
            }
          }
        }
        const inputText = serverContent?.inputTranscription?.text;
        if (inputText) {
          connection.memoryUser = (connection.memoryUser + inputText).slice(0,12000);
          send(socket, 'malvi:brain_caption', { sessionId: connection.sessionId, text: inputText, role: 'user' });
        }
        const outputText = serverContent?.outputTranscription?.text;
        if (outputText && acceptsOutput(connection)) {
          connection.transcript += outputText;
          connection.memoryAssistant = (connection.memoryAssistant + outputText).slice(0,12000);
          connection.outputCharacters += outputText.length;
          if (connection.outputCharacters > MAX_SPEECH_TEXT) {
            onFailure('Malvi’s spoken response exceeded the text safety limit.');
            return;
          }
          send(socket, 'malvi:brain_caption', { sessionId: connection.sessionId, language: connection.outputLanguage, text: outputText, role: 'assistant' });
          if (!serverContent?.turnComplete && connection.speechProvider === 'elevenlabs') flushOpening(socket, connection, onFailure);
        }
        if (serverContent?.turnComplete) saveMemoryTurn(connection);
        if (serverContent?.turnComplete && connection.speechProvider === 'gemini') {
          try { flushNativeAudio(socket, connection); }
          catch (error) { onFailure((error as Error).message); }
          return;
        }
        if (connection.speechProvider === 'gemini' && connection.nativeVoice.ready(connection.transcript)) {
          try { flushNativeAudio(socket, connection, false); }
          catch (error) { onFailure((error as Error).message); }
        }
        if (serverContent?.turnComplete) void flushAudio(socket, connection, true).catch(error => {
          onFailure(error instanceof Error ? error.message : 'Malvi’s ElevenLabs voice could not complete the response.');
        });
      },
      onerror() { onFailure('The selected live voice provider reported an error.'); },
      onclose() { onFailure('The live brain connection closed.'); },
    },
  });
  connection.sendAudio = (base64) => {
    session.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
  };
  connection.endAudio = () => session.sendRealtimeInput({ audioStreamEnd: true });
  connection.sendVision = image => {
    session.sendRealtimeInput({ video: image });
    session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: VISION_INSTRUCTION }] }], turnComplete: true });
  };
  connection.changeLanguage = code => {
    session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text: `${malviLanguageInstruction(code, connection.provider)}${connection.isFirstTurn ? `\n${malviGreetingInstruction(code, connection.memory.hasPrevious)}` : ''}${connection.speechProvider === 'gemini' ? `\n${malviGeminiVoiceDirection(code)}` : ''}` }] }],
      turnComplete: false,
    });
  };
  connection.closeProvider = () => { void session.close(); };
  if (connection.closed) { connection.closeProvider(); return; }
  onReady();
  // The selected brain supplies the introduction in the selected language.
  // Do not play a separate English greeting through another provider.
  session.sendClientContent({
    turns: [{ role: 'user', parts: [{ text: malviGreetingInstruction(connection.language, connection.memory.hasPrevious) }] }],
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
  const handleReferences = createOpenAIReferenceBridge(connection.research, event => live.send(event), () => connection.closed);
  let started = false;
  let outputTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSpeech = () => {
    if (outputTimer) clearTimeout(outputTimer);
    // GPT-Live transcripts have no done event. Use both audio and transcript
    // activity to delimit a quiet segment, including discarded interrupted text.
    outputTimer = setTimeout(() => {
      outputTimer = null;
      saveMemoryTurn(connection);
      void flushAudio(socket, connection, true).catch(error => {
        onFailure(error instanceof Error ? error.message : 'Malvi’s ElevenLabs voice could not complete the response.');
      });
    }, 700);
  };
  const timeout = setTimeout(() => onFailure('The selected live voice provider did not become ready.'), 12_000);
  live.on('event', (event: any) => {
    if (!event || connection.closed || socket.readyState !== socket.OPEN) return;
    void handleReferences(event).catch(() => onFailure('The reference tool response could not reach the selected brain.'));
    if (event.type === 'session.started') {
      if (!started) {
        started = true;
        clearTimeout(timeout);
        onReady();
      }
    } else if (event.type === 'session.output_audio.delta' && typeof event.delta === 'string') {
      acceptsOutput(connection); // Never forward OpenAI's native voice.
      scheduleSpeech();
    } else if (event.type === 'session.output_transcript.delta' && typeof event.delta === 'string' && acceptsOutput(connection)) {
      connection.transcript += event.delta;
      connection.memoryAssistant = (connection.memoryAssistant + event.delta).slice(0,12000);
      connection.outputCharacters += event.delta.length;
      if (connection.outputCharacters > MAX_SPEECH_TEXT) {
        onFailure('Malvi’s spoken response exceeded the text safety limit.');
        return;
      }
      send(socket, 'malvi:brain_caption', { sessionId: connection.sessionId, language: connection.outputLanguage, text: event.delta, role: 'assistant' });
      flushOpening(socket, connection, onFailure);
      scheduleSpeech();
    } else if (event.type === 'session.input_transcript.delta' && typeof event.delta === 'string') {
      connection.memoryUser = (connection.memoryUser + event.delta).slice(0,12000);
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
        instructions: `${buildMalviLiveInstructions(connection.language, connection.provider)}${conversationMemoryContext(connection.memory)}\n${malviGreetingInstruction(connection.language, connection.memory.hasPrevious)}`,
        audio: { format: { type: 'audio/pcm', rate: 24000 }, output: { voice: process.env.MALVI_OPENAI_VOICE || 'marin' } },
        delegation: {
          type: 'responses',
          responses: {
            ...(process.env.MALVI_OPENAI_REASONING_MODEL ? { model: process.env.MALVI_OPENAI_REASONING_MODEL } : {}),
            instructions: buildMalviLiveInstructions(connection.language, connection.provider) + conversationMemoryContext(connection.memory),
            tools: [{ type: 'function', name: REFERENCE_TOOL_NAME, description: REFERENCE_TOOL_DESCRIPTION, parameters: REFERENCE_TOOL_PARAMETERS, strict: true },
              ...[MEMORY_TOOL, WEB_TOOL, MEDIA_TOOL, MAPS_TOOL].map(tool => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.parametersJsonSchema, strict: true }))],
            tool_choice: 'auto', parallel_tool_calls: false,
          },
        },
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
  connection.changeLanguage = code => {
    live.send({
      type: 'session.instructions.append',
      content: `${malviLanguageInstruction(code, connection.provider)}${connection.isFirstTurn ? `\n${malviGreetingInstruction(code)}` : ''}`,
      delegation_id: null,
    });
  };
  connection.closeProvider = () => {
    clearTimeout(timeout);
    if (outputTimer) clearTimeout(outputTimer);
    live.close();
  };
}

function createConnection(socket: WebSocket, userId: string, sessionId: string, language: string, voiceOnly = false, speechProvider: MalviVoiceProvider = malviVoiceSetup().provider,
  memory: MemoryState = { enabled: false, generation: 0, messages: [], hasPrevious: false }): BrainConnection {
  const connection: BrainConnection = {
    socket,
    owner: userId,
    sessionId,
    provider: 'gemini',
    language,
    ready: false,
    changeLanguage: () => {},
    sendAudio: () => {},
    endAudio: () => {},
    closed: false,
    closeProvider: () => {},
    close: () => {
      if (connection.closed) return;
      saveMemoryTurn(connection);
      connection.closed = true;
      connection.outputGeneration++;
      connection.speech.close();
      connection.nativeVoice.cancel();
      if (connection.idleTimer) clearTimeout(connection.idleTimer);
      if (connection.hardTimer) clearTimeout(connection.hardTimer);
      connection.closeProvider();
      if (voiceOnly) void liveAvatarService.stop(userId, sessionId).catch(() => {});
    },
    lastActivityAt: 0,
    idleTimer: null,
    hardTimer: null,
    frameWindowStartedAt: 0,
    framesInWindow: 0,
    speech: createMalviSpeechQueue(),
    speechProvider,
    nativeVoice: new GeminiNativeVoice(),
    playbackUntil: 0,
    outputLanguage: null,
    transcript: '',
    openingSent: false,
    outputCharacters: 0,
    outputGeneration: 0,
    startedAt: Date.now(),
    isFirstTurn: true,
    memory, memoryUser: '', memoryAssistant: '', memoryTurn: 0, memoryWrites: Promise.resolve(),
    sendVision: () => { throw new AssistantError(409, 'VISION_NOT_READY', 'Start a connected Gemini conversation before sharing a view.'); },
    visionAt: 0,
    research: createConversationTools(userId,
      payload => send(socket, 'malvi:brain_sources', { sessionId, ...payload }),
      () => connection.closed,
    ),
  };
  const providerConfig = getLiveBrainProviderConfig();
  assertMalviVoiceLanguage(language, speechProvider);
  const speechConfig = malviVoiceSetup(process.env, speechProvider);
  if (!speechConfig.configured) throw new Error(`Malvi’s voice setup requires ${speechConfig.missing.join(', ')}.`);
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
  const ready = () => {
    if (connection.closed) return;
    connection.ready = true;
    send(socket, 'malvi:brain_ready', { sessionId, provider: connection.provider, language: connection.language,
      speechProvider, coverage: malviLanguageCoverage(connection.language, connection.provider) });
  };
  if (connection.provider === 'gemini') void connectGemini(socket, connection, ready, fail).catch(() => fail('Gemini Live could not connect.'));
  else void connectOpenAI(socket, connection, ready, fail).catch(() => fail('OpenAI GPT-Live could not connect.'));
  return connection;
}

function armIdleDeadline(connection: BrainConnection, deadline: number, expired: () => void) {
  if (connection.idleTimer) clearTimeout(connection.idleTimer);
  connection.idleTimer = setTimeout(() => {
    // An explicit interrupt can extend the shared deadline through HTTP.
    // Re-read it rather than closing an active conversation using a stale timer.
    void liveAvatarService.owned(connection.owner, connection.sessionId).then(record => {
      if (connection.closed) return;
      if (record.deadline > Date.now()) armIdleDeadline(connection, record.deadline, expired);
      else expired();
    }).catch(() => { if (!connection.closed) expired(); });
  }, Math.max(1, deadline - Date.now() + 50));
}

export const malviLiveBrainController = {
  async revokeMemory(userId: string) {
    const sessions = [...activeBySession.values()].filter(c => c.owner === userId && c.memory.enabled);
    const stopped = await Promise.allSettled(sessions.map(async connection => {
      send(connection.socket, 'malvi:brain_error', { sessionId: connection.sessionId,
        message: 'Saved memory was disabled or deleted. Start a new conversation without the previous context.' });
      await this.stopSession(userId, connection.sessionId);
      await liveAvatarService.stop(userId, connection.sessionId);
    }));
    return stopped.every(result => result.status === 'fulfilled');
  },
  async start(socket: WebSocket, userId: string, sessionId: string, requestedLanguage?: unknown) {
    try {
      const session = await liveAvatarService.owned(userId, sessionId);
      const language = getMalviLanguage(requestedLanguage ?? session.language ?? 'en');
      const existing = activeBySocket.get(socket)?.get(sessionId);
      if (existing) return;
      const current = activeBySession.get(sessionId);
      if (current) throw new Error('This live session already has an active brain connection.');
      let memory: MemoryState | undefined;
      try { memory = await readConversationMemory(userId); }
      catch {
        send(socket, 'malvi:brain_memory', { sessionId, status: 'unavailable', message: 'Saved account memory is unavailable. This session can continue without it.' });
      }
      // Memory lookup is asynchronous: recheck after it to prevent duplicate starts.
      if (activeBySession.has(sessionId)) return;
      const fresh = await liveAvatarService.owned(userId, sessionId);
      if (socket.readyState !== socket.OPEN || activeBySession.has(sessionId)) return;
      const connection = createConnection(socket, userId, sessionId, language.code, fresh.mode === 'VOICE_TEST', fresh.speechProvider, memory);
      if (!activeBySocket.has(socket)) activeBySocket.set(socket, new Map());
      activeBySocket.get(socket)!.set(sessionId, connection);
      activeBySession.set(sessionId, connection);
      connection.lastActivityAt = Date.now();
      armIdleDeadline(connection, session.deadline || Date.now() + IDLE_MS, () => {
        send(socket, 'malvi:brain_error', { sessionId, message: 'Malvi stopped after 60 seconds without input.' });
        void this.stopSession(userId, sessionId);
      });
      if (Number.isFinite(session.hardDeadline)) {
        connection.hardTimer = setTimeout(() => {
          send(socket, 'malvi:brain_error', { sessionId, message: 'Malvi reached the maximum session duration.' });
          void this.stopSession(userId, sessionId);
        }, Math.max(0, session.hardDeadline - Date.now()));
      }
    } catch (error) {
      send(socket, 'malvi:brain_error', {
        sessionId,
        message: error instanceof Error ? error.message : 'The live brain could not start.',
      });
    }
  },
  async shareVision(userId: string, sessionId: string, image: { data: string; mimeType: string }) {
    const connection = activeBySession.get(sessionId);
    if (!connection || connection.owner !== userId || connection.closed || !connection.ready) {
      throw new AssistantError(409, 'VISION_NOT_READY', 'Start a connected conversation before sharing a view.');
    }
    if (connection.provider !== 'gemini') throw new AssistantError(409, 'VISION_PROVIDER_UNSUPPORTED', 'Camera sharing currently requires the administrator-selected Gemini live brain.');
    if (Date.now() - connection.visionAt < 2000) throw new AssistantError(429, 'VISION_RATE_LIMIT', 'Wait two seconds before sharing another image.');
    connection.visionAt = Date.now();
    connection.memoryUser = (connection.memoryUser + '\nI explicitly shared one image for discussion. The image itself is not saved to conversation history.').slice(0,12000);
    connection.sendVision(image);
    await liveAvatarService.activity(userId, sessionId);
  },
  async language(socket: WebSocket, userId: string, sessionId: string, requestedLanguage: unknown) {
    try {
      const language = getMalviLanguage(requestedLanguage);
      const connection = activeBySocket.get(socket)?.get(sessionId);
      if (!connection || connection.owner !== userId || connection.closed || !connection.ready) {
        throw new Error('Start Malvi’s live conversation before changing its language.');
      }
      await liveAvatarService.owned(userId, sessionId);
      if (connection.closed) return;
      assertMalviVoiceLanguage(language.code, connection.speechProvider);
      // Updating a preference neither changes providers nor extends idle time.
      // Discard the old spoken turn before applying the new preference.
      connection.outputGeneration++;
      connection.speech.cancel();
      connection.nativeVoice.cancel();
      connection.playbackUntil = 0;
      send(socket, 'malvi:brain_interrupted', { sessionId });
      connection.transcript = '';
      connection.changeLanguage(language.code);
      connection.language = language.code;
      send(socket, 'malvi:brain_language', {
        sessionId, language: language.code, provider: connection.provider,
        coverage: malviLanguageCoverage(language.code, connection.provider),
      });
    } catch (error) {
      send(socket, 'malvi:brain_language_error', {
        sessionId,
        message: error instanceof Error ? error.message : 'The selected language could not be applied.',
      });
    }
  },
  inputReadiness(socket: WebSocket, userId: string, sessionId: string) {
    const connection = activeBySocket.get(socket)?.get(sessionId);
    if (!connection || connection.owner !== userId || connection.closed || !connection.ready) return null;
    return { provider: connection.provider, language: connection.language };
  },
  async audio(socket: WebSocket, userId: string, sessionId: string, encoded: unknown, current = () => true): Promise<boolean> {
    const connection = activeBySocket.get(socket)?.get(sessionId);
    if (!connection || connection.owner !== userId || connection.closed || !connection.ready || !current()) {
      send(socket, 'malvi:brain_error', { sessionId, message: 'The live brain session is not active for this account.' });
      return false;
    }
    if (typeof encoded !== 'string' || encoded.length > Math.ceil(MAX_INPUT_BYTES / 3) * 4 + 4) {
      send(socket, 'malvi:brain_error', { sessionId, message: 'The microphone audio frame exceeded the safe size limit.' });
      return false;
    }
    const now = Date.now();
    if (now - connection.frameWindowStartedAt >= 1000) {
      connection.frameWindowStartedAt = now;
      connection.framesInWindow = 0;
    }
    connection.framesInWindow += 1;
    if (connection.framesInWindow > 12) {
      send(socket, 'malvi:brain_error', { sessionId, message: 'The microphone is sending audio too quickly. Turn it off and try again.' });
      return false;
    }
    const pcm = base64Buffer(encoded);
    if (!pcm || pcm.length > MAX_INPUT_BYTES || pcm.length % 2 !== 0) {
      send(socket, 'malvi:brain_error', { sessionId, message: 'The microphone audio frame was invalid.' });
      return false;
    }
    if (hasSpeech(pcm) && (connection.speech.pending || connection.playbackUntil > now)) {
      connection.outputGeneration++;
      connection.speech.cancel();
      connection.playbackUntil = 0;
      send(socket, 'malvi:brain_interrupted', { sessionId });
    }
    if (hasSpeech(pcm) && Date.now() - connection.lastActivityAt > 1000) {
      try {
        const activity = await liveAvatarService.activity(userId, sessionId);
        send(socket, 'malvi:brain_activity', { sessionId, idleDeadline: activity.idleDeadline });
        connection.lastActivityAt = Date.now();
        armIdleDeadline(connection, activity.idleDeadline, () => {
          send(socket, 'malvi:brain_error', { sessionId, message: 'Malvi stopped after 60 seconds without input.' });
          void this.stopSession(userId, sessionId);
        });
      } catch {
        send(socket, 'malvi:brain_error', { sessionId, message: 'The live session timed out. End it and start a new conversation.' });
        await this.stopSession(userId, sessionId);
        return false;
      }
    }
    if (connection.closed || !current() || socket.readyState !== socket.OPEN) return false;
    connection.sendAudio(pcm.toString('base64'));
    return true;
  },
  endAudio(socket: WebSocket, userId: string, sessionId: string) {
    const connection = activeBySocket.get(socket)?.get(sessionId);
    if (connection?.owner === userId) connection.endAudio();
  },
  interrupt(socket: WebSocket, userId: string, sessionId: string) {
    const connection = activeBySocket.get(socket)?.get(sessionId);
    if (!connection || connection.owner !== userId || connection.closed) return;
    connection.outputGeneration++;
    connection.speech.cancel();
    connection.nativeVoice.cancel();
    connection.playbackUntil = 0;
    connection.transcript = '';
    // Discard the remainder of the interrupted response, not just its currently
    // buffered chunks. The next complete turn resets this marker.
    connection.outputLanguage = 'interrupted';
    send(socket, 'malvi:brain_interrupted', { sessionId });
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
