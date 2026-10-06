import {
  NanivioASRInferenceProvider,
  NanivioASRInferenceRequest,
} from "./inference";

import { SpeechRecognitionResult } from "../types";

export class NanivioASRInferenceRegistry {
  private providers: NanivioASRInferenceProvider[] = [];

  register(provider: NanivioASRInferenceProvider): void {
    this.providers.push(provider);
  }

  getProvider(modelId: string): NanivioASRInferenceProvider | undefined {
    return this.providers.find((provider) =>
      provider.supportsModel(modelId),
    );
  }

  async transcribe(
    request: NanivioASRInferenceRequest,
  ): Promise<SpeechRecognitionResult> {
    const provider = this.getProvider(request.modelId);

    if (!provider) {
      throw new Error(
        `No ASR inference provider is registered for model ${request.modelId}`,
      );
    }

    return provider.transcribe(request);
  }

  list(): string[] {
    return this.providers.map((provider) => provider.name);
  }
}

export const nanivioASRInferenceRegistry =
  new NanivioASRInferenceRegistry();
