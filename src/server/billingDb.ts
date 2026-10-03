import {
  BillingTransaction,
  BillingLedgerEntry,
  BillingPricingVersion,
  BillingSubscriptionPlan,
  UserSubscriptionState,
  BillingUsageSession,
  BillingInvoice,
  BillingPromotionalCredit,
  BillingDispute,
  BillingRefund,
  ProviderEarningsRecord,
  BusinessBillingAccount,
  BillingAuditRecord,
  EmergencyBillingControls,
  FinancialAccountType,
  PaymentGatewayConfig,
  MobileMoneyCountry,
  MobileMoneyNetwork,
  MobileMoneyReceivingAccount,
  MobileMoneyDepositRequest,
  FintechToCommunicationTransferRequest,
  FintechToCommunicationTransferResult,
  PeerToPeerTransferRequest,
  PeerToPeerTransferResult,
  UserFinancialAccounts,
  AccountWalletBalance,
  CommunicationMinutePackage,
  MalviSubscriptionPlan,
  MalviSubscriptionTier,
  UserMalviSubscriptionState,
  LangpretationMeterData,
  MalviBusinessSession,
} from '../types/billing';

// In-Memory Database Storage for Nanivio Universal Billing & Payment Gateway System
export class BillingDatabase {
  public ledger: BillingLedgerEntry[] = [];
  public transactions: BillingTransaction[] = [];
  public invoices: BillingInvoice[] = [];
  public pricingVersions: BillingPricingVersion[] = [];
  public subscriptionPlans: BillingSubscriptionPlan[] = [];
  public userSubscriptions: Map<string, UserSubscriptionState> = new Map();
  public activeUsageSessions: Map<string, BillingUsageSession> = new Map();
  public promotionalCredits: BillingPromotionalCredit[] = [];
  public disputes: BillingDispute[] = [];
  public refunds: BillingRefund[] = [];
  public providerEarnings: Map<string, ProviderEarningsRecord> = new Map();
  public businessAccounts: Map<string, BusinessBillingAccount> = new Map();
  public auditLogs: BillingAuditRecord[] = [];

  // Strictly Separated Financial Accounts:
  // 1. Communication Account Wallets: Map<userId, Map<currency, { available, reserved, promotional }>>
  public communicationWallets: Map<string, Map<string, { available: number; reserved: number; promotional: number }>> = new Map();
  // 2. Fintech Account Wallets: Map<userId, Map<currency, { available, reserved, promotional }>>
  public fintechWallets: Map<string, Map<string, { available: number; reserved: number; promotional: number }>> = new Map();

  // Backward compatibility alias for legacy methods
  public get userWallets() {
    return this.fintechWallets;
  }

  // Payment Gateways & Rails
  public paymentGateways: PaymentGatewayConfig[] = [];

  // Communication Minute Packages
  public communicationMinutePackages: CommunicationMinutePackage[] = [];

  // Separate Malvi Subscriptions & Plans
  public malviPlans: MalviSubscriptionPlan[] = [];
  public userMalviSubscriptions: Map<string, UserMalviSubscriptionState> = new Map();

  // Production Langpretation Usage Tracking (Audio, Video, Group, Voice Note, Text)
  public langpretationUsageLogs: Array<{
    id: string;
    userId: string;
    channel: 'AUDIO_CALL' | 'VIDEO_CALL' | 'GROUP_AUDIO' | 'VOICE_NOTE' | 'TEXT_CHAT';
    minutes: number;
    sourceLang: string;
    targetLang: string;
    timestamp: number;
    sessionId?: string;
    provider?: string;
    costEstimateUsd?: number;
  }> = [];

  // Malvi Business Collaboration Sessions
  public malviBusinessSessions: Map<string, MalviBusinessSession> = new Map();

  // Mobile Money Database Models
  public mobileMoneyCountries: MobileMoneyCountry[] = [];
  public mobileMoneyNetworks: MobileMoneyNetwork[] = [];
  public mobileMoneyReceivingAccounts: MobileMoneyReceivingAccount[] = [];
  public mobileMoneyDepositRequests: MobileMoneyDepositRequest[] = [];

  public emergencyControls: EmergencyBillingControls = {
    globalBillingFreeze: false,
    maintenanceMode: false,
    disableNewCharges: false,
    disableServiceBilling: {
      COMMUNICATION: false,
      LANGPRETATION: false,
      MALVI_AI: false,
      EXPERT_SERVICE: false,
      B2B_PREMIUM: false,
      FINTECH_TRANSFER: false,
      SUBSCRIPTION: false,
      AD_CAMPAIGN: false,
      ADJUSTMENT: false,
    },
    pauseProviderPayouts: false,
    pauseRefunds: false,
    disableAutoRenewals: false,
  };

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    const now = Date.now();

    // 1. Payment Gateways Configuration
    this.paymentGateways = [
      {
        id: 'gw_card',
        name: 'Credit / Debit Card',
        methodType: 'CARD',
        provider: 'STRIPE',
        supportedAccounts: ['COMMUNICATION', 'FINTECH'],
        supportedCurrencies: ['USD', 'EUR', 'GHS', 'AED', 'GBP'],
        supportedCountries: ['GLOBAL'],
        isActive: true,
        processingFeePercent: 2.9,
        fixedFee: 0.30,
        minimumAmount: 1.0,
        maximumAmount: 25000.0,
        iconName: 'CreditCard',
        description: 'Instant deposit via Visa, Mastercard, and American Express',
      },
      {
        id: 'gw_paypal',
        name: 'PayPal Global',
        methodType: 'PAYPAL',
        provider: 'PAYPAL',
        supportedAccounts: ['COMMUNICATION', 'FINTECH'],
        supportedCurrencies: ['USD', 'EUR', 'AED', 'GBP'],
        supportedCountries: ['GLOBAL'],
        isActive: true,
        processingFeePercent: 3.4,
        fixedFee: 0.35,
        minimumAmount: 2.0,
        maximumAmount: 15000.0,
        iconName: 'DollarSign',
        description: 'Secure checkout with your PayPal balance or linked bank',
      },
      {
        id: 'gw_gpay',
        name: 'Google Pay',
        methodType: 'GOOGLE_PAY',
        provider: 'GOOGLE',
        supportedAccounts: ['COMMUNICATION', 'FINTECH'],
        supportedCurrencies: ['USD', 'EUR', 'GHS', 'AED'],
        supportedCountries: ['GLOBAL'],
        isActive: true,
        processingFeePercent: 2.5,
        fixedFee: 0.20,
        minimumAmount: 1.0,
        maximumAmount: 20000.0,
        iconName: 'Smartphone',
        description: '1-Tap instant mobile and web checkout via Google Pay',
      },
      {
        id: 'gw_apple_pay',
        name: 'Apple Pay',
        methodType: 'APPLE_PAY',
        provider: 'APPLE',
        supportedAccounts: ['COMMUNICATION', 'FINTECH'],
        supportedCurrencies: ['USD', 'EUR', 'AED', 'GBP'],
        supportedCountries: ['GLOBAL'],
        isActive: true,
        processingFeePercent: 2.5,
        fixedFee: 0.20,
        minimumAmount: 1.0,
        maximumAmount: 20000.0,
        iconName: 'Apple',
        description: 'Biometric FaceID / TouchID checkout with Apple Wallet',
      },
      {
        id: 'gw_momo',
        name: 'Mobile Money (Africa)',
        methodType: 'MOBILE_MONEY',
        provider: 'MTN_MOMO',
        supportedAccounts: ['FINTECH'],
        supportedCurrencies: ['GHS', 'KES', 'UGX', 'TZS', 'NGN', 'XOF', 'XAF'],
        supportedCountries: ['GH', 'KE', 'UG', 'TZ', 'NG', 'CI', 'CM'],
        isActive: true,
        processingFeePercent: 1.0,
        fixedFee: 0.0,
        minimumAmount: 5.0,
        maximumAmount: 50000.0,
        iconName: 'PhoneCall',
        description: 'Direct Mobile Money rails: MTN MoMo, M-Pesa, Telecel Cash, Airtel Money',
      },
      {
        id: 'gw_internal_transfer',
        name: 'Transfer from Fintech Balance',
        methodType: 'FINTECH_TRANSFER',
        provider: 'INTERNAL_LEDGER',
        supportedAccounts: ['COMMUNICATION'],
        supportedCurrencies: ['GHS', 'USD', 'EUR', 'AED', 'NGN'],
        supportedCountries: ['GLOBAL'],
        isActive: true,
        processingFeePercent: 0.0,
        fixedFee: 0.0,
        minimumAmount: 1.0,
        maximumAmount: 100000.0,
        iconName: 'ArrowRightLeft',
        description: 'Instantly move available funds from your Nanivio Fintech Wallet to Communication Wallet with zero fees',
      },
    ];

