import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Users, UserRoundCheck, UserRoundX, CreditCard, Clock3 } from 'lucide-react';
import { authenticatedFetch } from '../../lib/authenticatedFetch';

type Metrics = { totalUsers: number; paidSubscribers: number; unsubscribedUsers: number; malviPaidSubscribers: number; malviTrialUsers: number };
const labels: Array<{ key: keyof Metrics; label: string; icon: React.FC<{ className?: string }>; note: string }> = [
  { key: 'totalUsers', label: 'All accounts', icon: Users, note: 'Distinct accounts' },
  { key: 'paidSubscribers', label: 'Paid subscribers', icon: CreditCard, note: 'Any paid plan' },
  { key: 'unsubscribedUsers', label: 'Without paid plan', icon: UserRoundX, note: 'No paid plan' },
  { key: 'malviPaidSubscribers', label: 'Malvi paid', icon: UserRoundCheck, note: 'Malvi paid plan' },
  { key: 'malviTrialUsers', label: 'Malvi trial', icon: Clock3, note: 'Malvi trial plan' },
];

export const AdminMalviOverview: React.FC = () => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authenticatedFetch('/api/admin/malvi/overview');
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true || !body.metrics || labels.some(({ key }) => !Number.isFinite(body.metrics[key]) || body.metrics[key] < 0)) {
        throw new Error(body?.message || 'Subscriber metrics are unavailable.');
      }
      setMetrics(body.metrics);
    } catch (err) {
      setMetrics(null);
      setError(err instanceof Error ? err.message : 'Subscriber metrics are unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const onAdjusted = () => { void refresh(); };
    window.addEventListener('nanivio:admin-malvi-adjusted', onAdjusted);
    return () => window.removeEventListener('nanivio:admin-malvi-adjusted', onAdjusted);
  }, [refresh]);

  return (
    <section aria-label="Subscriber metrics" className="border border-[#373a3e] bg-[#191c20]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#34373b] px-4 py-3 sm:px-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#e2bb62]">Account overview</p>
          <h2 className="mt-0.5 text-sm font-bold text-[#f4f1e9]">Subscriber metrics <span className="font-normal text-[#92918b]">· distinct accounts</span></h2>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex min-h-9 items-center gap-2 border border-[#414348] px-3 text-xs text-[#c5c2b8] hover:text-white disabled:opacity-50">
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </button>
      </div>
      {error ? <div className="flex flex-col gap-2 p-4 text-sm text-[#ffb6a8] sm:flex-row sm:items-center sm:justify-between" role="alert"><span>{error}</span><button onClick={() => void refresh()} className="min-h-9 border border-[#8b4a40] px-3 text-xs font-semibold">Retry</button></div> :
        <div className="grid grid-cols-2 divide-x divide-y divide-[#34373b] sm:grid-cols-3 lg:grid-cols-5">
          {labels.map(({ key, label, icon: Icon, note }) => <div key={key} className="min-w-0 p-4">
            <div className="flex items-center gap-2 text-[11px] font-medium text-[#aaa9a2]"><Icon className="h-4 w-4 shrink-0 text-[#e2bb62]" />{label}</div>
            {loading ? <div className="mt-3 h-7 w-20 animate-pulse bg-[#292c31]" aria-label="Loading metric" /> : <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#f4f1e9]">{metrics?.[key].toLocaleString() ?? '—'}</p>}
            <p className="mt-1 text-[10px] text-[#89877f]">{note}</p>
          </div>)}
        </div>}
    </section>
  );
};
