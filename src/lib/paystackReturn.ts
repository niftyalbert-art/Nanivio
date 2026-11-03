const key = (owner: string) => `nanivio:checkout-return:${owner}`;
export interface PaystackPurchase {
  purpose: 'COMMUNICATION_TOPUP' | 'COMMUNICATION_MINUTES' | 'SUBSCRIPTION' | 'MALVI_SUBSCRIPTION';
  name: string;
  billingCycle: 'MONTHLY' | 'ANNUAL' | null;
  minutes: number | null;
  validityDays: number | null;
  voiceMinutes: number | null;
  videoMinutes: number | null;
  langpretationMinutes: number | null;
}
const validReference = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_.=-]{1,120}$/.test(value);

// A browser hint only, never proof of payment or permission to grant benefits.
export function rememberPaystackReturn(owner: string, reference: string) {
  if (!owner || !validReference(reference)) return;
  try { localStorage.setItem(key(owner), JSON.stringify({ reference, at: Date.now() })); } catch {}
}
export function pendingPaystackReturn(owner: string): string | null {
  if (!owner) return null;
  const params = new URLSearchParams(window.location.search);
  const callback = params.get('reference') || params.get('trxref');
  if (validReference(callback)) return callback;
  try {
    const hint = JSON.parse(localStorage.getItem(key(owner)) || 'null');
    return hint && validReference(hint.reference) && Date.now() - hint.at < 2 * 86400000 ? hint.reference : null;
  } catch { return null; }
}
export function clearPaystackReturn(owner: string, reference: string) {
  try {
    const hint = JSON.parse(localStorage.getItem(key(owner)) || 'null');
    if (hint?.reference === reference) localStorage.removeItem(key(owner));
  } catch {}
  const url = new URL(window.location.href);
  for (const name of ['reference', 'trxref']) if (url.searchParams.get(name) === reference) url.searchParams.delete(name);
  window.history.replaceState(window.history.state, '', url);
}
export function announcePaystackActivation(reference: string) {
  window.dispatchEvent(new CustomEvent('nanivio:payment-activated', { detail: { reference } }));
}