    // 2. Mobile Money Supported Countries
    this.mobileMoneyCountries = [
      {
        id: 'country_gh',
        code: 'GH',
        name: 'Ghana',
        currency: 'GHS',
        currencySymbol: 'GH₵',
        phoneCode: '+233',
        flagEmoji: '🇬🇭',
        isActive: true,
      },
      {
        id: 'country_ke',
        code: 'KE',
        name: 'Kenya',
        currency: 'KES',
        currencySymbol: 'KSh',
        phoneCode: '+254',
        flagEmoji: '🇰🇪',
        isActive: true,
      },
      {
        id: 'country_ug',
        code: 'UG',
        name: 'Uganda',
        currency: 'UGX',
        currencySymbol: 'USh',
        phoneCode: '+256',
        flagEmoji: '🇺🇬',
        isActive: true,
      },
      {
        id: 'country_tz',
        code: 'TZ',
        name: 'Tanzania',
        currency: 'TZS',
        currencySymbol: 'TSh',
        phoneCode: '+255',
        flagEmoji: '🇹🇿',
        isActive: true,
      },
      {
        id: 'country_ng',
        code: 'NG',
        name: 'Nigeria',
        currency: 'NGN',
        currencySymbol: '₦',
        phoneCode: '+234',
        flagEmoji: '🇳🇬',
        isActive: true,
      },
      {
        id: 'country_ci',
        code: 'CI',
        name: 'Côte d’Ivoire',
        currency: 'XOF',
        currencySymbol: 'CFA',
        phoneCode: '+225',
        flagEmoji: '🇨🇮',
        isActive: true,
      },
      {
        id: 'country_cm',
        code: 'CM',
        name: 'Cameroon',
        currency: 'XAF',
        currencySymbol: 'FCFA',
        phoneCode: '+237',
        flagEmoji: '🇨🇲',
        isActive: true,
      },
    ];

    // 3. Mobile Money Supported Networks
    this.mobileMoneyNetworks = [
      // Ghana
      {
        id: 'net_mtn_gh',
        countryId: 'country_gh',
        countryCode: 'GH',
        name: 'MTN Mobile Money',
        code: 'MTN_GH',
        currency: 'GHS',
        colorHex: '#FFCC00',
        isActive: true,
      },
      {
        id: 'net_telecel_gh',
        countryId: 'country_gh',
        countryCode: 'GH',
        name: 'Telecel Cash (Vodafone)',
        code: 'TELECEL_GH',
        currency: 'GHS',
        colorHex: '#E60000',
        isActive: true,
      },
      {
        id: 'net_at_gh',
        countryId: 'country_gh',
        countryCode: 'GH',
        name: 'AirtelTigo Money (AT Money)',
        code: 'AT_GH',
        currency: 'GHS',
        colorHex: '#003399',
        isActive: true,
      },
      // Kenya
      {
        id: 'net_mpesa_ke',
        countryId: 'country_ke',
        countryCode: 'KE',
        name: 'Safaricom M-Pesa',
        code: 'MPESA_KE',
        currency: 'KES',
        colorHex: '#00B140',
        isActive: true,
      },
      {
        id: 'net_airtel_ke',
        countryId: 'country_ke',
        countryCode: 'KE',
        name: 'Airtel Money Kenya',
        code: 'AIRTEL_KE',
        currency: 'KES',
        colorHex: '#E60000',
        isActive: true,
      },
      // Uganda
      {
        id: 'net_mtn_ug',
        countryId: 'country_ug',
        countryCode: 'UG',
        name: 'MTN MoMo Uganda',
        code: 'MTN_UG',
        currency: 'UGX',
        colorHex: '#FFCC00',
        isActive: true,
      },
      {
        id: 'net_airtel_ug',
        countryId: 'country_ug',
        countryCode: 'UG',
        name: 'Airtel Money Uganda',
        code: 'AIRTEL_UG',
        currency: 'UGX',
        colorHex: '#E60000',
        isActive: true,
      },
      // Tanzania
      {
        id: 'net_mpesa_tz',
        countryId: 'country_tz',
        countryCode: 'TZ',
        name: 'Vodacom M-Pesa Tanzania',
        code: 'MPESA_TZ',
        currency: 'TZS',
        colorHex: '#E60000',
        isActive: true,
      },
      {
        id: 'net_tigo_tz',
        countryId: 'country_tz',
        countryCode: 'TZ',
        name: 'Tigo Pesa',
        code: 'TIGO_TZ',
        currency: 'TZS',
        colorHex: '#00377B',
        isActive: true,
      },
      // Nigeria
      {
        id: 'net_momo_ng',
        countryId: 'country_ng',
        countryCode: 'NG',
        name: 'MoMo PSB (MTN Nigeria)',
        code: 'MOMO_NG',
        currency: 'NGN',
        colorHex: '#FFCC00',
        isActive: true,
      },
      {
        id: 'net_opay_ng',
        countryId: 'country_ng',
        countryCode: 'NG',
        name: 'OPay Wallet',
        code: 'OPAY_NG',
        currency: 'NGN',
        colorHex: '#149A67',
        isActive: true,
      },
      // Côte d'Ivoire
      {
        id: 'net_orange_ci',
        countryId: 'country_ci',
        countryCode: 'CI',
        name: 'Orange Money Côte d’Ivoire',
        code: 'ORANGE_CI',
        currency: 'XOF',
        colorHex: '#FF6600',
        isActive: true,
      },
      {
        id: 'net_mtn_ci',
        countryId: 'country_ci',
        countryCode: 'CI',
        name: 'MTN MoMo CI',
        code: 'MTN_CI',
        currency: 'XOF',
        colorHex: '#FFCC00',
        isActive: true,
      },
      // Cameroon
      {
        id: 'net_mtn_cm',
        countryId: 'country_cm',
        countryCode: 'CM',
        name: 'MTN MoMo Cameroon',
        code: 'MTN_CM',
        currency: 'XAF',
        colorHex: '#FFCC00',
        isActive: true,
      },
    ];

    // 4. Admin-Configured Receiving Accounts
    this.mobileMoneyReceivingAccounts = [
      {
        id: 'rec_gh_mtn_01',
        countryId: 'country_gh',
        countryCode: 'GH',
        countryName: 'Ghana',
        networkId: 'net_mtn_gh',
        networkName: 'MTN Mobile Money',
        accountName: 'Nanivio Ghana Tech Ltd',
        receivingPhoneNumber: '+233 24 498 7654',
        accountReferenceId: 'NV-MOMO-ACCRA',
        currency: 'GHS',
        currencySymbol: 'GH₵',
        minimumDeposit: 10.0,
        maximumDeposit: 15000.0,
        instructions:
          '1. Dial *170# on your MTN device.\n2. Select Option 1 (Transfer Money) -> MoMo User.\n3. Enter Receiving Number: +233 24 498 7654.\n4. Enter your Deposit Amount.\n5. Reference: Enter your generated Deposit Reference Code.\n6. Authorize with your MoMo PIN.\n7. Return to Nanivio and submit your Telco SMS Reference ID.',
        displayOrder: 1,
        isActive: true,
        createdAt: now - 86400000 * 30,
        updatedAt: now - 86400000 * 5,
      },
      {
        id: 'rec_gh_telecel_02',
        countryId: 'country_gh',
        countryCode: 'GH',
        countryName: 'Ghana',
        networkId: 'net_telecel_gh',
        networkName: 'Telecel Cash (Vodafone)',
        accountName: 'Nanivio Financial Holdings',
        receivingPhoneNumber: '+233 20 812 3456',
        accountReferenceId: 'NV-TCASH-01',
        currency: 'GHS',
        currencySymbol: 'GH₵',
        minimumDeposit: 10.0,
        maximumDeposit: 10000.0,
        instructions:
          '1. Dial *110# on your Telecel device.\n2. Select Send Money -> Telecel Cash User.\n3. Enter Receiving Number: +233 20 812 3456.\n4. Enter Amount and reference code.\n5. Submit your transaction ID below once SMS confirmation is received.',
        displayOrder: 2,
        isActive: true,
        createdAt: now - 86400000 * 30,
        updatedAt: now - 86400000 * 5,
      },
      {
        id: 'rec_ke_mpesa_01',
        countryId: 'country_ke',
        countryCode: 'KE',
        countryName: 'Kenya',
        networkId: 'net_mpesa_ke',
        networkName: 'Safaricom M-Pesa',
        accountName: 'Nanivio East Africa Ltd',
        receivingPhoneNumber: '247247',
        accountReferenceId: 'NANIVIO-KE',
        currency: 'KES',
        currencySymbol: 'KSh',
        minimumDeposit: 100.0,
        maximumDeposit: 150000.0,
        instructions:
          '1. Open M-Pesa -> Lipa na M-Pesa -> Paybill.\n2. Enter Business Number: 247247.\n3. Enter Account Number: NANIVIO-KE.\n4. Enter deposit amount in KSh.\n5. Enter M-Pesa PIN and confirm payment.\n6. Enter the 10-digit M-Pesa Transaction Code (e.g. QBH892XJ1) below.',
        displayOrder: 1,
        isActive: true,
        createdAt: now - 86400000 * 30,
        updatedAt: now - 86400000 * 5,
      },
      {
        id: 'rec_ug_mtn_01',
        countryId: 'country_ug',
        countryCode: 'UG',
        countryName: 'Uganda',
        networkId: 'net_mtn_ug',
        networkName: 'MTN MoMo Uganda',
        accountName: 'Nanivio Uganda Telecom Ltd',
        receivingPhoneNumber: '+256 77 123 4567',
        accountReferenceId: 'NV-UG-MOMO',
        currency: 'UGX',
        currencySymbol: 'USh',
        minimumDeposit: 5000.0,
        maximumDeposit: 5000000.0,
        instructions:
          '1. Dial *165# -> Send Money -> Enter +256 77 123 4567.\n2. Enter amount and deposit reference.\n3. Enter PIN to complete and copy the Transaction ID.',
        displayOrder: 1,
        isActive: true,
        createdAt: now - 86400000 * 30,
        updatedAt: now - 86400000 * 5,
      },
      {
        id: 'rec_ng_momo_01',
        countryId: 'country_ng',
        countryCode: 'NG',
        countryName: 'Nigeria',
        networkId: 'net_momo_ng',
        networkName: 'MoMo PSB (MTN Nigeria)',
        accountName: 'Nanivio West Africa Hub',
        receivingPhoneNumber: '+234 80 3987 6543',
        accountReferenceId: 'NV-NG-PSB',
        currency: 'NGN',
        currencySymbol: '₦',
        minimumDeposit: 1000.0,
        maximumDeposit: 1000000.0,
        instructions:
          '1. Dial *671# or transfer via bank/MoMo PSB to +234 80 3987 6543.\n2. Account Name: Nanivio West Africa Hub.\n3. Submit your payment session ID / Reference.',
        displayOrder: 1,
        isActive: true,
        createdAt: now - 86400000 * 30,
        updatedAt: now - 86400000 * 5,
      },
    ];

