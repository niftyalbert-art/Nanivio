export type NanivioLanguageCode =
  | "en"
  | "fr"
  | "es"
  | "ar"
  | "de"
  | "it"
  | "pt"
  | "zh"
  | "ja"
  | "ko"
  | "sw"
  | "ha"
  | "ak"
  | "tw-ak"
  | "fat"
  | "ee"
  | "gaa"
  | "lg";

export type NanivioSpeechProvider =
  | "nanivio"
  | "azure"
  | "google"
  | "local"
  | "fallback";

export type NanivioTranslationProvider =
  | "nanivio"
  | "azure"
  | "google"
  | "local"
  | "fallback";

export interface SpeechRecognitionRequest {
  audio: Buffer;
  language: NanivioLanguageCode;
  mimeType?: string;
  sampleRate?: number;
  channels?: number;
}

export interface SpeechRecognitionResult {
  text: string;
  language: NanivioLanguageCode;
  provider: NanivioSpeechProvider;
  confidence?: number;
  durationMs?: number;
}

export interface TranslationRequest {
  text: string;
  sourceLanguage: NanivioLanguageCode;
  targetLanguage: NanivioLanguageCode;
}

export interface TranslationResult {
  text: string;
  sourceLanguage: NanivioLanguageCode;
  targetLanguage: NanivioLanguageCode;
  provider: NanivioTranslationProvider;
}

export interface SpeechSynthesisRequest {
  text: string;
  language: NanivioLanguageCode;
  voice?: string;
  format?: "wav" | "mp3" | "ogg" | "webm";
}

export interface SpeechSynthesisResult {
  audio: Buffer;
  language: NanivioLanguageCode;
  provider: NanivioSpeechProvider;
  mimeType: string;
  sampleRate?: number;
  durationMs?: number;
}

export interface LangpretationResult {
  sourceLanguage: NanivioLanguageCode;
  targetLanguage: NanivioLanguageCode;

  originalText: string;
  translatedText: string;

  recognition: SpeechRecognitionResult;
  translation: TranslationResult;
  synthesis: SpeechSynthesisResult;

  totalDurationMs?: number;
}

export interface NanivioLanguageCapabilities {
  language: NanivioLanguageCode;

  speechRecognition: boolean;
  translation: boolean;
  speechSynthesis: boolean;

  speechRecognitionProvider?: NanivioSpeechProvider;
  translationProvider?: NanivioTranslationProvider;
  speechSynthesisProvider?: NanivioSpeechProvider;
}