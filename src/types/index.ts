import { LanguageRegistryItem, INITIAL_LANGUAGE_REGISTRY } from '../i18n/languages';
export type { LanguageRegistryItem };
export { INITIAL_LANGUAGE_REGISTRY };

export type SupportedLanguageCode = string;

export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  region: string;
  locale?: string;
  direction?: 'ltr' | 'rtl';
  ui?: boolean;
  translation?: boolean;
  speechRecognition?: boolean;
  textToSpeech?: boolean;
  voiceTranslation?: boolean;
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = INITIAL_LANGUAGE_REGISTRY;

export type LangpretationState = 'OFF' | 'Starting' | 'ON' | 'Translating' | 'Unavailable' | 'Error';

export type CallType = 'audio_1on1' | 'video_1on1' | 'group_audio' | 'group_video';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

export interface Participant {
  id: string;
  nvId?: string; // Permanent Nanivio User ID
  nanivioNumber?: string; // Unique Nanivio Phone/User ID alias
  name: string;
  username?: string; // e.g. @kwame_asante
  statusMessage?: string; // Custom status bio e.g. "Available", "Consulting patients"
  email?: string;
  avatar: string;
  initials: string;
  myLanguage: SupportedLanguageCode; // Target translation/recipient language
  appLanguage?: string; // App / Interface language
  speakingLanguage?: string; // User's active speaking language
  translationLanguage?: string; // User's preferred translation language
  country?: string;
  isOnline?: boolean;
  lastSeen?: number;
  onlineVisibility?: 'everyone' | 'contacts' | 'nobody';
  profilePhotoVisibility?: 'everyone' | 'contacts' | 'nobody';
  isMuted?: boolean;
  isCameraOff?: boolean;
  isSpeaking?: boolean;
  isExpert?: boolean;
  role?: 'user' | 'expert' | 'host' | 'business' | 'admin' | 'driver';
  expertRatePerMin?: number;
}

export interface CallSession {
  id: string;
  channelName?: string;
  type: CallType;
  status: CallStatus;
  host: Participant;
  participants: Participant[];
  startedAt?: number;
  durationSeconds: number;
  langpretationEnabled: boolean;
  langpretationState: LangpretationState;
  activeSpeakerId?: string;
  
  // Live receiver-only transcript
  currentTranscript?: {
    speakerId: string;
    speakerName: string;
    speakerLang: SupportedLanguageCode;
    textInReceiverLang: string; // ONLY in the receiver's My Language!
    timestamp: number;
  };
  
  // Billing tracking (server authoritative)
  isPaidServiceCall: boolean;
  expertId?: string;
  expertRatePerMin: number;
  billedMinutes: number;
  accruedCost: number;
  langpretationMinutesUsed: number;
}

export interface VoiceNoteData {
  id: string;
  duration: number; // in seconds
  audioBlobUrl?: string;
  translatedAudioUrl?: string;
  waveform: number[];
  transcript?: string;
  translatedTranscript?: string; // in receiver's language
  hasLangpretation: boolean;
  sourceLang?: string;
  targetLang?: string;
  provider?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderLang: SupportedLanguageCode;
  text: string;
  translatedText?: string; // Translated into viewer's My Language
  timestamp: number;
  isVoiceNote?: boolean;
  voiceNote?: VoiceNoteData;
  isTranslated?: boolean;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  mediaType?: 'text' | 'image' | 'video' | 'document';
  mediaUrl?: string;
  mediaFileName?: string;
  mediaFileSize?: string;
  mediaCaption?: string;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
    mediaType?: 'text' | 'image' | 'video' | 'document';
  };
  isForwarded?: boolean;
  isDeleted?: boolean;
  mentions?: string[]; // @usernames
  reactions?: { emoji: string; count: number; users: string[] }[];
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  title: string;
  avatar: string;
  participants: Participant[];
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
  isExpertChat?: boolean;
  expertCategory?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  isMuted?: boolean;
  mutedUntil?: number; // timestamp until muted, or Infinity for always
  groupDescription?: string;
  groupAdmins?: string[]; // IDs of admins
  groupCreatedBy?: string;
  isSpam?: boolean;
  isBlocked?: boolean;
  isRestricted?: boolean;
}