    // 5. Mobile Money Deposit Requests (Live Empty Initial State)
    this.mobileMoneyDepositRequests = [];

    // 6. Pricing Versions
    const pricingV1: BillingPricingVersion = {
      versionId: 'pricing_v1_0',
      versionNumber: '1.0.0',
      label: 'Standard Production Tariff 2026',
      effectiveDate: now - 86400000 * 60,
      isActive: true,
      createdBy: 'super_admin@nanivio.tech',
      createdAt: now - 86400000 * 60,
      rules: [
        {
          id: 'rule_comm_voice_ghs',
          serviceType: 'COMMUNICATION',
          usageType: 'CALL_MINUTES',
          currency: 'GHS',
          unitName: 'minute',
          ratePerUnit: 0.25,
          minimumCharge: 0.25,
          platformCommissionPercent: 0,
          taxPercent: 0,
          freeTierAllowance: 60,
          effectiveFrom: now - 86400000 * 60,
          isActive: true,
        },
        {
          id: 'rule_comm_video_ghs',
          serviceType: 'COMMUNICATION',
          usageType: 'VIDEO_MINUTES',
          currency: 'GHS',
          unitName: 'minute',
          ratePerUnit: 0.40,
          minimumCharge: 0.40,
          platformCommissionPercent: 0,
          taxPercent: 0,
          freeTierAllowance: 60,
          effectiveFrom: now - 86400000 * 60,
          isActive: true,
        },
        {
          id: 'rule_lang_voice_ghs',
          serviceType: 'LANGPRETATION',
          usageType: 'LANGPRETATION_MINUTES',
          currency: 'GHS',
          unitName: 'minute',
          ratePerUnit: 2.20,
          minimumCharge: 2.20,
          platformCommissionPercent: 0,
          taxPercent: 0,
          freeTierAllowance: 15,
          effectiveFrom: now - 86400000 * 60,
          isActive: true,
        },
        {
          id: 'rule_lang_voice_usd',
          serviceType: 'LANGPRETATION',
          usageType: 'LANGPRETATION_MINUTES',
          currency: 'USD',
          unitName: 'minute',
          ratePerUnit: 0.15,
          minimumCharge: 0.15,
          platformCommissionPercent: 0,
          taxPercent: 0,
          freeTierAllowance: 15,
          effectiveFrom: now - 86400000 * 60,
          isActive: true,
        },
        {
          id: 'rule_malvi_voice_ghs',
          serviceType: 'MALVI_AI',
          usageType: 'MALVI_VOICE_MINUTES',
          currency: 'GHS',
          unitName: 'minute',
          ratePerUnit: 0.80,
          minimumCharge: 0.80,
          platformCommissionPercent: 0,
          taxPercent: 0,
          freeTierAllowance: 50,
          effectiveFrom: now - 86400000 * 60,
          isActive: true,
        },
        {
          id: 'rule_malvi_req_usd',
          serviceType: 'MALVI_AI',
          usageType: 'MALVI_REQUESTS',
          currency: 'USD',
          unitName: 'request',
          ratePerUnit: 0.02,
          minimumCharge: 0.02,
          platformCommissionPercent: 0,
          taxPercent: 0,
          freeTierAllowance: 100,
          effectiveFrom: now - 86400000 * 60,
          isActive: true,
        },
        {
          id: 'rule_expert_comm',
          serviceType: 'EXPERT_SERVICE',
          usageType: 'EXPERT_MINUTES',
          currency: 'GHS',
          unitName: 'minute',
          ratePerUnit: 12.50,
          minimumCharge: 12.50,
          platformCommissionPercent: 15.0,
          taxPercent: 0,
          freeTierAllowance: 0,
          effectiveFrom: now - 86400000 * 60,
          isActive: true,
        },
        {
          id: 'rule_fintech_transfer_pct',
          serviceType: 'FINTECH_TRANSFER',
          usageType: 'TRANSFER_AMOUNT',
          currency: 'USD',
          unitName: 'transaction',
          ratePerUnit: 0.012,
          minimumCharge: 0.50,
          platformCommissionPercent: 100,
          taxPercent: 0,
          freeTierAllowance: 0,
          effectiveFrom: now - 86400000 * 60,
          isActive: true,
        },
      ],
    };
    this.pricingVersions.push(pricingV1);

    // 7. Subscription Plans
    this.subscriptionPlans = [
      {
        id: 'plan_free_tier',
        tier: 'free',
        name: 'Free Basic Tier',
        description: 'Standard calling and trial Langpretation for casual personal use',
        priceMonthlyUSD: 0,
        priceMonthlyGHS: 0,
        priceAnnualUSD: 0,
        priceAnnualGHS: 0,
        includedLangpretationMinutes: 15,
        includedVoiceMinutes: 60,
        includedMalviRequests: 50,
        includedStorageGB: 2,
        overageLangpretationRateUSD: 0.20,
        overageLangpretationRateGHS: 2.80,
        groupCallLimit: 4,
        canCollapseAds: false,
        b2bSeatsIncluded: 0,
        features: [
          '15 free Langpretation minutes / month',
          'Standard peer-to-peer audio & video',
          'Sponsored banner advertising',
          'Basic Malvi AI text inquiries',
        ],
        isActive: true,
      },
      {
        id: 'plan_individual_premium',
        tier: 'individual_premium',
        name: 'Individual Premium',
        description: 'Enhanced minutes, ad collapse mode, priority Agora RTC and Malvi AI',
        priceMonthlyUSD: 9.99,
        priceMonthlyGHS: 145.00,
        priceAnnualUSD: 99.00,
        priceAnnualGHS: 1450.00,
        includedLangpretationMinutes: 200,
        includedVoiceMinutes: 500,
        includedMalviRequests: 500,
        includedStorageGB: 25,
        overageLangpretationRateUSD: 0.15,
        overageLangpretationRateGHS: 2.20,
        groupCallLimit: 12,
        canCollapseAds: true,
        b2bSeatsIncluded: 0,
        features: [
          '200 Langpretation Minutes / month',
          'Ad-Collapsible Mode in All Video/Voice Calls',
          'Up to 12 participants in Group Video Rooms',
          'Priority Doctor & Legal Consultation Routing',
          'Unlimited Malvi AI Task Assistance',
        ],
        isActive: true,
      },
      {
        id: 'plan_langpretation_pro',
        tier: 'langpretation_pro',
        name: 'Langpretation Pro (Power User)',
        description: 'For active international traders, diplomats, and high-volume professionals',
        priceMonthlyUSD: 24.99,
        priceMonthlyGHS: 360.00,
        priceAnnualUSD: 249.00,
        priceAnnualGHS: 3600.00,
        includedLangpretationMinutes: 600,
        includedVoiceMinutes: 1500,
        includedMalviRequests: 2000,
        includedStorageGB: 100,
        overageLangpretationRateUSD: 0.10,
        overageLangpretationRateGHS: 1.45,
        groupCallLimit: 32,
        canCollapseAds: true,
        b2bSeatsIncluded: 1,
        features: [
          '600 Langpretation Minutes / month',
          'Zero-latency Fan-Out Translation in Large Groups',
          'Complete Ad-Free Experience',
          'Up to 32 participants in Group Video Rooms',
          'Export Call Transcripts & Certified Translations',
          'Full Malvi Voice Concierge & Analytics',
        ],
        isActive: true,
      },
      {
        id: 'plan_business_b2b',
        tier: 'business_b2b',
        name: 'Enterprise / B2B Suite',
        description: 'Multi-seat corporate portal with pooled minutes, consolidated invoicing & API',
        priceMonthlyUSD: 89.00,
        priceMonthlyGHS: 1290.00,
        priceAnnualUSD: 890.00,
        priceAnnualGHS: 12900.00,
        includedLangpretationMinutes: 2500,
        includedVoiceMinutes: 10000,
        includedMalviRequests: 10000,
        includedStorageGB: 500,
        overageLangpretationRateUSD: 0.08,
        overageLangpretationRateGHS: 1.15,
        groupCallLimit: 100,
        canCollapseAds: true,
        b2bSeatsIncluded: 10,
        features: [
          '2,500 Pooled Company Langpretation Minutes',
          '10 Team Seats included (add seats at $15/seat)',
          'Centralized B2B Invoicing & Monthly VAT Receipts',
          'Dedicated AfCFTA Corporate Trade Desk Support',
          'Custom Brand Banner & Advertisement Placement',
          'Enterprise API Keys for CRM Translation',
        ],
        isActive: true,
      },
    ];

