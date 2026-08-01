import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, ArrowLeft } from 'lucide-react';
import { PinInput } from '@/components/pin-input';

const API = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api';

export default function ResetPassword() {
  const [, setLocation] = useLocation();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (pin.length !== 4) { setError('PIN must be exactly 4 digits'); return; }
    if (pin !== confirmPin) { setError('PINs do not match'); return; }

    setLoading(true);
    try {
      const r = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, pin }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? 'Reset failed'); return; }
      setDone(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Nanivio"
            className="w-16 h-16 rounded-2xl object-cover shadow-lg"
          />
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Reset PIN</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Enter the code you received and choose a new PIN</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          {done ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <div>
                <p className="font-semibold">PIN updated!</p>
                <p className="text-sm text-muted-foreground mt-1">You can now sign in with your new PIN.</p>
              </div>
              <Button className="w-full mt-2" onClick={() => setLocation('/login')}>Sign In</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="otp">6-Digit Reset Code</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  required
                  className="text-center tracking-widest text-xl font-mono"
                />
              </div>
              <div className="space-y-3">
                <Label>New 4-Digit PIN</Label>
                <PinInput value={pin} onChange={setPin} disabled={loading} />
              </div>
              <div className="space-y-3">
                <Label>Confirm New PIN</Label>
                <PinInput value={confirmPin} onChange={setConfirmPin} disabled={loading} />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loading || pin.length !== 4 || confirmPin.length !== 4}
              >
                {loading ? 'Updating…' : 'Update PIN'}
              </Button>
            </form>
          )}
        </div>

        <Link href="/login" className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
        </Link>
      </div>
    </div>
  );
}
