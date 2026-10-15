import type { BillingTransaction } from '../types/billing';

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

/** Read adapter only: database rows and canonical API rows share one display contract. */
export function normalizeBillingTransaction(row: Record<string, unknown>): BillingTransaction {
  const normalized = { ...row };
  for (const name of [
    'transaction_id', 'reference_id', 'user_id', 'service_type', 'usage_type',
    'unit_price', 'platform_fee', 'provider_fee', 'credit_applied', 'payment_method',
    'pricing_version_id', 'created_at', 'updated_at', 'completed_at',
  ]) {
    const camel = name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (normalized[camel] == null && row[name] != null) normalized[camel] = row[name];
  }
  for (const name of [
    'quantity', 'unitPrice', 'subtotal', 'platformFee', 'providerFee', 'tax',
    'discount', 'creditApplied', 'total',
  ]) {
    if (normalized[name] != null) normalized[name] = billingNumber(normalized[name]);
  }
  for (const name of ['createdAt', 'updatedAt', 'completedAt']) {
    if (typeof normalized[name] === 'string') normalized[name] = Date.parse(normalized[name] as string);
  }
  return normalized as unknown as BillingTransaction;
}
