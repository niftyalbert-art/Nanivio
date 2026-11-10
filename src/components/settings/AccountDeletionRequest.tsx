import React, { useEffect, useRef, useState } from 'react';
import { deletionRequestApi, type DeletionRequestReceipt } from '../../lib/accountDeletion';

export function AccountDeletionRequest({ initialEmail = '' }: { initialEmail?: string; key?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<DeletionRequestReceipt | null>(null);
  const [loading, setLoading] = useState(!!initialEmail);
  useEffect(() => {
    if (!initialEmail) return;
    let active = true;
    void deletionRequestApi('request').then(result => {
      if (active) setReceipt(result.request);
    }).catch(() => {
      if (active) setError('Saved request status could not be loaded. You can retry later; an existing request will not be duplicated.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialEmail]);
  const run = async (work: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await work(); } catch (error) {
      setError(error instanceof Error ? error.message : 'Your request could not be confirmed. Try again.');
    } finally { locked.current = false; setBusy(false); }
  };
  const input = 'w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white disabled:opacity-50';
  return (
    <section aria-labelledby="deletion-request-title" className="space-y-4 rounded-2xl border border-rose-500/40 bg-slate-900 p-4">
      <h2 id="deletion-request-title" className="font-bold text-white">Request account &amp; data deletion</h2>
      <p className="text-sm text-slate-300">
        Request permanent removal of your Nanivio profile, login and associated personal data,
        including your saved voice profile and private Malvi history. We verify ownership through your account email.
      </p>
      <p className="text-sm text-slate-300">
        Requests require review; submission does not immediately erase data or cancel a paid subscription.
        Necessary payment/security records and other participants’ copies of shared conversations may need to be retained.
        Retention details must be confirmed during review before erasure.
      </p>
      {loading ? <p role="status" className="text-sm text-slate-300">Checking saved request…</p> : receipt ? (
        <div role="status" className="space-y-2 rounded-xl border border-emerald-500/40 p-3 text-sm text-emerald-200">
          <p>Your verified deletion request has been saved.</p>
          <p>Status: <strong>{receipt.status.replaceAll('_', ' ')}</strong></p>
          <p className="break-all">Reference: {receipt.id}</p>
          <p>Your account and data have not been erased by submitting this request. Keep this reference.</p>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={event => {
          event.preventDefault();
          void run(async () => {
            if (!challenge) {
              const result = await deletionRequestApi('challenge', { email });
              setChallenge(result.challengeId); return;
            }
            const result = await deletionRequestApi('requests', { challengeId: challenge, code, confirmation });
            setReceipt(result.request);
          });
        }}>
          <label className="block space-y-1 text-sm text-slate-200">
            <span>Nanivio account email</span>
            <input type="email" autoComplete="email" required maxLength={254} className={input}
              value={email} disabled={busy || !!challenge} onChange={event => setEmail(event.target.value)} />
          </label>
          {challenge && <>
            <p role="status" className="text-sm text-slate-300">
              If this email belongs to an account, a code will be sent. Check your spam folder.
              It expires in 10 minutes and allows five attempts.
            </p>
            <label className="block space-y-1 text-sm text-slate-200">
              <span>Email verification code</span>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required
                minLength={6} maxLength={6} value={code} disabled={busy} className={input}
                onChange={event => setCode(event.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="block space-y-1 text-sm text-slate-200">
              <span>Type DELETE to request permanent deletion</span>
              <input autoComplete="off" required pattern="DELETE" value={confirmation} disabled={busy}
                className={input} onChange={event => setConfirmation(event.target.value)} />
            </label>
          </>}
          <button type="submit" disabled={busy || (!!challenge && (code.length !== 6 || confirmation !== 'DELETE'))}
            className="rounded-xl bg-rose-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
            {busy ? 'Please wait…' : challenge ? 'Submit verified deletion request' : 'Send verification code'}
          </button>
          {challenge && <button type="button" disabled={busy} className="ml-3 text-sm text-slate-300 underline"
            onClick={() => { setChallenge(''); setCode(''); setConfirmation(''); setError(''); }}>
            Start again / request another code
          </button>}
        </form>
      )}
      {error && <p role="alert" className="rounded-xl border border-rose-500/50 p-3 text-sm text-rose-200">{error}</p>}
    </section>
  );
}

export function AccountDeletionPage() {
  return <main className="min-h-[100dvh] bg-slate-950 px-4 py-8 text-white">
    <div className="mx-auto max-w-xl space-y-5">
      <a href="/" className="text-sm text-emerald-300 underline">Back to Nanivio sign in</a>
      <h1 className="text-2xl font-bold">Nanivio account deletion</h1>
      <p className="text-sm text-slate-300">You can request deletion without reinstalling the app or signing in.</p>
      <AccountDeletionRequest />
    </div>
  </main>;
}
