import { getServerSupabase } from '../supabaseServer.ts';
import { AssistantError } from './redisStore.ts';

type Lease = {
  mode: 'voice' | 'avatar';
  settled_at: string | null;
  ends_at: string;
  subscription_id: string;
};
type Account = { credit_balance: number | string };
type Subscription = {
  voice_minutes_allowed: number | string;
  voice_minutes_used: number | string;
  video_minutes_allowed: number | string;
  video_minutes_used: number | string;
  current_period_end: string;
};
const unavailable = () => new AssistantError(503, 'MALVI_USAGE_UNAVAILABLE',
  'Your remaining Malvi time could not be confirmed. Your existing conversation limits still apply.');

function amount(value: unknown) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') throw unavailable();
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw unavailable();
  return number;
}

/** Reservations already debit both balances. Add back only this session's
 * unspent escrow, not its original reservation or another user's lease.
 * This is a read-only display snapshot, never permission to extend a session.
 */
export function calculateMalviLiveAllowance(
  lease: Lease, account: Account, subscription: Subscription,
  mode: 'voice' | 'avatar', hardDeadline: number, now: number,
) {
  const leaseEnd = Date.parse(lease.ends_at);
  const periodEnd = Date.parse(subscription.current_period_end);
  if (lease.settled_at !== null || lease.mode !== mode ||
    ![leaseEnd, periodEnd, hardDeadline, now].every(Number.isFinite)) throw unavailable();
  const allowed = amount(mode === 'voice' ? subscription.voice_minutes_allowed : subscription.video_minutes_allowed);
  const used = amount(mode === 'voice' ? subscription.voice_minutes_used : subscription.video_minutes_used);
  const unreserved = Math.min(amount(account.credit_balance), Math.max(0, allowed - used)) * 60;
  const reservedRemaining = Math.max(0, Math.min(leaseEnd, hardDeadline, periodEnd) - now) / 1000;
  return {
    remainingSeconds: Math.max(0, Math.floor(Math.min(
      unreserved + reservedRemaining, (periodEnd - now) / 1000,
    ))),
    serverNow: now,
  };
}

export async function readMalviLiveAllowance(
  userId: string, sessionId: string, mode: 'voice' | 'avatar', hardDeadline: number,
  options: { database?: ReturnType<typeof getServerSupabase>; now?: () => number } = {},
) {
  const database = options.database ?? getServerSupabase();
  if (!database) throw unavailable();
  async function row<T>(table: string, columns: string, key?: string, value?: string): Promise<T> {
    let query = database!.from(table).select(columns).eq('user_id', userId);
    if (key) query = query.eq(key, value);
    const { data, error } = await query.abortSignal(AbortSignal.timeout(5000)).maybeSingle();
    if (error || !data) throw unavailable();
    return data as unknown as T;
  }
  const [lease, account] = await Promise.all([
    row<Lease>('nanivio_malvi_live_leases', 'mode,settled_at,ends_at,subscription_id', 'lease_id', sessionId),
    row<Account>('malvi_credit_accounts', 'credit_balance'),
  ]);
  const subscription = await row<Subscription>('nanivio_malvi_subscriptions',
    'voice_minutes_allowed,voice_minutes_used,video_minutes_allowed,video_minutes_used,current_period_end',
    'subscription_id', lease.subscription_id);
  return calculateMalviLiveAllowance(lease, account, subscription, mode, hardDeadline, (options.now ?? Date.now)());
}
