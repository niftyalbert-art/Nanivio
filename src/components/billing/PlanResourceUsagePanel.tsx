import React, { useCallback, useEffect, useRef, useState } from 'react';
import { authClient } from '../../lib/authClient';
import { useNanivio } from '../../context/NanivioContext';

const bytes = (value: number) => `${(value / 1e9).toLocaleString(undefined, { maximumFractionDigits: 3 })} GB`;
export function PlanResourceUsagePanel() {
  const { authUser } = useNanivio();
  const owner = authUser?.id;
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ owner: string; data: any } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    if (!owner) return;
    try {
      const response = await fetch('/api/assistant/plan-usage', {
        headers: { Authorization: `Bearer ${authClient.getToken()}` }, signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || data.userId !== owner) throw new Error(data.error || 'Plan usage is unavailable.');
      if (!controller.signal.aborted) { setState({ owner, data }); setError(''); }
    } catch (e) {
      if (!controller.signal.aborted) { setState(null); setError((e as Error).message); }
    }
  }, [owner]);
  useEffect(() => {
    setState(null); setError(''); void load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    return () => { clearInterval(timer); request.current?.abort(); };
  }, [load]);
  const data = state?.owner === owner ? state.data : null;
  async function remove(file: any) {
    if (!window.confirm(`Delete “${file.name}”? This removes the uploaded file for everyone in that chat. It does not delete the chat messages.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/stream/channels/${encodeURIComponent(file.channelId)}/attachments/${encodeURIComponent(file.id)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${authClient.getToken()}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'File deletion was not confirmed.');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section aria-label="Storage and paid research" className="mb-5 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-200">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-semibold">Storage &amp; paid research</h3>
      <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-600 px-3 py-1 text-xs">Refresh usage</button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-amber-300">{error}</p>}
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div><p className="text-xs text-slate-400">Recorded storage</p>
        <p className="mt-1 font-mono">{data ? `${bytes(data.storage.usedBytes)} / ${data.storage.capacityBytes === null ? 'Previous paid term preserved' : bytes(data.storage.capacityBytes)}` : 'Unavailable'}</p>
        <p className="mt-2 text-xs text-slate-400">Includes metered uploads and shared workspace documents. Stored files do not reset on renewal.</p>
        {data && !data.storage.legacyChatInventoryComplete && <p className="mt-2 text-xs text-amber-200">Older chat attachments are not fully inventoried. This is recorded usage, not a verified total for all historical files. Existing files remain accessible.</p>}
      </div>
      <div><p className="text-xs text-slate-400">Paid web-search queries</p>
        <p className="mt-1 font-mono">{!data ? 'Unavailable' : data.search.canResearch === false ? 'Not included in your active Malvi plan' : data.search.legacy ? 'Previous plan safety limits apply' : `${data.search.remaining.searchQueries ?? 0} remaining / ${data.search.quota.searchQueries ?? 0} per allocation`}</p>
        <p className="mt-2 text-xs text-slate-400">A lookup can generate several queries. Up to four remaining queries are reserved before each lookup; unused queries are returned after confirmed usage. You are never charged above that reservation. A timeout may retain it if provider usage cannot be confirmed.</p>
      </div>
    </div>
    {data?.storage.objects?.length > 0 && <details className="mt-4 border-t border-slate-700 pt-3">
      <summary className="cursor-pointer text-sm">Manage recent metered uploads</summary>
      <p className="mt-2 text-xs text-slate-400">Latest 100 uploads. Storage is released only after deletion is confirmed.</p>
      <ul className="mt-2 space-y-2">{data.storage.objects.map((file: any) => <li key={file.id} className="flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 break-all">{file.name} · {bytes(file.bytes)}{file.state === 'PENDING' ? ' · awaiting provider confirmation' : ''}</span>
        <button type="button" disabled={busy || file.state !== 'STORED'} onClick={() => void remove(file)} className="rounded border border-rose-400/50 px-2 py-1 text-rose-200 disabled:opacity-40">Delete file</button>
      </li>)}</ul>
    </details>}
  </section>;
}
