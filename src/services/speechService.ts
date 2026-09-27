/**
 * Nanivio Speech-to-Text (STT) and Text-to-Speech (TTS) Service
 * Real-time microphone capture, speech recognition, audio visualizer levels, and vocalization.
 */

export interface SpeechRecognitionResultPayload {
  transcript: string;
  isFinal: boolean;
  confidence: number;
}

export type SpeechCallback = (payload: SpeechRecognitionResultPayload) => void;
export type AudioLevelCallback = (level: number) => void;

class SpeechService {
  private recognition: any = null;
  private isListening = false;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private isSynthesizing = false;

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  }

  public isTTSSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return 'speechSynthesis' in window;
  }

  /**
   * Start listening to the microphone with SpeechRecognition
   */
  public async startListening(
    langCode: string,
    onResult: SpeechCallback,
    onError?: (err: any) => void
  ): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      onError?.(new Error('SpeechRecognition is not supported in this browser.'));
      return false;
    }

    try {
      if (this.recognition) {
        this.stopListening();
      }

      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.mapLangToLocale(langCode);

      this.recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          const transcript = res[0].transcript;
          const isFinal = res.isFinal;
          const confidence = res[0].confidence;
          onResult({ transcript, isFinal, confidence });
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.warn('Speech recognition error:', event.error);
          onError?.(event);
        }
      };

      this.recognition.onend = () => {
        // Auto-restart if still flagged as listening
        if (this.isListening) {
          try {
            this.recognition.start();
          } catch (_) {}
        }
      };

      this.isListening = true;
      this.recognition.start();
      return true;
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      onError?.(err);
      this.isListening = false;
      return false;
    }
  }

  public stopListening() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_) {}
      this.recognition = null;
    }
  }

  /**
   * Start real audio analyser stream for waveform bars
   */
  public async startAudioVisualizer(onLevel: AudioLevelCallback): Promise<boolean> {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        onLevel(normalized);

        this.animFrameId = requestAnimationFrame(checkVolume);
      };

      checkVolume();
      return true;
    } catch (err) {
      console.warn('Could not access microphone for visualizer:', err);
      return false;
    }
  }

  public stopAudioVisualizer() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (_) {}
      this.audioContext = null;
    }
    this.analyser = null;
  }

  /**
   * Vocalize text using SpeechSynthesis (TTS)
   */
  public speak(
    text: string,
    langCode: string,
    options?: { pitch?: number; rate?: number; volume?: number; onEnd?: () => void }
  ) {
    if (!this.isTTSSupported() || !text.trim()) return;

    try {
      window.speechSynthesis.cancel(); // Stop any pending speech

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options?.rate ?? 1.0;
      utterance.pitch = options?.pitch ?? 1.0;
      utterance.volume = options?.volume ?? 1.0;

      const targetLocale = this.mapLangToLocale(langCode);
      utterance.lang = targetLocale;

      // Find matching voice
      const voices = window.speechSynthesis.getVoices();
      const matchVoice = voices.find(
        (v) =>
          v.lang.toLowerCase() === targetLocale.toLowerCase() ||
          v.lang.toLowerCase().startsWith(langCode.toLowerCase())
      );
      if (matchVoice) {
        utterance.voice = matchVoice;
      }

      utterance.onend = () => {
        this.isSynthesizing = false;
        options?.onEnd?.();
      };
      utterance.onerror = () => {
        this.isSynthesizing = false;
        options?.onEnd?.();
      };

      this.isSynthesizing = true;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis failed:', e);
    }
  }

  public stopSpeaking() {
    if (this.isTTSSupported()) {
      window.speechSynthesis.cancel();
      this.isSynthesizing = false;
    }
  }

  private mapLangToLocale(code: string): string {
    const map: Record<string, string> = {
      en: 'en-US',
      ak: 'en-GH', // Akan/Twi fallback to Ghanaian locale
      tw: 'en-GH',
      fr: 'fr-FR',
      es: 'es-ES',
      sw: 'sw-KE',
      yo: 'en-NG', // Yoruba fallback to Nigerian English
      ha: 'ha-NG',
      zu: 'zu-ZA',
      ar: 'ar-SA',
      de: 'de-DE',
      pt: 'pt-BR',
      zh: 'zh-CN',
      hi: 'hi-IN',
      ja: 'ja-JP',
      it: 'it-IT',
      lg: 'en-UG', // Luganda fallback
      am: 'am-ET',
    };
    return map[code.toLowerCase()] || 'en-US';
  }
}

export const speechService = new SpeechService();
