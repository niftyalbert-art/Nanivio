import {
  SpeechRecognitionRequest,
  SpeechRecognitionResult,
  TranslationRequest,
  TranslationResult,
  SpeechSynthesisRequest,
  SpeechSynthesisResult,
} from "./types";

export interface NanivioASRProvider {
  readonly name: string;

  supports(language: string): boolean;

  transcribe(
    request: SpeechRecognitionRequest,
  ): Promise<SpeechRecognitionResult>;
}

export interface NanivioTranslationProvider {
  readonly name: string;

  supports(sourceLanguage: string, targetLanguage: string): boolean;

  translate(
    request: TranslationRequest,
  ): Promise<TranslationResult>;
}

export interface NanivioTTSProvider {
  readonly name: string;

  supports(language: string): boolean;

  synthesize(
    request: SpeechSynthesisRequest,
  ): Promise<SpeechSynthesisResult>;
}
