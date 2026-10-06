import { NanivioLanguageCode } from "../types";
import { NANIVIO_ASR_MODELS } from "./model-registry";
import { NanivioASRModel } from "./models";
import { nanivioInferenceHealthRegistry } from "./inference-health-registry";

export interface NanivioASRModelSelection {
  language: NanivioLanguageCode;
  selectedModel?: NanivioASRModel;
  candidates: NanivioASRModel[];
  reason: string;
}

const LANGUAGE_PREFERENCE: Record<
  NanivioLanguageCode,
  string[]
> = {
  en: ["dondo-southern-ghana", "nanivio-multilingual-asr"],
  fr: ["nanivio-multilingual-asr"],
  es: ["nanivio-multilingual-asr"],
  ar: ["nanivio-multilingual-asr"],
  de: ["nanivio-multilingual-asr"],
  it: ["nanivio-multilingual-asr"],
  pt: ["nanivio-multilingual-asr"],
  zh: ["nanivio-multilingual-asr"],
  ja: ["nanivio-multilingual-asr"],
  ko: ["nanivio-multilingual-asr"],
  sw: ["sunflowerasr-51", "nanivio-multilingual-asr"],
  ha: ["sunflowerasr-51", "nanivio-multilingual-asr"],
  ak: ["dondo-southern-ghana", "sunflowerasr-51"],
  "tw-ak": ["dondo-southern-ghana"],
  fat: ["dondo-southern-ghana"],
  ee: ["dondo-southern-ghana", "sunflowerasr-51"],
  gaa: ["dondo-southern-ghana"],
  lg: ["sunflowerasr-51", "nanivio-multilingual-asr"],
};

export function selectNanivioASRModel(
  language: NanivioLanguageCode,
): NanivioASRModelSelection {
  const preference = LANGUAGE_PREFERENCE[language] ?? [];

  const candidates = NANIVIO_ASR_MODELS
    .filter((model) => model.languages.includes(language))
    .filter((model) => model.status !== "disabled")
    .sort((a, b) => {
      const aIndex = preference.indexOf(a.id);
      const bIndex = preference.indexOf(b.id);

      const aRank =
        aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
      const bRank =
        bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;

      return aRank - bRank;
    });

  for (const model of candidates) {
    const health = nanivioInferenceHealthRegistry.get(
      model.id,
    );

    if (
      model.status === "healthy" &&
      health?.status === "healthy"
    ) {
      return {
        language,
        selectedModel: model,
        candidates,
        reason:
          `Selected healthy Nanivio ASR model ${model.id}.`,
      };
    }
  }

  const healthStates = candidates.map((model) => {
    const health = nanivioInferenceHealthRegistry.get(
      model.id,
    );

    return `${model.id}:${health?.status ?? "unregistered"}`;
  });

  return {
    language,
    candidates,
    reason:
      candidates.length === 0
        ? `No ASR model is registered for ${language}.`
        : `No healthy ASR model is currently available for ${language}. ` +
          `Model health: ${healthStates.join(", ")}.`,
  };
}
