import {
  LangpretationResult,
  SpeechRecognitionRequest,
  TranslationRequest,
  SpeechSynthesisRequest,
  SpeechRecognitionResult,
  TranslationResult,
  SpeechSynthesisResult,
} from "./types";

import {
  NanivioASRProvider,
  NanivioTranslationProvider,
  NanivioTTSProvider,
} from "./providers";

export interface NanivioLanguageEngine {
  readonly name: "nanivio";

  registerASRProvider(provider: NanivioASRProvider): void;

  registerTranslationProvider(provider: NanivioTranslationProvider): void;

  registerTTSProvider(provider: NanivioTTSProvider): void;

  transcribe(
    request: SpeechRecognitionRequest,
  ): Promise<SpeechRecognitionResult>;

  translate(
    request: TranslationRequest,
  ): Promise<TranslationResult>;

  synthesize(
    request: SpeechSynthesisRequest,
  ): Promise<SpeechSynthesisResult>;

  langpretate(
    request: SpeechRecognitionRequest & {
      targetLanguage: TranslationRequest["targetLanguage"];
      outputFormat?: SpeechSynthesisRequest["format"];
    },
  ): Promise<LangpretationResult>;
}
