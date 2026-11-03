/** Public diagnostics only. Never send provider errors or credentials to clients. */
export const CALL_TOKEN_ERRORS = {
  CALL_CONFIGURATION_REQUIRED: 'Calling is not configured on this server. Please contact Nanivio support.',
  CALL_CONFIGURATION_INVALID: 'The calling provider configuration needs an administrator check. Please contact Nanivio support.',
  CALL_TOKEN_GENERATION_FAILED: 'The call service could not create a connection token. Please contact Nanivio support.',
  CALL_USAGE_SETUP_REQUIRED: 'Calling usage setup needs an administrator update. Please contact Nanivio support.',
  CALL_USAGE_UNAVAILABLE: 'The caller’s allowance could not be checked just now. Please try again shortly.',
  CALL_ALLOWANCE_REQUIRED: 'The caller needs an active calling allowance. Receiving ordinary calls remains free.',
  CALL_NOT_AUTHORIZED: 'This call invitation is no longer authorized. End it and start a new call.',
  CALL_NOT_READY: 'This call is not ready to connect. End it and start a new call.',
  CALL_TOKEN_UNAVAILABLE: 'The call service is unavailable. Please try again shortly or contact Nanivio support.',
} as const;

export type CallTokenErrorCode = keyof typeof CALL_TOKEN_ERRORS;
export function isCallTokenErrorCode(value: unknown): value is CallTokenErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CALL_TOKEN_ERRORS, value);
}
