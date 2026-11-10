import type { Express, RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabase } from './supabaseServer';

const statuses = ['pending_review','processing','needs_attention','completed'] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pageSize = 25;
type Cursor = { id: string; requestedAt: string };
export type DeletionReviewItem = Cursor & {
  ownerId: string; status: string; updatedAt: string; completedAt: string | null;
};
export class DeletionReviewError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function deletionReviewFilter(status: unknown, cursor: unknown) {
  const selected = status === undefined ? 'pending_review' : status;
  if (typeof selected !== 'string' || (selected !== 'all' && !statuses.includes(selected as any))) {
    throw new DeletionReviewError(400, 'Choose a valid deletion-request status.');
  }
  let after: Cursor | null = null;
  if (cursor !== undefined) {
    try {
      if (typeof cursor !== 'string' || cursor.length > 300 || !/^[\w-]+$/.test(cursor)) throw Error();
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      if (!uuid.test(parsed.id) || typeof parsed.requestedAt !== 'string' ||
        new Date(parsed.requestedAt).toISOString() !== parsed.requestedAt) throw Error();
      after = { id: parsed.id, requestedAt: parsed.requestedAt };
    } catch { throw new DeletionReviewError(400, 'The request-list cursor is invalid. Return to the first page.'); }
  }
  return { status: selected, after };
}

export async function readDeletionReview(
  filter: ReturnType<typeof deletionReviewFilter>,
  database: () => SupabaseClient | null = getServerSupabase,
) {
  const db = database();
  if (!db) throw Error('storage unavailable');
  let query = db.from('nanivio_deletion_requests')
    .select('id,owner_id,status,requested_at,updated_at,completed_at')
    .order('requested_at', { ascending: true }).order('id', { ascending: true })
    .limit(pageSize + 1);
  if (filter.status !== 'all') query = query.eq('status', filter.status);
  if (filter.after) {
    const { id, requestedAt } = filter.after;
    // Values are strictly validated above, not arbitrary PostgREST expressions.
    query = query.or(`requested_at.gt.${requestedAt},and(requested_at.eq.${requestedAt},id.gt.${id})`);
  }
  const { data, error } = await query.abortSignal(AbortSignal.timeout(5000));
  if (error || !Array.isArray(data)) throw Error('storage unavailable');
  const items: DeletionReviewItem[] = data.slice(0, pageSize).map(row => ({
    id: row.id, ownerId: row.owner_id, status: row.status,
    requestedAt: row.requested_at, updatedAt: row.updated_at, completedAt: row.completed_at,
  }));
  const last = items.at(-1);
  const nextCursor = data.length > pageSize && last ? Buffer.from(JSON.stringify({
    id: last.id, requestedAt: new Date(last.requestedAt).toISOString(),
  })).toString('base64url') : null;
  return { items, nextCursor };
}

export function registerAccountDeletionReview(app: Express, admin: RequestHandler,
  read = readDeletionReview) {
  app.get('/api/admin/account-deletion/requests',
    (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); },
    admin,
    async (req, res) => {
      try {
        const result = await read(deletionReviewFilter(req.query.status, req.query.cursor));
        return res.json({ success: true, ...result, readOnly: true });
      } catch (error) {
        return res.status(error instanceof DeletionReviewError ? error.status : 503).json({
          success: false, error: error instanceof DeletionReviewError ? error.message
            : 'Deletion requests could not be loaded. No account status was changed.',
        });
      }
    },
  );
}
