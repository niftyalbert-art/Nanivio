export interface DiditFailureDiagnostic {
  provider: 'didit';
  operation?: 'send' | 'check';
  status: number;
  code: string;
  requestId?: string;
}

const messages: Readonly<Record<string, string>> = Object.freeze({
  not_configured: 'Configure DIDIT_API_KEY on this server.',
  invalid_configuration: 'Store the raw Didit API key without quotes, whitespace or an authentication prefix.',
  unauthorized: 'Didit rejected the API key. Check whether it is incorrect, expired or revoked.',
  forbidden: 'Didit denied access. Check Sessions write, IP restrictions, and that workflow/status restrictions are disabled for standalone checks.',
  insufficient_balance: 'Didit requires account credit. Check the balance and phone verification pricing in the Didit console.',
  request_rejected: 'Didit rejected the phone verification request. Review account access and destination settings in the Didit console.',
  blocked: 'Didit blocked sending this code through its anti-fraud checks. Review the verification in the Didit console.',
  rate_limited: 'Didit rate-limited verification. Wait before retrying and review account limits.',
  provider_unavailable: 'Didit phone verification is temporarily unavailable. Retry later.',
  network_error: 'The server could not reach Didit before the request failed or timed out.',
  invalid_response: 'Didit returned a malformed or mismatched verification response.',
  unknown_error: 'Didit phone verification failed. Review provider activity or contact Didit support.',
});

/** Never copy raw upstream messages, phone reports or codes into operational history. */
export function describeDiditFailure(status: number, code?: string, requestId?: unknown): {
  message: string;
  diagnostic: DiditFailureDiagnostic;
} {
  const fallback = status === 401 ? 'unauthorized'
    : status === 402 ? 'insufficient_balance'
    : status === 403 ? 'forbidden'
    : status === 429 ? 'rate_limited'
    : status >= 500 ? 'provider_unavailable'
    : status >= 400 && status < 500 ? 'request_rejected' : 'unknown_error';
  const safeCode = code && Object.prototype.hasOwnProperty.call(messages, code) ? code : fallback;
  const safeId = typeof requestId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)
    ? requestId : undefined;
  return {
    message: `${messages[safeCode]} (Didit ${status}/${safeCode})`,
    diagnostic: { provider: 'didit', status, code: safeCode, ...(safeId ? { requestId: safeId } : {}) },
  };
}
