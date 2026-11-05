export type CryptoCheckoutAccess = {
  allowed: boolean;
  mode: 'test' | 'public' | 'closed';
  reason?: string;
};

// The owner approved a public rollout. Optional test mode must be explicit.
// Never take identity or rollout mode from request parameters or browser storage.
export function cryptoCheckoutAccess(
  authenticatedUserId: string,
  environment: Record<string, string | undefined> = process.env,
): CryptoCheckoutAccess {
  const mode = (environment.TRON_USDT_ACCESS_MODE ?? 'public').trim().toLowerCase();
  if (mode !== 'test' && mode !== 'public') {
    return { allowed: false, mode: 'closed', reason: 'USDT checkout access is not configured. Paystack remains available.' };
  }
  if (!authenticatedUserId?.trim()) {
    return { allowed: false, mode, reason: 'An authenticated account is required.' };
  }
  if (mode === 'public') return { allowed: true, mode };
  const users = new Set((environment.TRON_USDT_TEST_USER_IDS || '')
    .split(/[,\n]/).map(value => value.trim()).filter(Boolean));
  return users.has(authenticatedUserId)
    ? { allowed: true, mode }
    : { allowed: false, mode, reason: 'USDT checkout is currently restricted to approved test accounts. Paystack remains available.' };
}
