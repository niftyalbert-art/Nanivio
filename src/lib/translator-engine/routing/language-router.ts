import { IMtProvider } from '../mt/interface';
import { KhayaMtProvider } from '../mt/khaya';
import { SunbirdMtProvider } from '../mt/sunbird';
import { AzureMtProvider } from '../mt/azure';
import { NllbMtProvider } from '../mt/nllb';
import {
  NANIVIO_18_LANGUAGES,
  AUTHORITATIVE_18_LANG_CODES,
  CapabilityLevel,
  RealtimeStrategy,
  getLanguageCapability,
} from '../matrix/universal18Matrix';

export type LangpretationMode = 'CALL' | 'VIDEO_CALL' | 'VOICE_NOTE' | 'TEXT' | 'LIVE_TRANSLATION';

export interface CompleteRoutePlan {
  sourceLang: string;
  targetLang: string;
  mode: LangpretationMode;
  capabilityStatus: CapabilityLevel;
  asrProvider: string;
  mtProvider: string;
  ttsProvider: string;
  realtimeStrategy: RealtimeStrategy;
  fallbackProvider: string;
  requiresPivot: boolean;
  pivotLanguage?: string;
  canExecuteRealtimeAudio: boolean;
  canExecuteVoiceNote: boolean;
  estimatedLatencyMs: number;
}

export interface RouteDecision {
  providerId: 'khaya' | 'sunbird' | 'azure' | 'nllb';
  provider: IMtProvider;
  fallbackProviders: IMtProvider[];
  requiresPivot: boolean;
  pivotLanguage?: string;
  estimatedLatencyMs: number;
}

export interface Language18MatrixItem {
  code: string;
  name: string;
  region: string;
  flag: string;
  primaryProvider: 'Khaya AI' | 'Sunbird AI' | 'Azure Translator' | 'NLLB-200';
  fallbackProvider: string;
  pivotRequiredForNonEnglish: boolean;
  asrSupported: boolean;
  ttsSupported: boolean;
  subSecondLatencyCapable: boolean;
}

export class LanguageRouter {
  private khaya = new KhayaMtProvider();
  private sunbird = new SunbirdMtProvider();
  private azure = new AzureMtProvider();
  private nllb = new NllbMtProvider();

  // Authoritative 18 Target Languages of Nanivio
  // 1. Ghanaian Flagship Languages -> Khaya AI (Ghana NLP)
  private ghanaianLanguages = new Set(['ak', 'tw-ak', 'fat', 'ee', 'gaa']);

  // 2. West African Languages -> Khaya AI / NLLB
  private westAfricanLanguages = new Set(['ha']);

  // 3. East African Languages -> Sunbird AI
  private eastAfricanLanguages = new Set(['sw', 'lg']);

  // 4. Global Trade & International Languages -> Azure Translator
  private internationalLanguages = new Set(['en', 'fr', 'es', 'ar', 'de', 'it', 'pt', 'zh', 'ja', 'ko']);

