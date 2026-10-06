import {
  NanivioInferenceHealth,
  NanivioInferenceHealthStatus,
} from "./health";

import { nanivioInferenceHealthRegistry } from "./inference-health-registry";

export interface NanivioInferenceHealthCheckConfig {
  baseUrl: string;
  modelId: string;
  languages: NanivioInferenceHealth["languages"];
  apiKey?: string;
  timeoutMs?: number;
}

interface NanivioHealthResponse {
  status?: string;
  version?: string;
  modelId?: string;
  models?: string[];
}

export class NanivioInferenceHealthChecker {
  async check(
    config: NanivioInferenceHealthCheckConfig,
  ): Promise<NanivioInferenceHealth> {
    const startedAt = Date.now();

    nanivioInferenceHealthRegistry.update(config.modelId, {
      status: "loading",
      endpoint: config.baseUrl,
      languages: config.languages,
    });

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      config.timeoutMs ?? 5000,
    );

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(
        `${config.baseUrl.replace(/\/$/, "")}/health`,
        {
          method: "GET",
          headers,
          signal: controller.signal,
        },
      );

      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        const body = await response.text();

        return nanivioInferenceHealthRegistry.update(
          config.modelId,
          {
            status: "failed",
            endpoint: config.baseUrl,
            languages: config.languages,
            checkedAt: new Date().toISOString(),
            latencyMs,
            error:
              `Health endpoint returned ${response.status}: ${body}`,
          },
        );
      }

      const data =
        (await response.json()) as NanivioHealthResponse;

      const reportedModelIds = data.models ?? [];

      const modelMatches =
        !data.modelId ||
        data.modelId === config.modelId ||
        reportedModelIds.includes(config.modelId);

      if (!modelMatches) {
        return nanivioInferenceHealthRegistry.update(
          config.modelId,
          {
            status: "degraded",
            endpoint: config.baseUrl,
            languages: config.languages,
            checkedAt: new Date().toISOString(),
            latencyMs,
            version: data.version,
            error:
              `Inference server is healthy, but model ${config.modelId} was not reported by the server.`,
          },
        );
      }

      const serverStatus = String(
  data.status ?? "unknown",
).toLowerCase();

let status: NanivioInferenceHealthStatus;

switch (serverStatus) {
  case "ready":
  case "healthy":
    status = "healthy";
    break;

  case "configured":
    status = "configured";
    break;

  case "loading":
  case "starting":
    status = "loading";
    break;

  case "degraded":
  case "warning":
    status = "degraded";
    break;

  case "disabled":
  case "offline":
  case "failed":
  case "error":
    status = "failed";
    break;

  default:
    status = "degraded";
    break;
}

      return nanivioInferenceHealthRegistry.update(
        config.modelId,
        {
          status,
          endpoint: config.baseUrl,
          languages: config.languages,
          checkedAt: new Date().toISOString(),
          latencyMs,
          version: data.version,
        },
      );
    } catch (error) {
      const latencyMs = Date.now() - startedAt;

      return nanivioInferenceHealthRegistry.update(
        config.modelId,
        {
          status: "failed",
          endpoint: config.baseUrl,
          languages: config.languages,
          checkedAt: new Date().toISOString(),
          latencyMs,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const nanivioInferenceHealthChecker =
  new NanivioInferenceHealthChecker();
