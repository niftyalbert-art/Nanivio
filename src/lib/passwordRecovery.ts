/** Recovery credentials stay in purpose-bound HttpOnly cookies, never app storage. */
export class PasswordRecoveryError extends Error {}

async function call(path: string, body?: object) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!data || !response.ok || data.success === false) {
    throw new PasswordRecoveryError(typeof data?.error === 'string' ? data.error : 'Password recovery is unavailable. Please try again.');
  }
  return data;
}
let recovery: Promise<{ ready: boolean }> | undefined;
export function initializePasswordRecovery(): Promise<{ ready: boolean }> {
  // Redeem once across StrictMode remounts. Remove codes/errors before navigation.
  if (!recovery) {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const invalid = params.has('error') || !!window.location.hash;
    window.history.replaceState({}, '', '/reset-password');
    recovery = invalid
      ? Promise.reject(new Error('This recovery link is invalid or expired. Request a new link below.'))
      : code
        ? call('/api/auth/recovery/exchange', { code }).then(() => ({ ready: true }))
        : call('/api/auth/recovery/session').then(data => ({ ready: data.ready === true }));
  }
  return recovery;
}
export async function requestPasswordReset(identifier: string): Promise<string> {
  const result = await call('/api/auth/recovery', { identifier });
  return result.message;
}
export async function completePasswordReset(newPassword: string): Promise<void> {
  await call('/api/auth/reset-password', { newPassword });
}
