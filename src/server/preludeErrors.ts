const authentication = 'Phone verification configuration needs administrator attention.';
const credit = 'The phone verification provider reports insufficient account credit. Contact support.';
const account = 'Phone verification is restricted by the provider. The administrator must review the Prelude account settings.';
const destination = 'The provider cannot verify this mobile number. Check the number and selected country.';
const region = 'Phone verification is not enabled for this destination. Contact support.';
const request = 'Phone verification configuration was rejected by the provider. Contact support.';
const retry = 'Too many verification requests. Please try again later.';

// Only documented, explicitly approved codes may reach the client or logs.
// Never forward upstream messages, parameters, targets, headers or request bodies.
const messages: Readonly<Record<string, string>> = Object.freeze({
  invalid_api_key: authentication,
  invalid_bearer_token: authentication,
  missing_api_key: authentication,
  insufficient_balance: credit,
  suspended_account: account,
  missing_company_details: account,
  feature_gated: account,
  channels_not_allowed: account,
  custom_code_not_allowed: account,
  invalid_phone_number: destination,
  invalid_line_type: destination,
  unassigned_phone_number: destination,
  unsupported_country: region,
  region_blocked_by_customer: region,
  region_missing_registration: region,
  channel_not_enabled_in_region: region,
  template_not_registered_in_country: region,
  invalid_method: request,
  invalid_preferred_channel: request,
  invalid_channels: request,
  channels_conflict: request,
  invalid_code_size: request,
  invalid_request: request,
  malformed_verification_target_type: request,
  invalid_template: request,
  invalid_template_id: request,
  invalid_sender_id: request,
  unauthorized_sender_id: request,
  template_not_found: request,
  template_not_validated: request,
  premature_retry: retry,
  rate_limited: retry,
  too_many_attempts: retry,
  too_many_checks: retry,
  spending_limit_exceeded: 'The phone verification provider account has reached a spending limit. Contact support.',
  internal: 'The phone verification provider is temporarily unavailable. Please try again later.',
});

export interface PreludeFailureDiagnostic {
  provider: 'prelude';
  status: number;
  code: string;
  requestId?: string;
}

export function describePreludeFailure(status: number, payload: unknown): {
  message: string;
  diagnostic: PreludeFailureDiagnostic;
} {
  const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const code = typeof data.code === 'string' && Object.prototype.hasOwnProperty.call(messages, data.code)
    ? data.code : 'unknown_error';
  const fallback = status === 401 ? authentication
    : status === 403 ? account
    : status === 429 ? retry
    : status >= 500 ? 'The phone verification provider is temporarily unavailable. Please try again later.'
    : 'Phone verification was declined by the provider. Contact support.';
  // A 402 without Prelude's explicit insufficient_balance code is not proof
  // that topping up will resolve the problem.
  const message = code === 'unknown_error' ? fallback : messages[code];
  const requestId = typeof data.request_id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.request_id)
    ? data.request_id : undefined;
  return {
    message: `${message} (Prelude ${status}/${code})`,
    diagnostic: { provider: 'prelude', status, code, ...(requestId ? { requestId } : {}) },
  };
}
