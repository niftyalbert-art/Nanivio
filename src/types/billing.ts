import { SupportedLanguageCode } from './index';

export type FinancialAccountType = 'COMMUNICATION' | 'FINTECH';

export type PaymentMethodType =
  | 'CARD'
  | 'PAYPAL'
  | 'GOOGLE_PAY'
  | 'APPLE_PAY'
  | 'MOBILE_MONEY'
  | 'BANK_TRANSFER'
  | 'FINTECH_TRANSFER';

export type MobileMoneyDepositStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'CREDITED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED';

export type BillingServiceType =
  | 'COMMUNICATION'
  | 'LANGPRETATION'
  | 'MALVI_AI'
  | 'EXPERT_SERVICE'
  | 'B2B_PREMIUM'
  | 'FINTECH_TRANSFER'
  | 'SUBSCRIPTION'
  | 'AD_CAMPAIGN'
  | 'ADJUSTMENT';

export type BillingUsageType =
  | 'CALL_MINUTES'
  | 'VIDEO_MINUTES'
  | 'LANGPRETATION_MINUTES'
  | 'LANGPRETATION_REQUESTS'
  | 'MALVI_VOICE_MINUTES'
  | 'MALVI_REQUESTS'
  | 'EXPERT_MINUTES'
  | 'EXPERT_SESSIONS'
  | 'TRANSFER_AMOUNT'
  | 'TRANSFER_COUNT'
  | 'AD_IMPRESSIONS'
  | 'AD_CLICKS'
  | 'BUSINESS_SEATS'
  | 'BUSINESS_USAGE';

export type BillingStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'AUTHORIZED'
  | 'RESERVED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'REVERSED'
  | 'DISPUTED';

export type LedgerEntryType =
  | 'CHARGE'
  | 'PAYMENT'
  | 'CREDIT'
  | 'DEBIT'
  | 'REFUND'
  | 'REVERSAL'
  | 'PROVIDER_EARNING'
  | 'PLATFORM_REVENUE'
  | 'FEE'
  | 'TAX'
  | 'PROMOTIONAL_CREDIT'
  | 'ADJUSTMENT'
  | 'FINTECH_DEPOSIT'
  | 'FINTECH_WITHDRAWAL'
  | 'FINTECH_TRANSFER'
  | 'COMMUNICATION_TOPUP'
  | 'FINTECH_TO_COMMUNICATION'
  | 'COMMUNICATION_SUBSCRIPTION'
  | 'AUDIO_USAGE'
  | 'VIDEO_USAGE'
  | 'LANGPRETATION_USAGE'
  | 'ADMIN_ADJUSTMENT';

export type AdminBillingRole =
  | 'SUPER_ADMIN'
  | 'FINANCE_ADMIN'
  | 'BILLING_ADMIN'
  | 'SUPPORT_ADMIN'
  | 'AUDITOR';

export type DisputeStatus =
  | 'REQUESTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PARTIALLY_COMPENSATED'
  | 'REJECTED'
  | 'ESCALATED'
  | 'RESOLVED';

export type RefundStatus =
  | 'REQUESTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'FAILED';

// Multi-Currency Wallet Record for a specific financial account type
export interface AccountWalletBalance {
  currency: string;
  symbol: string;
  available: number;
  reserved: number;
  promotional: number;
}

// User Financial Accounts (Strictly Separated)
export interface UserFinancialAccounts {
  userId: string;
  nvNumber: string;
  communicationAccount: {
    accountId: string;
    accountType: 'COMMUNICATION';
    wallets: AccountWalletBalance[];
    activeSubscription?: UserSubscriptionState;
    autoRenew: boolean;
    usageToday: {
      audioMinutes: number;
      videoMinutes: number;
      langpretationMinutes: number;
    };
  };
  fintechAccount: {
    accountId: string;
    accountType: 'FINTECH';
    wallets: AccountWalletBalance[];
    pendingDepositsCount: number;
    totalTransfersCount: number;
  };
}

// Mobile Money Database Models
export interface MobileMoneyCountry {
  id: string;
  code: string;
  name: string;
  currency: string;
  currencySymbol: string;
  phoneCode: string;
  flagEmoji: string;
  isActive: boolean;
}

export interface MobileMoneyNetwork {
  id: string;
  countryId: string;
  countryCode: string;
  name: string;
  code: string;
  currency: string;
  logoUrl?: string;
  colorHex?: string;
  isActive: boolean;
}

