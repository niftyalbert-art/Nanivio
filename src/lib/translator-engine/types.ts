export type SupportedLangCode = string;

export interface AudioSegment {
  id: string;
  pcmData: Float32Array;
  sampleRate: number;
  durationMs: number;
  timestamp: number;
  isFinal: boolean;
}

export interface AsrResult {
  text: string;
  language: string;
  confidence: number | null;
  isFinal: boolean;
  latencyMs: number;
}

export interface MtResult {
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  provider: string;
  providerChain?: string[];
  latencyMs: number;
  cached?: boolean;
  confidence?: number;
  pivotUsed?: boolean;
}

export interface TtsResult {
  audioBuffer?: ArrayBuffer | AudioBuffer;
  audioUrl?: string;
  durationMs: number | null;
  provider: string;
  latencyMs: number;
}

export interface LangpretationTurn {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerLang: string;
  receiverLang: string;
  originalText?: string;
  translatedText: string; // ONLY in receiver's language
  asrLatencyMs: number | null;
  mtLatencyMs: number;
  ttsLatencyMs: number | null;
  totalLatencyMs: number;
  latencyGrade: 'ideal' | 'acceptable' | 'warning' | 'poor';
  provider: string;
  timestamp: number;
}

export interface ProviderCapability {
  id: string;
  name: string;
  type: 'asr' | 'mt' | 'tts' | 'full-duplex';
  supportedPairs: Array<{ from: string; to: string }>;
  averageLatencyMs: number | null;
  isRealtime: boolean;
  isAfricanLanguageSpecialist?: boolean;
  status: 'online' | 'degraded' | 'offline' | 'not-verified';
}

export interface EngineTelemetry {
  totalTurnsProcessed: number;
  averageLatencyMs: number;
  idealPercentage: number;
  activeProviderRoutes: Record<string, string>;
  cacheHitRatio: number;
  lastRecordedTurn?: LangpretationTurn;
}