    // 7B. Communication Minute Packages (Dedicated Selectable Minute Add-Ons)
    this.communicationMinutePackages = [
      {
        id: 'comm_pkg_60',
        name: 'Starter 60 Minutes',
        minutes: 60,
        priceUSD: 3.99,
        priceGHS: 55.00,
        description: 'Standard calling and trial speech translation for casual calling',
        validityDays: 30,
        features: [
          '60 direct voice & video calling minutes',
          'Instant balance top-up upon payment confirmation',
          'Applicable to both domestic & international routes',
          'Pay with Nanivio Service Value or Paystack',
        ],
      },
      {
        id: 'comm_pkg_150',
        name: 'Value 150 Minutes',
        minutes: 150,
        priceUSD: 8.99,
        priceGHS: 130.00,
        description: 'Popular communication pack for active weekly business and family connections',
        validityDays: 30,
        features: [
          '150 crystal-clear WebRTC audio & video minutes',
          'Priority route allocation',
          'Rolls over with active plan renewal',
          'Instant Paystack verification & activation',
        ],
      },
      {
        id: 'comm_pkg_300',
        name: 'Power 300 Minutes',
        minutes: 300,
        priceUSD: 16.99,
        priceGHS: 245.00,
        description: 'Substantial minutes allowance for cross-border trade, diaspora and consulting',
        validityDays: 60,
        features: [
          '300 minutes valid for 60 full days',
          'Low per-minute rate (GH₵ 0.81/min)',
          'High definition group audio & video access',
          'Comprehensive call record & receipt generation',
        ],
      },
      {
        id: 'comm_pkg_600',
        name: 'Executive 600 Minutes',
        minutes: 600,
        priceUSD: 29.99,
        priceGHS: 430.00,
        description: 'High-volume international communication pack for executives and regular traders',
        validityDays: 90,
        features: [
          '600 minutes valid for 90 days',
          'VIP carrier routing with lowest latency',
          'Detailed call detail records (CDR)',
          'Corporate invoice receipt included',
        ],
      },
      {
        id: 'comm_pkg_1500',
        name: 'Enterprise 1,500 Minutes',
        minutes: 1500,
        priceUSD: 69.99,
        priceGHS: 990.00,
        description: 'Ultimate commercial minute bundle for organizations, call centers, and teams',
        validityDays: 180,
        features: [
          '1,500 shared organization minutes',
          'Valid for 180 days',
          'Full AfCFTA trade corridor rate parity',
          'Instant automated Paystack settlement',
        ],
      },
    ];

    // 7C. Separate Malvi Subscription Plans (Independent from Langpretation / Communication)
    this.malviPlans = [
      {
        id: 'malvi_free',
        tier: 'free',
        name: 'Malvi Free Experience',
        tagline: 'Trial AI voice and video companion',
        description: 'Experience Malvi conversation with 3 limited trial minutes for interactive video companion',
        priceMonthlyUSD: 0,
        priceMonthlyGHS: 0,
        priceAnnualUSD: 0,
        priceAnnualGHS: 0,
        videoInteractionMinutesLimit: 3, // Very limited minutes for free users!
        voiceCapabilities: 'Basic Voice Inquiries',
        langpretationCapabilities: 'Standard phrase translations',
        aiInteractionCapabilities: 'Fundamental Q&A and Nanivio navigation',
        avatarInteractive: true,
        businessCollaboration: false,
        features: [
          '3-Minute Free Trial for Interactive Video Companion',
          'Fundamental text inquiries & navigation assistance',
          'Basic language translation assistance',
          'Platform guidance for Nanivio services',
        ],
        unavailableFeatures: [
          'Extended video avatar interaction (Locked after 3 mins)',
          'Continuous natural voice conversation',
          'Real-time Langpretation assistance during live calls',
          'Personalized context-aware memory retention',
          'Malvi Business collaborative online team sessions',
        ],
      },
      {
        id: 'malvi_basic',
        tier: 'malvi_basic',
        name: 'Malvi Basic',
        tagline: 'Essential AI communication companion',
        description: 'Fundamental AI communication functionality: Voice-based communication, basic AI conversation, Langpretation assistance, and text interaction',
        priceMonthlyUSD: 4.99,
        priceMonthlyGHS: 75.00,
        priceAnnualUSD: 49.00,
        priceAnnualGHS: 750.00,
        videoInteractionMinutesLimit: 30,
        voiceCapabilities: 'Voice-based communication with Malvi',
        langpretationCapabilities: 'Basic Langpretation assistance',
        aiInteractionCapabilities: 'Conversational task and information assistance',
        avatarInteractive: true,
        businessCollaboration: false,
        features: [
          'Voice-based communication with Malvi',
          'Basic AI conversation and reasoning',
          'Basic Langpretation assistance & translation prompts',
          'Basic text interaction and task assistance',
          'Natural communication through supported voice interfaces',
          '30 monthly interactive video companion minutes',
        ],
        unavailableFeatures: [
          'Real-time voice interaction during live phone & video calls',
          'Full human-like continuous live avatar streaming',
          'Malvi Business multi-user corporate collaboration rooms',
          'Executive summary & strategy decision support',
        ],
      },
      {
        id: 'malvi_premium',
        tier: 'malvi_premium',
        name: 'Malvi Premium',
        tagline: 'Advanced AI companion with interactive human-like avatar',
        description: 'Substantially expanded interaction capabilities: natural voice conversation, real-time Langpretation assistance, interactive onscreen AI companion/avatar, and personalized intelligence',
        priceMonthlyUSD: 14.99,
        priceMonthlyGHS: 220.00,
        priceAnnualUSD: 149.00,
        priceAnnualGHS: 2200.00,
        videoInteractionMinutesLimit: 300,
        voiceCapabilities: 'Continuous natural voice with emotional intonation',
        langpretationCapabilities: 'Real-time simultaneous Langpretation assistance',
        aiInteractionCapabilities: 'Context-aware intelligence & in-call active assistance',
        avatarInteractive: true,
        businessCollaboration: false,
        isPopular: true,
        features: [
          'Interactive human-like AI companion / avatar on screen with natural interaction',
          'Natural, continuous voice conversation with zero awkward pauses',
          'Real-time Langpretation assistance during supported voice and video calls',
          'Advanced conversational intelligence with rich, context-aware memory',
          'Personalized conversations adapting to your dialect & communication preferences',
          '300 monthly interactive video companion minutes',
          'Priority neural response routing with sub-second latency',
          'Advanced productivity & daily concierge assistance',
        ],
        unavailableFeatures: [
          'Multi-user corporate team brainstorming sessions',
          'Organization-wide pooled seats and corporate trade corridor desks',
        ],
      },
      {
        id: 'malvi_business',
        tier: 'malvi_business',
        name: 'Malvi Business',
        tagline: 'Collaborative AI environment for companies, teams & professionals',
        description: 'Dedicated business collaboration environment where real team members participate together and Malvi joins online group sessions as an active AI participant for brainstorming, strategy, and decision support',
        priceMonthlyUSD: 49.99,
        priceMonthlyGHS: 750.00,
        priceAnnualUSD: 490.00,
        priceAnnualGHS: 7500.00,
        videoInteractionMinutesLimit: 1500,
        voiceCapabilities: 'Multi-party voice conference & presentation assistance',
        langpretationCapabilities: 'Enterprise multilateral multi-dialect corporate Langpretation',
        aiInteractionCapabilities: 'Team brainstorming, SWOT, meeting summaries & action items',
        avatarInteractive: true,
        businessCollaboration: true,
        features: [
          'Genuine AI-assisted business collaboration environment with online team sessions',
          'Malvi joins real team group sessions as an active participant and co-pilot',
          'Business idea development, planning discussions, and structured brainstorming',
          'Meeting participation, live idea analysis, clarification, and critical questioning',
          'Business strategy discussions, proposal drafting, and decision-support records',
          'Automatic meeting summaries, key takeaways, and assignable action items',
          'Team Q&A sessions and persistent enterprise knowledge assistance',
          '1,500 monthly interactive video & conference assistant minutes',
          'Multi-party simultaneous Langpretation across African and global trade corridors',
        ],
      },
    ];

    // Seed default Malvi state for user_me (starts as Free Tier with 3 limited trial minutes)
    this.userMalviSubscriptions.set('user_me', {
      id: `malvi_sub_user_me_${now}`,
      userId: 'user_me',
      planId: 'malvi_free',
      tier: 'free',
      planName: 'Malvi Free Experience',
      billingCycle: 'MONTHLY',
      status: 'TRIAL',
      startedAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: now + 86400000 * 30,
      nextBillingAt: now + 86400000 * 30,
      pricePaid: 0,
      currency: 'GHS',
      videoMinutesAllowed: 3,
      videoMinutesUsed: 0,
      videoMinutesRemaining: 3,
      voiceMinutesAllowed: 15,
      voiceMinutesUsed: 0,
      voiceMinutesRemaining: 15,
      autoRenew: false,
    });

    // 8-13. User Subscriptions, Wallets, Transactions, and Invoices start empty for live users
    // All users start in live empty state and populate on registration and live usage.

