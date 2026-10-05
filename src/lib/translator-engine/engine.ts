import { LanguageRouter, RouteDecision, Language18MatrixItem, LangpretationMode, CompleteRoutePlan } from './routing/language-router';
import { PivotRouter } from './routing/pivot-router';
import { TranslationCache } from './cache/translation-cache';
import { LatencyMetricsTracker, QualityMetricsReport } from './metrics/latency';
import { ProviderRegistry } from './providers/registry';
import { AzureMtProvider } from './mt/azure';
import { LangpretationCallSession, CallParticipantMeta } from './session';
import { MtResult, LangpretationTurn, EngineTelemetry, AudioSegment, AsrResult, TtsResult } from './types';
import { LanguageDetector, LanguageDetectionResult } from './detection/language-detector';
import { AsrSubsystem } from './asr/subsystem';
import { TtsSubsystem } from './tts/subsystem';
import { VoiceActivityDetector } from './audio/vad';
import { AudioSegmenter } from './audio/segmentation';

/**
 * Nanivio Central Translator Engine
 * 
 * Unified Realtime Speech-to-Speech Translation Engine containing:
 * ├── ASR (Streaming & Chunked Speech Recognition)
 * ├── Language Detection (18-Language Heuristic & Orthographic Detector)
 * ├── Translation (Neural MT Orchestration)
 * ├── TTS (High-Naturalness Neural Speech Synthesis)
 * ├── VAD (Low-Latency Energy & Flux Voice Activity Detector)
 * ├── Audio Segmentation (Realtime PCM Window Slicing)
 * ├── Provider Routing (Specialized African & Global Matrix)
 * ├── Provider Fallback (Multi-tier resilient fallback execution)
 * ├── Translation Cache (High-Speed Memory & LRU Hit Store)
 * └── Latency / Quality Metrics (Sub-1.5s Tracking, P95/P99, BLEU Estimator)
 */
export class NanivioTranslatorEngine {
  private static instance: NanivioTranslatorEngine;

  // 1. Core Subsystems
  public readonly asr: AsrSubsystem = new AsrSubsystem();
  public readonly languageDetector: LanguageDetector = new LanguageDetector();
  public readonly tts: TtsSubsystem = new TtsSubsystem();
  public readonly router: LanguageRouter = new LanguageRouter();
  public readonly cache: TranslationCache = new TranslationCache();
  public readonly metrics: LatencyMetricsTracker = new LatencyMetricsTracker();
  public readonly registry: ProviderRegistry = new ProviderRegistry();

  private azure = new AzureMtProvider();
  private activeSessions = new Map<string, LangpretationCallSession>();

  private constructor() {}

  public static getInstance(): NanivioTranslatorEngine {
    if (!NanivioTranslatorEngine.instance) {
      NanivioTranslatorEngine.instance = new NanivioTranslatorEngine();
    }
    return NanivioTranslatorEngine.instance;
  }

  /**
   * Capability-based provider router for Call, Video, Voice-Note, Text
   */
  public route(sourceLang: string, targetLang: string, mode: LangpretationMode = 'CALL'): CompleteRoutePlan {
    return this.router.route(sourceLang, targetLang, mode);
  }

  // ==========================================================================
  // 1. ASR & SPEECH-TO-TEXT SUBSYSTEM
  // ==========================================================================
  public async transcribeAudio(segment: AudioSegment, language: string): Promise<AsrResult> {
    return this.asr.transcribe(segment, language);
  }

  // ==========================================================================
  // 2. LANGUAGE DETECTION SUBSYSTEM
  // ==========================================================================
  public detectLanguage(text: string): LanguageDetectionResult {
    return this.languageDetector.detect(text);
  }

  // ==========================================================================
  // 3. VOICE ACTIVITY DETECTION & AUDIO SEGMENTATION FACTORIES
  // ==========================================================================
  public createVAD(options?: {
    energyThreshold?: number;
    silenceDurationMs?: number;
    onSpeechStart?: () => void;
    onSpeechEnd?: (durationMs: number) => void;
  }): VoiceActivityDetector {
    return new VoiceActivityDetector(options);
  }

