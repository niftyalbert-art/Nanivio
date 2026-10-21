import { GoogleGenAI, Modality, type Session } from '@google/genai';
import { getLiveBrainProviderConfig } from '../src/server/assistant/brainProviderConfig.ts';

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
const finish = (success: boolean, reason: string) => {
  if (finished) return;
  finished = true;
  try { session?.close(); } catch {}
  console.log(JSON.stringify({ success, reason, provider: 'gemini', model: config.providers.gemini.model,
    audioBytes: bytes, avatarSessionStarted: false, microphoneUsed: false, redisConnectionVerified: false }));
  clearTimeout(timer);
  // Bound lifetime even if a failed SDK handshake leaves a socket alive.
  setTimeout(() => process.exit(success ? 0 : 1), 250);
};
const timer = setTimeout(() => finish(false, 'No complete audio response within 20 seconds.'), 20_000);
try {
  session = await new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }).live.connect({
    model: config.providers.gemini.model,
    config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
    callbacks: {
      onmessage(message) {
        for (const part of message.serverContent?.modelTurn?.parts || []) {
          if (part.inlineData?.mimeType?.startsWith('audio/pcm') && part.inlineData.data) {
            bytes += Buffer.from(part.inlineData.data, 'base64').length;
          }
        }
        if (message.serverContent?.turnComplete) finish(bytes > 0, bytes ? 'Live PCM voice output received.' : 'Turn completed without PCM voice output.');
      },
      onerror() { finish(false, 'Gemini Live reported a connection or configuration error.'); },
      onclose() { if (!finished) finish(false, 'Gemini Live closed before the voice test completed.'); },
    },
  });
  if (finished) session.close();
  else session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'Say only: Hello, I am Malvi, an AI assistant.' }] }], turnComplete: true });
} catch { finish(false, 'Gemini Live could not connect. No raw provider error or credential was logged.'); }
