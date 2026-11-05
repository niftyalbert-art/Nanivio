import { randomUUID } from 'node:crypto';
import { getServerSupabase } from './supabaseServer.ts';
import { AssistantError } from './assistant/redisStore.ts';

export async function planUsageCommand(name: 'nanivio_paid_search' | 'nanivio_plan_storage', action: string, payload: Record<string, unknown>) {
  const db = getServerSupabase();
  if (!db) throw new AssistantError(503, 'PLAN_METER_UNAVAILABLE', 'Plan usage could not be confirmed. No new paid work was started.');
  const { data, error } = await db.rpc(name, { action, payload }).abortSignal(AbortSignal.timeout(8000));
  if (error || !data) throw new AssistantError(503, 'PLAN_METER_UNAVAILABLE', 'Plan protection needs database update 026. Existing files were not deleted.');
  if (data.success === false) throw new AssistantError(
    data.code === 'SEARCH_ALLOWANCE_EXHAUSTED' || data.code === 'STORAGE_QUOTA_EXCEEDED' ? 402 : 409,
    data.code || 'PLAN_METER_UNAVAILABLE',
    data.code === 'SEARCH_ALLOWANCE_EXHAUSTED'
      ? 'Your included paid-search queries are used up. Review your Malvi plan.'
      : data.code === 'STORAGE_QUOTA_EXCEEDED'
        ? 'Your storage allowance is full. Delete an uploaded file or review your communication plan. Existing files remain available.'
        : 'This usage change could not be confirmed. Reload before retrying.',
  );
  return data;
}

/** Reserve first; ambiguous provider failures must not produce free repeat calls. */
export async function meteredWebResearch<T>(
  user: string, run: () => Promise<T>, queryCount: (result: T) => number | undefined,
  command = planUsageCommand,
): Promise<T & { paidSearchUsage: { chargedQueries: number; providerQueries?: number; legacy: boolean } }> {
  const eventId = `research:${randomUUID()}`;
  const reservation = await command('nanivio_paid_search', 'RESERVE', { userId: user, eventId });
  let result: T;
  try { result = await run(); }
  catch (error) {
    // Once dispatched, a timeout does not establish that the provider did no work.
    await command('nanivio_paid_search', 'SETTLE', { userId: user, eventId }).catch(() => {});
    throw error;
  }
  const queries = queryCount(result);
  const settled = await command('nanivio_paid_search', 'SETTLE', {
    userId: user, eventId, ...(queries === undefined ? {} : { providerQueries: queries }),
  });
  return Object.assign({}, result, { paidSearchUsage: {
    chargedQueries: settled.chargedQueries, providerQueries: queries, legacy: Boolean(reservation.legacy),
  } });
}
