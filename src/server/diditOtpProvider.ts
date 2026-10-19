import { PUBLIC_PHONE_VERIFICATION_ERROR } from './preludeErrors';
import { describeDiditFailure, type DiditFailureDiagnostic } from './diditErrors';
import { reportPhoneVerificationFailure } from './phoneVerificationDiagnostics';
import type { PhoneOtpProvider } from './phoneOtpProvider';

const isSessionId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export class DiditOtpProvider implements PhoneOtpProvider {
  readonly name = 'didit' as const;
  readonly maxAttempts = 3;

  constructor(
    private request: typeof fetch = fetch,
    private apiKey: () => string | undefined = () => process.env.DIDIT_API_KEY,
    private reportFailure: (diagnostic: DiditFailureDiagnostic) => void = reportPhoneVerificationFailure,
  ) {}

  private failure(status: number, code: string | undefined, operation: 'send' | 'check', requestId?: unknown): Error {
    const { diagnostic } = describeDiditFailure(status, code, requestId);
    this.reportFailure({ ...diagnostic, operation });
    return new Error(PUBLIC_PHONE_VERIFICATION_ERROR);
  }

  private async call(operation: 'send' | 'check', body: object) {
    const key = this.apiKey();
    if (!key) throw this.failure(0, 'not_configured', operation);
    if (/\s|["']/.test(key)) {
      throw this.failure(0, 'invalid_configuration', operation);
    }
    let response: Response;
    try {
      // Fixed destination and no redirects: the key must never be forwarded to another host.
      response = await this.request(`https://verification.didit.me/v3/phone/${operation}/`, {
        method: 'POST',
        headers: { 'x-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
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

  async send(phone: string): Promise<{ id: string; channel: 'sms' }> {
    const data = await this.call('send', {
      phone_number: phone,
      options: { preferred_channel: 'sms', code_size: 6, sms_sender_name: 'Nanivio', locale: 'en' },
    });
    if (data?.status === 'Blocked') throw this.failure(200, 'blocked', 'send', data.request_id);
    if (!['Success', 'Retry'].includes(data?.status) || !isSessionId(data?.request_id)) {
      throw this.failure(200, 'invalid_response', 'send');
    }
    return { id: data.request_id, channel: 'sms' };
  }

  async check(id: string, phone: string, code: string): Promise<boolean> {
    const data = await this.call('check', {
      phone_number: phone, code,
      // Do not silently purchase optional social-footprint lookups.
      enable_social: false,
    });
    // HTTP 200 is not verification. Failed/expired checks have unrelated request IDs.
    if (['Failed', 'Expired or Not Found', 'Declined'].includes(data?.status)) return false;
    if (data?.status !== 'Approved' || data.request_id !== id
      || data.phone?.status !== 'Approved' || data.phone.full_number !== phone) {
      throw this.failure(200, 'invalid_response', 'check', data?.request_id);
    }
    return true;
  }
}
