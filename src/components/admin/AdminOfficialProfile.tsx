import React, { useEffect, useState } from 'react';
import { Check, QrCode, Save } from 'lucide-react';
import { authenticatedFetch } from '../../lib/authenticatedFetch';
import { NANIVIO_COMPANY, NANIVIO_JOIN_URL, NANIVIO_OFFICIAL_QR, NANIVIO_OFFICIAL_URL } from '../../lib/nanivioOfficial';

type Profile = { address: string; email: string; phone: string; whatsapp: string; website: string; qrMode: 'official' | 'join' };
const EMPTY: Profile = { address: '', email: '', phone: '', whatsapp: '', website: '', qrMode: 'official' };
const FIELDS: { key: Exclude<keyof Profile, 'qrMode'>; label: string; placeholder: string; type?: string }[] = [
  { key: 'address', label: 'Address', placeholder: 'Street, city, region, Ghana' },
  { key: 'email', label: 'Email', placeholder: 'hello@naniviio.com', type: 'email' },
  { key: 'phone', label: 'Phone', placeholder: '+233 …', type: 'tel' },
  { key: 'whatsapp', label: 'WhatsApp', placeholder: '+233 … or https://wa.me/…' },
  { key: 'website', label: 'Website', placeholder: 'https://naniviio.com', type: 'url' },
];

export const AdminOfficialProfile: React.FC = () => {
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/official-profile', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : EMPTY)
      .then(saved => setProfile({ ...EMPTY, ...saved, qrMode: saved?.qrMode === 'join' ? 'join' : 'official' }))
      .catch(() => setStatus({ tone: 'error', text: 'Could not load the saved details.' }));
  }, []);

  const save = async () => {
    setSaving(true); setStatus(null);
    try {
      const response = await authenticatedFetch('/api/admin/official-profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not save.');
      setProfile(result.profile);
      setStatus({ tone: 'ok', text: 'Saved. Account pages show the new details within a minute.' });
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const qrOptions = [
    { mode: 'official' as const, title: 'Official QR design', detail: `Opens ${NANIVIO_OFFICIAL_URL.replace(/^https:\/\//, '')}` },
    { mode: 'join' as const, title: 'Registration QR', detail: `Opens ${NANIVIO_JOIN_URL.replace(/^https:\/\//, '')} (sign-up)` },
  ];

  return (
    <section className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900/60 p-5" aria-labelledby="admin-official-title">
      <div>
        <h2 id="admin-official-title" className="text-lg font-bold text-white">Official contact &amp; QR</h2>
        <p className="text-sm text-slate-400">Shown under “{NANIVIO_COMPANY}” on every Account page.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(({ key, label, placeholder, type }) => (
          <label key={key} className={`space-y-1 text-sm ${key === 'address' ? 'sm:col-span-2' : ''}`}>
            <span className="font-semibold text-slate-200">{label}</span>
            <input id={`official-${key}`} type={type || 'text'} value={profile[key]} placeholder={placeholder}
              onChange={event => setProfile(current => ({ ...current, [key]: event.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400" />
          </label>
        ))}
      </div>

      <fieldset className="space-y-2">
        <legend className="flex items-center gap-2 text-sm font-semibold text-slate-200"><QrCode className="h-4 w-4" />QR on Account pages</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {qrOptions.map(({ mode, title, detail }) => (
            <label key={mode} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 ${
              profile.qrMode === mode ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-700 bg-slate-950'}`}>
              <input type="radio" name="official-qr-mode" value={mode} checked={profile.qrMode === mode}
                onChange={() => setProfile(current => ({ ...current, qrMode: mode }))} className="sr-only" />
              {mode === 'official'
                ? <img src={NANIVIO_OFFICIAL_QR} alt="" className="h-14 w-14 rounded-lg" />
                : <span className="grid h-14 w-14 place-items-center rounded-lg bg-white text-slate-900"><QrCode className="h-8 w-8" /></span>}
              <span className="min-w-0 text-sm">
                <span className="block font-semibold text-white">{title}</span>
                <span className="block break-all text-slate-400">{detail}</span>
              </span>
              {profile.qrMode === mode && <Check className="ml-auto h-4 w-4 shrink-0 text-cyan-300" />}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" id="official-save" onClick={save} disabled={saving}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-4 text-sm font-semibold text-white disabled:opacity-60">
          <Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save'}
        </button>
        {status && <p role="status" className={`text-sm ${status.tone === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{status.text}</p>}
      </div>
    </section>
  );
};
