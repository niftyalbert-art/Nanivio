/** Test transactions must never buy real Nanivio benefits, in any environment. */
export function paystackLiveConfigurationError(key: string | undefined): string | null {
  if (!key) return 'Paystack live payments are not configured on this server.';
  if (!key.startsWith('sk_live_')) {
    return 'Paystack is not configured for live payments. An administrator must configure a live secret key. No purchase was activated.';
  }
  return null;
}

/** Apply to both API verification and authenticated charge.success webhooks. */
export function assertLivePaystackPayment(data: any): void {
  if (data?.domain !== 'live') {
    throw new Error('Test-mode or unconfirmed-mode payments cannot activate a purchase. No purchase was activated.');
  }
  if (data.status !== 'success') {
    throw new Error('Payment has not completed successfully. No purchase was activated.');
  }
  if (!Number.isSafeInteger(data.amount) || data.amount <= 0 || !data.currency) {
    throw new Error('Paystack returned invalid payment details. No purchase was activated.');
  }
}