export interface UserSecuritySession {
  id: string;
  device: string;
  browser: string;
  ip: string;
  location: string;
  lastActive: number;
  isCurrent: boolean;
  isSuspicious?: boolean;
}

export interface UserSettings {
  privacy: {
    lastSeen: 'everyone' | 'contacts' | 'nobody';
    onlineStatus: 'everyone' | 'contacts' | 'nobody';
    profilePhoto: 'everyone' | 'contacts' | 'nobody';
    readReceipts: boolean;
    blockedUsers: string[]; // array of participant IDs or NV numbers
    restrictedUsers: string[];
  };
  notifications: {
    messagesEnabled: boolean;
    soundEnabled: boolean;
    soundTone: 'chime' | 'modern' | 'subtle' | 'pulse';
    previewEnabled: boolean;
    missedCallAlerts: boolean;
    mentionsAlerts: boolean;
    vibrationEnabled: boolean;
  };
  dataUsage: {
    autoDownloadPhotos: 'wifi' | 'cellular_wifi' | 'never';
    autoDownloadVideos: 'wifi' | 'cellular_wifi' | 'never';
    autoDownloadDocuments: 'wifi' | 'cellular_wifi' | 'never';
    lowDataModeForCalls: boolean;
  };
  theme: 'dark' | 'light' | 'midnight' | 'system';
  languages?: {
    appLanguage: string;
    speakingLanguage: string;
    translationLanguage: string;
  };
}

export interface SafetyReport {
  id: string;
  targetId: string;
  targetName: string;
  reason: 'spam' | 'harassment' | 'impersonation' | 'suspicious' | 'inappropriate' | 'other';
  details?: string;
  timestamp: number;
}

export interface ExpertProvider {
  id: string;
  name: string;
  title: string;
  category: 'Healthcare & Medicine' | 'Legal & Immigration' | 'Tech & AI' | 'Language & Interpreters' | 'Business & Trade' | 'Education & Tutors';
  rating: number;
  reviewCount: number;
  avatar: string;
  initials: string;
  bio: string;
  location: string;
  primaryLanguage: SupportedLanguageCode;
  supportedLanguages: SupportedLanguageCode[];
  ratePerMinGHS: number;
  ratePerMinUSD: number;
  isOnline: boolean;
  isVerified: boolean;
  availableFor: ('audio' | 'video' | 'chat')[];
  specialties: string[];
}

export interface LiveAdCampaign {
  id: string;
  businessName: string;
  tagline: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  category: string;
  badge: string;
  bannerImage: string;
  logo: string;
  isPromoted: boolean;
  targetCountries: string[];
  active: boolean;
}

export type PlanTier = 'free' | 'individual_premium' | 'langpretation_pro' | 'business_b2b' | 'expert_provider';

export interface UserBillingPlan {
  tier: PlanTier;
  name: string;
  description?: string;
  monthlyPriceUSD: number;
  monthlyPriceGHS: number;
  langpretationMinutesQuota: number; // per month
  langpretationMinutesPerMonth?: number;
  langpretationMinutesRemaining: number;
  canCollapseAds: boolean;
  groupCallLimit: number;
  features: string[];
}

export interface WalletCurrencyBalance {
  currency: 'GHS' | 'USD' | 'EUR' | 'GBP' | 'NGN' | 'KES' | 'XOF';
  symbol: string;
  amount: number;
  flag: string;
}

export interface FinancialTransaction {
  id: string;
  type: 'expert_consultation' | 'langpretation_bundle' | 'subscription' | 'transfer_sent' | 'transfer_received' | 'deposit' | 'withdrawal';
  title: string;
  description: string;
  amount: number;
  currency: string;
  fee: number;
  status: 'completed' | 'processing' | 'failed';
  timestamp: number;
  recipient?: string;
  channel?: 'MTN MoMo' | 'Telecel Cash' | 'AirtelTigo Money' | 'Visa/Mastercard' | 'Nanivio Wallet';
}

