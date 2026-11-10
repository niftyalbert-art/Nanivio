import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertSignupEmailConfigured, sendSignupEmail } from './signupEmailDelivery';
import { getServerSupabase } from './supabaseServer';

export type DeletionReceipt = { id: string; status: string; requestedAt: string };
export class DeletionRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export interface DeletionRequests {
  challenge(email: string, ip: string): Promise<string>;
  confirm(id: string, code: string): Promise<DeletionReceipt>;
  current(owner: string): Promise<DeletionReceipt | null>;
}
const unavailable = () => new DeletionRequestError(503,
  'Account deletion requests are unavailable right now. No deletion has been confirmed. Please try again later.');

export class PersistentDeletionRequests implements DeletionRequests {
  constructor(
    private db: () => SupabaseClient | null = getServerSupabase,
    private send = sendSignupEmail,
    private assertDelivery = assertSignupEmailConfigured,
    private secret = () => process.env.SESSION_SECRET,
  ) {}
  private database() { const db = this.db(); if (!db) throw unavailable(); return db; }
  private hash(scope: string, value: string) {
    const secret = this.secret();
    if (!secret) throw unavailable();
    return crypto.createHmac('sha256', secret).update(`${scope}:${value}`).digest('hex');
  }
  async challenge(email: string, ip: string) {
    this.assertDelivery();
    const id = crypto.randomUUID(), code = String(crypto.randomInt(100000, 1000000));
    const db = this.database();
    const { data, error } = await db.rpc('nanivio_reserve_deletion_challenge', {
      p_email: email, p_email_hash: this.hash('email', email), p_ip_hash: this.hash('ip', ip),
      p_id: id, p_code_hash: this.hash('code', `${id}:${code}`),
    }).abortSignal(AbortSignal.timeout(5000));
    if (error || typeof data?.allowed !== 'boolean') throw unavailable();
    if (!data.allowed) throw new DeletionRequestError(429, 'Please wait before requesting another code.');
    if (data.known) {
      try {
        await this.send(email, code, 'account-deletion');
        const sent = await db.rpc('nanivio_mark_deletion_email_sent', { p_id: id })
          .abortSignal(AbortSignal.timeout(5000));
        if (sent.error) throw unavailable();
      } catch {
        // Do not leak whether an account exists through email-provider errors.
        // The unsent challenge cannot authorize a deletion request.
        console.warn('[Account deletion] Verification delivery could not be confirmed.');
      }
    }
    return id;
  }
  async confirm(id: string, code: string) {
    const { data, error } = await this.database().rpc('nanivio_confirm_deletion_request', {
      p_id: id, p_code_hash: this.hash('code', `${id}:${code}`),
    }).abortSignal(AbortSignal.timeout(5000));
    if (error) throw unavailable();
    if (!data?.verified) throw new DeletionRequestError(400,
      'This code is invalid, expired or locked after too many attempts. Request a new code.');
    if (!data.request?.id || !data.request.status || !data.request.requestedAt) throw unavailable();
    return data.request as DeletionReceipt;
  }
  async current(owner: string) {
    const { data, error } = await this.database().from('nanivio_deletion_requests')
      .select('id,status,requested_at').eq('owner_id', owner)
      .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
    if (error) throw unavailable();
    return data ? { id: data.id, status: data.status, requestedAt: data.requested_at } : null;
  }
}
