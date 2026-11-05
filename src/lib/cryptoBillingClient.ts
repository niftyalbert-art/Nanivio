import { protectedBillingRequest } from './billingClient';

export type CryptoPurchase = {
  purpose: 'SUBSCRIPTION' | 'MALVI_SUBSCRIPTION' | 'COMMUNICATION_TOPUP' | 'COMMUNICATION_MINUTES';
  planTier?: string;
  packageId?: string;
  amount?: number;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  catalogVersion?: number;
};

export type CryptoInvoice = {
  id: string;
  userId: string;
  purpose: CryptoPurchase['purpose'];
  planTier: string;
  packageId?: string;
  billingCycle: CryptoPurchase['billingCycle'];
  planName: string;
  amount: string;
  basePriceUSD: number;
  matchingDiscount: string;
  network: 'TRON';
  token: 'USDT';
  tokenContract: string;
  receivingAddress: string;
  createdAt: string;
  expiresAt: string;
  status: 'PENDING' | 'EXPIRED' | 'REVIEW' | 'ACTIVATED';
  transactionId?: string;
  activation?: { message: string; alreadyFulfilled?: boolean };
};

export const cryptoBillingClient = {
  config: (): Promise<{ enabled: boolean; eligible?: boolean; supportedPurposes?: string[]; accessMode?: 'test' | 'public' | 'closed'; reason?: string }> =>
    protectedBillingRequest('/api/billing/crypto/config'),
  create: (purchase: CryptoPurchase): Promise<{ invoice: CryptoInvoice }> =>
    protectedBillingRequest('/api/billing/crypto/invoices', { method: 'POST', body: JSON.stringify(purchase) }),
  list: (): Promise<{ invoices: CryptoInvoice[] }> =>
    protectedBillingRequest('/api/billing/crypto/invoices'),
  check: (id: string, transactionId?: string): Promise<{ invoice: CryptoInvoice; message?: string }> =>
    protectedBillingRequest(`/api/billing/crypto/invoices/${encodeURIComponent(id)}/check`, {
      method: 'POST', body: JSON.stringify({ transactionId }),
    }),
  adminList: (): Promise<{ invoices: CryptoInvoice[]; enabled: boolean; reason?: string }> =>
    protectedBillingRequest('/api/admin/billing/crypto/invoices'),
  adminCheck: (id: string, transactionId: string, acceptLate = false): Promise<{ invoice: CryptoInvoice }> =>
    protectedBillingRequest(`/api/admin/billing/crypto/invoices/${encodeURIComponent(id)}/check`, {
      method: 'POST', body: JSON.stringify({ transactionId, acceptLate }),
    }),
};
