import { Router, type RequestHandler } from 'express';
import { phoneVerificationDiagnostics, type PhoneVerificationDiagnosticStore } from './phoneVerificationDiagnostics';

export function createPhoneVerificationAdminRouter(
  requireAdmin: RequestHandler,
  diagnostics: PhoneVerificationDiagnosticStore = phoneVerificationDiagnostics,
): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  });
  router.get('/diagnostics', requireAdmin, (_req, res) => {
    res.json({ success: true, diagnostics: diagnostics.snapshot() });
  });
  return router;
}
