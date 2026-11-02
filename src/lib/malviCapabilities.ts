import type { MalviSubscriptionTier } from '../types/billing';
export type MalviCapability = 'conversation' | 'voice' | 'avatar' | 'memory' | 'research' | 'multimodal' | 'business';
export const MALVI_CAPABILITIES: Record<MalviSubscriptionTier, readonly MalviCapability[]> = {
  free: ['conversation', 'voice', 'avatar'],
  malvi_voice: ['conversation', 'voice'],
  malvi_basic: ['conversation', 'voice', 'avatar'],
  malvi_premium: ['conversation', 'voice', 'avatar', 'memory', 'research', 'multimodal'],
  malvi_business: ['conversation', 'voice', 'avatar', 'memory', 'research', 'multimodal', 'business'],
};
export const MALVI_CAPABILITY_LABELS: Record<MalviCapability, string> = {
  conversation: 'Text conversation and translation assistance', voice: 'Voice conversations',
  avatar: 'Live avatar', memory: 'Personalized conversation memory',
  research: 'Public web and media research', multimodal: 'Camera, images, audio, video and documents',
  business: 'Shared Business workspaces and meetings',
};
/** UI hint only; the server rechecks the purchased rights before every action. */
export function subscriptionHasCapability(subscription: {
  tier: string; status: string; currentPeriodStart?: number; currentPeriodEnd?: number;
  purchasedCapabilities?: readonly string[] | null;
} | null | undefined, capability: MalviCapability) {
  if (!subscription || !['ACTIVE', 'TRIAL'].includes(subscription.status)
    || (subscription.currentPeriodStart !== undefined && subscription.currentPeriodStart > Date.now())
    || (subscription.currentPeriodEnd !== undefined && subscription.currentPeriodEnd <= Date.now())) return false;
  if (Array.isArray(subscription.purchasedCapabilities)) return subscription.purchasedCapabilities.includes(capability);
  return Object.hasOwn(MALVI_CAPABILITIES, subscription.tier)
    && MALVI_CAPABILITIES[subscription.tier as MalviSubscriptionTier].includes(capability);
}
