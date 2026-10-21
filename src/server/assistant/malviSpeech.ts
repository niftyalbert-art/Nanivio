import { ReplitConnectors } from '@replit/connectors-sdk';
import { getMalviLanguage } from '../../lib/malviLanguages.ts';
import { malviSpeechFailure } from './malviSpeechErrors.ts';
import { validMalviAlignment, type MalviAlignment } from '../../lib/malviSpeechTiming.ts';

export type MalviSpeechBuffer = Buffer & { alignment?: MalviAlignment };

type Env = Record<string, string | undefined>;
export const MALVI_VOICE_ID = 'kW71iH6myeMHEvxKthQ6';
export const MALVI_SPEECH_MODEL = 'eleven_multilingual_v2';
export const MAX_SPEECH_TEXT = 1200;
export const MAX_SPEECH_BYTES = 3_000_000;
// Advertised coverage, not a claim of tested pronunciation. Preserve dialect IDs.
// https://elevenlabs.io/docs/overview/models#multilingual-v2
const LANGUAGES = new Set('en ja zh de hi fr ko pt it es id nl tr fil pl sv bg ro ar cs el fi hr ms sk da ta uk ru'.split(' '));

export function malviSpeechSetup(env: Env = process.env) {
  const transport = env.MALVI_TTS_TRANSPORT || (env.ELEVENLABS_API_KEY ? 'direct' : env.REPL_ID ? 'connector' : 'direct');
  const voiceId = env.ELEVENLABS_VOICE_ID?.trim() || MALVI_VOICE_ID;
  const missing: string[] = [];
  if (!['direct', 'connector'].includes(transport)) missing.push('MALVI_TTS_TRANSPORT must be direct or connector');
  if (transport === 'direct' && !env.ELEVENLABS_API_KEY) missing.push('ELEVENLABS_API_KEY');
  if (transport === 'connector' && !env.REPL_ID) missing.push('ElevenLabs connector requires a Replit runtime; use direct on Render');
  if (!/^[a-zA-Z0-9]{20}$/.test(voiceId)) missing.push('ELEVENLABS_VOICE_ID must be a valid voice ID');
  return { configured: missing.length === 0, missing, provider: 'elevenlabs' as const,
    transport, voiceId, model: MALVI_SPEECH_MODEL, supportedLanguages: [...LANGUAGES], liveVerified: false };
}

export function assertMalviSpeechLanguage(code: string) {
  const language = getMalviLanguage(code);
  if (!LANGUAGES.has(code)) {
    throw new Error(`${language.name} is not supported by Malvi’s configured ElevenLabs speech model. Choose a supported language; no English or alternate voice was substituted.`);
  }
  return language;
}

async function connectorSpeech(path: string, init: RequestInit) {
  // Fresh identity per request. Unlike proxy(), createProxyFetch preserves the
  // abort signal. Never retry a billable request through a different transport.
  return new ReplitConnectors().createProxyFetch('elevenlabs')(path, init);
}

