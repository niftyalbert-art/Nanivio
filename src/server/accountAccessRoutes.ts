import type { Express, Request } from 'express';

type AccountAccessDependencies = {
  getUser: (request: Request) => Promise<{ id: string } | null>;
  deactivate: (userId: string) => Promise<void>;
};

/** Deactivation is deliberately distinct from erasing an account and its data. */
export function registerAccountAccessRoutes(app: Express, dependencies: AccountAccessDependencies) {
  app.post('/api/auth/account/deactivate', async (req, res) => {
    try {
      const user = await dependencies.getUser(req);
      if (!user) return res.status(401).json({ success: false, error: 'Unauthorized session.' });
      if (req.body?.confirmation !== 'DEACTIVATE' ||
        (req.body.reason !== undefined && (typeof req.body.reason !== 'string' || req.body.reason.length > 500))) {
        return res.status(400).json({
          success: false, error: 'Confirm account deactivation. This operation does not erase your data.',
        });
      }
      // Identity always comes from the authenticated session, never the body.
      await dependencies.deactivate(user.id);
      return res.json({
        success: true, action: 'DEACTIVATED', dataDeleted: false,
        message: 'Your account has been deactivated. Your data has not been erased.',
      });
    } catch {
      return res.status(503).json({
        success: false, error: 'Account deactivation could not be confirmed. Please try again.',
      });
    }
  });

  // Older clients must not mistake deactivation for permanent data deletion.
  app.post('/api/auth/account/delete', async (req, res) => {
    try {
      const user = await dependencies.getUser(req);
      if (!user) return res.status(401).json({ success: false, error: 'Unauthorized session.' });
      return res.status(409).json({
        success: false, code: 'ACCOUNT_DELETION_UNAVAILABLE',
        error: 'Permanent account deletion is not available. Account deactivation in Settings is a separate action and does not erase your data.',
      });
    } catch {
      return res.status(503).json({ success: false, error: 'Account status could not be confirmed. Please try again.' });
    }
  });
}