  public createAudioSegmenter(sampleRate: number = 16000, maxSegmentDurationSec: number = 3.5): AudioSegmenter {
    return new AudioSegmenter(sampleRate, maxSegmentDurationSec);
  }

  // ==========================================================================
  // 4. TTS (TEXT-TO-SPEECH) SUBSYSTEM
  // ==========================================================================
  public async synthesizeSpeech(text: string, language: string): Promise<TtsResult> {
    return this.tts.synthesize(text, language);
  }

  public async speakInBrowser(text: string, language: string): Promise<void> {
    return this.tts.speakInBrowser(text, language);
  }

  // ==========================================================================
  // 5. TRANSLATION WITH MULTI-TIER PROVIDER ROUTING & AUTOMATIC FALLBACK
  // ==========================================================================
  public async translateText(text: string, sourceLang: string, targetLang: string): Promise<MtResult> {
    const start = Date.now();
    if (!text || !text.trim() || sourceLang === targetLang) {
      return { translatedText:text, sourceLang, targetLang, provider:'local', latencyMs:Date.now()-start };
    }
    const cached = this.cache.get(text, sourceLang, targetLang);
    if (cached) return { ...cached, cached:true };
    try {
      const response = await fetch('/api/translate', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,sourceLang,targetLang,preferredProvider:'azure'})});
      const data = await response.json();
      if (!response.ok || data.untranslated || !data.translatedText) throw new Error(data.error || 'Production translation unavailable');
      const result: MtResult = {translatedText:data.translatedText,sourceLang,targetLang,provider:(data.provider==='khaya-ghana-nlp'?'khaya':data.provider==='sunbird-makerere'?'sunbird':'azure'),latencyMs:Date.now()-start,confidence:data.confidence ?? .95,pivotUsed:!!data.pivotUsed};
      this.cache.set(text,sourceLang,targetLang,result);
      return result;
    } catch (e) {
      console.warn('[Nanivio Engine] Production translation failed:',e);
      throw new Error(`Production translation unavailable for ${sourceLang} -> ${targetLang}.`);
    }
  }

  // ==========================================================================
  // 6. ROUTING DECISIONS & 18-LANGUAGE MATRIX
  // ==========================================================================
  public resolveRoute(sourceLang: string, targetLang: string): RouteDecision {
    return this.router.resolveRoute(sourceLang, targetLang);
  }

  public get18LanguageMatrix(): Language18MatrixItem[] {
    return this.router.get18LanguageMatrix();
  }

  // ==========================================================================
  // 7. CALL SESSIONS & TELEMETRY
  // ==========================================================================
  public createCallSession(
    sessionId: string,
    host: CallParticipantMeta,
    receiver: CallParticipantMeta,
    onTurnProduced?: (turn: LangpretationTurn) => void
  ): LangpretationCallSession {
    const session = new LangpretationCallSession(sessionId, host, receiver, onTurnProduced);
    this.activeSessions.set(sessionId, session);
    return session;
  }

  public getCallSession(sessionId: string): LangpretationCallSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  public removeCallSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }

  public getTelemetry(): EngineTelemetry {
    const metricsReport = this.metrics.getComprehensiveReport();
    return {
      totalTurnsProcessed: metricsReport.totalTurns,
      averageLatencyMs: metricsReport.averageLatencyMs,
      idealPercentage: metricsReport.idealPercentage,
      activeProviderRoutes: {
        'ak,tw-ak,fat,ee,gaa,ha': 'Khaya AI (Ghana NLP)',
        'sw,lg': 'Sunbird AI (East Africa)',
        'en,fr,es,ar,de,it,pt,zh,ja,ko': 'Azure Translator / Speech',
        'cross-continental': 'Azure English Pivot + African specialist providers',
      },
      cacheHitRatio: this.cache.getHitRatio(),
      lastRecordedTurn: this.metrics.getLastTurn(),
    };
  }

  public getQualityReport(): QualityMetricsReport {
    return this.metrics.getComprehensiveReport();
  }
}

export const nanivioTranslatorEngine = NanivioTranslatorEngine.getInstance();
