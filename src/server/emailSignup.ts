import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeSignupPhone } from '../lib/phoneNumber';
import { assertSignupEmailConfigured, sendSignupEmail } from './signupEmailDelivery';
export { sendSignupEmail } from './signupEmailDelivery';

export function normalizeSignupEmail(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())) {
    throw new Error('Enter a valid email address.');
  }
  return raw.trim().toLowerCase();
}

export interface SignupIdentity {
  email: string;
  phoneNumber: string;
  callingCode?: string;
  country?: string;
}

export interface EmailSignupStore {
  assertAvailable(email: string, phone: string): Promise<void>;
  reserve(email: string, phone: string, ipHash: string, id: string, codeHash: string): Promise<string>;
  markSent(email: string, id: string): Promise<void>;
  verify(email: string, phone: string, codeHash: string, proofHash: string): Promise<string>;
  consume(email: string, phone: string, proofHash: string): Promise<boolean>;
}

function signupDb(): SupabaseClient {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Email verification is not configured. Please contact support.');
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await signupDb().rpc(name, args);
  if (error) {
    console.error('[Signup email] Verification storage unavailable', { code: error.code });
    throw new Error('Email verification is temporarily unavailable. Please try again later.');
  }
  return data;
}

export const emailSignupStore: EmailSignupStore = {
  async assertAvailable(email, phone) {
    const available = await rpc('nanivio_signup_identity_available', { p_email: email, p_phone: phone });
    if (!available) throw new Error('This email or phone number is already registered. Sign in or recover your account.');
  },
  reserve: (email, phone, ipHash, id, codeHash) => rpc('nanivio_reserve_signup_email', {
    p_email: email, p_phone: phone, p_ip_hash: ipHash, p_id: id, p_code_hash: codeHash,
  }),
  async markSent(email, id) {
    const { error } = await signupDb().from('nanivio_signup_email_challenges')
      .update({ sent: true }).eq('email', email).eq('id', id);
    if (error) throw new Error('Unable to confirm email delivery. Please request a new code.');
  },
  verify: (email, phone, codeHash, proofHash) => rpc('nanivio_verify_signup_email', {
    p_email: email, p_phone: phone, p_code_hash: codeHash, p_proof_hash: proofHash,
  }),
  consume: (email, phone, proofHash) => rpc('nanivio_consume_signup_email', {
    p_email: email, p_phone: phone, p_proof_hash: proofHash,
  }),
};

export class EmailSignupService {
  constructor(
    private store: EmailSignupStore = emailSignupStore,
    private deliver = sendSignupEmail,
    private secret = () => process.env.SESSION_SECRET,
  ) {}

  private hash(value: string) {
    const secret = this.secret();
    if (!secret) throw new Error('Email verification is not configured. Please contact support.');
    return crypto.createHmac('sha256', secret).update(value).digest('hex');
  }

  private identity(input: SignupIdentity) {
    return {
      email: normalizeSignupEmail(input.email),
      phone: normalizeSignupPhone(input.phoneNumber, input.callingCode, input.country),
    };
  }

  async send(input: SignupIdentity, ip: string) {
    const { email, phone } = this.identity(input);
    // Validate delivery configuration before reserving counters, never report a fake send.
    if (this.deliver === sendSignupEmail) assertSignupEmailConfigured();
    await this.store.assertAvailable(email, phone);
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const id = crypto.randomUUID();
    const status = await this.store.reserve(email, phone, this.hash(`ip:${ip}`), id, this.hash(`code:${email}:${phone}:${code}`));
    if (status === 'cooldown') throw new Error('Please wait 60 seconds before requesting another email.');
    if (status !== 'ok') throw new Error('Too many verification requests. Please try again later.');
    await this.deliver(email, code);
    await this.store.markSent(email, id);
    return { success: true, cooldownSeconds: 60, message: 'Verification email sent. Check your inbox and spam folder.' };
  }

  async verify(input: SignupIdentity, code: unknown) {
    const { email, phone } = this.identity(input);
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new Error('Enter the six-digit email code.');
    const proof = crypto.randomBytes(32).toString('hex');
    const status = await this.store.verify(email, phone, this.hash(`code:${email}:${phone}:${code}`), this.hash(`proof:${proof}`));
    if (status !== 'ok') throw new Error('The email code is incorrect, expired, or already used. Request a new code if needed.');
    return { success: true, verifiedEmail: email, verifiedPhone: phone, verificationToken: proof, expiresInSeconds: 900 };
  }

  async consumeProof(token: unknown, email: string, phone: string) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      throw new Error('Verify your email before completing signup.');
    }
    if (!await this.store.consume(normalizeSignupEmail(email), phone, this.hash(`proof:${token}`))) {
      throw new Error('Email verification expired or was already used. Please request and verify a new email code.');
    }
  }
}

export const emailSignupService = new EmailSignupService();
