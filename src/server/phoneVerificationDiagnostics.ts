import { randomUUID } from 'node:crypto';
import { describePreludeFailure, type PreludeFailureDiagnostic } from './preludeErrors';
import { describeDiditFailure, type DiditFailureDiagnostic } from './diditErrors';
import type { PhoneVerificationDiagnosticEvent, PhoneVerificationDiagnostics } from '../types/phoneVerification';

/** Bounded, non-PII operational history, not a durable audit ledger. */
export class PhoneVerificationDiagnosticStore {
  private events: PhoneVerificationDiagnosticEvent[] = [];
  private readonly startedAt: string;
  private readonly capacity = 100;
  private readonly retentionHours = 24;

  constructor(private now: () => number = Date.now) {
    this.startedAt = new Date(now()).toISOString();
  }

  record(input: PreludeFailureDiagnostic | DiditFailureDiagnostic): void {
    // Re-sanitize at the storage boundary rather than trusting injected callers.
    const status = Number.isInteger(input.status) && input.status >= 100 && input.status <= 599
      ? input.status : 0;
    const safe = input.provider === 'didit'
      ? describeDiditFailure(status, input.code, input.requestId)
      : describePreludeFailure(status, { code: input.code, request_id: input.requestId });
    this.prune();
    this.events.unshift({
      id: randomUUID(),
      createdAt: new Date(this.now()).toISOString(),
      provider: safe.diagnostic.provider,
      operation: input.operation === 'check' ? 'check' : 'send',
      status,
      code: safe.diagnostic.code,
      message: safe.message,
      ...(safe.diagnostic.requestId ? { requestId: safe.diagnostic.requestId } : {}),
    });
    this.events.length = Math.min(this.events.length, this.capacity);
  }

  private prune(): void {
    const cutoff = this.now() - this.retentionHours * 3_600_000;
    this.events = this.events.filter(event => Date.parse(event.createdAt) > cutoff);
  }

  snapshot(): PhoneVerificationDiagnostics {
    this.prune();
    return {
      events: this.events.map(event => ({ ...event })),
      startedAt: this.startedAt,
      storage: 'process-local',
      capacity: this.capacity,
      retentionHours: this.retentionHours,
    };
  }
}

export const phoneVerificationDiagnostics = new PhoneVerificationDiagnosticStore();

export function reportPreludeFailure(diagnostic: PreludeFailureDiagnostic): void {
  reportPhoneVerificationFailure(diagnostic);
}

export function reportPhoneVerificationFailure(diagnostic: PreludeFailureDiagnostic | DiditFailureDiagnostic): void {
  phoneVerificationDiagnostics.record(diagnostic);
  // Log only the sanitized event fields, never the raw provider response.
  const safe = phoneVerificationDiagnostics.snapshot().events[0];
  const label = safe?.provider === 'didit' ? 'Didit' : 'Prelude';
  if (safe) console.warn(`[${label} Verify] Request rejected`, safe);
}
