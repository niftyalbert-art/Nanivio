import { GoogleGenAI, Modality, type Session } from '@google/genai';
import { getLiveBrainProviderConfig } from '../src/server/assistant/brainProviderConfig.ts';
import { MALVI_GEMINI_VOICE, malviGeminiVoiceDirection } from '../src/server/assistant/geminiVoiceStyle.ts';
import { GeminiNativeVoice } from '../src/server/assistant/geminiNativeVoice.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
const arabicSwitch = process.argv.includes('--arabic-switch');
const samples: { language: string; transcript: string; chunks: Buffer[] }[] = [
  { language: 'en', transcript: '', chunks: [] },
  ...(arabicSwitch ? [{ language: 'ar', transcript: '', chunks: [] as Buffer[] }] : []),
];
let turn = 0;
const outputDirectory = resolve('generated-artifacts/malvi-voice-signature');
function writeWave(name: string, pcm: Buffer) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  writeFileSync(resolve(outputDirectory, name), Buffer.concat([header, pcm]));
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
    if (arabicSwitch) samples[turn].chunks.push(Buffer.from(packet.pcm24k, 'base64'));
    emittedPackets++;
    if (!packet.text.trim()) continuationPackets++;
  }
};
const finish = (success: boolean, reason: string) => {
  if (finished) return;
  finished = true;
  try { session?.close(); } catch {}
  const report = { success, reason, provider: 'gemini', model: config.providers.gemini.model,
    audioBytes: bytes, emittedPackets, continuationPackets, firstAudioMs, maximumAudioGapMs,
    configuredVoice: MALVI_GEMINI_VOICE, providerConnections: 1,
    perceivedVoiceIdentityVerified: false,
    avatarSessionStarted: false, microphoneUsed: false, redisConnectionVerified: false,
    ...(arabicSwitch ? { samples: samples.map(sample => ({
      language: sample.language, transcript: sample.transcript,
      audioBytes: sample.chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    })), boundary: 'Direct provider test with text-driven language switching; not a signed-in Render conversation.' } : {}),
  };
  if (arabicSwitch) {
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(resolve(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
    if (success) {
      writeWave('english.wav', Buffer.concat(samples[0].chunks));
      writeWave('arabic.wav', Buffer.concat(samples[1].chunks));
      writeWave('comparison.wav', Buffer.concat([...samples[0].chunks, Buffer.alloc(24000), ...samples[1].chunks]));
    }
  }
  console.log(JSON.stringify(report));
  clearTimeout(timer);
  // Bound lifetime even if a failed SDK handshake leaves a socket alive.
  setTimeout(() => process.exit(success ? 0 : 1), 250);
};
const limitMs = arabicSwitch ? 30_000 : 20_000;
const timer = setTimeout(() => finish(false, 'The bounded voice check timed out.'), limitMs);
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
               if (bytes > 2_000_000) { finish(false, 'The short voice check reached its audio safety limit.'); return; }
              native.append(part.inlineData.data,part.inlineData.mimeType);
            }
          }
           const text = message.serverContent?.outputTranscription?.text || '';
           transcript += text;
           samples[turn].transcript += text;
          if (native.ready(transcript)) emit(false);
          if (message.serverContent?.turnComplete) {
            emit(true);
             if (arabicSwitch) {
               if (!samples[turn].chunks.length) { finish(false, 'The selected language returned no playable PCM.'); return; }
               if (turn === 0) {
                 turn = 1;
                 lastArrival = 0;
                 session!.sendClientContent({ turns: [{ role: 'user', parts: [{ text:
                   `${malviGeminiVoiceDirection('ar')}\nSwitch to Arabic without changing your voice. Say only: مرحباً، أنا مالفي، رفيقتك في نانيفيو. كيف يمكنني مساعدتك؟` }] }], turnComplete: true });
                 return;
               }
               if (!/[\u0600-\u06ff]/u.test(samples[1].transcript)) {
                 finish(false, 'Audio arrived but an Arabic transcript was not confirmed.'); return;
               }
             }
            finish(bytes>0 && emittedPackets>0,bytes?'Approved live voice streamed through the application PCM processor.':'Turn completed without PCM voice output.');
          }
        } catch { finish(false,'The application voice processor rejected the response. No raw audio or credentials were logged.'); }
      },
      onerror() { finish(false, 'Gemini Live reported a connection or configuration error.'); },
      onclose() { if (!finished) finish(false, 'Gemini Live closed before the voice test completed.'); },
    },
  });
  if (finished) session.close();
   else session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: arabicSwitch
     ? 'Speak in English. Say only: Hello, I am Malvi, your companion at Nanivio. How can I help you?'
     : 'Say just one short sentence: I am ready to continue our conversation and help you explore Nanivio, one clear step at a time.' }] }], turnComplete: true });
} catch { finish(false, 'Gemini Live could not connect. No raw provider error or credential was logged.'); }
