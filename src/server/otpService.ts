import crypto from 'crypto';
import { normalizeSignupPhone } from '../lib/phoneNumber';
import { describePreludeFailure, type PreludeFailureDiagnostic } from './preludeErrors';

interface PendingVerification {
  id: string;
  expiresAt: number;
  attempts: number;
}

/** Process-local, fail-closed state. Restarting requires a fresh verification.
 * Multiple replicas require shared atomic storage before horizontal scaling. */
export class OtpService {
  private pending = new Map<string, PendingVerification>();
  private proofs = new Map<string, { phone: string; expiresAt: number }>();
  private history = new Map<string, number[]>();
  private cooldowns = new Map<string, number>();
  private busy = new Set<string>();

  constructor(
    private request: typeof fetch = fetch,
    private now: () => number = Date.now,
    private apiKey: () => string | undefined = () => process.env.PRELUDE_API_KEY,
    private reportFailure: (diagnostic: PreludeFailureDiagnostic) => void =
      diagnostic => console.warn('[Prelude Verify] Request rejected', diagnostic),
  ) {}

  public normalizePhoneNumber(phone: unknown, callingCode?: string, country?: string): string {
    return normalizeSignupPhone(phone, callingCode, country);
  }

  private prune() {
    const now = this.now();
    for (const [key, value] of this.pending) if (value.expiresAt <= now) this.pending.delete(key);
    for (const [key, value] of this.proofs) if (value.expiresAt <= now) this.proofs.delete(key);
    for (const [key, until] of this.cooldowns) if (until <= now) this.cooldowns.delete(key);
    for (const [key, times] of this.history) {
      const recent = times.filter(t => t > now - 3_600_000);
      if (recent.length) this.history.set(key, recent); else this.history.delete(key);
    }
  }

  private async call(path: string, body: object): Promise<any> {
    const key = this.apiKey();
    if (!key) throw new Error('Phone verification is unavailable. The administrator must configure Prelude.');
    let response: Response;
    try {
      response = await this.request(`https://api.prelude.dev/v2/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error('Phone verification could not reach the provider. Please try again later.');
    }
    if (!response.ok) {
      let payload: unknown;
      try { payload = await response.json(); } catch { /* Non-JSON errors still have a safe HTTP diagnostic. */ }
      const failure = describePreludeFailure(response.status, payload);
      this.reportFailure(failure.diagnostic);
      throw new Error(failure.message);
    }
    try { return await response.json(); }
    catch { throw new Error('Phone verification returned an invalid response. Please try again later.'); }
  }

  public async sendOtp(rawPhone: unknown, channel: string = 'sms', clientIp = 'unknown') {
    const phone = this.normalizePhoneNumber(rawPhone);
    if (channel !== 'sms') throw new Error('Signup verification currently supports SMS only.');
    this.prune();
    if (this.busy.has(phone)) throw new Error('A verification request is already in progress.');
    const until = this.cooldowns.get(phone) || 0;
    if (until > this.now()) throw new Error(`Please wait ${Math.ceil((until - this.now()) / 1000)}s before requesting a new code.`);
    const keys = [`phone:${phone}`, `ip:${clientIp}`];
    for (const key of keys) {
      const limit = key.startsWith('phone:') ? 6 : 120;
      if ((this.history.get(key)?.length || 0) >= limit) throw new Error('Too many verification requests. Please try again later.');
    }
    // Reserve before awaiting the provider, including failed requests, to prevent concurrent SMS floods.
    for (const key of keys) this.history.set(key, [...(this.history.get(key) || []), this.now()]);
    this.cooldowns.set(phone, this.now() + 45_000);
    this.busy.add(phone);
    try {
      const data = await this.call('verification', {
        target: { type: 'phone_number', value: phone },
        options: { method: 'message', preferred_channel: 'sms', code_size: 6 },
      });
      if (!['success', 'retry'].includes(data?.status) || typeof data?.id !== 'string' || !data.id) {
        throw new Error('The provider could not start phone verification for this number.');
      }
      const existing = this.pending.get(phone);
      // A resend in the same provider window must not reset expiry or the attempt budget.
      this.pending.set(phone, existing?.id === data.id ? existing : {
        id: data.id, expiresAt: this.now() + 300_000, attempts: 0,
      });
      const channel = Array.isArray(data.channels) && typeof data.channels[0] === 'string' ? data.channels[0] : 'sms';
      return { success: true, message: `Verification code requested (${channel}). Enter it when it arrives.`,
        cooldownSeconds: 45, channel, provider: 'prelude' };
    } finally { this.busy.delete(phone); }
  }

  public async verifyOtp(rawPhone: unknown, code: unknown) {
    const phone = this.normalizePhoneNumber(rawPhone);
    if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) throw new Error('Enter the 6-digit verification code.');
    this.prune();
    if (this.busy.has(phone)) throw new Error('A verification request is already in progress.');
    const record = this.pending.get(phone);
    if (!record) throw new Error('No active verification. Request a new code.');
    if (record.attempts >= 5) throw new Error('Maximum verification attempts reached. Please wait for the code to expire.');
    record.attempts++;
    this.busy.add(phone);
    try {
      const data = await this.call('verification/check', {
        target: { type: 'phone_number', value: phone }, code: code.trim(),
      });
      if (data?.status !== 'success' || data?.id !== record.id || record.expiresAt <= this.now()) {
        throw new Error('Invalid or expired verification code.');
      }
      this.pending.delete(phone);
      // Only the latest successful verification for this phone may be used.
      for (const [key, proof] of this.proofs) if (proof.phone === phone) this.proofs.delete(key);
      const verificationToken = `vtok_${crypto.randomBytes(32).toString('hex')}`;
      this.proofs.set(verificationToken, { phone, expiresAt: this.now() + 900_000 });
      return { success: true, message: 'Phone number verified.', verifiedPhone: phone, verificationToken };
    } finally { this.busy.delete(phone); }
  }

  /** Synchronous consume prevents concurrent registrations from reusing one proof. */
  public validateVerifiedToken(token: unknown, expectedPhone: unknown): boolean {
    this.prune();
    if (typeof token !== 'string') return false;
    const proof = this.proofs.get(token);
    if (!proof || proof.phone !== this.normalizePhoneNumber(expectedPhone)) return false;
    this.proofs.delete(token);
    return true;
  }
}

export const otpService = new OtpService();
