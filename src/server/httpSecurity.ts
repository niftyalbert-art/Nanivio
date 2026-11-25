import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export function timingSafeEqualString(provided: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b) && provided.length === expected.length;
}

type RateLimitOptions = {
  windowMs: number;
  max: number;
  key: (req: Request) => string;
  message?: string;
  now?: () => number;
};

/** Per-process fixed-window limiter. Keys must identify the client (trusted IP and/or identifier). */
export function createRateLimiter(options: RateLimitOptions) {
  const now = options.now || Date.now;
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = now();
  return (req: Request, res: Response, next: NextFunction) => {
    const time = now();
    if (time - lastSweep > options.windowMs) {
      for (const [key, bucket] of buckets) if (bucket.resetAt <= time) buckets.delete(key);
      lastSweep = time;
    }
    const key = options.key(req) || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= time) {
      bucket = { count: 0, resetAt: time + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - time) / 1000))));
      return res.status(429).json({
        success: false,
        error: options.message || 'Too many requests. Please wait and try again.',
        code: 'RATE_LIMITED',
      });
    }
    next();
  };
}

export function securityHeaders(production: boolean) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), payment=(self)');
    if (production) {
      // Development stays embeddable for the Replit webview.
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

/** Twilio request validation: HMAC-SHA1 over the full URL plus sorted POST parameters. */
export function twilioSignatureValid(authToken: string, url: string, params: Record<string, unknown>, signature: string): boolean {
  if (!authToken || !url || !signature) return false;
  const data = Object.keys(params || {}).sort().reduce((acc, key) => acc + key + String(params[key] ?? ''), url);
  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
  return timingSafeEqualString(signature, expected);
}

/** Browsers always send Origin on WebSocket upgrades; reject cross-site pages. */
export function websocketOriginAllowed(origin: string | undefined, host: string | undefined, publicAppUrl?: string): boolean {
  if (!origin) return true;
  let originHost: string;
  try { originHost = new URL(origin).host.toLowerCase(); } catch { return false; }
  if (host && originHost === host.toLowerCase()) return true;
  if (publicAppUrl) {
    try { if (originHost === new URL(publicAppUrl).host.toLowerCase()) return true; } catch { /* ignore invalid config */ }
  }
  return false;
}
