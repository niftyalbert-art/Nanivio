import { NanivioLanguageCode } from "../types";

export type NanivioRouteStrategy =
  | "identity"
  | "direct"
  | "pivot"
  | "unavailable";

export type NanivioQualityStatus =
  | "untested"
  | "experimental"
  | "validated"
  | "production";

export interface NanivioPairCapability {
  source: NanivioLanguageCode;
  target: NanivioLanguageCode;

  translation: NanivioRouteStrategy;
  speechToSpeech: boolean;
  voiceCloning: boolean;

  qualityStatus: NanivioQualityStatus;

  translationProvider?: string;
  asrProvider?: string;
  ttsProvider?: string;
  voiceProvider?: string;

  pivotLanguage?: NanivioLanguageCode;

  lastTestedAt?: string;
  notes?: string;
}
