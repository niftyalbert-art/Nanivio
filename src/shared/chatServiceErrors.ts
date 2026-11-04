/** Application-owned diagnostics. Never render provider messages or credentials. */
export const CHAT_SERVICE_ERRORS = {
  CHAT_CONFIGURATION_REQUIRED: 'Chat setup is incomplete. Contact Nanivio support.',
  CHAT_PROVIDER_REJECTED: 'The chat provider could not authorize this request. Contact Nanivio support.',
  CHAT_PROVIDER_LIMIT: 'Chat is busy right now. Please try again shortly.',
  CHAT_PROVIDER_TIMEOUT: 'The chat service took too long to respond. Please try again shortly.',
  CHAT_PROVIDER_RESPONSE_INVALID: 'The chat service returned an unreadable response. Please try again shortly.',
  CHAT_PROVIDER_UNAVAILABLE: 'The chat service is temporarily unavailable. Please try again shortly.',
} as const;
export type ChatServiceCode = keyof typeof CHAT_SERVICE_ERRORS;
export function isChatServiceCode(value: unknown): value is ChatServiceCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CHAT_SERVICE_ERRORS, value);
}