export interface AdminFeatureSwitches {
  freeCallsForAllUsers: boolean; // Master toggle: When ON, calls are free for all users worldwide. When OFF, metered by subscription/minute quota.
  callMinutesWarningApproved?: boolean; // When true, admin permits in-call minutes running notifications. When false (default), normal audio and video calling is 100% free with no warnings.
  audioCallsEnabled: boolean;
  videoCallsEnabled: boolean;
  liveAdsEnabled: boolean;
  liveServicesEnabled: boolean;
  expertsEnabled: boolean;
  langpretationEnabled: boolean;
  voiceNoteLangpretationEnabled: boolean;
  groupAudioEnabled: boolean;
  groupVideoEnabled: boolean;
  groupLangpretationEnabled: boolean;
  paidCallsEnabled: boolean;
  b2bPremiumEnabled: boolean;
  fintechEnabled: boolean;
  commFintechEnabled: boolean; // Master toggle to switch off Fintech/Transfers from Communication Hub
  maintenanceMode: boolean;
  allowPaidAdCollapse: boolean;
  // Ride-Hailing, Google Maps & Driver Fleet Operations
  nanivioRideEnabled?: boolean; // Master toggle to switch on/off Nanivio Ride
  nanivioDriveEnabled?: boolean; // Master toggle to switch on/off entire Nanivio Drive (Rides, Rentals, Driver Cockpit, Fleet Dispatch)
  rideHailingEnabled?: boolean;
  googleMapsSdkEnabled?: boolean;
  driverPartnerAppEnabled?: boolean;
  driverInstantAcceptanceSimEnabled?: boolean;
  realtimeGpsTrackingEnabled?: boolean;
  malviAiAssistantEnabled?: boolean;
}

export interface AdminPricingEngine {
  langpretationPerMinuteRateUSD: number;
  langpretationPerMinuteRateGHS: number;
  langpretationPerMinuteRateEUR?: number;
  langpretationPerMinuteRateGBP?: number;
  langpretationPerMinuteRateAED?: number;
  langpretationPerMinuteRateNGN?: number;
  voiceNoteLangpretationRateGHS: number;
  platformExpertCommissionPercent: number; // e.g. 15%
  b2bSeatMonthlyRateUSD: number;
  fintechTransferFeePercent: number; // e.g. 1.2%
  freeTierLangpretationMinutes: number;
  referralBonusMinutes?: number;
  referralBonusCreditUSD?: number;
  referralBonusCreditGHS?: number;
  // Ride Hailing & Driver Fleet Pricing Engine
  rideBaseFareGHS?: number;
  ridePerKmRateGHS?: number;
  ridePerMinuteRateGHS?: number;
  rideSurgeMultiplier?: number;
  driverCommissionPercent?: number; // e.g. 15% platform cut / 85% driver earnings
  rideCancellationFeeGHS?: number;
}

export type MalviAvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted' | 'processing' | 'success' | 'warning' | 'error';

export interface MalviToolProposal {
  id: string;
  type: 'transfer' | 'langpretation' | 'call' | 'book_expert' | 'admin_switch' | 'admin_pricing' | 'navigate';
  status: 'pending_confirmation' | 'confirmed' | 'executed' | 'cancelled';
  title: string;
  description: string;
  requiresConfirmation: boolean;
  details: {
    recipient?: string;
    amount?: number;
    currency?: string;
    channel?: string;
    fee?: number;
    expertName?: string;
    expertId?: string;
    targetLang?: string;
    sourceLang?: string;
    featureKey?: keyof AdminFeatureSwitches;
    featureValue?: boolean;
    pricingKey?: keyof AdminPricingEngine;
    pricingValue?: number;
    targetTab?: 'chat' | 'calls' | 'malvi' | 'services' | 'billing' | 'account' | 'admin' | 'contacts';
    callType?: 'audio' | 'video';
  };
}

export interface MalviAuditEntry {
  id: string;
  timestamp: number;
  adminUser: string;
  action: string;
  targetResource: string;
  result: 'success' | 'failed' | 'denied';
  details: string;
}

