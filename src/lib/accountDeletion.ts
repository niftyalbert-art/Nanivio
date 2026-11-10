import { authClient } from './authClient';

export type DeletionRequestReceipt = { id: string; status: string; requestedAt: string };
export async function deletionRequestApi(
  path: 'challenge' | 'requests' | 'request', body?: object, fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(`/api/account-deletion/${path}`, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin',
    // Preserve the released application's bearer-session contract. Public
    // email proof endpoints never need or receive this session credential.
    headers: body ? { 'Content-Type': 'application/json' }
      : path === 'request' && authClient.getToken()
        ? { Authorization: `Bearer ${authClient.getToken()}` } : undefined,
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
  });
  let result: any;
  try { result = await response.json(); } catch { throw new Error('Your request could not be confirmed. Please try again.'); }
  if (!response.ok || result?.success !== true) {
    throw new Error(typeof result?.error === 'string' ? result.error : 'Your request could not be confirmed. Please try again.');
  }
  if (path === 'challenge' && typeof result.challengeId !== 'string') throw new Error('Verification could not be started.');
  const receiptValid = (value: any) => value && typeof value.id === 'string' &&
    ['pending_review', 'processing', 'needs_attention', 'completed'].includes(value.status) &&
    typeof value.requestedAt === 'string' && Number.isFinite(Date.parse(value.requestedAt));
  if (path === 'requests' && (result.action !== 'DELETION_REQUESTED' || result.dataDeleted !== false ||
    !receiptValid(result.request))) throw new Error('Your deletion request could not be confirmed.');
  if (path === 'request' && result.request !== null && !receiptValid(result.request)) {
    throw new Error('Your saved request status could not be confirmed.');
  }
  return result;
}
