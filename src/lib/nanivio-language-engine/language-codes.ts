import { NanivioLanguageCode } from "./types";

export interface NanivioExternalLanguageCodes {
  nllb?: string;
  flores?: string;

  azureSpeechLocale?: string;
  azureTranslator?: string;

  sunbird?: string;
  khaya?: string;
}

export const NANIVIO_EXTERNAL_LANGUAGE_CODES: Record<
  NanivioLanguageCode,
  NanivioExternalLanguageCodes
> = {
  en: {
    nllb: "eng_Latn",
    flores: "eng_Latn",
    azureSpeechLocale: "en-US",
    azureTranslator: "en",
  },

  fr: {
    nllb: "fra_Latn",
    flores: "fra_Latn",
    azureSpeechLocale: "fr-FR",
    azureTranslator: "fr",
  },

  es: {
    nllb: "spa_Latn",
    flores: "spa_Latn",
    azureSpeechLocale: "es-ES",
    azureTranslator: "es",
  },

  ar: {
    nllb: "arb_Arab",
    flores: "arb_Arab",
    azureSpeechLocale: "ar-SA",
    azureTranslator: "ar",
  },

  de: {
    nllb: "deu_Latn",
    flores: "deu_Latn",
    azureSpeechLocale: "de-DE",
    azureTranslator: "de",
  },

  it: {
    nllb: "ita_Latn",
    flores: "ita_Latn",
    azureSpeechLocale: "it-IT",
    azureTranslator: "it",
  },

  pt: {
    nllb: "por_Latn",
    flores: "por_Latn",
    azureSpeechLocale: "pt-BR",
    azureTranslator: "pt",
  },

  zh: {
    nllb: "zho_Hans",
    flores: "zho_Hans",
    azureSpeechLocale: "zh-CN",
    azureTranslator: "zh-Hans",
  },

  ja: {
    nllb: "jpn_Jpan",
    flores: "jpn_Jpan",
    azureSpeechLocale: "ja-JP",
    azureTranslator: "ja",
  },

  ko: {
    nllb: "kor_Hang",
    flores: "kor_Hang",
    azureSpeechLocale: "ko-KR",
    azureTranslator: "ko",
  },

  sw: {
    nllb: "swh_Latn",
    flores: "swh_Latn",
    sunbird: "sw",
  },

  ha: {
    nllb: "hau_Latn",
    flores: "hau_Latn",
    sunbird: "ha",
    khaya: "ha",
  },

  ak: {
    nllb: "aka_Latn",
    flores: "aka_Latn",
    khaya: "ak",
  },

  "tw-ak": {
    nllb: "twi_Latn",
    flores: "twi_Latn",
    khaya: "tw-ak",
  },

  fat: {
    nllb: "fat_Latn",
    flores: "fat_Latn",
    khaya: "fat",
  },

  ee: {
    nllb: "ewe_Latn",
    flores: "ewe_Latn",
    khaya: "ee",
  },

  gaa: {
    nllb: "gaa_Latn",
    flores: "gaa_Latn",
    khaya: "gaa",
  },

  lg: {
    nllb: "lug_Latn",
    flores: "lug_Latn",
    sunbird: "lg",
  },
};

export function getNanivioExternalLanguageCodes(
  language: NanivioLanguageCode,
): NanivioExternalLanguageCodes {
  return NANIVIO_EXTERNAL_LANGUAGE_CODES[language];
}
