import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, MailCheck, ShieldCheck } from 'lucide-react';
import { NanivioLogo } from '../common/NanivioLogo';
import {
  completePasswordReset,
  initializePasswordRecovery,
  requestPasswordReset,
} from '../../lib/passwordRecovery';
import './nanivio-auth-luxury.css';

type PageState = 'checking' | 'reset' | 'request' | 'sent' | 'success';

const fieldClassName =
  'w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400/70 focus:ring-1 focus:ring-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-60';

export const PasswordResetPage: React.FC = () => {
  const [pageState, setPageState] = useState<PageState>('checking');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [requestError, setRequestError] = useState('');
  const mounted = useRef(false);
  const submitting = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    void initializePasswordRecovery()
      .then(({ ready }) => {
        if (!cancelled) {
          setPageState(ready ? 'reset' : 'request');
          if (!ready) {
            setErrorMessage('There is no active recovery link in this browser. Request a fresh link to continue.');
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPageState('request');
          setErrorMessage('This recovery link is missing, invalid, or has expired. Request a fresh link to continue.');
        }
      });

    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, []);

  const handleReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    setErrorMessage('');

    if (password.length < 8 || password.length > 128) {
      setErrorMessage('Choose a password between 8 and 128 characters.');
      return;
    }
    if (password !== confirmation) {
      setErrorMessage('Those passwords do not match. Check both fields and try again.');
      return;
    }

    submitting.current = true;
    setPending(true);
    try {
      await completePasswordReset(password);
      if (mounted.current) setPageState('success');
    } catch {
      if (mounted.current) {
        setPassword('');
        setConfirmation('');
        setPageState('request');
        setErrorMessage('We couldn’t confirm this recovery link. It may have expired or already been used. Request a fresh link to continue.');
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  };

  const handleRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const cleanIdentifier = identifier.trim();
    setRequestError('');
    setErrorMessage('');
    if (!cleanIdentifier) {
      setRequestError('Enter the email, phone number, or NV ID linked to your account.');
      return;
    }

    submitting.current = true;
    setPending(true);
    try {
      await requestPasswordReset(cleanIdentifier);
      if (mounted.current) setPageState('sent');
    } catch {
      if (mounted.current) {
        setRequestError('We couldn’t process that request right now. Please try again in a moment.');
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  };

  const returnToRequest = () => {
    if (pending) return;
    setErrorMessage('');
    setRequestError('');
    setPageState('request');
  };

  return (
    <main className="nanivio-auth auth-luxury min-h-[100dvh] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-x-hidden overflow-y-auto selection:bg-emerald-200 selection:text-emerald-900">
      <div className="auth-top-rule" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-xl mx-auto">
        <header className="auth-brand w-full max-w-xl mx-auto text-center z-10">
          <a href="/" aria-label="Nanivio home" className="auth-wordmark pt-1 flex justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
            <NanivioLogo size="lg" className="auth-official-logo" />
          </a>
          <p className="auth-tagline">Secure account recovery</p>
        </header>

        <section style={{ backdropFilter: 'none' }} className="auth-panel w-full mx-auto bg-white border rounded-[28px] p-5 sm:p-8 z-10 space-y-6">
            {pageState === 'checking' && (
              <div role="status" aria-live="polite" className="auth-panel-heading py-8">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-cyan-300">
                  <LockKeyhole className="h-6 w-6" aria-hidden="true" />
                </div>
                <span className="auth-overline">ACCOUNT RECOVERY</span>
                <h1>Checking your recovery link</h1>
                <p>One moment while we verify it securely.</p>
                <div className="mx-auto mt-7 h-1.5 w-44 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-emerald-400" />
                </div>
              </div>
            )}

            {pageState === 'reset' && (
              <>
                <div className="auth-panel-heading">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-cyan-300">
                    <LockKeyhole className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span className="auth-overline">ACCOUNT RECOVERY</span>
                  <h1>Choose a new password</h1>
                  <p>Keep your Nanivio account secure and pick up your conversations where you left off.</p>
                </div>

                {errorMessage && (
                  <div role="alert" className="mb-5 rounded-2xl border border-red-500/50 bg-red-950/60 p-3.5 text-xs leading-5 text-red-200">
                    <p>{errorMessage}</p>
                    {errorMessage.includes('expired') && (
                      <button
                        type="button"
                        onClick={returnToRequest}
                        className="mt-2 inline-flex items-center gap-1.5 text-emerald-400 underline underline-offset-4 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                      >
                        Request a fresh link <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}

                <form onSubmit={handleReset} className="space-y-5">
                  <div>
                    <label htmlFor="new-password" className="text-xs font-semibold text-slate-300">
                      New password
                    </label>
                    <div className="relative">
                      <input
                        id="new-password"
                        name="new-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        aria-describedby="password-guidance"
                        disabled={pending}
                        className={`${fieldClassName} mt-1 pr-12`}
                        placeholder="At least 8 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        aria-label={showPassword ? 'Hide new password' : 'Show new password'}
                        aria-pressed={showPassword}
                        disabled={pending}
                        className="absolute inset-y-0 right-2 my-auto flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                      </button>
                    </div>
                    <p id="password-guidance" className="mt-2 text-xs leading-5 text-slate-400">
                      Use 8–128 characters.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="confirm-password" className="text-xs font-semibold text-slate-300">
                      Confirm new password
                    </label>
                    <div className="relative">
                      <input
                        id="confirm-password"
                        name="confirm-password"
                        type={showConfirmation ? 'text' : 'password'}
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        required
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                        aria-invalid={!!confirmation && confirmation !== password}
                        aria-describedby={confirmation && confirmation !== password ? 'confirmation-guidance' : undefined}
                        disabled={pending}
                        className={`${fieldClassName} mt-1 pr-12`}
                        placeholder="Enter it again"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmation((visible) => !visible)}
                        aria-label={showConfirmation ? 'Hide confirmation password' : 'Show confirmation password'}
                        aria-pressed={showConfirmation}
                        disabled={pending}
                        className="absolute inset-y-0 right-2 my-auto flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50"
                      >
                        {showConfirmation ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                      </button>
                    </div>
                    {!!confirmation && confirmation !== password && (
                      <p id="confirmation-guidance" className="mt-2 text-xs leading-5 text-amber-200">
                        Passwords do not match yet.
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={pending || password.length < 8 || password.length > 128 || password !== confirmation}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {pending ? 'Updating password…' : 'Save new password'}
                    {!pending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </form>
              </>
            )}

            {(pageState === 'request' || pageState === 'sent') && (
              <>
                <div className="auth-panel-heading">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-cyan-300">
                    <MailCheck className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span className="auth-overline">ACCOUNT RECOVERY</span>
                  <h1>{pageState === 'sent' ? 'Check your email' : 'Get back into Nanivio'}</h1>
                  <p>
                    {pageState === 'sent'
                      ? 'If an account matches those details, we’ll send instructions to its recovery email.'
                      : 'Request a secure recovery link. Your conversations remain tied to your account.'}
                  </p>
                </div>

                {errorMessage && (
                  <div role="alert" className="mb-5 rounded-2xl border border-red-500/50 bg-red-950/60 p-3.5 text-xs leading-5 text-red-200">
                    {errorMessage}
                  </div>
                )}

                {pageState === 'sent' && (
                  <div role="status" aria-live="polite" className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-4 py-3.5 text-sm leading-6 text-emerald-200">
                    <p className="font-semibold text-emerald-100">Recovery request received</p>
                    <p className="mt-1 text-slate-300">
                      Open the link from the same browser where you requested it. For your security, this page won’t reset your password until you open a fresh link.
                    </p>
                  </div>
                )}

                {requestError && (
                  <div role="alert" className="mb-5 rounded-2xl border border-red-500/50 bg-red-950/60 p-3.5 text-xs leading-5 text-red-200">
                    {requestError}
                  </div>
                )}

                <form onSubmit={handleRequest} className="space-y-5">
                  <div>
                    <label htmlFor="recovery-identifier" className="text-xs font-semibold text-slate-300">
                      Email, phone number, or NV ID
                    </label>
                    <input
                      id="recovery-identifier"
                      name="identifier"
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                      disabled={pending}
                      className={`${fieldClassName} mt-1`}
                      placeholder="Enter your account details"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={pending || !identifier.trim()}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {pending ? 'Sending request…' : pageState === 'sent' ? 'Send another recovery link' : 'Send recovery link'}
                    {!pending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </form>

                <p className="mt-6 border-t border-slate-700 pt-5 text-xs leading-5 text-slate-400">
                  We’ll respond the same way whether or not an account matches, to help keep accounts private.
                </p>
              </>
            )}

            {pageState === 'success' && (
              <div className="auth-panel-heading py-3">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-950/40 text-emerald-200">
                  <Check className="h-7 w-7" aria-hidden="true" />
                </div>
                <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Password updated
                </p>
                <h1>You’re back in control</h1>
                <p role="status" className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-300">
                  Your password has been changed. Sign in again with your new password to return to Nanivio.
                </p>
                <a
                  href="/"
                  className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-cyan-200/70 bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/25"
                >
                  Go to sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            )}
        </section>

        <footer className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 text-cyan-300" aria-hidden="true" />
          <span>Private recovery. Your conversations stay yours.</span>
        </footer>

        {pageState === 'request' && (
          <a
            href="/"
            className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-300 transition hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to sign in
          </a>
        )}
      </div>
    </main>
  );
};
