import { PUBLIC_PHONE_VERIFICATION_ERROR } from './preludeErrors';
import { describeInfobipFailure, type InfobipFailureDiagnostic } from './infobipErrors';
import { reportPhoneVerificationFailure } from './phoneVerificationDiagnostics';

export interface PhoneOtpProvider {
  readonly name: 'infobip';
  send(phone: string): Promise<{ id: string; channel: 'sms' }>;
  check(id: string, phone: string, code: string): Promise<boolean>;
}

export interface InfobipOtpConfiguration {
  apiKey?: string;
  baseUrl?: string;
  applicationId?: string;
  messageId?: string;
}

/** Provider adapter only; OTP limits, expiry and single-use proofs stay in OtpService. */
export class InfobipOtpProvider implements PhoneOtpProvider {
  readonly name = 'infobip' as const;

  constructor(
    private request: typeof fetch = fetch,
    private configuration: () => InfobipOtpConfiguration = () => ({
      apiKey: process.env.INFOBIP_API_KEY,
      baseUrl: process.env.INFOBIP_API_BASE_URL,
      applicationId: process.env.INFOBIP_2FA_APPLICATION_ID,
      messageId: process.env.INFOBIP_2FA_MESSAGE_ID,
    }),
    private reportFailure: (diagnostic: InfobipFailureDiagnostic) => void = reportPhoneVerificationFailure,
  ) {}

  private failure(status: number, code: string | undefined, operation: 'send' | 'check', requestId?: unknown): Error {
    const { diagnostic } = describeInfobipFailure(status, code, requestId);
    this.reportFailure({ ...diagnostic, operation });
    return new Error(PUBLIC_PHONE_VERIFICATION_ERROR);
  }

  private settings(operation: 'send' | 'check') {
    const config = this.configuration();
    if (!config.apiKey || !config.baseUrl || !config.applicationId || !config.messageId) {
      throw this.failure(0, 'not_configured', operation);
    }
    let url: URL;
    try { url = new URL(config.baseUrl); }
    catch { throw this.failure(0, 'invalid_configuration', operation); }
    // Prevent misconfiguration from sending the API key to another host or path.
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash
      || url.pathname !== '/'
      || !(url.hostname === 'api.infobip.com' || /^[a-z0-9-]+\.api\.infobip\.com$/.test(url.hostname))
      || config.apiKey.trim() !== config.apiKey || /\s/.test(config.apiKey)
      || !/^[a-zA-Z0-9_-]{1,256}$/.test(config.applicationId)
      || !/^[a-zA-Z0-9_-]{1,256}$/.test(config.messageId)) {
      throw this.failure(0, 'invalid_configuration', operation);
    }
    return { ...config, baseUrl: url.origin };
  }

  private async call(path: string, body: object, operation: 'send' | 'check') {
    const settings = this.settings(operation);
    let response: Response;
    try {
      response = await this.request(`${settings.baseUrl}/2fa/2/${path}`, {
        method: 'POST',
        headers: { Authorization: `App ${settings.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
    } catch { throw this.failure(0, 'network_error', operation); }
    const requestId = response.headers.get('x-request-id');
    if (!response.ok) throw this.failure(response.status, undefined, operation, requestId);
    try { return await response.json(); }
    catch { throw this.failure(response.status, 'invalid_response', operation, requestId); }
  }

  private matchesPhone(value: unknown, phone: string): boolean {
    return typeof value === 'string' && /^\+?\d+$/.test(value) && value.replace(/^\+/, '') === phone.slice(1);
  }

  async send(phone: string): Promise<{ id: string; channel: 'sms' }> {
    const settings = this.settings('send');
    // Number Lookup is optional and separately billable; do not enable it silently.
    const data = await this.call('pin?ncNeeded=false', {
      applicationId: settings.applicationId,
      messageId: settings.messageId,
      to: phone.slice(1),
    }, 'send');
    if (data?.smsStatus === 'MESSAGE_NOT_SENT') throw this.failure(200, 'message_not_sent', 'send');
    if (data?.smsStatus !== 'MESSAGE_SENT' || typeof data.pinId !== 'string'
      || !/^[a-zA-Z0-9_-]{1,256}$/.test(data.pinId) || !this.matchesPhone(data.to, phone)) {
      throw this.failure(200, 'invalid_response', 'send');
    }
    return { id: data.pinId, channel: 'sms' };
  }

  async check(id: string, phone: string, code: string): Promise<boolean> {
    const data = await this.call(`pin/${encodeURIComponent(id)}/verify`, { pin: code }, 'check');
    if (typeof data?.verified !== 'boolean' || data.pinId !== id || !this.matchesPhone(data.msisdn, phone)) {
      throw this.failure(200, 'invalid_response', 'check');
    }
    return data.verified === true && !data.pinError;
  }
}
