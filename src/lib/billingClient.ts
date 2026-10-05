import { authClient } from './authClient';

import {
  BillingTransaction,
  BillingInvoice,
  BillingSubscriptionPlan,
  UserSubscriptionState,
  BillingUsageSession,
  BillingPromotionalCredit,
  BillingDispute,
  BillingRefund,
  ProviderEarningsRecord,
  BusinessBillingAccount,
  BillingPreviewRequest,
  BillingPreviewResponse,
  AdminBillingOverviewStats,
  BillingPricingVersion,
  EmergencyBillingControls,
  BillingLedgerEntry,
  BillingAuditRecord,
  UserFinancialAccounts,
  PaymentGatewayConfig,
  MobileMoneyCountry,
  MobileMoneyNetwork,
  MobileMoneyReceivingAccount,
  MobileMoneyDepositRequest,
  FintechToCommunicationTransferResult,
  PeerToPeerTransferResult,
  CommunicationMinutePackage,
  MalviSubscriptionPlan,
  MalviSubscriptionTier,
  UserMalviSubscriptionState,
  LangpretationMeterData,
  MalviBusinessSession,
} from '../types/billing';

function billingHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = authClient.getToken();
  if (token) { headers.Authorization = `Bearer ${token}`; headers['x-nanivio-token'] = token; }
  return headers;
}

export interface UserBillingSummaryResponse {
  success: boolean;
  userId: string;
  accounts?: UserFinancialAccounts;
  subscription: UserSubscriptionState | null;
  malviSubscription?: UserMalviSubscriptionState;
  langpretationMeter?: LangpretationMeterData;
  wallets: Array<{
    currency: string;
    available: number;
    reserved: number;
    promotional: number;
    symbol: string;
  }>;
  communicationWallets?: Array<{
    currency: string;
    available: number;
    reserved: number;
    promotional: number;
    symbol: string;
  }>;
  fintechWallets?: Array<{
    currency: string;
    available: number;
    reserved: number;
    promotional: number;
    symbol: string;
  }>;
  recentTransactions: BillingTransaction[];
  promotionalCredits: BillingPromotionalCredit[];
  activeUsageSessionsCount: number;
  emergencyControls: EmergencyBillingControls;
}

