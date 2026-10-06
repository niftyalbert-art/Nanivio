import { nanivioLanguageEngine } from "./index";
import { NanivioASRProvider, NanivioTranslationProvider, NanivioTTSProvider } from "./providers";

export function registerNanivioASRProvider(
  provider: NanivioASRProvider,
): void {
  nanivioLanguageEngine.registerASRProvider(provider);
}

export function registerNanivioTranslationProvider(
  provider: NanivioTranslationProvider,
): void {
  nanivioLanguageEngine.registerTranslationProvider(provider);
}

export function registerNanivioTTSProvider(
  provider: NanivioTTSProvider,
): void {
  nanivioLanguageEngine.registerTTSProvider(provider);
}

export function registerNanivioProviders(options: {
  asr?: NanivioASRProvider[];
  translation?: NanivioTranslationProvider[];
  tts?: NanivioTTSProvider[];
}): void {
  for (const provider of options.asr ?? []) {
    registerNanivioASRProvider(provider);
  }

  for (const provider of options.translation ?? []) {
    registerNanivioTranslationProvider(provider);
  }

  for (const provider of options.tts ?? []) {
    registerNanivioTTSProvider(provider);
  }
}
