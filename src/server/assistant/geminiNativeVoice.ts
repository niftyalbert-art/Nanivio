import { MAX_SPEECH_BYTES, MAX_SPEECH_TEXT } from './malviSpeech.ts';

/** One bounded native turn. No synthesis request, voice clone, or provider retry. */
export class GeminiNativeVoice {
  private chunks: Buffer[] = [];
  private bytes = 0;
  private characters = 0;
  private turns = 0;
  private sessionBytes = 0;

  append(encoded: string, mime: string) {
    if (!/^audio\/pcm;rate=24000$/i.test(mime)
      || encoded.length > MAX_SPEECH_BYTES * 1.34
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
      throw new Error('Gemini returned an unsupported voice audio format.');
    }
    const pcm = Buffer.from(encoded, 'base64');
    if (!pcm.length || pcm.length % 2) throw new Error('Gemini returned invalid PCM voice audio.');
    if (this.bytes + pcm.length > MAX_SPEECH_BYTES || this.sessionBytes + pcm.length > 14_400_000) {
      throw new Error('Malvi reached the native voice audio safety limit.');
    }
    this.bytes += pcm.length;
    this.sessionBytes += pcm.length;
    this.chunks.push(pcm);
  }

  finish(text: string) {
    if (!this.bytes && !text.trim()) return null; // Duplicate completion.
    if (!this.bytes || !text.trim()) throw new Error('Gemini did not provide both voice audio and its transcript.');
    if (text.length > MAX_SPEECH_TEXT || this.characters + text.length > 6000 || this.turns >= 30) {
      throw new Error('Malvi reached this session’s native speech usage limit.');
    }
    this.characters += text.length;
    this.turns++;
    const pcm = Buffer.concat(this.chunks, this.bytes);
    this.cancel();
    return { pcm24k: pcm.toString('base64'), durationMs: pcm.length / 48, text, captionTiming: 'estimated' as const };
  }

  cancel() { this.chunks = []; this.bytes = 0; }
}
