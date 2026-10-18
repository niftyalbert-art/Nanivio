export interface InfobipFailureDiagnostic {
  provider: 'infobip';
  operation?: 'send' | 'check';
  status: number;
  code: string;
  requestId?: string;
}

const messages: Readonly<Record<string, string>> = Object.freeze({
  not_configured: 'Configure INFOBIP_API_KEY, INFOBIP_API_BASE_URL, INFOBIP_2FA_APPLICATION_ID and INFOBIP_2FA_MESSAGE_ID on this server.',
  invalid_configuration: 'Check the Infobip API base URL and configuration. Use the HTTPS account API URL from Infobip, without paths or credentials.',
  unauthorized: 'Infobip rejected the API credentials. Check the API key, account API base URL and 2FA permissions.',
  forbidden: 'Infobip denied this request. Review account permissions, destination access and sender approval with Infobip.',
  request_rejected: 'Infobip rejected the request. Review the 2FA application, six-digit numeric SMS template, recipient and destination settings.',
  rate_limited: 'Infobip rate-limited verification. Wait before retrying and review provider limits.',
  provider_unavailable: 'Infobip is temporarily unavailable. Please try again later.',
  network_error: 'The server could not reach Infobip before the request failed or timed out.',
  invalid_response: 'Infobip returned a malformed or mismatched verification response.',
  message_not_sent: 'Infobip did not accept the SMS for sending. Review destination availability, sender approval, trial recipients and account credit.',
  unknown_error: 'Infobip verification failed. Review provider activity or contact Infobip support.',
});

/** Only static explanations and validated correlation IDs may enter diagnostics. */
export function describeInfobipFailure(status: number, code?: string, requestId?: unknown): {
  message: string;
  diagnostic: InfobipFailureDiagnostic;
} {
  const fallback = status === 401 ? 'unauthorized'
    : status === 403 ? 'forbidden'
    : status === 429 ? 'rate_limited'
    : status >= 500 ? 'provider_unavailable'
    : status >= 400 && status < 500 ? 'request_rejected' : 'unknown_error';
  const safeCode = code && Object.prototype.hasOwnProperty.call(messages, code) ? code : fallback;
  const safeId = typeof requestId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)
    ? requestId : undefined;
  return {
    message: `${messages[safeCode]} (Infobip ${status}/${safeCode})`,
    diagnostic: { provider: 'infobip', status, code: safeCode, ...(safeId ? { requestId: safeId } : {}) },
  };
}
