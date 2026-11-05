import { Router } from 'express';
import {
  BALANCED_PACKS, BALANCED_PLANS, SUBSCRIPTION_PRICING_VERSION,
  estimatePlanContribution, pricingPurchaseSnapshot, pricingReleaseBlockers,
  type PricingReleaseRequirement,
} from '../lib/subscriptionPricing.ts';
import { billingAdminActor } from './billingAccess.ts';

/**
 * Deliberately no save/publish/charge endpoint. A draft can be inspected without
 * making any of its unintegrated allowances purchasable.
 *
 * An isolated ledger test is not end-to-end fulfilment evidence. Do not change
 * these to true merely because that ledger test passes.
 */
export const balancedPricingIntegrationEvidence: Partial<Record<PricingReleaseRequirement, boolean>> = {};

export function balancedPricingProposal() {
  const blockers = pricingReleaseBlockers(balancedPricingIntegrationEvidence);
  return {
    success: true,
    version: SUBSCRIPTION_PRICING_VERSION,
    status: 'DRAFT' as const,
    purchasable: false as const,
    publishBlocked: true as const,
    blockers,
    plans: BALANCED_PLANS.map(plan => ({
      ...plan,
      limits: { ...plan.limits },
      estimate: estimatePlanContribution(plan),
      monthlyPurchase: pricingPurchaseSnapshot(plan.id),
      annualPurchase: pricingPurchaseSnapshot(plan.id, 'ANNUAL'),
    })),
    packs: BALANCED_PACKS.map(pack => ({ ...pack, limits: { ...pack.limits }, purchase: pricingPurchaseSnapshot(pack.id) })),
    assumptions: {
      currency: 'USD', fxPolicy: 'Use a current server-side checkout quote, never a fixed invented GHS rate.',
      voiceProvider: 'Gemini cost assumption; selected production provider has not been verified.',
      voiceSignature: 'Do not change the approved Malvi voice to meet this cost model.',
      contingencyPercent: 15, paymentFeePercent: 1.95,
      excludedCosts: 'Shared hosting, support, taxes, additional egress and unmodeled provider usage.',
      annualPolicy: 'Twelve monthly allocations, not one allowance for the whole annual term.',
      languagePolicy: 'Standard-equivalent units; actual route billing units must be measured and disclosed.',
      existingPurchases: 'Preserve existing paid terms, allowance snapshots and consumed trial usage.',
      paymentMethods: ['PAYSTACK', 'TRON_USDT', 'NANIVIO_CREDIT'],
      ordinaryChat: 'Ordinary chat and untranslated voice notes stay free.',
      receivingCalls: 'Receiving ordinary calls does not require a subscription.',
      businessPolicy: 'Pool allowances across the workspace; never multiply by seats.',
      packs: 'New packs expire 30 days after purchase; existing packs are unchanged.',
    },
  };
}
export function createBalancedPricingRouter() {
  const router = Router();
  router.get('/', (req, res) => {
    try {
      const actor = billingAdminActor(req);
      if (!['SUPER_ADMIN','FINANCE_ADMIN'].includes(actor.adminRole)) {
        return res.status(403).json({ success: false, error: 'A finance or super administrator is required.' });
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.json(balancedPricingProposal());
    } catch {
      return res.status(403).json({ success: false, error: 'An authenticated billing administrator is required.' });
    }
  });
  return router;
}
