/** This permission covers only the account owner's adult voice, never another
 * participant. Changing the text's meaning requires a new consent version. */
export const VOICE_PROFILE_CONSENT = 'nanivio-own-adult-voice-v1';
export type VoiceProfileStatus = 'none'|'creating'|'processing'|'ready'|'deleting'|'deleted'|'attention';
export interface VoiceProfileView {
  available: boolean;
  status: VoiceProfileStatus;
  enabled: boolean;
  language?: string;
  consentedAt?: string;
  supportedLanguages: string[];
}
