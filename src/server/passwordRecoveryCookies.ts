import crypto from 'node:crypto';
import type { Request, Response } from 'express';
export type RecoveryCookie = {
  id: string; expires: number; host?: string; verifier?: string; token?: string; authId?: string; owner?: string;
};
function name(req: Request, purpose: string) {
  return `${['localhost', '127.0.0.1'].includes(req.hostname) ? 'nv_dev_' : '__Host-nanivio_'}recovery_${purpose}`;
}
function options(req: Request) {
  return { httpOnly: true, secure: !['localhost','127.0.0.1'].includes(req.hostname), sameSite: 'lax' as const, path: '/' };
}
function key() {
  if (!process.env.SESSION_SECRET) throw Error('Recovery security is not configured.');
  return crypto.createHash('sha256').update(process.env.SESSION_SECRET).digest();
}
export function recoveryCookie(req: Request, res: Response, purpose: string, value?: RecoveryCookie): RecoveryCookie | null {
  const cookieName = name(req, purpose);
  if (value) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    cipher.setAAD(Buffer.from(cookieName));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify({ ...value, host: req.hostname })), cipher.final()]);
    const sealed = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
    if (sealed.length > 3800) throw Error('Recovery credential exceeds the cookie limit.');
    res.cookie(cookieName, sealed, { ...options(req), maxAge: value.expires - Date.now() });
    return value;
  }
  try {
    const raw = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    if (!raw || raw.length > 3800) return null;
    const bytes = Buffer.from(raw, 'base64url'), decipher = crypto.createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(cookieName)); decipher.setAuthTag(bytes.subarray(12, 28));
    const parsed = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
    return parsed.host === req.hostname && parsed.expires > Date.now() ? parsed : null;
  } catch { return null; }
}
export function clearRecoveryCookie(req: Request, res: Response, purpose: string) {
  res.clearCookie(name(req, purpose), options(req));
}