  /**
   * Capability-based router determining STT, MT, TTS, strategy, and fallbacks
   */
  public route(sourceLang: string, targetLang: string, mode: LangpretationMode): CompleteRoutePlan {
    const srcCap = getLanguageCapability(sourceLang);
    const tgtCap = getLanguageCapability(targetLang);

    // If source === target, direct passthrough
    if (sourceLang === targetLang) {
      return {
        sourceLang,
        targetLang,
        mode,
        capabilityStatus: 'FULL',
        asrProvider: srcCap.asrProvider,
        mtProvider: 'DIRECT_PASSTHROUGH',
        ttsProvider: tgtCap.ttsProvider,
        realtimeStrategy: 'STREAMING_FULL_DUPLEX',
        fallbackProvider: 'NONE',
        requiresPivot: false,
        canExecuteRealtimeAudio: true,
        canExecuteVoiceNote: true,
        estimatedLatencyMs: 5,
      };
    }

    // Determine joint capability
    let jointStatus: CapabilityLevel = 'FULL';
    if (!srcCap.active || !tgtCap.active) {
      jointStatus = 'UNAVAILABLE';
    } else if (srcCap.capability === 'PARTIAL' || tgtCap.capability === 'PARTIAL') {
      jointStatus = 'PARTIAL';
    }

    const isGhanaianPair = this.ghanaianLanguages.has(sourceLang) || this.ghanaianLanguages.has(targetLang);
    const isEastAfricanPair = this.eastAfricanLanguages.has(sourceLang) || this.eastAfricanLanguages.has(targetLang);
    const isWestAfricanPair = this.westAfricanLanguages.has(sourceLang) || this.westAfricanLanguages.has(targetLang);

    let asrProvider = srcCap.asrProvider;
    let mtProvider = 'Azure Translator';
    let ttsProvider = tgtCap.ttsProvider;
    let fallbackProvider = 'Meta NLLB-200 / Google Cloud Fallback';
    let requiresPivot = false;
    let pivotLanguage: string | undefined;
    let latency = 550;

    if (isGhanaianPair) {
      mtProvider = 'Khaya AI (Ghana NLP Engine)';
      fallbackProvider = 'Meta NLLB-200 / Azure English Pivot';
      const isCross = (this.ghanaianLanguages.has(sourceLang) && targetLang !== 'en') ||
                      (this.ghanaianLanguages.has(targetLang) && sourceLang !== 'en');
      if (isCross && !this.ghanaianLanguages.has(targetLang)) {
        requiresPivot = true;
        pivotLanguage = 'en';
        latency = 1100;
      } else {
        latency = 750;
      }
    } else if (isEastAfricanPair) {
      mtProvider = 'Sunbird AI (Makerere University)';
      fallbackProvider = 'Google Cloud / Meta NLLB';
      const isCross = (this.eastAfricanLanguages.has(sourceLang) && targetLang !== 'en') ||
                      (this.eastAfricanLanguages.has(targetLang) && sourceLang !== 'en');
      if (isCross) {
        requiresPivot = true;
        pivotLanguage = 'en';
        latency = 1150;
      } else {
        latency = 780;
      }
    } else if (isWestAfricanPair) {
      mtProvider = 'Khaya AI / Meta NLLB-200';
      fallbackProvider = 'Azure English Pivot / Google Cloud';
      latency = 820;
    }

    // Determine realtime strategy based on mode and language characteristics
    let strategy: RealtimeStrategy = 'STREAMING_FULL_DUPLEX';
    if (jointStatus === 'PARTIAL' || isGhanaianPair || isEastAfricanPair || isWestAfricanPair) {
      strategy = (mode === 'CALL' || mode === 'VIDEO_CALL') ? 'VAD_CHUNKED_TURN' : 'PIPELINE_STT_MT_TTS';
    }

    return {
      sourceLang,
      targetLang,
      mode,
      capabilityStatus: jointStatus,
      asrProvider,
      mtProvider,
      ttsProvider,
      realtimeStrategy: strategy,
      fallbackProvider,
      requiresPivot,
      pivotLanguage,
      canExecuteRealtimeAudio: jointStatus === 'FULL' || jointStatus === 'PARTIAL',
      canExecuteVoiceNote: true,
      estimatedLatencyMs: latency,
    };
  }

