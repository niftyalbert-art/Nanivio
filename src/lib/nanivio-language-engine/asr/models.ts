import { NanivioLanguageCode } from "../types";

export type NanivioASRDeployment =
  | "local"
  | "self_hosted"
  | "remote";

export type NanivioASRStatus =
  | "configured"
  | "healthy"
  | "degraded"
  | "disabled"
  | "untested";

export interface NanivioASRModel {
  id: string;
  name: string;
  version?: string;

  deployment: NanivioASRDeployment;
  status: NanivioASRStatus;

  languages: NanivioLanguageCode[];

  supportsLongForm?: boolean;
  supportsStreaming?: boolean;

  modelSource?: string;
  license?: string;

  notes?: string;
}
