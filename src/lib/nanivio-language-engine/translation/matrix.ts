import { NanivioLanguageCode } from "../types";

export interface NanivioLanguagePair {
  source: NanivioLanguageCode;
  target: NanivioLanguageCode;
  key: string;
  sameLanguage: boolean;
}

export function getLanguagePairKey(
  source: NanivioLanguageCode,
  target: NanivioLanguageCode,
): string {
  return `${source}->${target}`;
}

export function buildNanivioLanguagePairMatrix(): NanivioLanguagePair[] {
  const languages: NanivioLanguageCode[] = [
    "en",
    "fr",
    "es",
    "ar",
    "de",
    "it",
    "pt",
    "zh",
    "ja",
    "ko",
    "sw",
    "ha",
    "ak",
    "tw-ak",
    "fat",
    "ee",
    "gaa",
    "lg",
  ];

  const pairs: NanivioLanguagePair[] = [];

  for (const source of languages) {
    for (const target of languages) {
      pairs.push({
        source,
        target,
        key: getLanguagePairKey(source, target),
        sameLanguage: source === target,
      });
    }
  }

  return pairs;
}

export const NANIVIO_LANGUAGE_PAIR_MATRIX =
  buildNanivioLanguagePairMatrix();

export const NANIVIO_LANGUAGE_PAIR_COUNT =
  NANIVIO_LANGUAGE_PAIR_MATRIX.length;
