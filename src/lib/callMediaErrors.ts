import { CALL_TOKEN_ERRORS, isCallTokenErrorCode } from '../shared/callTokenErrors';

/** Distinguish local device failures from RTC/network failures without exposing credentials. */
export type CallMediaStage = 'token' | 'join' | 'microphone' | 'camera' | 'publish' | 'registration';

export class CallMediaSetupError extends Error {
  constructor(public readonly stage: CallMediaStage, public readonly original: unknown, public readonly httpStatus?: number,
    public readonly serviceCode?: string) {
    super('Call media setup failed.');
    this.name = 'CallMediaSetupError';
  }
}

/** Deliberately omit messages, identities, channels and credentials from logs. */
export function callMediaFailureDetails(error: unknown) {
  const setup = error instanceof CallMediaSetupError ? error : null;
  const cause = (setup ? setup.original : error) as { code?: string; name?: string } | null;
  const code = String(cause?.code || cause?.name || '');
  const known = /^(NOT_READABLE|NOT_ALLOWED|PERMISSION_DENIED|DEVICE_NOT_FOUND|NOT_FOUND|INVALID_TOKEN|TOKEN_EXPIRED|CAN_NOT_GET_GATEWAY_SERVER|NETWORK_TIMEOUT|NETWORK_ERROR|WEB_SECURITY_RESTRICT|UID_CONFLICT|INVALID_APP_ID|NotAllowedError|NotReadableError|NotFoundError|AbortError|TimeoutError)$/;
  return { stage: setup?.stage || 'unknown', code: known.test(code) ? code : 'UNCLASSIFIED',
    ...(isCallTokenErrorCode(setup?.serviceCode) ? { supportCode: setup.serviceCode } : {}),
    ...(setup?.httpStatus ? { httpStatus: setup.httpStatus } : {}) };
}

export function callMediaErrorMessage(error: unknown, type: 'audio' | 'video'): string {
  const setup = error instanceof CallMediaSetupError ? error : null;
  const candidate = (setup ? setup.original : error) as { name?: string; code?: string; message?: string } | null;
  const detail = `${candidate?.name || ''} ${candidate?.code || ''} ${candidate?.message || String(error)}`;
  const device = type === 'video' ? 'camera or microphone' : 'microphone';
  if (setup?.stage === 'token' && isCallTokenErrorCode(setup.serviceCode)) {
    return `${CALL_TOKEN_ERRORS[setup.serviceCode]} Support code: ${setup.serviceCode}.`;
  }
  if (setup?.httpStatus === 401) {
    return 'Your sign-in session has expired. Sign in again, then call again.';
  }
  if (setup?.httpStatus === 403) {
    return 'This call could not be authorized. End it and start a new call with this contact.';
  }
  if (setup?.stage === 'token' && setup.httpStatus === 402) {
    return CALL_TOKEN_ERRORS.CALL_ALLOWANCE_REQUIRED;
  }
  if (/invalid_token|token_expired|invalid_app_id|credentials|certificate|dynamic.?key|appid/i.test(detail)) {
    return 'The call service could not authorize the media connection. Please contact Nanivio support.';
  }
  if (/web_security_restrict|secure context/i.test(detail)) {
    return 'Calling requires a secure connection. Open Nanivio using HTTPS, then call again.';
  }
  if (/not_readable|notreadable|could not start (video|audio) source|trackstarterror/i.test(detail)) {
    return `Your ${device} could not start. Close other apps or browser tabs using it, then end this call and try again.${type === 'video' ? ' You can also try an audio-only call if your camera is unavailable.' : ''}`;
  }
  if (/permission|denied|not_allowed|notallowed/i.test(detail)) {
    return `Access to your ${device} was denied. Allow access in your browser settings, then call again.`;
  }
  if (/not_found|notfound|devicesnotfound/i.test(detail)) {
    return `No available ${device} was found. Connect or enable your device, then call again.`;
  }
  if (/timeout|network|gateway|failed to fetch/i.test(detail)) {
    return 'The call media service could not be reached. Check your connection, VPN or firewall, then call again.';
  }
  if (setup?.stage === 'registration') {
    return 'The server could not finish setting up this call. End it and try again.';
  }
  if (setup?.stage === 'token') {
    return 'The call service is unavailable. Please try again shortly or contact Nanivio support.';
  }
  return 'The call media could not connect. Check your connection and call again.';
}

/** Media failure is already presented by the media controller, not a billing failure. */
export async function finishAnsweredCall(
  connect: () => Promise<unknown>,
  startBilling: () => Promise<unknown>,
  billingFailed: () => void,
) {
  try { if (await connect() === false) return; } catch { return; }
  try { await startBilling(); } catch { billingFailed(); }
}