export function createMalviSpeechSynthesizer(
  env: () => Env = () => process.env,
  fetcher: typeof fetch = fetch,
  proxy: (path: string, init: RequestInit) => Promise<Response> = connectorSpeech,
  withTiming = false,
) {
  return async (text: string, language: string, signal: AbortSignal): Promise<MalviSpeechBuffer> => {
    const current = env();
    const config = malviSpeechSetup(current);
    if (!config.configured) throw new Error(`Malvi’s voice setup requires ${config.missing.join(', ')}.`);
    assertMalviSpeechLanguage(language);
    if (!text.trim() || text.length > MAX_SPEECH_TEXT) throw new Error('Malvi’s spoken response exceeded the text safety limit.');
    signal.throwIfAborted();
    const path = `/v1/text-to-speech/${config.voiceId}${withTiming ? '/with-timestamps' : ''}?output_format=pcm_24000`;
    const init: RequestInit = {
      method: 'POST', redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      headers: { 'Content-Type': 'application/json', Accept: withTiming ? 'application/json' : 'audio/pcm',
        ...(config.transport === 'direct' ? { 'xi-api-key': current.ELEVENLABS_API_KEY! } : {}) },
      body: JSON.stringify({
        text, model_id: config.model,
        // multilingual_v2 does not accept language_code. The brain supplies text
        // in the requested language, restricted to the model's actual catalogue.
        voice_settings: { stability: 0.5, similarity_boost: 0.75, use_speaker_boost: true, speed: 1 },
      }),
    };
    let response: Response;
    try {
      response = config.transport === 'direct'
        ? await fetcher(`https://api.elevenlabs.io${path}`, init)
        : await proxy(path, init);
    } catch {
      signal.throwIfAborted();
      throw new Error('Malvi’s ElevenLabs voice request timed out or could not connect. No alternate voice was used.');
    }
    if (!response.ok) {
      const message = await malviSpeechFailure(response);
      signal.throwIfAborted();
      throw new Error(message);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!(withTiming ? /^application\/json(;|$)/i : /^(audio\/(pcm|x-pcm|raw)|application\/octet-stream)(;|$)/i).test(contentType)) {
      await response.body?.cancel().catch(() => {});
      throw new Error('Malvi’s speech provider did not return raw PCM audio.');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Malvi’s speech provider returned no audio.');
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        signal.throwIfAborted();
        bytes += result.value.length;
        if (bytes > (withTiming ? MAX_SPEECH_BYTES * 1.5 : MAX_SPEECH_BYTES)) throw new Error('Malvi’s spoken response exceeded the playback safety limit.');
        chunks.push(Buffer.from(result.value));
      }
      signal.throwIfAborted();
      let audio: MalviSpeechBuffer = Buffer.concat(chunks, bytes);
      if (withTiming) {
        const result = JSON.parse(audio.toString('utf8'));
        if (typeof result.audio_base64 !== 'string' || result.audio_base64.length > MAX_SPEECH_BYTES * 1.34
          || !/^[A-Za-z0-9+/]*={0,2}$/.test(result.audio_base64)) {
          throw new Error('Malvi’s speech provider returned invalid PCM audio.');
        }
        audio = Buffer.from(result.audio_base64, 'base64');
        const alignment = result.normalized_alignment || result.alignment;
        if (!validMalviAlignment(alignment, audio.length / 48)) {
          throw new Error('Malvi’s speech provider returned no usable subtitle timestamps.');
        }
        audio.alignment = alignment;
      }
      if (!audio.length || audio.length > MAX_SPEECH_BYTES || audio.length % 2 || ['RIFF', 'OggS'].includes(audio.subarray(0, 4).toString()) || audio.subarray(0, 3).toString() === 'ID3') {
        throw new Error('Malvi’s speech provider returned invalid PCM audio.');
      }
      return audio;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof Error && error.message.startsWith('Malvi’s ')) throw error;
      throw new Error('Malvi’s ElevenLabs audio stream stopped before the response was complete.');
    } finally {
      await reader.cancel().catch(() => {});
    }
  };
}

export const synthesizeMalviSpeech = createMalviSpeechSynthesizer();
// Same voice/model and one TTS request, now including provider timing metadata.
export const synthesizeTimedMalviSpeech = createMalviSpeechSynthesizer(undefined, undefined, undefined, true);

/** One text segment → one request. Interrupted requests are not retried. */
export function createMalviSpeechQueue(
  synthesize = synthesizeTimedMalviSpeech,
  limits = { characters: 6000, turns: 30 },
) {
  let generation = 0;
  let active: AbortController | null = null;
  let closed = false;
  let characters = 0;
  let turns = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const waiting = new Set<symbol>();
  return {
    get pending() { return waiting.size > 0; },
    cancel() { generation++; active?.abort(); active = null; waiting.clear(); tail = Promise.resolve(); },
    close() { closed = true; this.cancel(); },
    async speak(text: string, language: string): Promise<MalviSpeechBuffer | null> {
      if (closed) return null;
      assertMalviSpeechLanguage(language);
      if (!text.trim() || text.length > MAX_SPEECH_TEXT) throw new Error('Malvi’s spoken response is empty or exceeds the text safety limit.');
      if (waiting.size >= 3) throw new Error('Malvi’s voice response queue reached its safety limit.');
      const token = generation;
      const id = Symbol();
      waiting.add(id);
      const work = tail.then(async () => {
        if (closed || token !== generation) return null;
        if (characters + text.length > limits.characters || turns >= limits.turns) {
          closed = true;
          throw new Error('Malvi reached this session’s speech usage limit. End the session before starting another.');
        }
        characters += text.length;
        turns++;
        const request = new AbortController();
        active = request;
        try {
          const audio = await synthesize(text, language, request.signal);
          return !closed && token === generation ? audio : null;
        } catch (error) {
          if (closed || token !== generation) return null;
          // Stop queued work immediately, before controller error handling runs.
          // A rejected request must not be followed by more billable segments.
          closed = true;
          generation++;
          waiting.clear();
          throw error;
        } finally {
          if (active === request) active = null;
        }
      });
      tail = work.catch(() => {});
      return work.finally(() => waiting.delete(id));
    },
  };
}
