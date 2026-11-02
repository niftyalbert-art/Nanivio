import { GoogleGenAI, Modality, type Session } from '@google/genai';
import { getLiveBrainProviderConfig } from '../src/server/assistant/brainProviderConfig.ts';
import { MALVI_GEMINI_VOICE, malviGeminiVoiceDirection } from '../src/server/assistant/geminiVoiceStyle.ts';
import { GeminiNativeVoice } from '../src/server/assistant/geminiNativeVoice.ts';

// Explicit opt-in: this makes ONE short, potentially billable Gemini Live
// connection, without microphone, Redis writes, personal data, or an avatar.
if (!process.argv.includes('--confirm-billable')) {
  console.log('Not started. Pass --confirm-billable to run one short Gemini Live voice-output check.');
  process.exit(1);
}
const config = getLiveBrainProviderConfig();
if (config.selectedProvider !== 'gemini' || !config.configured) {
  console.log(JSON.stringify({ success: false, reason: 'Selected Gemini provider is not configured.' }));
  process.exit(1);
}
let session: Session | undefined;
let finished = false;
let bytes = 0;
let transcript = '';
let emittedPackets = 0;
let continuationPackets = 0;
let firstAudioMs: number | null = null;
let lastArrival = 0;
let maximumAudioGapMs = 0;
const started = Date.now();
const native = new GeminiNativeVoice();
const emit = (final: boolean) => {
  const packet = native.finish(transcript,final);
  transcript = '';
  if (packet) {
    emittedPackets++;
    if (!packet.text.trim()) continuationPackets++;
  }
};
const finish = (success: boolean, reason: string) => {
  if (finished) return;
  finished = true;
  try { session?.close(); } catch {}
  console.log(JSON.stringify({ success, reason, provider: 'gemini', model: config.providers.gemini.model,
    audioBytes: bytes, emittedPackets, continuationPackets, firstAudioMs, maximumAudioGapMs,
    approvedVoice: true, avatarSessionStarted: false, microphoneUsed: false, redisConnectionVerified: false }));
  clearTimeout(timer);
  // Bound lifetime even if a failed SDK handshake leaves a socket alive.
  setTimeout(() => process.exit(success ? 0 : 1), 250);
};
const timer = setTimeout(() => finish(false, 'No complete audio response within 20 seconds.'), 20_000);
try {
  session = await new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }).live.connect({
    model: config.providers.gemini.model,
    config: {
      responseModalities: [Modality.AUDIO], outputAudioTranscription: {},
      systemInstruction: malviGeminiVoiceDirection('en'),
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: MALVI_GEMINI_VOICE } } },
    },
    callbacks: {
      onmessage(message) {
        try {
          for (const part of message.serverContent?.modelTurn?.parts || []) {
            if (part.inlineData?.mimeType?.startsWith('audio/pcm') && part.inlineData.data) {
              const now=Date.now();
              if (firstAudioMs===null) firstAudioMs=now-started;
              if (lastArrival) maximumAudioGapMs=Math.max(maximumAudioGapMs,now-lastArrival);
              lastArrival=now;
              bytes += Buffer.from(part.inlineData.data, 'base64').length;
              native.append(part.inlineData.data,part.inlineData.mimeType);
            }
          }
          transcript += message.serverContent?.outputTranscription?.text || '';
          if (native.ready(transcript)) emit(false);
          if (message.serverContent?.turnComplete) {
            emit(true);
            finish(bytes>0 && emittedPackets>0,bytes?'Approved live voice streamed through the application PCM processor.':'Turn completed without PCM voice output.');
          }
        } catch { finish(false,'The application voice processor rejected the response. No raw audio or credentials were logged.'); }
      },
      onerror() { finish(false, 'Gemini Live reported a connection or configuration error.'); },
      onclose() { if (!finished) finish(false, 'Gemini Live closed before the voice test completed.'); },
    },
  });
  if (finished) session.close();
  else session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'Say just one short sentence: I am ready to continue our conversation and help you explore Nanivio, one clear step at a time.' }] }], turnComplete: true });
} catch { finish(false, 'Gemini Live could not connect. No raw provider error or credential was logged.'); }
