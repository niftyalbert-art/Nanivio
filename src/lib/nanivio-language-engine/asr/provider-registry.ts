import {
  SpeechRecognitionRequest,
  SpeechRecognitionResult,
} from "../types";

import { NanivioASRProvider } from "../providers";

export interface NanivioASRProviderRegistration {
  provider: NanivioASRProvider;
  priority: number;
  enabled: boolean;
  languages: string[];
}

export class NanivioASRProviderRegistry {
  private providers: NanivioASRProviderRegistration[] = [];

  register(
    provider: NanivioASRProvider,
    options?: {
      priority?: number;
      enabled?: boolean;
      languages?: string[];
    },
  ): void {
    this.providers.push({
      provider,
      priority: options?.priority ?? 100,
      enabled: options?.enabled ?? true,
      languages: options?.languages ?? [],
    });

    this.providers.sort((a, b) => a.priority - b.priority);
  }

  getProviders(language: string): NanivioASRProviderRegistration[] {
    return this.providers.filter(
      (entry) =>
        entry.enabled &&
        entry.provider.supports(language) &&
        (entry.languages.length === 0 ||
          entry.languages.includes(language)),
    );
  }

  async transcribe(
    request: SpeechRecognitionRequest,
  ): Promise<SpeechRecognitionResult> {
    const providers = this.getProviders(request.language);

    if (providers.length === 0) {
      throw new Error(
        `No enabled Nanivio ASR provider is available for ${request.language}`,
      );
    }

    let lastError: unknown;

    for (const entry of providers) {
      try {
        return await entry.provider.transcribe(request);
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      `All Nanivio ASR providers failed for ${request.language}: ${
        lastError instanceof Error
          ? lastError.message
          : String(lastError)
      }`,
    );
  }

  list(): Array<{
    name: string;
    priority: number;
    enabled: boolean;
    languages: string[];
  }> {
    return this.providers.map((entry) => ({
      name: entry.provider.name,
      priority: entry.priority,
      enabled: entry.enabled,
      languages: entry.languages,
    }));
  }
}

export const nanivioASRProviderRegistry =
  new NanivioASRProviderRegistry();
