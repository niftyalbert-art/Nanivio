import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Mail } from 'lucide-react';
import { authClient } from '../../lib/authClient';
import { normalizeSignupPhone } from '../../lib/phoneNumber';

export interface EmailProof { email: string; phone: string; token: string; expiresAt: number }

interface Props {
  key?: string;
  email: string;
  phone: string;
  callingCode: string;
  country: string;
  verified: boolean;
  onVerified: (proof: EmailProof) => void;
}

export function EmailVerification({ email, phone, callingCode, country, verified, onVerified }: Props) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const run = async (verify: boolean) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const identity = { email: email.trim().toLowerCase(), phoneNumber: normalizeSignupPhone(phone, callingCode, country) };
      if (verify) {
        const result = await authClient.verifySignupEmail(identity, code);
        if (mounted.current) onVerified({
          email: result.verifiedEmail, phone: result.verifiedPhone, token: result.verificationToken,
          expiresAt: Date.now() + result.expiresInSeconds * 1000,
        });
      } else {
        const result = await authClient.sendSignupEmail(identity);
        if (mounted.current) {
          setSent(true); setCode(''); setCooldown(result.cooldownSeconds); setMessage(result.message);
        }
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Email verification failed.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  if (verified) return <p role="status" className="flex items-center gap-2 text-sm text-emerald-300 py-2">
    <CheckCircle2 className="w-4 h-4" /> Email verified. Your phone number has not been SMS-verified.
  </p>;
  return <div className="space-y-3 p-4 rounded-2xl border border-slate-700 bg-slate-900 text-slate-200">
    <p className="flex items-center gap-2 font-semibold text-sm"><Mail className="w-4 h-4 text-[#f0b90b]" /> Verify your email</p>
    <p className="text-sm text-slate-400">We’ll email you a code. Both email and phone must be unique; no signup SMS is sent.</p>
    <button type="button" onClick={() => void run(false)} disabled={busy || cooldown > 0 || !email.trim() || !phone.trim()}
      className="px-4 py-2.5 rounded-xl bg-[#f0b90b] hover:bg-[#ffd54a] text-slate-950 text-sm font-semibold disabled:opacity-50">
      {busy ? 'Please wait…' : cooldown ? `Resend in ${cooldown}s` : sent ? 'Resend email code' : 'Send email code'}
    </button>
    {sent && <div className="flex gap-2">
      <input aria-label="Email verification code" autoComplete="one-time-code" inputMode="numeric" maxLength={6}
        value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="6-digit email code" className="min-w-0 flex-1 px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-100" />
      <button type="button" onClick={() => void run(true)} disabled={busy || code.length !== 6}
        className="px-4 py-2 rounded-xl bg-[#f0b90b] hover:bg-[#ffd54a] text-slate-950 font-semibold text-sm disabled:opacity-50">Verify email</button>
    </div>}
    {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
  </div>;
}