export interface MobileMoneyReceivingAccount {
  id: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  networkId: string;
  networkName: string;
  accountName: string;
  receivingPhoneNumber: string;
  accountReferenceId?: string;
  currency: string;
  currencySymbol: string;
  minimumDeposit: number;
  maximumDeposit: number;
  instructions: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MobileMoneyDepositRequest {
  id: string;
  referenceId: string; // e.g. REF-NV-MOMO-88192
  userId: string;
  userName: string;
  nvNumber: string;
  countryCode: string;
  countryName: string;
  networkId: string;
  networkName: string;
  receivingAccountId: string;
  receivingAccountName: string;
  receivingPhoneNumber: string;
  senderPhoneNumber: string;
  externalTransactionReference: string; // From telco/network
  amountSent: number;
  currency: string;
  currencySymbol: string;
  exchangeRateToUSD: number;
  exchangeRateToGHS: number;
  feeAmount: number;
  netCreditedEstimated: number;
  status: MobileMoneyDepositStatus;
  proofNote?: string;
  proofImageUrl?: string;
  adminNotes?: string;
  verifiedByAdmin?: string;
  verifiedAt?: number;
  creditedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// Gateway Configuration Model
export interface PaymentGatewayConfig {
  id: string;
  name: string;
  methodType: PaymentMethodType;
  provider: 'STRIPE' | 'PAYPAL' | 'GOOGLE' | 'APPLE' | 'MTN_MOMO' | 'TELECEL_CASH' | 'INTERNAL_LEDGER';
  supportedAccounts: FinancialAccountType[];
  supportedCurrencies: string[];
  supportedCountries: string[];
  isActive: boolean;
  processingFeePercent: number;
  fixedFee: number;
  minimumAmount: number;
  maximumAmount: number;
  iconName: string;
  description: string;
}

export interface AdminPaymentGatewayDetails {
  mobileMoney: {
    enabled: boolean;
    mtnMoMoNumber: string;
    mtnMerchantName: string;
    telecelCashShortcode: string;
    telecelMerchantName: string;
    mpesaTillNumber: string;
    airteltigoNumber: string;
    feePercent: number;
    instructions: string;
  };
  cardPayment: {
    enabled: boolean;
    processor: 'Stripe Global' | 'Paystack' | 'Flutterwave';
    supportedBrands: string[];
    feePercent: number;
    require3DSecure: boolean;
    publicKey: string;
  };
  payPal: {
    enabled: boolean;
    merchantEmail: string;
    clientId: string;
    mode: 'live' | 'sandbox';
    feePercent: number;
  };
  googlePay: {
    enabled: boolean;
    merchantId: string;
    merchantName: string;
    feePercent: number;
    environment: 'PRODUCTION' | 'TEST';
  };
  applePay: {
    enabled: boolean;
    merchantIdentifier: string;
    domainName: string;
    feePercent: number;
  };
  bankPayment: {
    enabled: boolean;
    bankName: string;
    accountName: string;
    accountNumber: string;
    iban: string;
    swiftBic: string;
    branchCode: string;
    country: string;
    currency: string;
    feePercent: number;
    wireInstructions: string;
  };
}

// Internal Transfer Model
export interface FintechToCommunicationTransferRequest {
  userId: string;
  amount: number;
  currency: string;
  idempotencyKey?: string;
  notes?: string;
}

export interface FintechToCommunicationTransferResult {
  transferId: string;
  referenceId: string;
  userId: string;
  amount: number;
  currency: string;
  fintechBalanceAfter: number;
  communicationBalanceAfter: number;
  timestamp: number;
  status: 'COMPLETED' | 'FAILED';
  ledgerEntries: BillingLedgerEntry[];
}

export interface BillingLedgerEntry {
  id: string;
  transactionId?: string;
  referenceId: string;
  accountType?: FinancialAccountType;
  entityType: 'USER' | 'PROVIDER' | 'BUSINESS' | 'PLATFORM';
  entityId: string;
  entryType: LedgerEntryType;
  debit: number;
  credit: number;
  balanceAfter: number;
  currency: string;
  description: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface BillingTransaction {
  transactionId: string;
  referenceId: string;
  userId: string;
  userName?: string;
  businessId?: string;
  providerId?: string;
  providerName?: string;
  serviceType: BillingServiceType;
  serviceId?: string;
  sessionId?: string;
  usageType: BillingUsageType;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  platformFee: number;
  providerFee: number;
  tax: number;
  discount: number;
  creditApplied: number;
  total: number;
  currency: string;
  status: BillingStatus;
  paymentMethod: string;
  pricingVersionId: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  sourceLang?: SupportedLanguageCode;
  targetLang?: SupportedLanguageCode;
  notes?: string;
  disputeId?: string;
  refundId?: string;
}

export interface BillingInvoiceItem {
  id: string;
  description: string;
  serviceType: BillingServiceType;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  discount: number;
  total: number;
}

export interface BillingInvoice {
  id: string;
  invoiceNumber: string;
  transactionReference: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerAddress?: string;
  businessName?: string;
  items: BillingInvoiceItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  platformFee: number;
  discountTotal: number;
  creditTotal: number;
  total: number;
  currency: string;
  status: 'PAID' | 'PENDING' | 'REFUNDED' | 'VOID';
  issuedAt: number;
  paidAt?: number;
  dueDate: number;
  paymentMethod: string;
  pricingVersion: string;
  notes?: string;
}

export interface BillingPricingRule {
  id: string;
  serviceType: BillingServiceType;
  usageType: BillingUsageType;
  currency: string;
  unitName: string;
  ratePerUnit: number;
  minimumCharge: number;
  platformCommissionPercent: number;
  taxPercent: number;
  freeTierAllowance: number;
  effectiveFrom: number;
  expiresAt?: number;
  isActive: boolean;
  tier?: string;
  notes?: string;
}

export interface BillingPricingVersion {
  versionId: string;
  versionNumber: string;
  label: string;
  effectiveDate: number;
  isActive: boolean;
  rules: BillingPricingRule[];
  createdBy: string;
  createdAt: number;
}

export interface BillingSubscriptionPlan {
  id: string;
  tier: string;
  name: string;
  description: string;
  priceMonthlyUSD: number;
  priceMonthlyGHS: number;
  priceAnnualUSD: number;
  priceAnnualGHS: number;
  includedLangpretationMinutes: number;
  includedVoiceMinutes: number;
  includedMalviRequests: number;
  includedStorageGB: number;
  overageLangpretationRateUSD: number;
  overageLangpretationRateGHS: number;
  groupCallLimit: number;
  canCollapseAds: boolean;
  b2bSeatsIncluded: number;
  features: string[];
  isActive: boolean;
}

export interface UserSubscriptionState {
  id: string;
  userId: string;
  planId: string;
  tier: string;
  planName: string;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'TRIAL';
  startedAt: number;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  nextBillingAt: number;
  autoRenew: boolean;
  pricePaid: number;
  currency: string;
  
  // Quota & Real-time Meters
  langpretationMinutesQuota: number;
  langpretationMinutesUsed: number;
  langpretationMinutesRemaining: number;
  
  voiceMinutesQuota: number;
  voiceMinutesUsed: number;
  
  malviUnitsQuota: number;
  malviUnitsUsed: number;
}

export interface BillingUsageSession {
  sessionId: string;
  userId: string;
  serviceType: BillingServiceType;
  usageType: BillingUsageType;
  startedAt: number;
  updatedAt: number;
  elapsedSeconds: number;
  currentQuantity: number;
  unit: string;
  unitRate: number;
  currency: string;
  currentCost: number;
  reservedAmount: number;
  isLangpretationActive: boolean;
  langpretationRate: number;
  langpretationCost: number;
  expertRate?: number;
  expertCost?: number;
  providerId?: string;
  sourceLang?: SupportedLanguageCode;
  targetLang?: SupportedLanguageCode;
  status: 'ACTIVE' | 'PAUSED' | 'FINALIZED' | 'CANCELLED';

  // Production-hardened server-authoritative metering & exhaustion telemetry
  langpretationMinutesRemaining?: number;
  langpretationMinutesQuota?: number;
  userAvailableBalance?: number;
  isSubscriptionCovered?: boolean;
  isFallbackToServiceValue?: boolean;
  isExhausted?: boolean;
  exhaustionNoticeType?: 'warning' | 'fallback' | 'exhausted' | null;
  exhaustionMessage?: string;
  inGracePeriod?: boolean;
  gracePeriodSecondsRemaining?: number;
  shouldTerminate?: boolean;
}

export interface BillingPromotionalCredit {
  id: string;
  userId: string;
  title: string;
  source: 'WELCOME' | 'REFERRAL' | 'COMPENSATION' | 'PROMO_CODE' | 'ADMIN_GRANT';
  amount: number;
  currency: string;
  remainingAmount: number;
  applicableServices: BillingServiceType[];
  expiresAt: number;
  status: 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED';
  createdAt: number;
}

export interface BillingDispute {
  id: string;
  caseNumber: string;
  transactionId: string;
  transactionReference: string;
  userId: string;
  userName: string;
  serviceType: BillingServiceType;
  amount: number;
  currency: string;
  reason: 'INCORRECT_CHARGE' | 'DUPLICATE_CHARGE' | 'FAILED_SERVICE' | 'INCORRECT_DURATION' | 'LANGPRETATION_ERROR' | 'UNAUTHORIZED' | 'OTHER';
  userExplanation: string;
  status: DisputeStatus;
  adminResolution?: string;
  resolvedByAdmin?: string;
  resolutionTimestamp?: number;
  refundAmount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface BillingRefund {
  id: string;
  refundReference: string;
  transactionId: string;
  userId: string;
  providerId?: string;
  amount: number;
  currency: string;
  reason: string;
  status: RefundStatus;
  disputeId?: string;
  approvedBy?: string;
  ledgerEntryId?: string;
  createdAt: number;
  completedAt?: number;
}

export interface ProviderEarningsRecord {
  providerId: string;
  providerName: string;
  specialty: string;
  currency: string;
  grossEarnings: number;
  platformCommissionTotal: number;
  netEarnings: number;
  availablePayout: number;
  pendingPayout: number;
  totalPaidOut: number;
  totalConsultationMinutes: number;
  completedSessionsCount: number;
  lastSessionAt?: number;
}

export interface BusinessBillingAccount {
  businessId: string;
  companyName: string;
  taxId?: string;
  billingEmail: string;
  planId: string;
  tier: string;
  seatsTotal: number;
  seatsAllocated: number;
  pooledLangpretationMinutesQuota: number;
  pooledLangpretationMinutesUsed: number;
  monthlySpendLimitUSD: number;
  currentMonthSpendUSD: number;
  currency: string;
  activeMembers: {
    userId: string;
    userName: string;
    email: string;
    role: 'ADMIN' | 'MEMBER';
    minutesUsed: number;
  }[];
}

export interface BillingAuditRecord {
  id: string;
  timestamp: number;
  adminUser: string;
  adminRole: AdminBillingRole;
  action: string;
  targetEntityType: 'USER' | 'PRICING' | 'SERVICE' | 'TRANSACTION' | 'DISPUTE' | 'REFUND' | 'SYSTEM';
  targetEntityId: string;
  previousValue?: any;
  newValue?: any;
  reason: string;
  result: 'SUCCESS' | 'FAILED' | 'DENIED';
  ipAddress?: string;
}

export interface BillingPreviewRequest {
  serviceType: BillingServiceType;
  usageType: BillingUsageType;
  estimatedQuantity: number;
  currency?: string;
  userId?: string;
  providerId?: string;
  withLangpretation?: boolean;
  promoCode?: string;
}

export interface BillingPreviewResponse {
  serviceType: BillingServiceType;
  currency: string;
  estimatedQuantity: number;
  unit: string;
  unitRate: number;
  baseCharge: number;
  langpretationRate?: number;
  langpretationCharge?: number;
  providerRate?: number;
  providerCharge?: number;
  platformFee: number;
  taxPercent: number;
  taxAmount: number;
  discountAmount: number;
  promotionalCreditApplied: number;
  totalEstimatedCharge: number;
  userAvailableBalance: number;
  isEligible: boolean;
  lowBalanceWarning: boolean;
  requiredReservation: number;
  pricingVersion: string;
}

export interface AdminBillingOverviewStats {
  grossVolumeTodayUSD: number;
  grossVolumeTodayGHS: number;
  monthlyRecurringRevenueUSD: number;
  platformNetRevenueUSD: number;
  platformNetRevenueGHS: number;
  providerPayoutsPendingUSD: number;
  activePaidSubscriptions: number;
  activeLiveUsageMeters: number;
  openDisputesCount: number;
  pendingRefundsCount: number;
  revenueByService: Record<BillingServiceType, { amountUSD: number; percentage: number }>;
  transactionsCountToday: number;
  reconciliationStatus: 'BALANCED' | 'DISCREPANCY_FLAGGED';
}

export interface EmergencyBillingControls {
  globalBillingFreeze: boolean;
  maintenanceMode: boolean;
  disableNewCharges: boolean;
  disableServiceBilling: Record<BillingServiceType, boolean>;
  pauseProviderPayouts: boolean;
  pauseRefunds: boolean;
  disableAutoRenewals: boolean;
}

export interface PeerToPeerTransferRequest {
  fromUserId: string;
  fromUserName?: string;
  toUserIdentifier?: string; // NV ID, email, or phone
  toUserId?: string;
  toUserName?: string;
  toNvId?: string;
  amount: number;
  currency: string;
  accountType: FinancialAccountType;
  note?: string;
}

export interface PeerToPeerTransferResult {
  transferId: string;
  referenceId: string;
  fromUserId: string;
  toUserId: string;
  toUserName: string;
  toNvId?: string;
  amount: number;
  currency: string;
  accountType: FinancialAccountType;
  senderBalanceAfter: number;
  recipientBalanceAfter: number;
  timestamp: number;
  status: 'COMPLETED';
  note?: string;
}

// ============================================================================
// COMMUNICATION MINUTES PACKAGES & SEPARATE MALVI SUBSCRIPTION MODELS
// ============================================================================

export interface CommunicationMinutePackage {
  id: string;
  name: string;
  minutes: number;
  priceUSD: number;
  priceGHS: number;
  description: string;
  validityDays: number;
  features: string[];
}

export type MalviSubscriptionTier = 'free' | 'malvi_basic' | 'malvi_premium' | 'malvi_business';

export interface MalviSubscriptionPlan {
  id: string;
  tier: MalviSubscriptionTier;
  name: string;
  tagline: string;
  description: string;
  priceMonthlyUSD: number;
  priceMonthlyGHS: number;
  priceAnnualUSD: number;
  priceAnnualGHS: number;
  videoInteractionMinutesLimit: number; // free: 3, basic: 15, premium: 300, business: 1500
  voiceCapabilities: string;
  langpretationCapabilities: string;
  aiInteractionCapabilities: string;
  avatarInteractive: boolean;
  businessCollaboration: boolean;
  features: string[];
  unavailableFeatures?: string[];
  isPopular?: boolean;
}

export interface UserMalviSubscriptionState {
  id: string;
  userId: string;
  planId: string;
  tier: MalviSubscriptionTier;
  planName: string;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  status: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'CANCELLED';
  startedAt: number;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  nextBillingAt: number;
  pricePaid: number;
  currency: string;
  videoMinutesAllowed: number;
  videoMinutesUsed: number;
  videoMinutesRemaining: number;
  voiceMinutesAllowed: number;
  voiceMinutesUsed: number;
  voiceMinutesRemaining: number;
  autoRenew: boolean;
}

export interface LangpretationMeterData {
  remainingAllowance: number;
  monthlyQuota: number;
  minutesUsed: number;
  estimatedSavingsGHS: number;
  estimatedSavingsUSD: number;
  status: 'ACTIVE' | 'TRIAL' | 'EXHAUSTED' | 'EXPIRED';
  currentPeriodStart: number;
  currentPeriodEnd: number;
  tier: string;
  planName: string;
  channelBreakdown: {
    audioCalls: number;
    videoCalls: number;
    groupAudioCalls: number;
    voiceNotes: number;
    textChat: number;
  };
}

export interface MalviBusinessSessionIdea {
  id: string;
  author: string;
  avatar?: string;
  text: string;
  timestamp: number;
  category?: string;
  status?: 'proposed' | 'accepted' | 'under_review';
}

export interface MalviBusinessContribution {
  id: string;
  type: 'analysis' | 'suggestion' | 'clarification' | 'action_items' | 'summary';
  content: string;
  timestamp: number;
  referencedIdeaIds?: string[];
}

export interface MalviBusinessSession {
  sessionId: string;
  title: string;
  objective: string;
  participants: Array<{ id: string; name: string; role: string; avatar?: string; isAI?: boolean }>;
  ideas: MalviBusinessSessionIdea[];
  contributions: MalviBusinessContribution[];
  actionItems: Array<{ id: string; task: string; owner: string; status: 'pending' | 'completed' }>;
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'completed';
}

