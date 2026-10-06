import {
  SpeechRecognitionRequest,
  SpeechRecognitionResult,
} from "../types";

import { nanivioASRProviderRegistry } from "./provider-registry";
import { nanivioASRInferenceRegistry } from "./inference-registry";
import { selectNanivioASRModel } from "./model-selection";

export class NanivioASRRouter {
  async transcribe(
    request: SpeechRecognitionRequest,
  ): Promise<SpeechRecognitionResult> {
    const selection = selectNanivioASRModel(request.language);

    if (!selection.selectedModel) {
      throw new Error(
        `No production-ready ASR model is available for ${request.language}. ${selection.reason}`,
      );
    }

    const modelId = selection.selectedModel.id;

    const inferenceProvider =
      nanivioASRInferenceRegistry.getProvider(modelId);

    if (inferenceProvider) {
      return inferenceProvider.transcribe({
        modelId,
        request,
      });
    }

    const providerResult =
      await nanivioASRProviderRegistry.transcribe(request);

    return providerResult;
  }

  listProviders(): Array<{
    name: string;
    priority: number;
    enabled: boolean;
    languages: string[];
  }> {
    return nanivioASRProviderRegistry.list();
  }

  getModelSelection(request: SpeechRecognitionRequest) {
    return selectNanivioASRModel(request.language);
  }

  listInferenceProviders(): string[] {
    return nanivioASRInferenceRegistry.list();
  }
}

export const nanivioASRRouter = new NanivioASRRouter();
