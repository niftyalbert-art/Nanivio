import type { MalviSubscriptionTier } from '../../types/billing';
import { MALVI_CAPABILITIES, type MalviCapability } from '../../lib/malviCapabilities';
export { MALVI_CAPABILITIES, type MalviCapability } from '../../lib/malviCapabilities';
import { ensureMalviEntitlement, getPersistentMalviSubscription } from '../normalizedBillingRepository';
import { AssistantError } from './redisStore';

export function planAllows(tier: string, capability: MalviCapability) {
  return Object.hasOwn(MALVI_CAPABILITIES, tier)
    && MALVI_CAPABILITIES[tier as MalviSubscriptionTier].includes(capability);
}
export async function requireMalviCapability(user: string, capability: MalviCapability) {
  await ensureMalviEntitlement(user);
  const subscription = await getPersistentMalviSubscription(user);
  if (!subscription || !['ACTIVE', 'TRIAL'].includes(subscription.status)
    || subscription.currentPeriodStart > Date.now() || subscription.currentPeriodEnd <= Date.now()) {
    throw new AssistantError(402, 'MALVI_PLAN_REQUIRED', 'An active Malvi plan is required. Open Malvi billing to review access.');
  }
  // Immutable purchased snapshots are captured by the database at activation.
  // Pre-migration subscriptions retain their tier's established benefits.
  const saved = subscription.purchasedCapabilities;
  const allowed = Array.isArray(saved) ? saved.includes(capability) : planAllows(subscription.tier, capability);
  if (!allowed) throw new AssistantError(403, 'MALVI_FEATURE_NOT_INCLUDED', 'This feature needs a higher Malvi plan. Open Malvi billing to compare features.');
  return subscription;
}
