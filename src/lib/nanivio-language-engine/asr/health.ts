import { NanivioLanguageCode } from "../types";

export type NanivioInferenceHealthStatus =
  | "registered"
  | "configured"
  | "loading"
  | "healthy"
  | "degraded"
  | "disabled"
  | "failed";

export interface NanivioInferenceHealth {
  modelId: string;
  status: NanivioInferenceHealthStatus;

  endpoint?: string;
  languages: NanivioLanguageCode[];

  checkedAt?: string;
  latencyMs?: number;
  version?: string;

  error?: string;
  details?: string;
}
