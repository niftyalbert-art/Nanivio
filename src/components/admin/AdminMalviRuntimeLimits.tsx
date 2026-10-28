import React, { useEffect, useState } from 'react';
import { protectedBillingRequest } from '../../lib/billingClient';

const fields = [
  ['live_minutes_monthly','Shared live minutes per UTC month'],
  ['research_monthly','Research attempts per user per UTC month'],
  ['analyses_monthly','Analysis attempts per user per UTC month'],
  ['upload_mib_monthly','Uploaded MiB per user per UTC month'],
] as const;
type Policy = { version: number } & Record<typeof fields[number][0],number | null>;
export function AdminMalviRuntimeLimits() {
  const [policy,setPolicy] = useState<Policy | null>(null);
  const [values,setValues] = useState<Record<string,string>>({});
  const [canEdit,setCanEdit] = useState(false);
  const [reason,setReason] = useState('');
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const load = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await protectedBillingRequest('/api/admin/billing/malvi-runtime') as {policy:Policy;canEdit:boolean};
      setPolicy(result.policy); setCanEdit(result.canEdit);
      setValues(Object.fromEntries(fields.map(([key]) => [key,result.policy[key] === null ? '' : String(result.policy[key])])));
    } catch(error) { setMessage(error instanceof Error ? error.message : 'Usage limits could not be loaded.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); },[]);
  const save = async () => {
    if (!policy || fields.some(([key]) => !/^\d+$/.test(values[key] || ''))) {
      setMessage('Enter all four limits. Zero disables that usage; blank is not unlimited.'); return;
    }
    setBusy(true); setMessage('');
    try {
      const result = await protectedBillingRequest('/api/admin/billing/malvi-runtime/save',{
        method:'POST',body:JSON.stringify({expectedVersion:policy.version,reason,...Object.fromEntries(fields.map(([key]) => [key,Number(values[key])]))}),
      }) as {policy:Policy};
      setPolicy(result.policy); setReason('');
      setMessage('Usage limits saved. Purchased prices, minutes and renewal dates were not changed.');
    } catch(error) { setMessage(error instanceof Error ? error.message : 'The save could not be confirmed. Reload before retrying.'); }
    finally { setBusy(false); }
  };
  return <section aria-label="Malvi usage safety limits" className="rounded-2xl border border-slate-800 bg-[#0c1424] p-4 sm:p-6">
    <h3 className="text-lg font-semibold text-white">Malvi usage safety limits</h3>
    <p className="mt-2 text-sm text-slate-300">Set caps from your provider allowance and budget. These are usage ceilings, not dollar estimates or new customer prices. Unconfigured features stay unavailable; zero disables them.</p>
    <p className="mt-2 text-xs text-slate-400">Research and analysis count accepted attempts, including provider failures. Unused live time is returned when a conversation closes. Live minutes are reserved against both the customer’s purchased allowance and the shared cap.</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {fields.map(([key,label]) => <label key={key} className="block text-sm text-slate-200">{label}
        <input type="number" min="0" max="1000000000" step="1" value={values[key] ?? ''} placeholder="Not configured"
          disabled={!canEdit || busy} onChange={e => { const value=e.target.value; setValues(previous=>({...previous,[key]:value})); }}
          className="mt-1 w-full min-w-0 rounded-xl border border-slate-700 bg-[#080e18] p-3 text-white disabled:opacity-60" />
      </label>)}
    </div>
    <label className="mt-4 block text-sm text-slate-200">Reason for the change
      <input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} disabled={!canEdit || busy}
        className="mt-1 w-full rounded-xl border border-slate-700 bg-[#080e18] p-3 text-white" />
    </label>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" disabled={busy} onClick={() => void load()} className="rounded-xl border border-slate-600 px-4 py-2 text-white disabled:opacity-50">Reload limits</button>
      <button type="button" disabled={!canEdit || !policy || busy || reason.trim().length<8} onClick={() => void save()}
        className="rounded-xl bg-amber-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">Save usage limits</button>
    </div>
    {message && <p role="status" className="mt-3 break-words text-sm text-amber-200">{message}</p>}
  </section>;
}
