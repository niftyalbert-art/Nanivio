import { MAX_SPEECH_BYTES, MAX_SPEECH_TEXT } from './malviSpeech.ts';
import { MalviGeminiEffectStream, MALVI_GEMINI_TAIL_SAMPLES } from './geminiVoiceEffects.ts';

/** One bounded native turn. No synthesis request, voice clone, or provider retry. */
export class GeminiNativeVoice {
  private chunks: Buffer[] = [];
  private bytes = 0;
  private characters = 0;
  private turns = 0;
  private sessionBytes = 0;
  private turnBytes = 0;
  private turnCharacters = 0;
  private emitted = false;
  private effects = new MalviGeminiEffectStream();

  append(encoded: string, mime: string) {
    if (!/^audio\/pcm;rate=24000$/i.test(mime)
      || encoded.length > MAX_SPEECH_BYTES * 1.34
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
      throw new Error('Gemini returned an unsupported voice audio format.');
    }
    const pcm = Buffer.from(encoded, 'base64');
    if (!pcm.length || pcm.length % 2) throw new Error('Gemini returned invalid PCM voice audio.');
    if (this.turnBytes + pcm.length > MAX_SPEECH_BYTES || this.sessionBytes + pcm.length > 14_400_000) {
      throw new Error('Malvi reached the native voice audio safety limit.');
    }
    this.bytes += pcm.length;
    this.turnBytes += pcm.length;
    this.sessionBytes += pcm.length;
    this.chunks.push(pcm);
  }

  /** 400 ms plus the retained 20 ms tail. Still use paired avatar A/V playback. */
  ready(text: string) { return this.bytes >= 20_160 && Boolean(text.trim()); }

  finish(text: string, final = true) {
    if (final && !this.bytes && !text.trim() && this.emitted) {
      // No remaining speech. Tail was not sent separately as a silent utterance.
      this.cancel();
      return null;
    }
    if (!this.bytes && !text.trim()) return null; // Duplicate completion.
    if (!this.bytes || (!text.trim() && !this.emitted)) throw new Error('Gemini did not provide both voice audio and its transcript.');
    if (this.turnCharacters + text.length > MAX_SPEECH_TEXT || this.characters + text.length > 6000 || (!this.emitted && this.turns >= 30)) {
      throw new Error('Malvi reached this session’s native speech usage limit.');
    }
    if (final && this.sessionBytes + MALVI_GEMINI_TAIL_SAMPLES * 2 > 14_400_000) {
      throw new Error('Malvi reached the native voice audio safety limit.');
    }
    const joined = Buffer.concat(this.chunks, this.bytes);
    // Retain 20 ms for the final packet, including late transcription and the
    // once-only reflection tail. Do not emit a separate silent utterance.
    const cut = final ? joined.length : joined.length - 960;
    if (cut <= 0) return null;
    const styled = this.effects.process(joined.subarray(0, cut), final);
    if (final) this.sessionBytes += MALVI_GEMINI_TAIL_SAMPLES * 2;
    this.characters += text.length;
    this.turnCharacters += text.length;
    if (!this.emitted) this.turns++;
    this.emitted = true;
    this.chunks = final ? [] : [joined.subarray(cut)];
    this.bytes = final ? 0 : joined.length - cut;
    if (final) this.cancel();
    return { pcm24k: styled.pcm.toString('base64'), durationMs: styled.durationMs,
      speechDurationMs: styled.speechDurationMs, text, captionTiming: 'estimated' as const };
  }

  cancel() {
    this.chunks = []; this.bytes = 0; this.turnBytes = 0; this.turnCharacters = 0; this.emitted = false;
    this.effects = new MalviGeminiEffectStream();
  }
}
