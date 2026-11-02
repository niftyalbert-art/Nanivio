// Explicit owner approval required. One real 4-second translation stream,
// broadcast to two isolated listeners. Uses an existing generated Malvi sample,
// never an uploaded customer recording. Does not call app auth/billing APIs.
import { spawnSync } from 'node:child_process';
import { PalabraLiveGateway } from '../src/server/palabraLiveStream';
import { BusinessTranslationAudience } from '../src/server/businessTranslationAudience';
import { randomUUID } from 'node:crypto';
const callId = `business:${randomUUID()}`, speakerId = 'generated-probe-speaker';
const pcm = spawnSync('ffmpeg', ['-v','error','-i','generated-artifacts/malvi-gemini-sulafat-sample.wav','-t','4','-f','s16le','-ac','1','-ar','16000','pipe:1'], { maxBuffer: 500000 }).stdout;
if (!pcm?.length) throw new Error('The existing generated speech sample could not be decoded.');
const counts = [0, 0], transcript = [0, 0];
let stopped = '', ready = false, firstAudio: number | null = null, gateway: PalabraLiveGateway;
const started = Date.now(), streamId = randomUUID();
const speaker = { send(event: string, payload: any) {
  if (event === 'langpretation:ready') ready = true;
  if (event === 'langpretation:stopped') stopped = payload.message || 'Stream stopped';
} };
const audience = new BusinessTranslationAudience(async () => ({ language: 'fr', endsAt: Date.now() + 30000 }), () => 42);
const listeners = counts.map((_, index) => ({ send(event: string, payload: any) {
  if (event === 'langpretation:remote_start') gateway.acknowledgeReceiver(callId, speakerId, streamId, `generated-listener-${index}`);
  if (event === 'langpretation:audio_out') {
    counts[index] += Buffer.from(payload.data, 'base64').length;
    firstAudio ??= Date.now() - started;
  }
  if (event === 'langpretation:transcript' && payload.translated && payload.language === 'fr') transcript[index] += payload.text.length;
} }));
gateway = new PalabraLiveGateway({ authorize: async () => {}, remote: (id, user, event, payload) => audience.remote(id, user, event, payload) });
try {
  for (let i = 0; i < listeners.length; i++) await audience.subscribe(listeners[i], `generated-listener-${i}`, callId);
  await gateway.start(speaker, speakerId, { callId, streamId, sourceLang: 'en', targetLang: 'fr', voiceConsent: true });
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
  for (let n = 0; n < 130 && !ready && !stopped; n++) await delay(100);
  if (!ready) throw new Error(stopped || 'Translation did not become ready.');
  let sequence = 0;
  for (let offset = 0; offset < pcm.length + 32000; offset += 10240) {
    const packet = Buffer.alloc(10240);
    if (offset < pcm.length) pcm.copy(packet, 0, offset, Math.min(offset + 10240, pcm.length));
    gateway.audio(speaker, { streamId, sequence: sequence++, data: packet.toString('base64') });
    await delay(320);
  }
  for (let n = 0; n < 100 && (!counts.every(Boolean) || !transcript.every(Boolean)) && !stopped; n++) await delay(100);
  console.log(JSON.stringify({ provider: 'Palabra', actualNetwork: true, success: counts.every(Boolean) && transcript.every(Boolean),
    speakerStreams: 1, receivingListeners: 2, audioBytesPerListener: counts, frenchTranscriptCharacters: transcript, firstAudioMs: firstAudio,
    source: 'existing generated Malvi voice sample', productionMembershipTested: false, auditoryQualityVerified: false, error: stopped || undefined }));
} finally {
  gateway.stop(speaker); listeners.forEach(p => audience.remove(p));
}
