import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/auth';
import { PinInput } from '@/components/pin-input';

const API = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api';

export default function SignUp() {
  const [, setLocation] = useLocation();
  const { setAuth } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (pin.length !== 4) { setError('PIN must be exactly 4 digits'); return; }
    if (pin !== confirmPin) { setError('PINs do not match'); return; }

    setLoading(true);
    try {
      const r = await fetch(`${API}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: phone.trim() || undefined, pin }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? 'Sign up failed'); return; }
      setAuth(data.token, data.user);
      setLocation('/');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Nanivio"
            className="w-16 h-16 rounded-2xl object-cover shadow-lg"
          />
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Send money globally with Nanivio</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6 bg-card border border-border rounded-2xl p-6 shadow-sm">
          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Jane Smith"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              minLength={2}
            />
          </div>

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
            <Label htmlFor="phone">
              Phone Number <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+971501234567"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Others can find you by phone number in chat.</p>
          </div>

          <div className="space-y-3">
            <Label>Choose a 4-Digit PIN</Label>
            <PinInput value={pin} onChange={setPin} disabled={loading} autoFocus={false} />
          </div>

          <div className="space-y-3">
            <Label>Confirm PIN</Label>
            <PinInput value={confirmPin} onChange={setConfirmPin} disabled={loading} autoFocus={false} />
          </div>

          <Button type="submit" className="w-full" disabled={loading || pin.length !== 4 || confirmPin.length !== 4}>
            {loading ? 'Creating account…' : 'Create Account'}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            By signing up you agree to our terms of service.
          </p>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
