import type { CommunicationAccess } from './communicationAccess.ts';
import type { LangpretationMeterData, UserSubscriptionState } from '../types/billing';

const nonnegative = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};
const minutes = (seconds: unknown) => Number((nonnegative(seconds) / 60).toFixed(4));

/** Read the same pools RESERVE/COMMIT charge, not the unrelated Malvi usage log. */
export function buildCommunicationMeter(
  userId: string, access: CommunicationAccess, subscription: UserSubscriptionState | null, now = Date.now(), recordedTrialMinutes?: number,
): LangpretationMeterData {
  const values: unknown[] = [access.policy.liveTrialMinutes, access.liveTrialSecondsRemaining, access.textCharactersRemaining,
    ...(access.paid ? [access.translatedSecondsRemaining, subscription?.langpretationMinutesQuota] : [])];
  for (const value of values) {
    if (value == null || (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value))) throw new Error('Communication allowance data is incomplete.');
  }
  const trialRemaining = minutes(access.liveTrialSecondsRemaining);
  const trialUsed = recordedTrialMinutes === undefined
    ? Math.max(0, nonnegative(access.policy.liveTrialMinutes) - trialRemaining) : Number(nonnegative(recordedTrialMinutes).toFixed(4));
  // The current admin default is not an existing user's original grant.
  const trialQuota = trialRemaining + trialUsed;
  const paidQuota = access.paid ? nonnegative(subscription?.langpretationMinutesQuota) : 0;
  const paidRemaining = access.paid ? minutes(access.translatedSecondsRemaining) : 0;
  const used = trialUsed + Math.max(0, paidQuota - paidRemaining);
  const remaining = trialRemaining + paidRemaining;
  return {
    userId, available: true, observedAt: now, usageBasis: 'used-or-reserved',
    remainingAllowance: remaining, monthlyQuota: paidQuota, totalAllowance: trialQuota + paidQuota,
    minutesUsed: Number(used.toFixed(4)),
    trialQuotaMinutes: trialQuota, trialRemainingMinutes: trialRemaining,
    subscriptionQuotaMinutes: paidQuota, subscriptionRemainingMinutes: paidRemaining,
    textCharactersRemaining: nonnegative(access.textCharactersRemaining),
    callMinutesRemaining: access.callSecondsRemaining === null ? null : minutes(access.callSecondsRemaining),
    fallbackEnabled: false,
    // No verified interpreter price comparison or audio/video split exists in this ledger.
    estimatedSavingsGHS: 0, estimatedSavingsUSD: 0, estimatedSavingsAvailable: false,
    channelBreakdownAvailable: false,
    status: remaining > 0 ? (access.paid ? 'ACTIVE' : 'TRIAL') : 'EXHAUSTED',
    currentPeriodStart: access.paid ? nonnegative(subscription?.currentPeriodStart) : 0,
    currentPeriodEnd: access.paid && access.paidUntil ? Date.parse(access.paidUntil) : 0,
    tier: access.paid ? subscription?.tier || 'paid' : 'free',
    planName: access.paid ? subscription?.planName || 'Communication plan'
      : trialRemaining > 0 ? 'Live Langpretation test' : 'Subscription required',
    channelBreakdown: { audioCalls: 0, videoCalls: 0, groupAudioCalls: 0, voiceNotes: 0, textChat: 0 },
  };
}

export function unavailableCommunicationMeter(userId: string): LangpretationMeterData {
  return {
    userId, available: false, observedAt: Date.now(), status: 'UNAVAILABLE',
    remainingAllowance: 0, monthlyQuota: 0, minutesUsed: 0,
    estimatedSavingsGHS: 0, estimatedSavingsUSD: 0, estimatedSavingsAvailable: false,
    currentPeriodStart: 0, currentPeriodEnd: 0, tier: '', planName: 'Allowance unavailable',
    channelBreakdownAvailable: false,
    channelBreakdown: { audioCalls: 0, videoCalls: 0, groupAudioCalls: 0, voiceNotes: 0, textChat: 0 },
  };
}