    // 14. System Audit Log
    this.auditLogs.push({
      id: 'aud_b_01',
      timestamp: now - 86400000 * 60,
      adminUser: 'super_admin@nanivio.tech',
      adminRole: 'SUPER_ADMIN',
      action: 'BOOTSTRAP_UNIVERSAL_BILLING',
      targetEntityType: 'SYSTEM',
      targetEntityId: 'nanivio_billing_core',
      previousValue: null,
      newValue: { version: '1.0.0', currency: 'GHS/USD/AED' },
      reason: 'Rollout of Nanivio Dual Account Billing, Payment Gateway, and Mobile Money Ledger',
      result: 'SUCCESS',
    });
  }

  // =========================================================================
  // SEPARATED FINANCIAL ACCOUNT ACCESSORS & ATOMIC OPERATIONS
  // =========================================================================

  public getUserFinancialAccounts(userId: string): UserFinancialAccounts {
    let commMap = this.communicationWallets.get(userId);
    if (!commMap) {
      commMap = new Map();
      commMap.set('GHS', { available: 0, reserved: 0, promotional: 0 });
      commMap.set('USD', { available: 0, reserved: 0, promotional: 0 });
      commMap.set('EUR', { available: 0, reserved: 0, promotional: 0 });
      commMap.set('AED', { available: 0, reserved: 0, promotional: 0 });
      this.communicationWallets.set(userId, commMap);
    }

    let finMap = this.fintechWallets.get(userId);
    if (!finMap) {
      finMap = new Map();
      finMap.set('GHS', { available: 0, reserved: 0, promotional: 0 });
      finMap.set('USD', { available: 0, reserved: 0, promotional: 0 });
      finMap.set('EUR', { available: 0, reserved: 0, promotional: 0 });
      finMap.set('AED', { available: 0, reserved: 0, promotional: 0 });
      finMap.set('NGN', { available: 0, reserved: 0, promotional: 0 });
      this.fintechWallets.set(userId, finMap);
    }

    const symbols: Record<string, string> = {
      GHS: 'GH₵',
      USD: '$',
      EUR: '€',
      AED: 'AED',
      NGN: '₦',
      GBP: '£',
    };

    const commWallets: AccountWalletBalance[] = Array.from(commMap.entries()).map(([curr, b]) => ({
      currency: curr,
      symbol: symbols[curr] || curr,
      available: b.available,
      reserved: b.reserved,
      promotional: b.promotional,
    }));

    const finWallets: AccountWalletBalance[] = Array.from(finMap.entries()).map(([curr, b]) => ({
      currency: curr,
      symbol: symbols[curr] || curr,
      available: b.available,
      reserved: b.reserved,
      promotional: b.promotional,
    }));

    const sub = this.userSubscriptions.get(userId);

    const pendingMomo = this.mobileMoneyDepositRequests.filter(
      (r) => r.userId === userId && (r.status === 'PENDING' || r.status === 'UNDER_REVIEW')
    ).length;

    const totalTransfers = this.transactions.filter(
      (t) => t.userId === userId && t.serviceType === 'FINTECH_TRANSFER'
    ).length;

    const dynamicNvNumber = userId.startsWith('0486') ? userId : `NV-${userId.slice(-6).toUpperCase()}`;

    return {
      userId,
      nvNumber: dynamicNvNumber,
      communicationAccount: {
        accountId: `COMM_${userId}`,
        accountType: 'COMMUNICATION',
        wallets: commWallets,
        activeSubscription: sub,
        autoRenew: true,
        usageToday: {
          audioMinutes: 0,
          videoMinutes: 0,
          langpretationMinutes: 0,
        },
      },
      fintechAccount: {
        accountId: `FIN_${userId}`,
        accountType: 'FINTECH',
        wallets: finWallets,
        pendingDepositsCount: pendingMomo,
        totalTransfersCount: totalTransfers,
      },
    };
  }

  public getCommunicationBalance(userId: string, currency: string = 'GHS'): number {
    const userMap = this.communicationWallets.get(userId);
    if (!userMap) return 0;
    const wallet = userMap.get(currency);
    return wallet ? wallet.available + wallet.promotional : 0;
  }

  public getFintechBalance(userId: string, currency: string = 'GHS'): number {
    const userMap = this.fintechWallets.get(userId);
    if (!userMap) return 0;
    const wallet = userMap.get(currency);
    return wallet ? wallet.available : 0;
  }

  // ATOMIC INTERNAL TRANSFER: FINTECH -> COMMUNICATION
  public transferFintechToCommunication(
    request: FintechToCommunicationTransferRequest
  ): FintechToCommunicationTransferResult {
    const { userId, amount, currency, notes } = request;
    if (amount <= 0) {
      throw new Error('Transfer amount must be strictly greater than zero.');
    }

    const userFinMap = this.fintechWallets.get(userId);
    const userCommMap = this.communicationWallets.get(userId);

    if (!userFinMap || !userCommMap) {
      throw new Error('User financial accounts not initialized.');
    }

    const finWallet = userFinMap.get(currency) || { available: 0, reserved: 0, promotional: 0 };
    const commWallet = userCommMap.get(currency) || { available: 0, reserved: 0, promotional: 0 };

    if (finWallet.available < amount) {
      throw new Error(
        `Insufficient Fintech Balance. Available: ${currency} ${finWallet.available.toFixed(2)}, Requested: ${currency} ${amount.toFixed(2)}`
      );
    }

    const now = Date.now();
    const referenceId = `REF-NV-INT-${Math.floor(100000 + Math.random() * 900000)}`;
    const transferId = `tx_transfer_${now}`;

    // 1. Debit Fintech Balance
    finWallet.available -= amount;
    userFinMap.set(currency, finWallet);

    // 2. Credit Communication Balance
    commWallet.available += amount;
    userCommMap.set(currency, commWallet);

    // 3. Append-only Double-Entry Ledger
    const debitLedgerEntry: BillingLedgerEntry = {
      id: `ledg_deb_${now}`,
      transactionId: transferId,
      referenceId,
      accountType: 'FINTECH',
      entityType: 'USER',
      entityId: userId,
      entryType: 'FINTECH_TO_COMMUNICATION',
      debit: amount,
      credit: 0,
      balanceAfter: finWallet.available,
      currency,
      description: `Internal Transfer Debit to Communication Wallet (${currency} ${amount.toFixed(2)})`,
      timestamp: now,
      metadata: { targetAccount: 'COMMUNICATION', notes },
    };

    const creditLedgerEntry: BillingLedgerEntry = {
      id: `ledg_cred_${now}`,
      transactionId: transferId,
      referenceId,
      accountType: 'COMMUNICATION',
      entityType: 'USER',
      entityId: userId,
      entryType: 'COMMUNICATION_TOPUP',
      debit: 0,
      credit: amount,
      balanceAfter: commWallet.available,
      currency,
      description: `Internal Transfer Credit from Fintech Wallet (${currency} ${amount.toFixed(2)})`,
      timestamp: now,
      metadata: { sourceAccount: 'FINTECH', notes },
    };

    this.ledger.push(debitLedgerEntry, creditLedgerEntry);

    // 4. Record Transaction
    this.transactions.unshift({
      transactionId: transferId,
      referenceId,
      userId,
      userName: 'Kwame Mensah',
      serviceType: 'FINTECH_TRANSFER',
      usageType: 'TRANSFER_AMOUNT',
      quantity: amount,
      unit: currency,
      unitPrice: 1.0,
      subtotal: amount,
      platformFee: 0,
      providerFee: 0,
      tax: 0,
      discount: 0,
      creditApplied: 0,
      total: amount,
      currency,
      status: 'COMPLETED',
      paymentMethod: 'Fintech to Communication Transfer',
      pricingVersionId: 'pricing_v1_0',
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      notes: notes || `Moved ${currency} ${amount.toFixed(2)} from Fintech Balance to Communication Balance`,
    });

    // 5. Audit Log
    this.auditLogs.unshift({
      id: `aud_tf_${now}`,
      timestamp: now,
      adminUser: userId,
      adminRole: 'SUPPORT_ADMIN',
      action: 'INTERNAL_BALANCE_TRANSFER',
      targetEntityType: 'USER',
      targetEntityId: userId,
      previousValue: { fintech: finWallet.available + amount, communication: commWallet.available - amount },
      newValue: { fintech: finWallet.available, communication: commWallet.available },
      reason: `User initiated internal funding transfer of ${currency} ${amount}`,
      result: 'SUCCESS',
    });

    return {
      transferId,
      referenceId,
      userId,
      amount,
      currency,
      fintechBalanceAfter: finWallet.available,
      communicationBalanceAfter: commWallet.available,
      timestamp: now,
      status: 'COMPLETED',
      ledgerEntries: [debitLedgerEntry, creditLedgerEntry],
    };
  }

  // ATOMIC PEER-TO-PEER VALUE TRANSFER (Transfer Value to another Nanivio User)
  public transferPeerToPeer(
    request: PeerToPeerTransferRequest
  ): PeerToPeerTransferResult {
    const { fromUserId, fromUserName = 'Kwame Mensah', toUserId, toUserName = 'Recipient', toNvId, amount, currency, accountType, note } = request;
    if (amount <= 0) {
      throw new Error('Transfer amount must be strictly greater than zero.');
    }
    if (fromUserId === toUserId) {
      throw new Error('Cannot transfer value to yourself.');
    }

    const senderWalletMap = accountType === 'COMMUNICATION'
      ? this.communicationWallets.get(fromUserId)
      : this.fintechWallets.get(fromUserId);

    if (!senderWalletMap) {
      throw new Error('Sender financial account not initialized.');
    }

    const senderWallet = senderWalletMap.get(currency) || { available: 0, reserved: 0, promotional: 0 };
    if (senderWallet.available < amount) {
      throw new Error(
        `Insufficient ${accountType} Balance. Available: ${currency} ${senderWallet.available.toFixed(2)}, Requested: ${currency} ${amount.toFixed(2)}`
      );
    }

    // Recipient wallet map
    let recipientWalletMap = accountType === 'COMMUNICATION'
      ? this.communicationWallets.get(toUserId)
      : this.fintechWallets.get(toUserId);

    if (!recipientWalletMap) {
      recipientWalletMap = new Map();
      if (accountType === 'COMMUNICATION') {
        this.communicationWallets.set(toUserId, recipientWalletMap);
      } else {
        this.fintechWallets.set(toUserId, recipientWalletMap);
      }
    }

    let recipientWallet = recipientWalletMap.get(currency);
    if (!recipientWallet) {
      recipientWallet = { available: 0, reserved: 0, promotional: 0 };
      recipientWalletMap.set(currency, recipientWallet);
    }

    const now = Date.now();
    const referenceId = `REF-NV-P2P-${Math.floor(100000 + Math.random() * 900000)}`;
    const transferId = `tx_p2p_${now}`;

    // 1. Debit Sender
    senderWallet.available = Number((senderWallet.available - amount).toFixed(2));
    senderWalletMap.set(currency, senderWallet);

    // 2. Credit Recipient
    recipientWallet.available = Number((recipientWallet.available + amount).toFixed(2));
    recipientWalletMap.set(currency, recipientWallet);

    // 3. Double-Entry Immutable Ledger
    const debitLedgerEntry: BillingLedgerEntry = {
      id: `ledg_p2p_deb_${now}`,
      transactionId: transferId,
      referenceId,
      accountType,
      entityType: 'USER',
      entityId: fromUserId,
      entryType: 'PAYMENT',
      debit: amount,
      credit: 0,
      balanceAfter: senderWallet.available,
      currency,
      description: `Transfer Value Sent to ${toUserName} (${toNvId || toUserId})`,
      timestamp: now,
      metadata: { targetUserId: toUserId, targetUserName: toUserName, note },
    };

    const creditLedgerEntry: BillingLedgerEntry = {
      id: `ledg_p2p_cred_${now}`,
      transactionId: transferId,
      referenceId,
      accountType,
      entityType: 'USER',
      entityId: toUserId,
      entryType: 'CREDIT',
      debit: 0,
      credit: amount,
      balanceAfter: recipientWallet.available,
      currency,
      description: `Transfer Value Received from ${fromUserName}`,
      timestamp: now,
      metadata: { sourceUserId: fromUserId, sourceUserName: fromUserName, note },
    };

    this.ledger.unshift(debitLedgerEntry, creditLedgerEntry);

    // 4. Record Transaction
    this.transactions.unshift({
      transactionId: transferId,
      referenceId,
      userId: fromUserId,
      userName: fromUserName,
      serviceType: accountType === 'COMMUNICATION' ? 'COMMUNICATION' : 'FINTECH_TRANSFER',
      usageType: 'TRANSFER_AMOUNT',
      quantity: amount,
      unit: 'currency',
      unitPrice: 1,
      subtotal: amount,
      platformFee: 0,
      providerFee: 0,
      tax: 0,
      discount: 0,
      creditApplied: 0,
      total: amount,
      currency,
      status: 'COMPLETED',
      paymentMethod: `Nanivio ${accountType} Value Transfer`,
      pricingVersionId: 'pricing_v1_0',
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      notes: note || `Transferred ${currency} ${amount.toFixed(2)} to ${toUserName} (${toNvId || toUserId})`,
    });

    // 5. Audit Log
    this.auditLogs.unshift({
      id: `aud_p2p_${now}`,
      timestamp: now,
      adminUser: fromUserId,
      adminRole: 'SUPPORT_ADMIN',
      action: 'P2P_VALUE_TRANSFER',
      targetEntityType: 'USER',
      targetEntityId: toUserId,
      previousValue: { sender: senderWallet.available + amount, recipient: recipientWallet.available - amount },
      newValue: { sender: senderWallet.available, recipient: recipientWallet.available },
      reason: `User transfer of ${currency} ${amount} to ${toUserName}`,
      result: 'SUCCESS',
    });

    return {
      transferId,
      referenceId,
      fromUserId,
      toUserId,
      toUserName,
      toNvId,
      amount,
      currency,
      accountType,
      senderBalanceAfter: senderWallet.available,
      recipientBalanceAfter: recipientWallet.available,
      timestamp: now,
      status: 'COMPLETED',
      note,
    };
  }

  // =========================================================================
  // MOBILE MONEY DEPOSIT & VERIFICATION METHODS
  // =========================================================================

  public createMobileMoneyDepositRequest(data: {
    userId: string;
    userName: string;
    nvNumber?: string;
    countryCode: string;
    networkId: string;
    amountSent: number;
    currency: string;
    senderPhoneNumber: string;
    externalTransactionReference: string;
    proofNote?: string;
  }): MobileMoneyDepositRequest {
    const {
      userId,
      userName,
      nvNumber = 'NV-8829-GH',
      countryCode,
      networkId,
      amountSent,
      currency,
      senderPhoneNumber,
      externalTransactionReference,
      proofNote,
    } = data;

    // Check duplicate external reference
    const duplicate = this.mobileMoneyDepositRequests.find(
      (r) =>
        r.externalTransactionReference.trim().toLowerCase() ===
        externalTransactionReference.trim().toLowerCase()
    );
    if (duplicate) {
      throw new Error(
        'This payment reference has already been processed or is currently under review.'
      );
    }

    const country = this.mobileMoneyCountries.find((c) => c.code === countryCode);
    const network = this.mobileMoneyNetworks.find((n) => n.id === networkId);
    const receivingAccount = this.mobileMoneyReceivingAccounts.find(
      (a) => a.countryCode === countryCode && a.networkId === networkId && a.isActive
    ) || this.mobileMoneyReceivingAccounts[0];

    const now = Date.now();
    const referenceId = `REF-NV-MOMO-${Math.floor(100000 + Math.random() * 900000)}`;

    const fee = amountSent * 0.01; // 1%
    const netCredited = amountSent - fee;

    const newRequest: MobileMoneyDepositRequest = {
      id: `momo_req_${now}`,
      referenceId,
      userId,
      userName,
      nvNumber,
      countryCode,
      countryName: country?.name || 'Ghana',
      networkId,
      networkName: network?.name || 'Mobile Money',
      receivingAccountId: receivingAccount.id,
      receivingAccountName: receivingAccount.accountName,
      receivingPhoneNumber: receivingAccount.receivingPhoneNumber,
      senderPhoneNumber,
      externalTransactionReference,
      amountSent,
      currency,
      currencySymbol: country?.currencySymbol || currency,
      exchangeRateToUSD: 0.069,
      exchangeRateToGHS: 1.0,
      feeAmount: fee,
      netCreditedEstimated: netCredited,
      status: 'PENDING',
      proofNote,
      createdAt: now,
      updatedAt: now,
    };

    this.mobileMoneyDepositRequests.unshift(newRequest);
    return newRequest;
  }

  public verifyAndCreditMobileMoneyDeposit(
    depositId: string,
    adminUser: string = 'finance_admin@nanivio.tech',
    action: 'VERIFY_AND_CREDIT' | 'REJECT',
    adminNotes?: string
  ): MobileMoneyDepositRequest {
    const deposit = this.mobileMoneyDepositRequests.find((d) => d.id === depositId);
    if (!deposit) {
      throw new Error('Deposit request not found.');
    }

    if (deposit.status === 'CREDITED') {
      throw new Error('This deposit has already been credited to user balance.');
    }

    const now = Date.now();

    if (action === 'REJECT') {
      deposit.status = 'REJECTED';
      deposit.adminNotes = adminNotes || 'Rejected by finance audit team.';
      deposit.verifiedByAdmin = adminUser;
      deposit.verifiedAt = now;
      deposit.updatedAt = now;
      return deposit;
    }

    // ACTION === 'VERIFY_AND_CREDIT'
    deposit.status = 'CREDITED';
    deposit.verifiedByAdmin = adminUser;
    deposit.verifiedAt = now;
    deposit.creditedAt = now;
    deposit.adminNotes = adminNotes || 'Verified via telco settlement statement and credited.';
    deposit.updatedAt = now;

    // Credit User's FINTECH Account (NEVER Communication account directly)
    const userFinMap = this.fintechWallets.get(deposit.userId) || new Map();
    const finWallet = userFinMap.get(deposit.currency) || { available: 0, reserved: 0, promotional: 0 };

    finWallet.available += deposit.netCreditedEstimated;
    userFinMap.set(deposit.currency, finWallet);
    this.fintechWallets.set(deposit.userId, userFinMap);

    // Ledger Entry
    const ledgerEntry: BillingLedgerEntry = {
      id: `ledg_momo_${now}`,
      referenceId: deposit.referenceId,
      accountType: 'FINTECH',
      entityType: 'USER',
      entityId: deposit.userId,
      entryType: 'FINTECH_DEPOSIT',
      debit: 0,
      credit: deposit.netCreditedEstimated,
      balanceAfter: finWallet.available,
      currency: deposit.currency,
      description: `Mobile Money Deposit (${deposit.networkName}) - Ref: ${deposit.externalTransactionReference}`,
      timestamp: now,
      metadata: { depositId: deposit.id, senderNumber: deposit.senderPhoneNumber },
    };
    this.ledger.push(ledgerEntry);

    // Record Transaction
    this.transactions.unshift({
      transactionId: `tx_momo_${now}`,
      referenceId: deposit.referenceId,
      userId: deposit.userId,
      userName: deposit.userName,
      serviceType: 'FINTECH_TRANSFER',
      usageType: 'TRANSFER_AMOUNT',
      quantity: deposit.amountSent,
      unit: deposit.currency,
      unitPrice: 1.0,
      subtotal: deposit.amountSent,
      platformFee: deposit.feeAmount,
      providerFee: 0,
      tax: 0,
      discount: 0,
      creditApplied: 0,
      total: deposit.netCreditedEstimated,
      currency: deposit.currency,
      status: 'COMPLETED',
      paymentMethod: `Mobile Money (${deposit.networkName})`,
      pricingVersionId: 'pricing_v1_0',
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      notes: `Mobile Money deposit from ${deposit.senderPhoneNumber}. External Ref: ${deposit.externalTransactionReference}`,
    });

    // Audit Log
    this.auditLogs.unshift({
      id: `aud_momo_${now}`,
      timestamp: now,
      adminUser,
      adminRole: 'FINANCE_ADMIN',
      action: 'MOMO_DEPOSIT_VERIFIED_AND_CREDITED',
      targetEntityType: 'TRANSACTION',
      targetEntityId: deposit.id,
      previousValue: { status: 'PENDING' },
      newValue: { status: 'CREDITED', creditedAmount: deposit.netCreditedEstimated },
      reason: `Finance audit approval for deposit reference ${deposit.externalTransactionReference}`,
      result: 'SUCCESS',
    });

    return deposit;
  }

  // =========================================================================
  // SEPARATE MALVI SUBSCRIPTION MANAGEMENT & USAGE
  // =========================================================================

  public getUserMalviSubscription(userId: string): UserMalviSubscriptionState {
    let sub = this.userMalviSubscriptions.get(userId);
    if (!sub) {
      const now = Date.now();
      sub = {
        id: `malvi_sub_${userId}_${now}`,
        userId,
        planId: 'malvi_free',
        tier: 'free',
        planName: 'Malvi Free Experience',
        billingCycle: 'MONTHLY',
        status: 'TRIAL',
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: now + 86400000 * 30,
        nextBillingAt: now + 86400000 * 30,
        pricePaid: 0,
        currency: 'GHS',
        videoMinutesAllowed: 3,
        videoMinutesUsed: 0,
        videoMinutesRemaining: 3,
        voiceMinutesAllowed: 15,
        voiceMinutesUsed: 0,
        voiceMinutesRemaining: 15,
        autoRenew: false,
      };
      this.userMalviSubscriptions.set(userId, sub);
    }
    return sub;
  }

  public activateMalviSubscription(data: {
    userId: string;
    tier: MalviSubscriptionTier;
    billingCycle: 'MONTHLY' | 'ANNUAL';
    paymentMethod: string;
    pricePaid: number;
    currency: string;
    referenceId?: string;
  }): { subscription: UserMalviSubscriptionState; transaction: BillingTransaction; invoice: BillingInvoice } {
    const { userId, tier, billingCycle, paymentMethod, pricePaid, currency, referenceId } = data;
    const plan = this.malviPlans.find((p) => p.tier === tier) || this.malviPlans[1];
    const now = Date.now();
    const periodDays = billingCycle === 'ANNUAL' ? 365 : 30;
    const ref = referenceId || `REF-NV-MALVI-${Math.floor(100000 + Math.random() * 900000)}`;
    const txId = `tx_malvi_${now}`;

    const videoAllowed = plan.videoInteractionMinutesLimit;
    const voiceAllowed = tier === 'malvi_business' ? 1500 : tier === 'malvi_premium' ? 500 : 150;

    const newSub: UserMalviSubscriptionState = {
      id: `malvi_sub_${userId}_${now}`,
      userId,
      planId: plan.id,
      tier: plan.tier,
      planName: plan.name,
      billingCycle,
      status: 'ACTIVE',
      startedAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: now + 86400000 * periodDays,
      nextBillingAt: now + 86400000 * periodDays,
      pricePaid,
      currency,
      videoMinutesAllowed: videoAllowed,
      videoMinutesUsed: 0,
      videoMinutesRemaining: videoAllowed,
      voiceMinutesAllowed: voiceAllowed,
      voiceMinutesUsed: 0,
      voiceMinutesRemaining: voiceAllowed,
      autoRenew: true,
    };

    this.userMalviSubscriptions.set(userId, newSub);

    // Record Transaction
    const transaction: BillingTransaction = {
      transactionId: txId,
      referenceId: ref,
      userId,
      userName: 'Kwame Mensah',
      serviceType: 'MALVI_AI',
      usageType: 'MALVI_REQUESTS',
      quantity: 1,
      unit: billingCycle === 'ANNUAL' ? 'year' : 'month',
      unitPrice: pricePaid,
      subtotal: pricePaid,
      platformFee: 0,
      providerFee: 0,
      tax: 0,
      discount: 0,
      creditApplied: 0,
      total: pricePaid,
      currency,
      status: 'COMPLETED',
      paymentMethod,
      pricingVersionId: 'pricing_v1_0',
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      notes: `Activated ${plan.name} (${billingCycle}) via ${paymentMethod}`,
    };
    this.transactions.unshift(transaction);

    // Double-entry Ledger
    this.ledger.unshift({
      id: `ledg_malvi_${now}`,
      transactionId: txId,
      referenceId: ref,
      accountType: 'COMMUNICATION',
      entityType: 'USER',
      entityId: userId,
      entryType: 'PAYMENT',
      debit: pricePaid,
      credit: 0,
      balanceAfter: this.getCommunicationBalance(userId, currency),
      currency,
      description: `Malvi Subscription: ${plan.name} (${billingCycle}) via ${paymentMethod}`,
      timestamp: now,
    });

    // Official Invoice
    const invoiceNumber = `INV-MALVI-${now.toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const invoice: BillingInvoice = {
      id: `inv_malvi_${now}`,
      invoiceNumber,
      transactionReference: ref,
      userId,
      customerName: 'Kwame Mensah',
      customerEmail: 'kwame@nanivio.tech',
      items: [
        {
          id: `item_malvi_${now}`,
          description: `Nanivio ${plan.name} Subscription (${billingCycle}) - ${plan.videoInteractionMinutesLimit} Video Companion Mins`,
          serviceType: 'MALVI_AI',
          quantity: 1,
          unit: billingCycle === 'ANNUAL' ? 'year' : 'month',
          unitPrice: pricePaid,
          subtotal: pricePaid,
          discount: 0,
          total: pricePaid,
        },
      ],
      subtotal: pricePaid,
      taxRate: 0,
      taxAmount: 0,
      platformFee: 0,
      discountTotal: 0,
      creditTotal: 0,
      total: pricePaid,
      currency,
      status: 'PAID',
      issuedAt: now,
      paidAt: now,
      dueDate: now,
      paymentMethod,
      pricingVersion: '1.0.0',
      notes: `Official receipt for Malvi ${plan.name} subscription activation.`,
    };
    this.invoices.unshift(invoice);

    // System Audit Log
    this.auditLogs.unshift({
      id: `aud_malvi_${now}`,
      timestamp: now,
      adminUser: userId,
      adminRole: 'SUPPORT_ADMIN',
      action: 'MALVI_SUBSCRIPTION_ACTIVATED',
      targetEntityType: 'USER',
      targetEntityId: userId,
      previousValue: null,
      newValue: { tier: plan.tier, pricePaid, currency, billingCycle },
      reason: `Activated Malvi ${plan.name} subscription via verified ${paymentMethod}`,
      result: 'SUCCESS',
    });

    return { subscription: newSub, transaction, invoice };
  }

  public recordMalviVideoUsage(userId: string, seconds: number): {
    allowed: boolean;
    remainingMinutes: number;
    usedMinutes: number;
    isTrialExhausted: boolean;
    message?: string;
  } {
    const sub = this.getUserMalviSubscription(userId);
    const usedMinutes = Number((seconds / 60).toFixed(2));
    sub.videoMinutesUsed = Number((sub.videoMinutesUsed + usedMinutes).toFixed(2));
    sub.videoMinutesRemaining = Math.max(0, Number((sub.videoMinutesAllowed - sub.videoMinutesUsed).toFixed(2)));

    const isTrialExhausted = sub.tier === 'free' && sub.videoMinutesRemaining <= 0;

    let message: string | undefined;
    if (isTrialExhausted) {
      sub.status = 'EXPIRED';
      message = 'You have used your free 3-minute Malvi video interaction trial. Please subscribe to Malvi Premium or Malvi Business to continue experiencing Malvi video companion.';
    }

    return {
      allowed: !isTrialExhausted,
      remainingMinutes: sub.videoMinutesRemaining,
      usedMinutes: sub.videoMinutesUsed,
      isTrialExhausted,
      message,
    };
  }

  // =========================================================================
  // COMMUNICATION MINUTES PACKAGE ACTIVATION
  // =========================================================================

  public addCommunicationMinutes(data: {
    userId: string;
    packageId: string;
    minutes: number;
    pricePaid: number;
    currency: string;
    paymentMethod: string;
    referenceId?: string;
  }): {
    subscription: UserSubscriptionState;
    transaction: BillingTransaction;
    invoice: BillingInvoice;
    allowance: number;
    expiryDate: number;
  } {
    const { userId, packageId, minutes, pricePaid, currency, paymentMethod, referenceId } = data;
    const pkg = this.communicationMinutePackages.find((p) => p.id === packageId) || {
      id: packageId,
      name: `${minutes} Communication Minutes`,
      validityDays: 30,
    };

    const now = Date.now();
    const expiryDate = now + 86400000 * (pkg.validityDays || 30);
    const ref = referenceId || `REF-NV-MIN-${Math.floor(100000 + Math.random() * 900000)}`;
    const txId = `tx_min_${now}`;

    // Update User Active Subscription State
    let sub = this.userSubscriptions.get(userId);
    if (!sub) {
      sub = {
        id: `sub_${userId}_${now}`,
        userId,
        planId: 'plan_individual_premium',
        tier: 'individual_premium',
        planName: 'Individual Premium Minutes Pack',
        billingCycle: 'MONTHLY',
        status: 'ACTIVE',
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: expiryDate,
        nextBillingAt: expiryDate,
        autoRenew: false,
        pricePaid,
        currency,
        langpretationMinutesQuota: minutes,
        langpretationMinutesUsed: 0,
        langpretationMinutesRemaining: minutes,
        voiceMinutesQuota: minutes,
        voiceMinutesUsed: 0,
        malviUnitsQuota: 100,
        malviUnitsUsed: 0,
      };
    } else {
      sub.langpretationMinutesQuota += minutes;
      sub.langpretationMinutesRemaining += minutes;
      sub.voiceMinutesQuota += minutes;
      sub.currentPeriodEnd = Math.max(sub.currentPeriodEnd, expiryDate);
      sub.nextBillingAt = Math.max(sub.nextBillingAt, expiryDate);
      sub.status = 'ACTIVE';
    }

    this.userSubscriptions.set(userId, sub);

    // Record Transaction
    const transaction: BillingTransaction = {
      transactionId: txId,
      referenceId: ref,
      userId,
      userName: 'Kwame Mensah',
      serviceType: 'COMMUNICATION',
      usageType: 'CALL_MINUTES',
      quantity: minutes,
      unit: 'minute',
      unitPrice: pricePaid / minutes,
      subtotal: pricePaid,
      platformFee: 0,
      providerFee: 0,
      tax: 0,
      discount: 0,
      creditApplied: 0,
      total: pricePaid,
      currency,
      status: 'COMPLETED',
      paymentMethod,
      pricingVersionId: 'pricing_v1_0',
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      notes: `Purchased +${minutes} Communication Minutes via ${paymentMethod}`,
    };
    this.transactions.unshift(transaction);

    // Ledger
    this.ledger.unshift({
      id: `ledg_min_${now}`,
      transactionId: txId,
      referenceId: ref,
      accountType: 'COMMUNICATION',
      entityType: 'USER',
      entityId: userId,
      entryType: 'PAYMENT',
      debit: pricePaid,
      credit: 0,
      balanceAfter: this.getCommunicationBalance(userId, currency),
      currency,
      description: `Communication Minutes Purchase: +${minutes} Mins via ${paymentMethod}`,
      timestamp: now,
    });

    // Invoice
    const invoiceNumber = `INV-MIN-${now.toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const invoice: BillingInvoice = {
      id: `inv_min_${now}`,
      invoiceNumber,
      transactionReference: ref,
      userId,
      customerName: 'Kwame Mensah',
      customerEmail: 'kwame@nanivio.tech',
      items: [
        {
          id: `item_min_${now}`,
          description: `Nanivio Communication Minutes Pack (+${minutes} Mins)`,
          serviceType: 'COMMUNICATION',
          quantity: minutes,
          unit: 'minute',
          unitPrice: Number((pricePaid / minutes).toFixed(2)),
          subtotal: pricePaid,
          discount: 0,
          total: pricePaid,
        },
      ],
      subtotal: pricePaid,
      taxRate: 0,
      taxAmount: 0,
      platformFee: 0,
      discountTotal: 0,
      creditTotal: 0,
      total: pricePaid,
      currency,
      status: 'PAID',
      issuedAt: now,
      paidAt: now,
      dueDate: now,
      paymentMethod,
      pricingVersion: '1.0.0',
      notes: `Official statement for +${minutes} Communication Minutes. Valid through ${new Date(expiryDate).toLocaleDateString()}.`,
    };
    this.invoices.unshift(invoice);

    return {
      subscription: sub,
      transaction,
      invoice,
      allowance: sub.langpretationMinutesRemaining,
      expiryDate,
    };
  }

  // =========================================================================
  // PRODUCTION LANGPRETATION USAGE TRACKING & REAL-TIME METER
  // =========================================================================

  public recordLangpretationUsage(data: {
    userId: string;
    channel: 'AUDIO_CALL' | 'VIDEO_CALL' | 'GROUP_AUDIO' | 'VOICE_NOTE' | 'TEXT_CHAT';
    minutes: number;
    sourceLang: string;
    targetLang: string;
    sessionId?: string;
    provider?: string;
    costEstimateUsd?: number;
  }): {
    success: boolean;
    remainingAllowance: number;
    minutesUsed: number;
    deductedFromQuota: number;
    deductedFromBalance: number;
    meter: LangpretationMeterData;
  } {
    const { userId, channel, minutes, sourceLang, targetLang, sessionId, provider = 'palabra', costEstimateUsd } = data;
    const now = Date.now();
    const safeMinutes = Math.max(0.1, Number(minutes.toFixed(2)));
    const calculatedCost = costEstimateUsd !== undefined ? costEstimateUsd : Number((safeMinutes * 0.01).toFixed(4));

    // 1. Log to production usage table
    this.langpretationUsageLogs.unshift({
      id: `lang_use_${now}_${Math.random().toString(36).substr(2, 4)}`,
      userId,
      channel,
      minutes: safeMinutes,
      sourceLang,
      targetLang,
      timestamp: now,
      sessionId,
      provider,
      costEstimateUsd: calculatedCost,
    });

    // 2. Authoritative quota deduction
    let sub = this.userSubscriptions.get(userId);
    let deductedFromQuota = 0;
    let deductedFromBalance = 0;

    if (sub && sub.langpretationMinutesRemaining > 0) {
      deductedFromQuota = Math.min(sub.langpretationMinutesRemaining, safeMinutes);
      sub.langpretationMinutesRemaining = Math.max(0, Number((sub.langpretationMinutesRemaining - deductedFromQuota).toFixed(2)));
      sub.langpretationMinutesUsed = Number((sub.langpretationMinutesUsed + deductedFromQuota).toFixed(2));
      const remainingUncovered = Number((safeMinutes - deductedFromQuota).toFixed(2));

      if (remainingUncovered > 0) {
        // Fallback to Nanivio Service Value Balance
        const ratePerMin = 2.20; // GHS
        const costToDeduct = Number((remainingUncovered * ratePerMin).toFixed(2));
        const commMap = this.communicationWallets.get(userId);
        if (commMap) {
          const wallet = commMap.get('GHS');
          if (wallet && wallet.available >= costToDeduct) {
            wallet.available = Number((wallet.available - costToDeduct).toFixed(2));
            deductedFromBalance = costToDeduct;
          }
        }
      }
    } else {
      // Direct deduction from Service Value balance
      const ratePerMin = 2.20; // GHS
      const costToDeduct = Number((safeMinutes * ratePerMin).toFixed(2));
      const commMap = this.communicationWallets.get(userId);
      if (commMap) {
        const wallet = commMap.get('GHS');
        if (wallet && wallet.available >= costToDeduct) {
          wallet.available = Number((wallet.available - costToDeduct).toFixed(2));
          deductedFromBalance = costToDeduct;
        }
      }
    }

    const meter = this.getLangpretationMeter(userId);

    return {
      success: true,
      remainingAllowance: meter.remainingAllowance,
      minutesUsed: meter.minutesUsed,
      deductedFromQuota,
      deductedFromBalance,
      meter,
    };
  }

  public getLangpretationMeter(userId: string): LangpretationMeterData {
    const sub = this.userSubscriptions.get(userId);
    const now = Date.now();

    // Sum channel usage from actual logs
    const userLogs = this.langpretationUsageLogs.filter((l) => l.userId === userId);
    const channelBreakdown = {
      audioCalls: Number(userLogs.filter((l) => l.channel === 'AUDIO_CALL').reduce((sum, l) => sum + l.minutes, 0).toFixed(1)),
      videoCalls: Number(userLogs.filter((l) => l.channel === 'VIDEO_CALL').reduce((sum, l) => sum + l.minutes, 0).toFixed(1)),
      groupAudioCalls: Number(userLogs.filter((l) => l.channel === 'GROUP_AUDIO').reduce((sum, l) => sum + l.minutes, 0).toFixed(1)),
      voiceNotes: Number(userLogs.filter((l) => l.channel === 'VOICE_NOTE').reduce((sum, l) => sum + l.minutes, 0).toFixed(1)),
      textChat: Number(userLogs.filter((l) => l.channel === 'TEXT_CHAT').reduce((sum, l) => sum + l.minutes, 0).toFixed(1)),
    };

    const quota = sub ? sub.langpretationMinutesQuota : 0;
    const remaining = sub ? sub.langpretationMinutesRemaining : 0;
    const used = sub ? sub.langpretationMinutesUsed : 0;

    // Conventional interpreter charges ~$2.50 / GH₵ 35 per minute
    // Nanivio estimated savings = used * (35.00 - rate)
    const estimatedSavingsGHS = Number((used * 32.80).toFixed(2));
    const estimatedSavingsUSD = Number((used * 2.35).toFixed(2));

    let status: 'ACTIVE' | 'TRIAL' | 'EXHAUSTED' | 'EXPIRED' = 'ACTIVE';
    if (!sub || quota === 0) {
      status = 'EXHAUSTED';
    } else if (remaining <= 0) {
      status = 'EXHAUSTED';
    } else if (sub.currentPeriodEnd < now) {
      status = 'EXPIRED';
    } else if (sub.tier === 'free') {
      status = 'TRIAL';
    }

    return {
      remainingAllowance: remaining,
      monthlyQuota: quota,
      minutesUsed: used,
      estimatedSavingsGHS,
      estimatedSavingsUSD,
      status,
      currentPeriodStart: sub ? sub.currentPeriodStart : now,
      currentPeriodEnd: sub ? sub.currentPeriodEnd : now + 86400000 * 30,
      tier: sub ? sub.tier : 'free',
      planName: sub ? sub.planName : 'Free Basic Tier',
      channelBreakdown,
    };
  }
}

export const billingDb = new BillingDatabase();
