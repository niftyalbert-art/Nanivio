import {
  NanivioInferenceHealth,
  NanivioInferenceHealthStatus,
} from "./health";

export class NanivioInferenceHealthRegistry {
  private health = new Map<string, NanivioInferenceHealth>();

  register(
    modelId: string,
    initial: NanivioInferenceHealth,
  ): void {
    this.health.set(modelId, {
      ...initial,
      modelId,
    });
  }

  update(
    modelId: string,
    patch: Partial<NanivioInferenceHealth>,
  ): NanivioInferenceHealth {
    const current = this.health.get(modelId);

    const next: NanivioInferenceHealth = {
      ...(current ?? {
        modelId,
        status: "registered",
        languages: [],
      }),
      ...patch,
      modelId,
    };

    this.health.set(modelId, next);

    return next;
  }

  get(modelId: string): NanivioInferenceHealth | undefined {
    return this.health.get(modelId);
  }

  getStatus(
    modelId: string,
  ): NanivioInferenceHealthStatus | undefined {
    return this.health.get(modelId)?.status;
  }

  isHealthy(modelId: string): boolean {
    return this.health.get(modelId)?.status === "healthy";
  }

  list(): NanivioInferenceHealth[] {
    return Array.from(this.health.values());
  }

  listHealthy(): NanivioInferenceHealth[] {
    return this.list().filter(
      (item) => item.status === "healthy",
    );
  }

  clear(): void {
    this.health.clear();
  }
}

export const nanivioInferenceHealthRegistry =
  new NanivioInferenceHealthRegistry();
