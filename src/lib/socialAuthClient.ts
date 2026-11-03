import { createClient } from '@supabase/supabase-js';
import { authClient } from './authClient';

export type SocialProvider = 'google' | 'apple';
const PENDING = 'nanivio_social_signup';
const PROVIDER = 'nanivio_social_provider';
let exchange: Promise<any> | null = null;

async function configuration() {
  const response = await fetch('/api/auth/social/config', { cache: 'no-store' });
  const config = await response.json();
  if (!response.ok) throw new Error(config.error || 'Social sign-in is unavailable.');
  return config;
}
function client(config: {url: string; publicKey: string}) {
  return createClient(config.url, config.publicKey, { auth: {
    flowType: 'pkce', storage: sessionStorage, storageKey: 'nanivio-social-pkce',
    detectSessionInUrl: false, autoRefreshToken: false, persistSession: true,
  } });
}
export async function startSocialSignIn(provider: SocialProvider) {
  const config = await configuration();
  if (!config[provider]) throw new Error(`${provider === 'google' ? 'Google' : 'Apple'} sign-in has not been enabled yet. Please use email and password for now.`);
  sessionStorage.removeItem(PENDING);
  sessionStorage.setItem(PROVIDER, provider);
  const { data, error } = await client(config).auth.signInWithOAuth({
    provider, options: { redirectTo: `${window.location.origin}/auth/callback`, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw new Error('Unable to open social sign-in. Please try again.');
  window.location.assign(data.url);
}

export function finishSocialSignIn(code: string) {
  // StrictMode remounts may observe the same callback; redeem its code once.
  if (!exchange) exchange = (async () => {
    const config = await configuration();
    const provider = sessionStorage.getItem(PROVIDER);
    if (provider !== 'google' && provider !== 'apple') throw new Error('Start social sign-in again from this browser tab.');
    const db = client(config);
    const { data, error } = await db.auth.exchangeCodeForSession(code);
    if (error || !data.session) throw new Error('Social sign-in expired or was cancelled. Please try again.');
    const token = data.session.access_token;
    const response = await fetch('/api/auth/social/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: token, provider }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Social sign-in could not be completed.');
    if (result.needsRegistration) sessionStorage.setItem(PENDING, JSON.stringify({ token, provider, email: result.email }));
    else {
      authClient.setToken(result.token);
      authClient.setStoredUser(result.user);
      clearSocialSignup();
    }
    // Remove temporary provider tokens from the PKCE client after exchange.
    sessionStorage.removeItem('nanivio-social-pkce');
    sessionStorage.removeItem(PROVIDER);
    return result;
  })();
  return exchange;
}

export function socialSignupHeaders(email?: string): Record<string, string> {
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING) || 'null');
    return pending?.token && (!email || pending.email?.toLowerCase() === email.trim().toLowerCase()) && ['google','apple'].includes(pending.provider)
      ? { 'x-nanivio-social-token': pending.token, 'x-nanivio-social-provider': pending.provider } : {};
  } catch { return {}; }
}
export function clearSocialSignup() {
  try { sessionStorage.removeItem(PENDING); } catch { /* Storage may be disabled. */ }
}