  public resolveRoute(sourceLang: string, targetLang: string): RouteDecision {
    if (sourceLang === targetLang) {
      return {
        providerId: 'azure',
        provider: this.azure,
        fallbackProviders: [this.nllb],
        requiresPivot: false,
        estimatedLatencyMs: 10,
      };
    }

    const isGhanaian = this.ghanaianLanguages.has(sourceLang) || this.ghanaianLanguages.has(targetLang);
    const isEastAfrican = this.eastAfricanLanguages.has(sourceLang) || this.eastAfricanLanguages.has(targetLang);
    const isWestAfrican = this.westAfricanLanguages.has(sourceLang) || this.westAfricanLanguages.has(targetLang);
    const isInternationalPair = this.internationalLanguages.has(sourceLang) && this.internationalLanguages.has(targetLang);

    // 1. Ghanaian specialized domestic & cross routing (Khaya AI -> NLLB -> Azure fallback)
    if (isGhanaian) {
      const isCrossLang = (this.ghanaianLanguages.has(sourceLang) && targetLang !== 'en') ||
                          (this.ghanaianLanguages.has(targetLang) && sourceLang !== 'en');
      // For domestic African language pairs (e.g. Twi <-> Ewe, Twi <-> Ga, Ewe <-> Ga):
      // Supported directly via Nanivio Volta-Niger multi-lingual MT or internal pivot.
      return {
        providerId: 'khaya',
        provider: this.khaya,
        fallbackProviders: [this.nllb, this.azure],
        requiresPivot: isCrossLang && !this.ghanaianLanguages.has(targetLang),
        pivotLanguage: isCrossLang && !this.ghanaianLanguages.has(targetLang) ? 'en' : undefined,
        estimatedLatencyMs: isCrossLang ? 1150 : 720,
      };
    }

    // 2. East African specialized routing (Sunbird AI -> NLLB -> Azure fallback)
    if (isEastAfrican) {
      const isCrossLang = (this.eastAfricanLanguages.has(sourceLang) && targetLang !== 'en') ||
                          (this.eastAfricanLanguages.has(targetLang) && sourceLang !== 'en');
      return {
        providerId: 'sunbird',
        provider: this.sunbird,
        fallbackProviders: [this.nllb, this.azure],
        requiresPivot: isCrossLang,
        pivotLanguage: isCrossLang ? 'en' : undefined,
        estimatedLatencyMs: isCrossLang ? 1200 : 750,
      };
    }

    // 3. West African Hausa (Khaya AI / Gemini)
    if (isWestAfrican) {
      const isCrossLang = targetLang !== 'en' && sourceLang !== 'en';
      return {
        providerId: 'khaya',
        provider: this.khaya,
        fallbackProviders: [this.nllb, this.azure],
        requiresPivot: isCrossLang,
        pivotLanguage: isCrossLang ? 'en' : undefined,
        estimatedLatencyMs: isCrossLang ? 1250 : 780,
      };
    }

    // 4. Mainstream international languages (Azure Translator)
    if (isInternationalPair) {
      return {
        providerId: 'azure',
        provider: this.azure,
        fallbackProviders: [this.nllb],
        requiresPivot: false,
        estimatedLatencyMs: 520,
      };
    }

    // Universal Fallback Chain
    return {
      providerId: 'azure',
      provider: this.azure,
      fallbackProviders: [],
      requiresPivot: false,
      estimatedLatencyMs: 880,
    };
  }

  /**
   * Returns the verified authoritative 18-Language Support & Routing Matrix
   */
  public get18LanguageMatrix(): Language18MatrixItem[] {
    return AUTHORITATIVE_18_LANG_CODES.map((code) => {
      const item = NANIVIO_18_LANGUAGES[code];
      const isGhanaian = this.ghanaianLanguages.has(code);
      const isEastAfrican = this.eastAfricanLanguages.has(code);
      const isWestAfrican = this.westAfricanLanguages.has(code);

      let primaryProvider: 'Khaya AI' | 'Sunbird AI' | 'Azure Translator' | 'NLLB-200' = 'Azure Translator';
      let fallbackProvider = 'Azure Translator / English Pivot';
      let pivotRequired = false;

      if (isGhanaian) {
        primaryProvider = 'Khaya AI';
        pivotRequired = true;
      } else if (isEastAfrican) {
        primaryProvider = 'Sunbird AI';
        pivotRequired = true;
      } else if (isWestAfrican) {
        primaryProvider = 'Khaya AI';
        pivotRequired = true;
      }

      return {
        code: item.code,
        name: item.name,
        region: item.region,
        flag: item.flag,
        primaryProvider,
        fallbackProvider,
        pivotRequiredForNonEnglish: pivotRequired,
        asrSupported: true,
        ttsSupported: true,
        subSecondLatencyCapable: true,
      };
    });
  }
}