export const billingClient = {
  // 1. Fetch User Summary & Separated Financial Accounts
  async getSummary(userId?: string): Promise<UserBillingSummaryResponse> {
    const res = await fetch(`/api/billing/summary`, { headers: billingHeaders() });
    if (!res.ok) throw new Error('Failed to fetch billing summary');
    return res.json();
  },

  // 1B. Fetch Dedicated User Financial Accounts (Communication + Fintech)
  async getFinancialAccounts(userId?: string): Promise<UserFinancialAccounts> {
    const res = await fetch(`/api/billing/accounts`, { headers: billingHeaders() });
    if (!res.ok) throw new Error('Failed to fetch user financial accounts');
    const data = await res.json();
    return data.accounts;
  },

  // 1C. Transfer Funds from Fintech Account to Communication Account
  async transferFintechToCommunication(params: {
    userId?: string;
    amount: number;
    currency: string;
    notes?: string;
  }): Promise<FintechToCommunicationTransferResult> {
    const res = await fetch('/api/billing/transfer/fintech-to-communication', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to transfer funds from Fintech to Communication');
    }
    return data.result;
  },

  // 1C2. Atomic Peer-to-Peer Transfer Value
  async transferPeerToPeer(params: {
    fromUserId?: string;
    toIdentifier: string;
    amount: number;
    currency?: string;
    accountType?: 'COMMUNICATION' | 'FINTECH';
    note?: string;
  }): Promise<PeerToPeerTransferResult> {
    const res = await fetch('/api/billing/transfer/p2p', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to execute peer-to-peer transfer');
    }
    return data.result;
  },

  // 1C3. Paystack Top-Up & Subscription Initialization
  async initializePaystack(params: {
    email: string;
    amount: number;
    currency?: string;
    userId?: string;
    purpose?: 'COMMUNICATION_TOPUP' | 'SUBSCRIPTION' | 'COMMUNICATION_MINUTES' | 'MALVI_SUBSCRIPTION';
    packageId?: string;
    planTier?: string;
    billingCycle?: 'MONTHLY' | 'ANNUAL';
    minutes?: number;
    metadata?: Record<string, any>;
  }): Promise<{
    success: boolean;
    authorization_url: string;
    reference: string;
    access_code: string;
    sandbox?: boolean;
    message?: string;
  }> {
    const res = await fetch('/api/paystack/initialize', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to initialize Paystack payment');
    }
    return data;
  },

  // 1C4. Paystack Payment Verification & Direct Activation
  async verifyPaystack(reference: string, userId?: string, amount?: number): Promise<{
    success: boolean;
    verified: boolean;
    type?: string;
    reference: string;
    amount: number;
    currency: string;
    newBalance?: number;
    subscription?: any;
    allowance?: number;
    expiryDate?: number;
    invoice?: any;
    message: string;
  }> {
    const url = new URL(`/api/paystack/verify/${encodeURIComponent(reference)}`, window.location.origin);
    if (userId) url.searchParams.append('userId', userId);
    if (amount) url.searchParams.append('amount', String(amount));
    const res = await fetch(url.toString());
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to verify Paystack payment');
    }
    return data;
  },

  // 1D. Get Supported Payment Gateways
  async getPaymentGateways(): Promise<PaymentGatewayConfig[]> {
    const res = await fetch('/api/billing/gateways');
    if (!res.ok) throw new Error('Failed to fetch payment gateways');
    const data = await res.json();
    return data.gateways || [];
  },

  // 1E. Get Mobile Money Metadata (Countries, Networks, Active Accounts)
  async getMobileMoneyMetadata(): Promise<{
    countries: MobileMoneyCountry[];
    networks: MobileMoneyNetwork[];
    receivingAccounts: MobileMoneyReceivingAccount[];
  }> {
    const res = await fetch('/api/billing/momo/metadata');
    if (!res.ok) throw new Error('Failed to fetch mobile money metadata');
    return res.json();
  },

  // 1F. Submit Mobile Money Deposit Request
  async submitMobileMoneyDeposit(params: {
    userId?: string;
    userName?: string;
    nvNumber?: string;
    countryCode: string;
    networkId: string;
    amountSent: number;
    currency: string;
    senderPhoneNumber: string;
    externalTransactionReference: string;
    proofNote?: string;
  }): Promise<MobileMoneyDepositRequest> {
    const res = await fetch('/api/billing/momo/deposit-request', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to submit mobile money deposit request');
    }
    return data.deposit;
  },

  // 1G. Get Mobile Money Deposit Requests
  async getMobileMoneyRequests(userId?: string, status?: string): Promise<MobileMoneyDepositRequest[]> {
    const url = new URL('/api/billing/momo/requests', window.location.origin);
    if (userId) url.searchParams.append('userId', userId);
    if (status) url.searchParams.append('status', status);
    const res = await fetch(url.toString());
    const data = await res.json();
    return data.requests || [];
  },

  // 1H. Admin Verify Mobile Money Deposit
  async verifyMobileMoneyDeposit(params: {
    depositId: string;
    action: 'VERIFY_AND_CREDIT' | 'REJECT';
    adminUser?: string;
    adminNotes?: string;
  }): Promise<MobileMoneyDepositRequest> {
    const res = await fetch('/api/billing/momo/verify', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to verify mobile money deposit');
    }
    return data.deposit;
  },

  // 1I. External Top-Up (Card, PayPal, Apple Pay, Google Pay)
  async topUpAccount(params: {
    userId?: string;
    targetAccount: 'COMMUNICATION' | 'FINTECH';
    paymentMethod: string;
    amount: number;
    currency: string;
  }): Promise<any> {
    const res = await fetch('/api/billing/topup', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to process top-up');
    }
    return data;
  },

  // 1J. Admin Toggle Payment Gateway
  async toggleGateway(gatewayId: string, isActive: boolean): Promise<any> {
    const res = await fetch('/api/admin/billing/gateways/toggle', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify({ gatewayId, isActive }),
    });
    return res.json();
  },

  // 1K. Admin Toggle MoMo Country
  async toggleMomoCountry(countryId: string, isActive: boolean): Promise<any> {
    const res = await fetch('/api/admin/billing/momo/countries/toggle', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify({ countryId, isActive }),
    });
    return res.json();
  },

  // 1L. Admin Save MoMo Receiving Account
  async saveMomoReceivingAccount(accountData: any): Promise<any> {
    const res = await fetch('/api/admin/billing/momo/accounts', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(accountData),
    });
    return res.json();
  },

  // 2. Pre-Action Billing Preview
  async previewCharge(request: BillingPreviewRequest): Promise<BillingPreviewResponse> {
    const res = await fetch('/api/billing/preview', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(request),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to preview charge');
    return data.preview;
  },

  // 3. Start Live Usage Session (Reserve Funds)
  async startUsageSession(params: {
    sessionId: string;
    userId?: string;
    serviceType: string;
    usageType: string;
    currency?: string;
    isLangpretationActive?: boolean;
    providerId?: string;
    sourceLang?: string;
    targetLang?: string;
  }): Promise<BillingUsageSession> {
    const res = await fetch('/api/billing/session/start', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to start usage session');
    return data.session;
  },

  // 4. Update Live Usage Meter
  async updateUsageMeter(sessionId: string, elapsedSeconds: number): Promise<BillingUsageSession> {
    const res = await fetch('/api/billing/session/meter', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify({ sessionId, elapsedSeconds }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update meter');
    return data.session;
  },

  // 5. Complete Usage Session & Capture Universal Ledger Charge
  async completeUsageSession(sessionId: string): Promise<{ transaction: BillingTransaction; invoice: BillingInvoice }> {
    const res = await fetch('/api/billing/session/complete', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to complete usage session');
    return { transaction: data.transaction, invoice: data.invoice };
  },

  // 6. Get Transactions
  async getTransactions(userId?: string, serviceType?: string): Promise<BillingTransaction[]> {
    const url = new URL('/api/billing/transactions', window.location.origin);
    if (userId) url.searchParams.append('userId', userId);
    if (serviceType) url.searchParams.append('serviceType', serviceType);
    const res = await fetch(url.toString());
    const data = await res.json();
    return data.transactions || [];
  },

  // 7. Get Invoices
  async getInvoices(userId?: string): Promise<BillingInvoice[]> {
    const res = await fetch(`/api/billing/invoices`, { headers: billingHeaders() });
    const data = await res.json();
    return data.invoices || [];
  },

  // 8. Plans & Plan Upgrades
  async getPlans(): Promise<BillingSubscriptionPlan[]> {
    const res = await fetch('/api/billing/plans');
    const data = await res.json();
    return data.plans || [];
  },

  async changePlan(planTier: string, billingCycle: 'MONTHLY' | 'ANNUAL' = 'MONTHLY'): Promise<UserSubscriptionState> {
    const res = await fetch('/api/billing/plans/change', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify({ planTier, billingCycle }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to change plan');
    return data.subscription;
  },

  // 9. Promotional Credits & Voucher Redemption
  async getCredits(userId?: string): Promise<BillingPromotionalCredit[]> {
    const res = await fetch(`/api/billing/credits?userId=${encodeURIComponent(userId)}`);
    const data = await res.json();
    return data.credits || [];
  },

  async redeemPromoCode(promoCode: string): Promise<{ credit: BillingPromotionalCredit; message: string }> {
    const res = await fetch('/api/billing/credits/redeem', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify({ promoCode }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to redeem voucher');
    return { credit: data.credit, message: data.message };
  },

  // 10. Disputes
  async createDispute(params: {
    transactionId: string;
    reason: string;
    userExplanation: string;
  }): Promise<BillingDispute> {
    const res = await fetch('/api/billing/disputes/create', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to file dispute');
    return data.dispute;
  },

  async getDisputes(userId?: string): Promise<BillingDispute[]> {
    const res = await fetch(`/api/billing/disputes`, { headers: billingHeaders() });
    const data = await res.json();
    return data.disputes || [];
  },

  // 11. Provider & Business
  async getProviderEarnings(providerId: string = 'exp_amina'): Promise<ProviderEarningsRecord> {
    const res = await fetch(`/api/billing/provider/earnings?providerId=${encodeURIComponent(providerId)}`);
    const data = await res.json();
    return data.earnings;
  },

  async getBusinessAccount(businessId: string = 'biz_agro_trade'): Promise<BusinessBillingAccount> {
    const res = await fetch(`/api/billing/business?businessId=${encodeURIComponent(businessId)}`);
    const data = await res.json();
    return data.business;
  },

  // ==========================================
  // Admin Operations
  // ==========================================
  async getAdminOverview(): Promise<{
    stats: AdminBillingOverviewStats;
    activePricingVersion: BillingPricingVersion;
    emergencyControls: EmergencyBillingControls;
    recentLedger: BillingLedgerEntry[];
    disputesCount: number;
    activeSessionsCount: number;
  }> {
    const res = await fetch('/api/admin/billing/overview');
    const data = await res.json();
    return data;
  },

  async updatePricingRule(params: {
    ruleId: string;
    ratePerUnit?: number;
    minimumCharge?: number;
    platformCommissionPercent?: number;
  }): Promise<any> {
    const res = await fetch('/api/admin/billing/pricing/update-rule', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async updateEmergencyControls(updates: Partial<EmergencyBillingControls>, reason?: string): Promise<any> {
    const res = await fetch('/api/admin/billing/emergency/update', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify({ updates, reason }),
    });
    return res.json();
  },

  async getAdminLedger(entityType?: string, limit: number = 50): Promise<BillingLedgerEntry[]> {
    const url = new URL('/api/admin/billing/ledger', window.location.origin);
    if (entityType) url.searchParams.append('entityType', entityType);
    url.searchParams.append('limit', limit.toString());
    const res = await fetch(url.toString());
    const data = await res.json();
    return data.ledger || [];
  },

  async resolveDispute(params: {
    disputeId: string;
    resolution: string;
    adminExplanation: string;
    refundAmount?: number;
    adminRole?: string;
  }): Promise<any> {
    const res = await fetch('/api/admin/billing/disputes/resolve', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async processRefund(params: {
    transactionId: string;
    amount: number;
    reason: string;
    adminUser?: string;
    adminRole?: string;
  }): Promise<any> {
    const res = await fetch('/api/admin/billing/refunds/process', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify({
        adminUser: 'super_admin@nanivio.tech',
        adminRole: 'SUPER_ADMIN',
        ...params,
      }),
    });
    return res.json();
  },

  async createAdjustment(params: {
    userId: string;
    amount: number;
    type: 'CREDIT' | 'DEBIT' | 'PROMOTIONAL_CREDIT' | 'COMPENSATION';
    currency: string;
    reason: string;
    adminUser?: string;
    adminRole?: string;
  }): Promise<any> {
    const res = await fetch('/api/admin/billing/adjustments/create', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify({
        adminUser: 'super_admin@nanivio.tech',
        adminRole: 'SUPER_ADMIN',
        ...params,
      }),
    });
    return res.json();
  },

  async getReconciliationReport(): Promise<any> {
    const res = await fetch('/api/admin/billing/reconciliation');
    const data = await res.json();
    return data.report;
  },

  async getAuditLogs(): Promise<BillingAuditRecord[]> {
    const res = await fetch('/api/admin/billing/audit');
    const data = await res.json();
    return data.logs || [];
  },

  async inspectUser(userId: string): Promise<any> {
    const res = await fetch(`/api/admin/billing/user/${encodeURIComponent(userId)}`);
    return res.json();
  },

  // ==========================================
  // Communication Minute Packages
  // ==========================================
  async getCommunicationMinutePackages(): Promise<CommunicationMinutePackage[]> {
    const res = await fetch('/api/billing/communication-minute-packages');
    const data = await res.json();
    return data.packages || [];
  },

  async purchaseMinutePackage(params: {
    packageId: string;
    currency?: string;
    paymentMethod?: 'SERVICE_VALUE' | 'PAYSTACK';
  }): Promise<{
    success: boolean;
    subscription: UserSubscriptionState;
    allowance: number;
    invoice: any;
    message: string;
  }> {
    const res = await fetch('/api/billing/communication-minutes/purchase', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      const error: any = new Error(data.error || 'Failed to purchase communication minute package');
      error.code = data.code;
      error.requiredAmount = data.requiredAmount;
      error.availableBalance = data.availableBalance;
      throw error;
    }
    return data;
  },

  // ==========================================
  // Separate Malvi Subscriptions
  // ==========================================
  async getMalviPlans(): Promise<MalviSubscriptionPlan[]> {
    const res = await fetch('/api/billing/malvi-plans');
    const data = await res.json();
    return data.plans || [];
  },

  async getMalviSubscription(userId?: string): Promise<UserMalviSubscriptionState> {
    const res = await fetch(`/api/billing/malvi-subscription`, { headers: billingHeaders() });
    const data = await res.json();
    return data.subscription;
  },

  async changeMalviSubscription(params: {
    tier: MalviSubscriptionTier;
    billingCycle?: 'MONTHLY' | 'ANNUAL';
    paymentMethod?: 'SERVICE_VALUE' | 'PAYSTACK';
    currency?: string;
  }): Promise<{
    success: boolean;
    subscription: UserMalviSubscriptionState;
    invoice?: any;
    message: string;
  }> {
    const res = await fetch('/api/billing/malvi-subscription/change', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      const error: any = new Error(data.error || 'Failed to change Malvi subscription');
      error.code = data.code;
      error.requiredAmount = data.requiredAmount;
      error.availableBalance = data.availableBalance;
      throw error;
    }
    return data;
  },

  async recordMalviVideoUsage(seconds: number): Promise<{
    success: boolean;
    allowed: boolean;
    remainingMinutes: number;
    usedMinutes: number;
    isTrialExhausted: boolean;
    message?: string;
  }> {
    const res = await fetch('/api/malvi/record-video-usage', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify({ seconds }),
    });
    return res.json();
  },

  // ==========================================
  // Live Langpretation Meter & Usage Deduction
  // ==========================================
  async getLangpretationMeter(userId?: string): Promise<LangpretationMeterData> {
    const res = await fetch(`/api/billing/langpretation/meter?userId=${encodeURIComponent(userId)}`);
    const data = await res.json();
    return data.meter;
  },

  async recordLangpretationUsage(params: {
    channel: 'AUDIO_CALL' | 'VIDEO_CALL' | 'GROUP_AUDIO' | 'VOICE_NOTE' | 'TEXT_CHAT';
    minutes: number;
    sourceLang?: string;
    targetLang?: string;
    sessionId?: string;
  }): Promise<{
    success: boolean;
    remainingAllowance: number;
    minutesUsed: number;
    deductedFromQuota: number;
    deductedFromBalance: number;
    meter: LangpretationMeterData;
  }> {
    const res = await fetch('/api/billing/langpretation/record-usage', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(params),
    });
    return res.json();
  },

  // ==========================================
  // Malvi Business Real-Time Team Collaboration AI
  // ==========================================
  async collaborateMalviBusiness(params: {
    sessionId?: string;
    topic: string;
    objective?: string;
    participants?: Array<{ id: string; name: string; role: string }>;
    ideas?: Array<{ author: string; text: string }>;
    newIdea?: string;
    history?: any[];
  }): Promise<{
    success: boolean;
    contribution: { id: string; type: string; content: string; timestamp: number };
    actionItems: Array<{ id: string; task: string; owner: string; status: 'pending' | 'completed' }>;
  }> {
    const res = await fetch('/api/malvi/business/collaborate', {
      method: 'POST',
      headers: billingHeaders(),
      body: JSON.stringify(params),
    });
    return res.json();
  },
};
