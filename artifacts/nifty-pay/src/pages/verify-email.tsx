import { useState, useEffect, type FormEvent } from 'react';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/auth';
import { MailCheck, RefreshCw } from 'lucide-react';

import { API_BASE as API } from '@/lib/api';

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const { setAuth } = useAuth();

  // Email + optional dev-mode code are passed via sessionStorage
  const [email, setEmailState] = useState<string>(() => sessionStorage.getItem('pendingVerifyEmail') ?? '');
  const [devCode, setDevCode] = useState<string>(() => sessionStorage.getItem('pendingDevCode') ?? '');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // If no email in storage, redirect to signup
  useEffect(() => {
    if (!email) setLocation('/signup');
  }, [email, setLocation]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code)) { setError('Please enter the 6-digit code'); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? 'Verification failed. Please try again.'); return; }
      // Verified — we get back a token, log the user in
      sessionStorage.removeItem('pendingVerifyEmail');
      sessionStorage.removeItem('pendingDevCode');
      setAuth(data.token, data.user);
      setLocation('/');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setSuccess('');
    setResending(true);
    try {
      const r = await fetch(`${API}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? 'Could not resend code. Please try again.'); return; }
      setSuccess('A new code has been sent to your email.');
      if (data.devCode) {
        setDevCode(data.devCode);
        sessionStorage.setItem('pendingDevCode', data.devCode);
      }
      setCode('');
      setCooldown(60);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm space-y-8">
        {/* Icon + heading */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <MailCheck className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
            <p className="text-sm text-muted-foreground mt-1">
              We sent a 6-digit code to<br />
              <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>
        </div>

        {/* Dev-mode banner */}
        {devCode && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center space-y-1">
            <p className="text-xs font-semibold text-amber-500 uppercase tracking-wide">Dev mode — email not sent</p>
            <p className="text-xs text-muted-foreground">Twilio isn't configured. Use this code:</p>
            <p className="text-3xl font-mono font-bold tracking-[0.3em] text-amber-400">{devCode}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 bg-card border border-border rounded-2xl p-6 shadow-sm">
          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              {success}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-2xl tracking-[0.5em] font-mono h-14"
              autoFocus
            />
            <p className="text-xs text-muted-foreground text-center">
              Enter the 6-digit code from your email. It expires in 15 minutes.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
            {loading ? 'Verifying…' : 'Verify Email'}
          </Button>

          <div className="flex flex-col items-center gap-2 pt-1">
            <p className="text-sm text-muted-foreground">Didn't receive it?</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResend}
              disabled={resending || cooldown > 0}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
              {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? 'Sending…' : 'Resend code'}
            </Button>
          </div>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Wrong email?{' '}
          <Link href="/signup" onClick={() => sessionStorage.removeItem('pendingVerifyEmail')}
            className="text-primary font-medium hover:underline">
            Sign up again
          </Link>
        </p>
      </div>
    </div>
  );
}
