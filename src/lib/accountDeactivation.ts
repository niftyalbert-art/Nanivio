/** Require an explicit, truthful acknowledgement before the caller signs out. */
export async function requestAccountDeactivation(
  reason?: string,
  token?: string | null,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher('/api/auth/account/deactivate', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ confirmation: 'DEACTIVATE', reason }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || result?.success !== true || result?.action !== 'DEACTIVATED' ||
    result?.dataDeleted !== false) {
    throw new Error('Account deactivation could not be confirmed. Please try again.');
  }
}
