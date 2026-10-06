export type NanivioVoiceType =
  | "user_clone"
  | "malvi"
  | "system";

export type NanivioVoiceStatus =
  | "pending"
  | "ready"
  | "disabled";

export interface NanivioVoiceProfile {
  id: string;

  ownerUserId?: string;

  type: NanivioVoiceType;

  displayName: string;

  referenceAudioUrl?: string;

  provider?: string;

  supportedLanguages: string[];

  consentConfirmed: boolean;

  status: NanivioVoiceStatus;

  createdAt?: string;

  updatedAt?: string;
}

export interface NanivioVoiceCloneRequest {
  voiceProfileId: string;

  text: string;

  sourceLanguage: string;

  targetLanguage: string;

  format?: "wav" | "mp3" | "ogg" | "webm";
}

export interface NanivioVoiceCloneResult {
  voiceProfileId: string;

  targetLanguage: string;

  audio: Buffer;

  mimeType: string;

  provider: string;

  speakerSimilarity?: number;
}
