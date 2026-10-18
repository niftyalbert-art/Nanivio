import React, { useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { authClient } from '../../lib/authClient';
import type { PhoneVerificationDiagnostics } from '../../types/phoneVerification';

interface ViewProps {
  diagnostics: PhoneVerificationDiagnostics | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

export function PhoneVerificationDiagnosticsView({ diagnostics, loading, error, onRefresh }: ViewProps) {
  return (
    <section aria-labelledby="phone-verification-diagnostics-heading"
      className="bg-[#0c1424] border border-slate-800 rounded-3xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="phone-verification-diagnostics-heading" className="text-base font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            Phone verification diagnostics
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Prelude errors are visible only to administrators. Signup users receive a simple retry message.
          </p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 flex items-center gap-2 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh diagnostics
        </button>
      </div>
      <p className="text-xs text-amber-200/80">
        Recent errors on this server only: up to {diagnostics?.capacity ?? 100} events from the last{' '}
        {diagnostics?.retentionHours ?? 24} hours. History clears when the server restarts; this is not a durable audit ledger.
        API keys, phone numbers and verification codes are never included.
      </p>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {loading && !diagnostics && <p role="status" className="text-sm text-slate-400">Loading verification diagnostics…</p>}
      {diagnostics && !error && <>
        <p className="text-xs text-slate-500">Server started: {new Date(diagnostics.startedAt).toLocaleString()}</p>
        {diagnostics.events.length === 0
          ? <p role="status" className="text-sm text-slate-300">
            No provider errors recorded since this server started. This does not confirm successful SMS delivery.
          </p>
          : <ul className="space-y-3" aria-label="Recent phone verification errors">
            {diagnostics.events.map(event => <li key={event.id} className="p-3 rounded-xl border border-slate-700 bg-slate-950/70 space-y-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
                <span>Prelude · {event.operation === 'check' ? 'Check code' : 'Send code'}</span>
                <span>{event.status ? `HTTP ${event.status}` : 'No HTTP response'}</span>
              </div>
              <p className="font-mono text-xs text-amber-300 break-all">{event.code}</p>
              <p className="text-sm text-slate-200 break-words">{event.message}</p>
              {event.requestId && <p className="text-xs text-slate-500 break-all">Provider request ID: {event.requestId}</p>}
            </li>)}
          </ul>}
      </>}
    </section>
  );
}

export function AdminPhoneVerificationDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<PhoneVerificationDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    authClient.getPhoneVerificationDiagnostics(controller.signal)
      .then(result => { if (!controller.signal.aborted) setDiagnostics(result); })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDiagnostics(null);
          setError('Diagnostics could not be loaded. Check your administrator session and try refreshing.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  return <PhoneVerificationDiagnosticsView diagnostics={diagnostics} loading={loading}
    error={error} onRefresh={() => setRefresh(value => value + 1)} />;
}
