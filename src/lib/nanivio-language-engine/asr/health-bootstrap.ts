import { NANIVIO_ASR_MODELS } from "./model-registry";
import { nanivioInferenceHealthRegistry } from "./inference-health-registry";

export function initializeNanivioASRHealthRegistry(): void {
  for (const model of NANIVIO_ASR_MODELS) {
    if (!nanivioInferenceHealthRegistry.get(model.id)) {
      nanivioInferenceHealthRegistry.register(model.id, {
        modelId: model.id,
        status: "registered",
        languages: model.languages,
        details:
          "Model is registered with Nanivio but its inference service has not yet been health-checked.",
      });
    }
  }
}
