import {
  Participant,
  SavedContact,
  ExpertProvider,
  LiveAdCampaign,
  Conversation,
  ChatMessage,
  FinancialTransaction,
  WalletCurrencyBalance,
  UserBillingPlan,
  AdminFeatureSwitches,
  AdminPricingEngine,
  UserSettings,
  UserSecuritySession,
} from '../types';

export function getOrCreateGuestNvId(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const existing = localStorage.getItem('nanivio_guest_nv_id');
      if (existing && /^0486\d{6}$/.test(existing)) {
        return existing;
      }
      const newSix = Math.floor(100000 + Math.random() * 900000).toString();
      const newNvId = `0486${newSix}`;
      localStorage.setItem('nanivio_guest_nv_id', newNvId);
      return newNvId;
    }
  } catch {}
  return '0486' + Math.floor(100000 + Math.random() * 900000).toString();
}

export const CURRENT_USER: Participant = {
  id: 'usr_new_user',
  nvId: '',
  nanivioNumber: '',
  name: 'New User',
  username: 'new_user',
  statusMessage: '✨ Welcome to Nanivio Global Network',
  email: '',
  avatar: '',
  initials: 'NV',
  myLanguage: 'en',
  role: 'user',
  isOnline: true,
  onlineVisibility: 'everyone',
  profilePhotoVisibility: 'everyone',
};

export const INITIAL_SAVED_CONTACTS: SavedContact[] = [];

export const CONTACT_PARTICIPANTS: Participant[] = [];

export const INITIAL_EXPERTS: ExpertProvider[] = [];

export const INITIAL_ADS: LiveAdCampaign[] = [];

export const INITIAL_CONVERSATIONS: Conversation[] = [];

export const INITIAL_MESSAGES: Record<string, ChatMessage[]> = {};

export const INITIAL_WALLETS: WalletCurrencyBalance[] = [
  { currency: 'GHS', symbol: 'GH₵', amount: 0.00, flag: '🇬🇭' },
  { currency: 'USD', symbol: '$', amount: 0.00, flag: '🇺🇸' },
  { currency: 'EUR', symbol: '€', amount: 0.00, flag: '🇪🇺' },
  { currency: 'GBP', symbol: '£', amount: 0.00, flag: '🇬🇧' },
  { currency: 'NGN', symbol: '₦', amount: 0.00, flag: '🇳🇬' },
  { currency: 'XOF', symbol: 'CFA', amount: 0.00, flag: '🇨🇮' },
];

export const INITIAL_TRANSACTIONS: FinancialTransaction[] = [];

export const USER_PLANS: UserBillingPlan[] = [
  {
    tier: 'free',
    name: 'Free Basic',
    monthlyPriceUSD: 0,
    monthlyPriceGHS: 0,
    langpretationMinutesQuota: 0,
    langpretationMinutesRemaining: 0,
    canCollapseAds: false,
    groupCallLimit: 4,
    features: [
      'Normal audio and video calls (Unlimited)',
      'Direct & Group chat with instant text translation',
      'Pay-as-you-go Langpretation with Nanivio credit balance',
      'Optional 15-Minute Free Langpretation Trial on demand',
      'Access to verified professional specialists',
    ],
  },
  {
    tier: 'individual_premium',
    name: 'Individual Premium',
    monthlyPriceUSD: 8.99,
    monthlyPriceGHS: 130.00,
    langpretationMinutesQuota: 90,
    langpretationMinutesRemaining: 0,
    canCollapseAds: true,
    groupCallLimit: 12,
    features: [
      '90 Langpretation audio/video minutes per month',
      'Collapsible / Ad-Free Live Services experience',
      'Unlimited Voice-Note Langpretation',
      'Priority routing with ultra-low latency neural engine',
      'HD Video Calling & Group Fan-Out',
    ],
  },
  {
    tier: 'langpretation_pro',
    name: 'Langpretation Unlimited Pro',
    monthlyPriceUSD: 19.99,
    monthlyPriceGHS: 290.00,
    langpretationMinutesQuota: 300,
    langpretationMinutesRemaining: 0,
    canCollapseAds: true,
    groupCallLimit: 25,
    features: [
      '300 High-Fidelity Langpretation Minutes',
      'No Live Ads during calls or sessions',
      'Simultaneous multi-dialect recognition (Twi, Yoruba, Swahili, etc.)',
      'Multi-Party Group Fan-Out Langpretation',
      'Dedicated VIP Audio Route',
    ],
  },
  {
    tier: 'business_b2b',
    name: 'B2B Enterprise',
    monthlyPriceUSD: 79.00,
    monthlyPriceGHS: 1150.00,
    langpretationMinutesQuota: 1500,
    langpretationMinutesRemaining: 0,
    canCollapseAds: true,
    groupCallLimit: 100,
    features: [
      '1,500 Pooled Company Langpretation Minutes',
      'Custom Organization Dashboard & Seat Management',
      'Audit logs, centralized billing, and invoice settlement',
      'API access & dedicated AfCFTA trade corridor routing',
      'Zero ads across entire corporate workspace',
    ],
  },
];

export const INITIAL_ADMIN_PAYMENT_GATEWAYS = {
  mobileMoney: { enabled:false, mtnMoMoNumber:'', mtnMerchantName:'', telecelCashShortcode:'', telecelMerchantName:'', mpesaTillNumber:'', airteltigoNumber:'', feePercent:0, instructions:'Mobile-money provider integration is not enabled until a verified provider account is connected.' },
  cardPayment: { enabled:true, processor:'Paystack' as const, supportedBrands:['Visa','Mastercard'], feePercent:0, require3DSecure:true, publicKey:'' },
  payPal: { enabled:false, merchantEmail:'', clientId:'', mode:'live' as const, feePercent:0 },
  googlePay: { enabled:false, merchantId:'', merchantName:'', feePercent:0, environment:'PRODUCTION' as const },
  applePay: { enabled:false, merchantIdentifier:'', domainName:'', feePercent:0 },
  bankPayment: { enabled:false, bankName:'', accountName:'', accountNumber:'', iban:'', swiftBic:'', branchCode:'', country:'', currency:'', feePercent:0, wireInstructions:'Bank settlement integration is not enabled.' },
};

export const INITIAL_USER_SETTINGS: UserSettings = {
  privacy: {
    lastSeen: 'everyone',
    onlineStatus: 'everyone',
    profilePhoto: 'everyone',
    readReceipts: true,
    blockedUsers: [],
    restrictedUsers: [],
  },
  notifications: {
    messagesEnabled: true,
    soundEnabled: true,
    soundTone: 'chime',
    previewEnabled: true,
    missedCallAlerts: true,
    mentionsAlerts: true,
    vibrationEnabled: true,
  },
  dataUsage: {
    autoDownloadPhotos: 'cellular_wifi',
    autoDownloadVideos: 'wifi',
    autoDownloadDocuments: 'wifi',
    lowDataModeForCalls: false,
  },
  theme: 'midnight',
};

export const INITIAL_SECURITY_SESSIONS: UserSecuritySession[] = [
  {
    id: 'sess_live_current',
    device: typeof navigator !== 'undefined' ? (navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser') : 'Current Session',
    browser: typeof navigator !== 'undefined' ? (navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Safari') ? 'Safari' : 'Web Browser') : 'Web Browser',
    ip: 'Live Secure Session',
    location: 'Current Connected Location',
    lastActive: Date.now(),
    isCurrent: true,
    isSuspicious: false,
  },
];


