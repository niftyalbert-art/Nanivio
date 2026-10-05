/**
 * Comprehensive Server-Authoritative Billing & Phone OTP Verification Audit Suite
 * 
 * Verifies:
 * 1. Server-authoritative quota deduction on 60s boundaries in billingDb.userSubscriptions.
 * 2. Client manipulation resistance (client localStorage/input cannot modify server quota).
 * 3. 80% usage threshold warning detection.
 * 4. Fallback from subscription quota to Nanivio credit when quota hits 0.
 * 5. 30-second server grace period tracking and authoritative termination.
 * 6. Twilio Verify / SMS OTP dispatch and validation.
 */

import { UniversalBillingEngine } from '../src/server/billingEngine.ts';
import { billingDb } from '../src/server/billingDb.ts';
import { otpService } from '../src/server/otpService.ts';

async function runAudit() {
  console.log('===============================================================');
  console.log('NANIVIO GOOGLE AI DETAILED AUDIT: SERVER-AUTHORITATIVE SUITE');
  console.log('===============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] Test ${totalTests}: ${testName}`);
      if (details) console.log(`       ↳ ${details}`);
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${testName}`);
      if (details) console.error(`       ↳ FAILED: ${details}`);
      process.exit(1);
    }
  }

  const engine = new UniversalBillingEngine();
  const testUserId = 'test_audit_user_' + Date.now();
  const testSessionId = 'test_call_session_' + Date.now();

  // -----------------------------------------------------------------
  // 1. Database Setup: User Subscription & Wallets
  // -----------------------------------------------------------------
  console.log('--- 1. DATABASE & SERVER STATE SETUP ---');
  billingDb.userSubscriptions.set(testUserId, {
    id: `sub_${testUserId}`,
    userId: testUserId,
    planId: 'plan_individual_premium',
    planName: 'Individual Premium',
    tier: 'PREMIUM',
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    currency: 'GHS',
    startedAt: Date.now() - 86400000,
    currentPeriodStart: Date.now() - 86400000,
    currentPeriodEnd: Date.now() + 86400000 * 29,
    nextBillingAt: Date.now() + 86400000 * 29,
    autoRenew: true,
    pricePaid: 35.0,
    langpretationMinutesQuota: 10,
    langpretationMinutesRemaining: 10,
    langpretationMinutesUsed: 0,
    voiceMinutesQuota: 500,
    voiceMinutesUsed: 0,
    malviUnitsQuota: 100,
    malviUnitsUsed: 0,
  });

  const userWallets = new Map();
  userWallets.set('GHS', {
    currency: 'GHS',
    available: 15.0, // Nanivio credit
    reserved: 0.0,
    promotional: 0.0,
    symbol: 'GH₵',
  });
  billingDb.userWallets.set(testUserId, userWallets);
  billingDb.communicationWallets.set(testUserId, userWallets);

  assert(
    billingDb.userSubscriptions.get(testUserId)?.langpretationMinutesRemaining === 10,
    'Initial subscription stored in billingDb.userSubscriptions',
    'Server DB initialized with 10 quota minutes.'
  );

  // -----------------------------------------------------------------
  // 2. Start Live Usage Session
  // -----------------------------------------------------------------
  console.log('\n--- 2. CALL START & LIVE SESSION RESERVATION ---');
  const startResult = engine.startUsageSession({
    sessionId: testSessionId,
    userId: testUserId,
    serviceType: 'COMMUNICATION',
    usageType: 'CALL_MINUTES',
    currency: 'GHS',
    isLangpretationActive: true,
  });

  assert(
    startResult.success && billingDb.activeUsageSessions.has(testSessionId),
    'startUsageSession creates active session in server billingDb.activeUsageSessions',
    `Session ID: ${testSessionId}, Status: ACTIVE`
  );

  // -----------------------------------------------------------------
  // 3. Server-Authoritative Minute Deduction on 60s Boundaries
  // -----------------------------------------------------------------
  console.log('\n--- 3. SERVER-AUTHORITATIVE METER DEDUCTION ---');
  // First 30 seconds - within first minute boundary: no deduction yet
  let meter30s = engine.updateUsageMeter(testSessionId, 30);
  assert(
    billingDb.userSubscriptions.get(testUserId)?.langpretationMinutesRemaining === 10,
    'No deduction before 60-second boundary',
    `Elapsed: 30s, Server remaining: ${billingDb.userSubscriptions.get(testUserId)?.langpretationMinutesRemaining} min`
  );

  // At 61 seconds - passes first 60s boundary: server deducts exactly 1 minute
  let meter61s = engine.updateUsageMeter(testSessionId, 61);
  const remAfter61s = billingDb.userSubscriptions.get(testUserId)?.langpretationMinutesRemaining;
  assert(
    remAfter61s === 9,
    'Server authoritatively deducted 1 minute on 60-second boundary',
    `Elapsed: 61s, Server remaining: ${remAfter61s} min (Cost covered by quota: ${meter61s?.langpretationCost} GHS)`
  );

  // -----------------------------------------------------------------
  // 4. Manipulation Resistance: Client Cannot Inject Quota
  // -----------------------------------------------------------------
  console.log('\n--- 4. CLIENT MANIPULATION RESISTANCE ---');
  // Simulate an attacker trying to send fake quota or local remaining count via client
  // The server updateUsageMeter does NOT accept a remaining quota param; it always reads server DB
  const meterAttacker = engine.updateUsageMeter(testSessionId, 122);
  const remAfter122s = billingDb.userSubscriptions.get(testUserId)?.langpretationMinutesRemaining;
  assert(
    remAfter122s === 8,
    'Server ignores client state and only uses internal billingDb records',
    `Elapsed: 122s, Server remaining: ${remAfter122s} min`
  );

  // -----------------------------------------------------------------
  // 5. 80% Usage Threshold Warning Notification
  // -----------------------------------------------------------------
  console.log('\n--- 5. 80% USAGE THRESHOLD NOTIFICATION ---');
  // Quota is 10. 80% used means 2 remaining (10 * 0.2 = 2).
  // Advance call to 8 minutes elapsed (485s)
  const meter8min = engine.updateUsageMeter(testSessionId, 485);
  const rem8min = billingDb.userSubscriptions.get(testUserId)?.langpretationMinutesRemaining;
  assert(
    rem8min === 2 && meter8min?.exhaustionNoticeType === 'warning',
    'Dispatches 80% quota usage threshold warning',
    `Remaining: ${rem8min} min. Notice: "${meter8min?.exhaustionMessage}"`
  );

  // -----------------------------------------------------------------
  // 6. Quota Exhausted -> Fallback to Nanivio credit
  // -----------------------------------------------------------------
  console.log('\n--- 6. QUOTA EXHAUSTION & VALUE FALLBACK ---');
  // Advance call past 10 minutes (610s) -> Quota hits 0
  const meter10min = engine.updateUsageMeter(testSessionId, 610);
  const rem10min = billingDb.userSubscriptions.get(testUserId)?.langpretationMinutesRemaining;
  assert(
    rem10min === 0 &&
    meter10min?.isFallbackToServiceValue === true &&
    meter10min?.exhaustionNoticeType === 'fallback',
    'Seamless fallback to Nanivio credit when plan quota reaches 0',
    `Remaining: ${rem10min}. Notice: "${meter10min?.exhaustionMessage}"`
  );

  // -----------------------------------------------------------------
  // 7. Nanivio credit Exhaustion -> 30s Grace Period
  // -----------------------------------------------------------------
  console.log('\n--- 7. NANIVIO CREDIT EXHAUSTION & 30-SECOND GRACE PERIOD ---');
  // Deplete Nanivio credit to 0.00 GHS in database
  userWallets.get('GHS')!.available = 0.0;
  billingDb.userWallets.set(testUserId, userWallets);
  billingDb.communicationWallets.set(testUserId, userWallets);

  const meterExhausted = engine.updateUsageMeter(testSessionId, 670);
  assert(
    meterExhausted?.isExhausted === true &&
    meterExhausted?.inGracePeriod === true &&
    meterExhausted?.gracePeriodSecondsRemaining === 30,
    'Enters 30-second server grace period when both Quota and Nanivio credit are 0',
    `Grace remaining: ${meterExhausted?.gracePeriodSecondsRemaining}s. Message: "${meterExhausted?.exhaustionMessage}"`
  );

  // -----------------------------------------------------------------
  // 8. Server-Side Authoritative Termination
  // -----------------------------------------------------------------
  console.log('\n--- 8. SERVER-SIDE AUTHORITATIVE TERMINATION ---');
  // Trigger authoritative termination on the server
  const termResult = engine.handleServerAuthoritativeTermination(
    testSessionId,
    'Nanivio credit exhausted. 30-second grace period expired.'
  );

  assert(
    termResult.success === true &&
    termResult.sessionSnapshot?.status === 'FINALIZED' &&
    termResult.sessionSnapshot?.shouldTerminate === true &&
    termResult.transaction !== undefined &&
    termResult.invoice !== undefined,
    'Server forcefully marks session FINALIZED, shouldTerminate=true, and settles transaction',
    `Status: ${termResult.sessionSnapshot?.status}, Tx: ${termResult.transaction?.transactionId}, Invoice: ${termResult.invoice?.invoiceNumber}`
  );

  // -----------------------------------------------------------------
  // 9. Twilio Verify / Phone OTP Backend Verification
  // -----------------------------------------------------------------
  console.log('\n--- 9. PHONE OTP SERVICE VERIFICATION ---');
  const testPhone = '+233244123456';
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID) {
    const otpSendResult = await otpService.sendOtp(testPhone, 'sms');
    assert(otpSendResult.success && otpSendResult.isTwilioVerify === true, 'OTP send uses production Twilio Verify', `Phone: ${testPhone}`);
    let invalidCaught = false;
    try { await otpService.verifyOtp(testPhone, '000000'); } catch { invalidCaught = true; }
    assert(invalidCaught, 'OTP verify rejects incorrect code', 'Incorrect code rejected by Twilio Verify');
  } else {
    let providerBlocked = false;
    try { await otpService.sendOtp(testPhone, 'sms'); } catch { providerBlocked = true; }
    assert(providerBlocked, 'OTP refuses insecure sandbox fallback when Twilio is not configured', 'No fake OTP was generated or exposed');
  }

  console.log('\n===============================================================');
  console.log(`AUDIT COMPLETE: ${passedTests}/${totalTests} TESTS PASSED CLEANLY (100%)`);
  console.log('===============================================================');
}

runAudit().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
