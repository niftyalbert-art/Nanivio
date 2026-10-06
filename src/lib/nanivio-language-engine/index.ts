import {
  LangpretationResult,
  SpeechRecognitionRequest,
  TranslationRequest,
  SpeechSynthesisRequest,
} from "./types";

import {
  NanivioASRProvider,
  NanivioTranslationProvider,
  NanivioTTSProvider,
} from "./providers";

export class NanivioLanguageEngineImpl {
  readonly name = "nanivio" as const;

  private asrProviders: NanivioASRProvider[] = [];
  private translationProviders: NanivioTranslationProvider[] = [];
  private ttsProviders: NanivioTTSProvider[] = [];

  registerASRProvider(provider: NanivioASRProvider): void {
    this.asrProviders.push(provider);
  }

  registerTranslationProvider(provider: NanivioTranslationProvider): void {
    this.translationProviders.push(provider);
  }

  registerTTSProvider(provider: NanivioTTSProvider): void {
    this.ttsProviders.push(provider);
  }

  async transcribe(request: SpeechRecognitionRequest) {
    const provider = this.asrProviders.find((candidate) =>
      candidate.supports(request.language),
    );

    if (!provider) {
      throw new Error(
        `Nanivio ASR is not configured for language: ${request.language}`,
      );
    }

    return provider.transcribe(request);
  }

  async translate(request: TranslationRequest) {
    if (request.sourceLanguage === request.targetLanguage) {
      return {
        text: request.text,
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        provider: "nanivio" as const,
      };
    }

    const provider = this.translationProviders.find((candidate) =>
      candidate.supports(
        request.sourceLanguage,
        request.targetLanguage,
      ),
    );

    if (!provider) {
      throw new Error(
        `Nanivio translation is not configured for ${request.sourceLanguage} -> ${request.targetLanguage}`,
      );
    }

    return provider.translate(request);
  }

  async synthesize(request: SpeechSynthesisRequest) {
    const provider = this.ttsProviders.find((candidate) =>
      candidate.supports(request.language),
    );

    if (!provider) {
      throw new Error(
        `Nanivio TTS is not configured for language: ${request.language}`,
      );
    }

    return provider.synthesize(request);
  }

  async langpretate(
    request: SpeechRecognitionRequest & {
      targetLanguage: TranslationRequest["targetLanguage"];
      outputFormat?: SpeechSynthesisRequest["format"];
    },
  ): Promise<LangpretationResult> {
    const startedAt = Date.now();

    const recognition = await this.transcribe({
      audio: request.audio,
      language: request.language,
      mimeType: request.mimeType,
      sampleRate: request.sampleRate,
      channels: request.channels,
    });

    const translation = await this.translate({
      text: recognition.text,
      sourceLanguage: recognition.language,
      targetLanguage: request.targetLanguage,
    });

    const synthesis = await this.synthesize({
      text: translation.text,
      language: request.targetLanguage,
      format: request.outputFormat ?? "wav",
    });

    return {
      sourceLanguage: recognition.language,
      targetLanguage: request.targetLanguage,
      originalText: recognition.text,
      translatedText: translation.text,
      recognition,
      translation,
      synthesis,
      totalDurationMs: Date.now() - startedAt,
    };
  }
}

export const nanivioLanguageEngine =
  new NanivioLanguageEngineImpl();
