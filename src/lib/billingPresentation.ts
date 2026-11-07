import type { BillingTransaction, BillingInvoice, BillingDispute } from '../types/billing';
import type { UserBillingSummaryResponse } from './billingClient';

/** A known empty communication wallet is zero; another owner's/missing data is unknown. */
export function communicationCreditBalance(summary: UserBillingSummaryResponse | null | undefined, ownerId: string, currency = 'GHS'): number | undefined {
  if (!summary?.success || summary.userId !== ownerId) return undefined;
  const wallets = summary.accounts?.communicationAccount?.wallets ?? summary.wallets;
  if (!Array.isArray(wallets)) return undefined;
  const wallet = wallets.find(row => row.currency === currency);
  return wallet ? billingNumber(wallet.available) : 0;
}

export function billingNumber(value: unknown): number | undefined {
  if (typeof value === 'string') {
    if (!value.trim() || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return undefined;
    value = Number(value);
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function formatBillingAmount(value: unknown): string {
  const number = billingNumber(value);
  return number === undefined ? 'Unavailable' : number.toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

export function formatBillingMinutes(value: unknown): string {
  const number = billingNumber(value);
  if (number === undefined || number < 0) return 'Unavailable';
  if (number > 0 && number < 0.01) return '<0.01';
  return number.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function billingHistoryDisplay(row: Record<string, unknown>) {
  const tx = normalizeBillingTransaction(row);
  const rawDate = row.timestamp ?? tx.createdAt;
  const timestamp = typeof rawDate === 'string' ? Date.parse(rawDate) : rawDate;
  const date = typeof timestamp === 'number' && Number.isFinite(timestamp) ? new Date(timestamp) : null;
  const time = date && Number.isFinite(date.getTime())
    ? `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Date unavailable';
  const kind = String(row.type || tx.serviceType || '');
  return {
    id: String(row.id || tx.transactionId || tx.referenceId || ''),
    title: String(row.description || tx.notes || kind.replace(/_/g, ' ') || 'Nanivio service transaction'),
    time,
    amount: formatBillingAmount(row.amount ?? tx.total),
    currency: String(tx.currency || 'Currency unavailable'),
    isTopUp: /TOPUP|TOP_UP/.test(kind),
  };
}

/** Presentation only: never fill an unknown allowance with demonstration usage. */
export function billingAllowanceDisplay(remaining: unknown, quota: unknown) {
  const left = billingNumber(remaining), total = billingNumber(quota);
  if (left === undefined || total === undefined || left < 0 || total < 0) {
    return { label: 'Unavailable', percentRemaining: 0 };
  }
  const format = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return {
    label: `${format(left)} / ${format(total)} min`,
    percentRemaining: total > 0 ? Math.min(100, Math.max(0, left / total * 100)) : 0,
  };
}

export function malviCheckoutAllowanceText(voice: unknown, avatar: unknown, cycle: 'MONTHLY' | 'ANNUAL'): string {
  const voiceMinutes = billingNumber(voice), avatarMinutes = billingNumber(avatar);
  if (voiceMinutes === undefined || avatarMinutes === undefined || voiceMinutes < 0 || avatarMinutes < 0) {
    return 'Confirmed allowance unavailable. Reload the published plan before paying.';
  }
  const amounts = `${voiceMinutes} voice-only minutes · ${avatarMinutes} live avatar minutes`;
  return cycle === 'ANNUAL'
    ? `${amounts} per monthly allocation. Annual payment includes twelve monthly allocations.`
    : `${amounts} per 30-day allowance allocation.`;
}

/** Read adapter only: database rows and canonical API rows share one display contract. */
export function normalizeBillingTransaction(row: Record<string, unknown>): BillingTransaction {
  const normalized = billingReadAliases(row, [
    'transaction_id', 'reference_id', 'user_id', 'service_type', 'usage_type',
    'unit_price', 'platform_fee', 'provider_fee', 'credit_applied', 'payment_method',
    'pricing_version_id', 'created_at', 'updated_at', 'completed_at',
  ]);
  normalizeReadNumbers(normalized, [
    'quantity', 'unitPrice', 'subtotal', 'platformFee', 'providerFee', 'tax',
    'discount', 'creditApplied', 'total',
  ]);
  normalizeReadDates(normalized, ['createdAt', 'updatedAt', 'completedAt']);
  return normalized as unknown as BillingTransaction;
}

/** Explicit schema aliases only; metadata is not an alternate financial source. */
function billingReadAliases(row: Record<string, unknown>, aliases: string[]) {
  const normalized = { ...row };
  for (const name of aliases) {
    const camel = name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (normalized[camel] == null && row[name] != null) normalized[camel] = row[name];
  }
  return normalized;
}

function normalizeReadNumbers(row: Record<string, unknown>, names: string[]) {
  for (const name of names) row[name] = billingNumber(row[name]);
}

function normalizeReadDates(row: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = row[name];
    const timestamp = typeof value === 'string' ? Date.parse(value) : value;
    row[name] = typeof timestamp === 'number' && Number.isFinite(timestamp)
      && Number.isFinite(new Date(timestamp).getTime()) ? timestamp : undefined;
  }
}

export function normalizeBillingInvoice(row: Record<string, unknown>): BillingInvoice {
  const normalized = billingReadAliases(row, [
    'invoice_number', 'user_id', 'transaction_reference', 'tax_amount', 'platform_fee',
    'discount_total', 'credit_total', 'payment_method', 'issued_at', 'paid_at', 'due_date',
  ]);
  // Persisted `id` is a storage UUID; invoice_id is the public invoice identifier.
  normalized.id = row.invoiceId ?? row.invoice_id ?? row.id;
  normalizeReadNumbers(normalized, [
    'subtotal', 'taxRate', 'taxAmount', 'platformFee', 'discountTotal', 'creditTotal', 'total',
  ]);
  normalizeReadDates(normalized, ['issuedAt', 'paidAt', 'dueDate']);
  normalized.items = Array.isArray(row.items) ? row.items.map(item => {
    const result = billingReadAliases(item, ['service_type', 'unit_price']);
    normalizeReadNumbers(result, ['quantity', 'unitPrice', 'subtotal', 'discount', 'total']);
    return result;
  }) : [];
  return normalized as unknown as BillingInvoice;
}

export function normalizeBillingDispute(row: Record<string, unknown>): BillingDispute {
  const normalized = billingReadAliases(row, [
    'transaction_id', 'user_id', 'created_at', 'updated_at',
  ]);
  normalized.id = row.disputeId ?? row.dispute_id ?? row.id;
  normalized.userExplanation = row.userExplanation ?? row.explanation;
  normalized.adminResolution = row.adminResolution ?? row.resolution;
  normalizeReadNumbers(normalized, ['amount', 'refundAmount']);
  normalizeReadDates(normalized, ['createdAt', 'updatedAt', 'resolutionTimestamp']);
  return normalized as unknown as BillingDispute;
}
