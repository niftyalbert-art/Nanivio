import type { Express } from 'express';
import { createClient, type User } from '@supabase/supabase-js';
import { userFromToken } from './persistentAuth';

export function assertSocialIdentity(user: User | null, provider: string) {
  if (!['google', 'apple'].includes(provider) || !user?.email || !user.email_confirmed_at ||
      !user.identities?.some(identity => identity.provider === provider)) {
    throw new Error('Your Google or Apple identity could not be verified. Please sign in again.');
  }
  return user;
}

export async function verifiedSocialIdentity(token: string, provider: string) {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error) throw new Error('Your social sign-in has expired. Please sign in again.');
  return assertSocialIdentity(data.user, provider);
}

export async function socialConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Social sign-in is not configured yet. Please use email and password.');
  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, {
    headers: { apikey: key }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Social sign-in settings are temporarily unavailable. Please use email and password.');
  const settings = await response.json();
  // The anon key is Supabase's public browser key, never the service-role key.
  return { url, publicKey: key, google: settings.external?.google === true, apple: settings.external?.apple === true };
}

export async function completeSocial(token: string, provider: string, deps = {
  verify: verifiedSocialIdentity, profile: userFromToken,
}) {
  const identity = await deps.verify(token, provider);
  const user = await deps.profile(token);
  if (!user) return { needsRegistration: true as const, email: identity.email! };
  if (user.accountStatus !== 'ACTIVE') throw new Error('This account is not active. Please contact Nanivio support.');
  return { needsRegistration: false as const, user, token };
}

export function registerSocialAuthRoutes(app: Express, deps = { config: socialConfig, complete: completeSocial }) {
  app.get('/api/auth/social/config', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(await deps.config()); }
    catch { res.status(503).json({ error: 'Social sign-in is temporarily unavailable. Please use email and password.' }); }
  });
  app.post('/api/auth/social/complete', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const { accessToken, provider } = req.body || {};
    if (typeof accessToken !== 'string' || accessToken.length > 16000 || !['google', 'apple'].includes(provider)) {
      return res.status(400).json({ error: 'Choose Google or Apple and sign in again.' });
    }
    try { res.json(await deps.complete(accessToken, provider)); }
    catch { res.status(401).json({ error: 'Social sign-in could not be completed. Check your account status or try again.' }); }
  });
}
