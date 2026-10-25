import type { Request, RequestHandler } from 'express';
import type { AdminBillingRole } from '../types/billing';

/** Only populate this principal from the existing authentication middleware. */
export interface BillingPrincipal {
  id: string;
  role: string;
  accountStatus: string;
  adminSubRole?: string;
  expertProfileId?: string;
  businessProfileId?: string;
}

type BillingRequest = Request & {
  authUser?: BillingPrincipal;
  billingAdmin?: { adminUser: string; adminRole: AdminBillingRole };
};

const financeRoles: AdminBillingRole[] = ['SUPER_ADMIN', 'FINANCE_ADMIN'];
const mutationRoles: Record<string, AdminBillingRole[]> = {
  '/malvi-costs/save': financeRoles,
  '/malvi-plans/save': financeRoles,
  '/pricing/update-rule': financeRoles,
  '/emergency/update': financeRoles,
  '/refunds/process': financeRoles,
  '/gateways/toggle': financeRoles,
  '/momo/countries/toggle': financeRoles,
  '/momo/accounts': financeRoles,
  '/adjustments/create': [...financeRoles, 'BILLING_ADMIN'],
  '/disputes/resolve': [...financeRoles, 'BILLING_ADMIN', 'SUPPORT_ADMIN'],
};

export function billingRole(user: BillingPrincipal | undefined): AdminBillingRole | null {
  if (!user?.id || user.accountStatus !== 'ACTIVE' || user.role !== 'ADMIN') return null;
  switch (user.adminSubRole) {
    case 'SUPER_ADMIN': return 'SUPER_ADMIN';
    case 'FINTECH_ADMIN':
    case 'FINANCE_ADMIN': return 'FINANCE_ADMIN';
    case 'BILLING_ADMIN': return 'BILLING_ADMIN';
    case 'SUPPORT_ADMIN': return 'SUPPORT_ADMIN';
    case 'AUDITOR': return 'AUDITOR';
    default: return null;
  }
}

export function canManageBilling(user: BillingPrincipal | undefined, method: string, path: string): boolean {
  const role = billingRole(user);
  if (!role) return false;
  if (method === 'GET' || method === 'HEAD') return true;
  const normalizedPath = path.toLowerCase().replace(/\/+$/, '');
  return method === 'POST' && Boolean(mutationRoles[normalizedPath]?.includes(role));
}

export function canRefund(role: AdminBillingRole): boolean {
  return financeRoles.includes(role);
}

/** Mounted after requireAuthenticatedUser on the entire admin billing namespace. */
export const requireBillingAdmin: RequestHandler = (req: BillingRequest, res, next) => {
  if (!req.authUser?.id) {
    res.status(401).json({ success: false, error: 'Authentication required.', code: 'AUTH_REQUIRED' });
    return;
  }
  if (!canManageBilling(req.authUser, req.method, req.path)) {
    res.status(403).json({ success: false, error: 'Billing administrator permission required.', code: 'BILLING_FORBIDDEN' });
    return;
  }
  req.billingAdmin = { adminUser: req.authUser.id, adminRole: billingRole(req.authUser)! };
  next();
};

export function billingAdminActor(req: Request) {
  const actor = (req as BillingRequest).billingAdmin;
  if (!actor) throw new Error('Verified billing administrator is required.');
  return actor;
}

export function ownsBillingRecord(user: BillingPrincipal | undefined, ownerId: string | undefined): boolean {
  return Boolean(user?.id && user.accountStatus === 'ACTIVE' && ownerId === user.id);
}

export function ownsProviderEarnings(user: BillingPrincipal | undefined, providerId: string): boolean {
  return Boolean(user?.id && user.accountStatus === 'ACTIVE' &&
    (providerId === user.id || (user.role === 'EXPERT' && providerId === user.expertProfileId)));
}

export function ownsBusinessBilling(
  user: BillingPrincipal | undefined,
  account: { businessId: string; activeMembers: { userId: string; role: string }[] } | undefined,
): boolean {
  if (!user?.id || user.accountStatus !== 'ACTIVE' || !account) return false;
  return (user.role === 'BUSINESS' && (account.businessId === user.id || account.businessId === user.businessProfileId)) ||
    account.activeMembers.some(member => member.userId === user.id && member.role === 'ADMIN');
}
