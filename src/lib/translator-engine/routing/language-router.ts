import { IMtProvider } from '../mt/interface';
import { KhayaMtProvider } from '../mt/khaya';
import { SunbirdMtProvider } from '../mt/sunbird';
import { PalabraMtProvider } from '../mt/palabra';
import { NllbMtProvider } from '../mt/nllb';
import { NANIVIO_18_LANGUAGES, AUTHORITATIVE_18_LANG_CODES } from '../matrix/universal18Matrix';

export interface RouteDecision {
  providerId: 'khaya' | 'sunbird' | 'palabra' | 'nllb';
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
  primaryProvider: 'Khaya AI' | 'Sunbird AI' | 'Palabra MT' | 'NLLB-200';
  fallbackProvider: string;
  pivotRequiredForNonEnglish: boolean;
  asrSupported: boolean;
  ttsSupported: boolean;
  subSecondLatencyCapable: boolean;
}

export class LanguageRouter {
  private khaya = new KhayaMtProvider();
  private sunbird = new SunbirdMtProvider();
  private palabra = new PalabraMtProvider();
  private nllb = new NllbMtProvider();

  // Authoritative 18 Target Languages of Nanivio
  // 1. Ghanaian Flagship Languages -> Khaya AI (Ghana NLP)
  private ghanaianLanguages = new Set(['ak', 'tw-ak', 'fat', 'ee', 'gaa']);

  // 2. West African Languages -> Khaya AI / NLLB
  private westAfricanLanguages = new Set(['ha']);

  // 3. East African Languages -> Sunbird AI
  private eastAfricanLanguages = new Set(['sw', 'lg']);

  // 4. Global Trade & International Languages -> Palabra Realtime MT
  private internationalLanguages = new Set(['en', 'fr', 'es', 'ar', 'de', 'it', 'pt', 'zh', 'ja', 'ko']);

  public resolveRoute(sourceLang: string, targetLang: string): RouteDecision {
    if (sourceLang === targetLang) {
      return {
        providerId: 'palabra',
        provider: this.palabra,
        fallbackProviders: [this.nllb],
        requiresPivot: false,
        estimatedLatencyMs: 10,
      };
    }

    const isGhanaian = this.ghanaianLanguages.has(sourceLang) || this.ghanaianLanguages.has(targetLang);
    const isEastAfrican = this.eastAfricanLanguages.has(sourceLang) || this.eastAfricanLanguages.has(targetLang);
    const isWestAfrican = this.westAfricanLanguages.has(sourceLang) || this.westAfricanLanguages.has(targetLang);
    const isInternationalPair = this.internationalLanguages.has(sourceLang) && this.internationalLanguages.has(targetLang);

    // 1. Ghanaian specialized domestic & cross routing (Khaya AI -> NLLB -> Palabra fallback)
    if (isGhanaian) {
      const isCrossLang = (this.ghanaianLanguages.has(sourceLang) && targetLang !== 'en') ||
                          (this.ghanaianLanguages.has(targetLang) && sourceLang !== 'en');
      // For domestic African language pairs (e.g. Twi <-> Ewe, Twi <-> Ga, Ewe <-> Ga):
      // Supported directly via Nanivio Volta-Niger multi-lingual MT or internal pivot.
      return {
        providerId: 'khaya',
        provider: this.khaya,
        fallbackProviders: [this.nllb, this.palabra],
        requiresPivot: isCrossLang && !this.ghanaianLanguages.has(targetLang),
        pivotLanguage: isCrossLang && !this.ghanaianLanguages.has(targetLang) ? 'en' : undefined,
        estimatedLatencyMs: isCrossLang ? 1150 : 720,
      };
    }

    // 2. East African specialized routing (Sunbird AI -> NLLB -> Palabra fallback)
    if (isEastAfrican) {
      const isCrossLang = (this.eastAfricanLanguages.has(sourceLang) && targetLang !== 'en') ||
                          (this.eastAfricanLanguages.has(targetLang) && sourceLang !== 'en');
      return {
        providerId: 'sunbird',
        provider: this.sunbird,
        fallbackProviders: [this.nllb, this.palabra],
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
        fallbackProviders: [this.nllb, this.palabra],
        requiresPivot: isCrossLang,
        pivotLanguage: isCrossLang ? 'en' : undefined,
        estimatedLatencyMs: isCrossLang ? 1250 : 780,
      };
    }

    // 4. Mainstream international languages (Palabra -> NLLB fallback)
    if (isInternationalPair) {
      return {
        providerId: 'palabra',
        provider: this.palabra,
        fallbackProviders: [this.nllb],
        requiresPivot: false,
        estimatedLatencyMs: 520,
      };
    }

    // Universal Fallback Chain
    return {
      providerId: 'nllb',
      provider: this.nllb,
      fallbackProviders: [this.palabra],
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

      let primaryProvider: 'Khaya AI' | 'Sunbird AI' | 'Palabra MT' | 'NLLB-200' = 'Palabra MT';
      let fallbackProvider = 'NLLB-200 / Palabra Multi-Tier';
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
