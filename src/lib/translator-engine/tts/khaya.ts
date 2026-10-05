import { ITtsProvider } from './interface';
import { TtsResult } from '../types';

export class KhayaTtsProvider implements ITtsProvider {
  public id = 'khaya-tts';
  public name = 'Khaya AI TTS';
  public supportedLanguages = ['ak', 'tw-ak', 'fat', 'ee', 'gaa'];

  public canSynthesize(language: string): boolean {
    return this.supportedLanguages.includes(language);
  }

  public async synthesize(text: string, language: string): Promise<TtsResult> {
    const start = Date.now();
    const response = await fetch('/api/langpretation/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language }),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Khaya TTS failed (${response.status}): ${message}`);
    }
    const data = await response.json();
    if (!data?.audioBase64) throw new Error('Khaya TTS returned no real audio.');

    const binary = atob(data.audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const audioBuffer = bytes.buffer;

    return {
      audioBuffer,
      durationMs: Math.max(1, Math.round((text.trim().split(/\s+/).length * 350))),
      provider: data.provider || 'khaya-tts',
      latencyMs: Date.now() - start,
    };
  }

  public async speakInBrowser(text: string, language: string): Promise<void> {
    const result = await this.synthesize(text, language);
    const blob = new Blob([result.audioBuffer as ArrayBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    try {
      const audio = new Audio(url);
      await audio.play();
      await new Promise<void>((resolve, reject) => { audio.onended = () => resolve(); audio.onerror = () => reject(new Error('Khaya audio playback failed')); });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
