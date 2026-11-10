import type { Express, Request } from 'express';
import { DeletionRequestError, type DeletionRequests } from './accountDeletionRequests';

export function registerAccountDeletionRoutes(app: Express, dependencies: {
  requests: DeletionRequests;
  getUser: (req: Request) => Promise<{ id: string } | null>;
}) {
  const fail = (res: any, error: unknown) => res.status(
    error instanceof DeletionRequestError ? error.status : 503,
  ).json({ success: false, error: error instanceof DeletionRequestError ? error.message
    : 'Your deletion request could not be confirmed. Please try again later.' });
  // Public intake requires fresh proof sent only to the stored account email.
  // A stolen browser session alone cannot submit a deletion request.
  app.post('/api/account-deletion/challenge', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Enter a valid account email address.' });
    }
    try {
      const challengeId = await dependencies.requests.challenge(email, req.ip || req.socket.remoteAddress || 'unknown');
      return res.json({ success: true, challengeId,
        message: 'If this email belongs to a Nanivio account, a verification code will be sent. Check your spam folder too.' });
    } catch (error) { return fail(res, error); }
  });
  app.post('/api/account-deletion/requests', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const { challengeId, code, confirmation } = req.body || {};
    if (typeof challengeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(challengeId) ||
      typeof code !== 'string' || !/^\d{6}$/.test(code) || confirmation !== 'DELETE') {
      return res.status(400).json({ success: false, error: 'Enter the email code and type DELETE to confirm your request.' });
    }
    try {
      const request = await dependencies.requests.confirm(challengeId, code);
      return res.status(202).json({ success: true, action: 'DELETION_REQUESTED', dataDeleted: false, request,
        message: 'Your verified deletion request has been saved for review. Your account and data have not been erased by submitting this request.' });
    } catch (error) { return fail(res, error); }
  });
  app.get('/api/account-deletion/request', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const user = await dependencies.getUser(req);
      if (!user) return res.status(401).json({ success: false, error: 'Sign in to view your request.' });
      return res.json({ success: true, request: await dependencies.requests.current(user.id) });
    } catch (error) { return fail(res, error); }
  });
}
