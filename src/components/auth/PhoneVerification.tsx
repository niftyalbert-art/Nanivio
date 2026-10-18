import React, { useEffect, useRef, useState } from 'react';
import { authClient } from '../../lib/authClient';
import { normalizeSignupPhone } from '../../lib/phoneNumber';

export interface PhoneProof { phone: string; token: string }

interface Props {
  phone: string;
  callingCode: string;
  country: string;
  verified: boolean;
  onVerified: (proof: PhoneProof) => void;
}

/** Parent keys this component by country/number so stale requests cannot verify a changed input. */
export const PhoneVerification: React.FC<Props> = ({ phone, callingCode, country, verified, onVerified }) => {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const run = async (verify: boolean) => {
    setBusy(true);
    setError('');
    try {
      const fullPhone = normalizeSignupPhone(phone, callingCode, country);
      if (verify) {
        const result = await authClient.verifyPhoneOtp(fullPhone, code);
        if (mounted.current) onVerified({ phone: result.verifiedPhone, token: result.verificationToken });
      } else {
        const result = await authClient.sendPhoneOtp(fullPhone, 'sms');
        if (mounted.current) {
          setSent(true);
          setCooldown(result.cooldownSeconds);
          setMessage(result.message);
          setCode('');
        }
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Phone verification failed.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  if (verified) return <p role="status" className="text-xs text-emerald-300 py-2">Phone number verified.</p>;
  return (
    <div className="space-y-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
      <p className="text-xs text-slate-300">Verify this phone number before completing signup.</p>
      <button type="button" disabled={busy || cooldown > 0 || !phone.trim()}
        onClick={() => void run(false)}
        className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs disabled:opacity-50">
        {busy ? 'Please wait…' : cooldown ? `Resend in ${cooldown}s` : sent ? 'Resend code' : 'Send verification code'}
      </button>
      {sent && <div className="flex gap-2">
        <input aria-label="Phone verification code" autoComplete="one-time-code" inputMode="numeric"
          value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="6-digit code" maxLength={6}
          className="min-w-0 flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white" />
        <button type="button" onClick={() => void run(true)} disabled={busy || code.length !== 6}
          className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs disabled:opacity-50">Confirm code</button>
      </div>}
      {message && <p role="status" className="text-xs text-slate-400">{message}</p>}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>
  );
};
