import crypto from 'node:crypto';
import type { Express, Request } from 'express';
import { createRecoveryProvider } from './passwordRecoveryProvider';
import { passwordRecoveryStore } from './passwordRecoveryStore';
import { recoveryCookie, clearRecoveryCookie } from './passwordRecoveryCookies';

const MESSAGE = 'If an eligible account matches those details, password reset instructions will be sent to its email. Open the newest link in this same browser.';
const INVALID = 'This recovery link is invalid, expired or already used. Request a new link.';
const id = () => crypto.randomBytes(32).toString('hex');
export function registerPasswordRecoveryRoutes(app: Express, dependencies: {
  find: (identifier: string) => Promise<{ id: string; email: string; accountStatus?: string } | null>;
  store?: typeof passwordRecoveryStore; provider?: () => ReturnType<typeof createRecoveryProvider>; origin?: string;
  clientIp?: (request: Request) => string;
}) {
  const store = dependencies.store || passwordRecoveryStore;
  const provider = dependencies.provider || (() => createRecoveryProvider());
  app.use(['/reset-password', '/api/auth/recovery', '/api/auth/reset-password'], (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (!origin || origin !== `${origin.startsWith('https:') ? 'https' : 'http'}://${req.headers.host}` ||
        req.headers['sec-fetch-site'] === 'cross-site') {
        return res.status(403).json({ success: false, error: 'Open Nanivio and try again from the same site.' });
      }
    }
    next();
  });
  function redirect(req: Request) {
    const configured = dependencies.origin || process.env.PUBLIC_APP_URL;
    const origin = configured ? new URL(configured) : null;
    if (!origin || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      (origin.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(origin.hostname))) throw Error('Recovery return URL is not configured.');
    if (req.headers.origin !== origin.origin) throw Error('Request recovery from Nanivio’s configured official site.');
    return origin.origin + '/reset-password';
  }
  app.post('/api/auth/recovery', async (req, res) => {
    const identifier = req.body?.identifier;
    if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 254) {
      return res.status(400).json({ success: false, error: 'Enter your registered email, phone number or NV ID.' });
    }
    try {
      const redirectTo = redirect(req), delivery = provider();
      await store.ready();
      const secret = process.env.SESSION_SECRET;
      if (!secret) throw Error('Security unavailable');
      const user = await dependencies.find(identifier.trim());
      const eligible = user?.accountStatus === 'ACTIVE' ? user : null;
      const nonce = id(), verifier = crypto.randomBytes(48).toString('base64url'), expires = Date.now() + 15 * 60000;
      // Socket IP only; never trust an arbitrary caller's X-Forwarded-For header.
      const ipHash = crypto.createHmac('sha256', secret).update(dependencies.clientIp?.(req) || req.socket.remoteAddress || 'unknown').digest('hex');
      const subjectHash = crypto.createHmac('sha256', secret).update(`recovery:${identifier.trim().toLowerCase()}`).digest('hex');
      if (!(await store.reserve(nonce, eligible?.id || null, ipHash, expires, subjectHash))) {
        return res.status(429).json({ success: false, error: 'Too many recovery attempts. Please try again later.' });
      }
      if (eligible) {
        try { await delivery.send(eligible.email, crypto.createHash('sha256').update(verifier).digest('base64url'), redirectTo); }
        catch { console.warn('[Password recovery] Email acceptance could not be confirmed.'); }
      }
      recoveryCookie(req, res, 'pkce', { id: nonce, verifier, expires });
      clearRecoveryCookie(req, res, 'reset');
      return res.json({ success: true, message: MESSAGE });
    } catch {
      return res.status(503).json({ success: false, error: 'Password recovery is temporarily unavailable. Please try again later.' });
    }
  });
  app.post('/api/auth/recovery/exchange', async (req, res) => {
    const cookie = recoveryCookie(req, res, 'pkce'), code = req.body?.code;
    if (!cookie?.verifier || typeof code !== 'string' || !code || code.length > 2048) {
      return res.status(400).json({ success: false, error: INVALID });
    }
    clearRecoveryCookie(req, res, 'pkce');
    try {
      const owner = await store.consume(cookie.id, 'pkce');
      if (!owner) return res.status(400).json({ success: false, error: INVALID });
      const session = await provider().exchange(code, cookie.verifier);
      if (await store.owner(session.authId) !== owner) return res.status(400).json({ success: false, error: INVALID });
      const nonce = id(), expires = Date.now() + Math.min(session.expiresIn * 1000, 5 * 60000);
      if (expires <= Date.now()) return res.status(400).json({ success: false, error: INVALID });
      await store.resetCapability(nonce, owner, expires);
      recoveryCookie(req, res, 'reset', { id: nonce, owner, authId: session.authId, token: session.token, expires });
      return res.json({ success: true, ready: true });
    } catch { return res.status(400).json({ success: false, error: INVALID }); }
  });
  app.get('/api/auth/recovery/session', async (req, res) => {
    try {
      const cookie = recoveryCookie(req, res, 'reset');
      return res.json({ success: true, ready: !!cookie && await store.valid(cookie.id) });
    } catch { return res.status(503).json({ success: false, error: 'Unable to check recovery. Please request a new link later.' }); }
  });
  app.post('/api/auth/reset-password', async (req, res) => {
    const password = req.body?.newPassword;
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return res.status(400).json({ success: false, error: 'Use a password between 8 and 128 characters.' });
    }
    const cookie = recoveryCookie(req, res, 'reset');
    // Arbitrary app/access tokens, even valid ones, never authorize password reset.
    if (!cookie?.token || !cookie.authId || !cookie.owner) return res.status(400).json({ success: false, error: INVALID });
    clearRecoveryCookie(req, res, 'reset');
    try {
      if (await store.owner(cookie.authId) !== cookie.owner || await store.consume(cookie.id, 'reset') !== cookie.owner) {
        return res.status(400).json({ success: false, error: INVALID });
      }
      const operation = provider();
      await operation.update(cookie.token, password, cookie.authId);
      await operation.revoke(cookie.token);
      return res.json({ success: true, message: 'Password updated. Sign in again with your new password.' });
    } catch {
      // The capability stays consumed: an uncertain password update must not be repeated.
      return res.status(503).json({ success: false, error: 'The reset could not be fully confirmed. Your password may have changed. Try signing in, or request a new recovery link. Do not reuse this link.' });
    }
  });
}