export interface MalviActionCommand {
  type: 'navigate' | 'langpretation' | 'find_expert' | 'start_call' | 'propose_send_money' | 'admin_action' | 'execute_tool';
  target?: 'chat' | 'calls' | 'malvi' | 'services' | 'billing' | 'account' | 'admin' | 'contacts';
  enable?: boolean;
  sourceLang?: string;
  targetLang?: string;
  category?: string;
  expertName?: string;
  recipient?: string;
  amount?: number;
  currency?: string;
  proposal?: MalviToolProposal;
}

export interface MalviMemoryWallet {
  currency: 'GHS' | 'USD' | 'EUR' | 'GBP' | 'NGN' | 'KES' | 'XOF';
  symbol: string;
  amount: number;
  flag: string;
}

export interface MalviMemoryTransaction {
  id: string;
  type: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  fee: number;
  status: string;
  timestamp: number;
  timeAgo: string;
  recipient?: string;
  channel?: string;
}

export interface MalviMemoryChatSummary {
  id: string;
  title: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage?: string;
  lastMessageTimeAgo?: string;
}

export interface MalviMemoryActiveMessage {
  id: string;
  senderName: string;
  text: string;
  translatedText?: string;
  senderLang: string;
  isVoiceNote?: boolean;
  voiceTranscript?: string;
  timeAgo: string;
}

export interface MalviMemoryExpert {
  id: string;
  name: string;
  title: string;
  category: string;
  rating: number;
  ratePerMinGHS: number;
  ratePerMinUSD: number;
  isOnline: boolean;
  isVerified: boolean;
  location: string;
  specialties: string[];
}

export interface MalviContextMemory {
  wallets: MalviMemoryWallet[];
  recentTransactions: MalviMemoryTransaction[];
  currentPlan: {
    name: string;
    tier: string;
    minutesRemaining: number;
    minutesQuota: number;
    monthlyPriceGHS: number;
    monthlyPriceUSD: number;
  };
  recentConversations: MalviMemoryChatSummary[];
  activeConversation?: {
    id: string;
    title: string;
    isGroup: boolean;
    messages: MalviMemoryActiveMessage[];
  };
  activeCall?: {
    id: string;
    type: string;
    status: string;
    hostName: string;
    participants: string[];
    durationSeconds: number;
    durationFormatted: string;
    langpretationState: string;
    billedMinutes: number;
    currentTranscript?: string;
  } | null;
  verifiedExperts: MalviMemoryExpert[];
  currentUser: {
    id: string;
    name: string;
    myLanguage: string;
    myLanguageName: string;
    role: string;
  };
  activeView: string;
  timestamp: number;
}

export interface MalviChatMessage {
  id: string;
  sender: 'user' | 'malvi' | 'system';
  text: string;
  timestamp: number;
  mode?: 'voice' | 'text';
  emotion?: 'warm' | 'calm' | 'empathetic' | 'enthusiastic' | 'focused' | 'caring' | 'analytical';
  detectedIntent?: string;
  suggestedActions?: string[];
  actionCommand?: MalviActionCommand | null;
  proposal?: MalviToolProposal | null;
  audioUrl?: string;
  isAdminResponse?: boolean;
}

export interface SavedContact {
  id: string;
  nvId: string; // Permanent Nanivio Number (e.g. 0486482190)
  name: string;
  phone?: string;
  avatar?: string;
  initials?: string;
  preferredLanguage?: SupportedLanguageCode;
  notes?: string;
  category?: 'Personal' | 'Work' | 'Medical' | 'Business' | 'Family';
  isFavorite?: boolean;
  createdAt: number;
  lastContactedAt?: number;
}

export interface CallLogRecord {
  id: string;
  participantId?: string;
  participantNvId?: string;
  participantName: string;
  participantAvatar?: string;
  callType: 'audio' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  timestamp: number;
  durationSeconds: number;
  hasLangpretation: boolean;
  isExpertConsultation?: boolean;
  costGHS?: number;
}

export interface ChatNotificationToast {
  id: string;
  conversationId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  timestamp: number;
}

export * from './billing';
export * from './auth';
export * from './drive';

export type NavigationTab =
  | 'home'
  | 'chat'
  | 'calls'
  | 'contacts'
  | 'nvnumber'
  | 'services'
  | 'billing'
  | 'account'
  | 'admin'
  | 'ride'
  | 'malvi';


