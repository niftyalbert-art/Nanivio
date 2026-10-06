import { NanivioLanguageCode } from "../types";
import { NANIVIO_LANGUAGE_PAIR_MATRIX } from "./matrix";
import { NanivioPairCapability } from "./capabilities";

export class NanivioTranslationRouteRegistry {
  private routes = new Map<string, NanivioPairCapability>();

  constructor() {
    for (const pair of NANIVIO_LANGUAGE_PAIR_MATRIX) {
      const isIdentity = pair.source === pair.target;

      this.routes.set(pair.key, {
        source: pair.source,
        target: pair.target,

        translation: isIdentity ? "identity" : "unavailable",

        speechToSpeech: false,
        voiceCloning: false,

        qualityStatus: "untested",

        notes: isIdentity
          ? "Identity route: no translation required."
          : "Awaiting real provider/model validation.",
      });
    }
  }

  get(
    source: NanivioLanguageCode,
    target: NanivioLanguageCode,
  ): NanivioPairCapability | undefined {
    return this.routes.get(`${source}->${target}`);
  }

  set(capability: NanivioPairCapability): void {
    this.routes.set(
      `${capability.source}->${capability.target}`,
      capability,
    );
  }

  list(): NanivioPairCapability[] {
    return Array.from(this.routes.values());
  }

  count(): number {
    return this.routes.size;
  }

  countByStatus(): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const route of this.routes.values()) {
      counts[route.qualityStatus] =
        (counts[route.qualityStatus] ?? 0) + 1;
    }

    return counts;
  }

  countByStrategy(): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const route of this.routes.values()) {
      counts[route.translation] =
        (counts[route.translation] ?? 0) + 1;
    }

    return counts;
  }
}

export const nanivioTranslationRouteRegistry =
  new NanivioTranslationRouteRegistry();
