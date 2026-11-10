import React, { useEffect, useState } from 'react';
import { authClient } from '../../lib/authClient';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import type { DeletionReviewItem } from '../../server/accountDeletionReview';

const choices = [
  ['pending_review','Awaiting review'], ['needs_attention','Needs attention'],
  ['processing','Processing'], ['completed','Completed'], ['all','All requests'],
] as const;

export const AdminDeletionRequests: React.FC<{ key?: string }> = () => {
  const [status, setStatus] = useState('pending_review');
  const [cursor, setCursor] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [items, setItems] = useState<DeletionReviewItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    setBusy(true); setError(''); setItems([]); setNext(null);
    const query = new URLSearchParams({ status });
    if (cursor) query.set('cursor', cursor);
    void (async () => {
      try {
        const response = await fetch(`/api/admin/account-deletion/requests?${query}`, {
          credentials: 'same-origin', signal: controller.signal,
          headers: authClient.getToken() ? { Authorization: `Bearer ${authClient.getToken()}` } : undefined,
        });
        const data = await response.json();
        const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
        if (!response.ok || data?.success !== true || data.readOnly !== true ||
          !Array.isArray(data.items) || data.items.length > 25 ||
          !(data.nextCursor === null || typeof data.nextCursor === 'string') ||
          data.items.some((item: any) => typeof item?.id !== 'string' || typeof item.ownerId !== 'string' ||
            !choices.some(([value]) => value !== 'all' && value === item.status) ||
            !validDate(item.requestedAt) || !validDate(item.updatedAt) ||
            !(item.status === 'completed' ? validDate(item.completedAt) : item.completedAt === null))) {
          throw Error('Deletion requests could not be verified. No account status was changed.');
        }
        if (active) { setItems(data.items); setNext(data.nextCursor); }
      } catch {
        if (active) setError('Deletion requests could not be loaded. Check your admin sign-in and try again.');
      } finally { clearTimeout(timeout); if (active) setBusy(false); }
    })();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [status, cursor, refresh]);
  const displayTime = (value: string) => new Date(value).toLocaleString();
  return (
    <section aria-labelledby="deletion-review-heading" className="space-y-4 rounded-3xl border border-slate-700 bg-slate-950/70 p-4 sm:p-6">
      <h2 id="deletion-review-heading" className="flex items-center gap-2 text-lg font-bold text-white">
        <ShieldAlert className="h-5 w-5 text-amber-300" /> Account deletion requests
      </h2>
      <p className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 text-sm text-amber-100">
        Review only. These requests were verified by email. Account erasure and provider cleanup are not automated yet.
        This screen cannot delete accounts or mark requests complete.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm text-slate-300">
          <span className="block">Request status</span>
          <select value={status} onChange={event => {
            setStatus(event.target.value); setCursor(''); setItems([]); setNext(null);
          }} className="rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-white">
            {choices.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={() => setRefresh(value => value+1)}
          className="flex items-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-sm text-white disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> Refresh requests
        </button>
      </div>
      {busy ? <p role="status" className="text-sm text-slate-300">Loading verified requests…</p>
        : error ? <p role="alert" className="rounded-xl border border-rose-500/50 p-3 text-sm text-rose-200">{error}</p>
        : items.length === 0 ? <p role="status" className="text-sm text-slate-300">No requests in this view.</p>
        : <ul className="space-y-3">
          {items.map(item => <li key={item.id} className="space-y-2 rounded-2xl border border-slate-700 p-4 text-sm text-slate-300">
            <p className="font-semibold text-amber-200">{item.status.replaceAll('_',' ')}</p>
            <dl className="grid gap-2">
              <div><dt className="text-slate-400">Request reference</dt><dd className="break-all font-mono">{item.id}</dd></div>
              <div><dt className="text-slate-400">Account reference</dt><dd className="break-all font-mono">{item.ownerId}</dd></div>
              <div><dt className="text-slate-400">Requested</dt><dd>{displayTime(item.requestedAt)}</dd></div>
              <div><dt className="text-slate-400">Last updated</dt><dd>{displayTime(item.updatedAt)}</dd></div>
              {item.completedAt && <div><dt className="text-slate-400">Recorded completion</dt><dd>{displayTime(item.completedAt)}</dd></div>}
            </dl>
          </li>)}
        </ul>}
      <div className="flex flex-wrap gap-3">
        {cursor && <button type="button" disabled={busy} onClick={() => setCursor('')}
          className="rounded-xl border border-slate-600 px-3 py-2 text-sm text-white disabled:opacity-50">First page</button>}
        {next && !error && <button type="button" disabled={busy} onClick={() => setCursor(next)}
          className="rounded-xl border border-slate-600 px-3 py-2 text-sm text-white disabled:opacity-50">Next page</button>}
      </div>
    </section>
  );
};
