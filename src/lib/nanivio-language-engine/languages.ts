import type {
  NanivioLanguageCapabilities,
  NanivioLanguageCode,
} from "./types";

export const NANIVIO_LANGUAGES: NanivioLanguageCapabilities[] = [
  {
    language: "en",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "fr",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "es",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "ar",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "de",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "it",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "pt",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "zh",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "ja",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "ko",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "sw",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "ha",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "ak",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "tw-ak",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "fat",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "ee",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "gaa",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
  {
    language: "lg",
    speechRecognition: true,
    translation: true,
    speechSynthesis: true,
  },
];

export function getNanivioLanguage(
  language: NanivioLanguageCode,
): NanivioLanguageCapabilities | undefined {
  return NANIVIO_LANGUAGES.find((item) => item.language === language);
}