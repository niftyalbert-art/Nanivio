import React, { useEffect, useState } from 'react';
import { authenticatedFetch } from '../../lib/authenticatedFetch';
import type { LangpretationReadiness } from '../../shared/langpretationReadiness';
import { NANIVIO_18_LANGUAGES } from '../../lib/translator-engine/matrix/universal18Matrix';

export function LangpretationReadinessPanel({ refreshKey }: { refreshKey: string }) {
  const [report, setReport] = useState<LangpretationReadiness | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [blockedOnly, setBlockedOnly] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setReport(null);
    void (async () => {
      try {
        const response = await authenticatedFetch('/api/langpretation/admin/readiness', { signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Readiness could not be loaded.');
        if (!controller.signal.aborted) setReport(data.report);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Readiness could not be loaded.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [refreshKey, revision]);
  const name = (code: string) => NANIVIO_18_LANGUAGES[code]?.name || code;
  return (
    <section aria-label="All language pair readiness" className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-white">18 × 18 language-pair readiness</h3>
        <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}
          className="min-h-11 rounded-lg border border-slate-700 px-3 text-sm text-white disabled:opacity-50">
          {loading ? 'Checking configuration…' : 'Refresh readiness'}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">Configuration checks only—no provider credits are used. Configured does not mean live verified. Same-language calls preserve original audio.</p>
      {error && <p role="alert" className="mt-3 text-sm text-amber-300">{error}</p>}
      {report && <>
        <p className="mt-3 text-sm text-slate-200">
          {report.total} combinations · {report.crossLanguage} translation directions · {report.sameLanguage} same-language · {report.configured} configured · {report.blocked} blocked · {report.liveVerified} live verified
        </p>
        <label className="my-3 flex min-h-11 items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={blockedOnly} onChange={event => setBlockedOnly(event.target.checked)} />
          Show blocked pairs only
        </label>
        <div className="max-h-[32rem] overflow-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <caption className="sr-only">Recognition, translation and spoken-output readiness for every language direction</caption>
            <thead className="sticky top-0 bg-slate-900 text-slate-300">
              <tr><th className="p-3">From</th><th className="p-3">To</th><th className="p-3">Configuration</th><th className="p-3">Blockers</th></tr>
            </thead>
            <tbody>{report.pairs.filter(pair => !blockedOnly || !pair.configured).map(pair => (
              <tr key={`${pair.source}:${pair.target}`} className="border-t border-slate-800 text-slate-300">
                <td className="p-3">{name(pair.source)}</td><td className="p-3">{name(pair.target)}</td>
                <td className={`p-3 ${pair.configured ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {pair.configured ? pair.sameLanguage ? 'Original audio' : 'Configured—not verified' : 'Blocked'}
                </td>
                <td className="p-3">{pair.blockers.length
                  ? <ul className="space-y-1">{pair.blockers.map((blocker, index) => <li key={index}>{blocker.stage}: {blocker.reason}</li>)}</ul>
                  : 'No configuration blockers; live testing still required.'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </>}
    </section>
  );
}
