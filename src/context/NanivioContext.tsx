import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  SupportedLanguageCode,
  SUPPORTED_LANGUAGES,
  Participant,
  SavedContact,
  CallSession,
  CallType,
  CallStatus,
  LangpretationState,
  ChatMessage,
  Conversation,
  ExpertProvider,
  LiveAdCampaign,
  WalletCurrencyBalance,
  FinancialTransaction,
  UserBillingPlan,
  PlanTier,
  AdminFeatureSwitches,
  AdminPricingEngine,
  VoiceNoteData,
  MalviContextMemory,
  CallLogRecord,
  ChatNotificationToast,
  UserSettings,
  UserSecuritySession,
  SafetyReport,
  NavigationTab,
} from '../types';
import { NanivioTranslatorEngine } from '../lib/translator-engine/engine';
import {
  CURRENT_USER,
  CONTACT_PARTICIPANTS,
  INITIAL_SAVED_CONTACTS,
  INITIAL_EXPERTS,
  INITIAL_ADS,
  INITIAL_CONVERSATIONS,
  INITIAL_MESSAGES,
  INITIAL_WALLETS,
  INITIAL_TRANSACTIONS,
  USER_PLANS,
  INITIAL_ADMIN_PAYMENT_GATEWAYS,
  INITIAL_USER_SETTINGS,
  INITIAL_SECURITY_SESSIONS,
  getOrCreateGuestNvId,
} from '../data/mockData';
import { lookupNanivioUser } from '../utils/userLookup';
import { agoraClient, AgoraTelemetryStats } from '../lib/agoraClient';
import { streamClient, StreamClientState } from '../lib/streamClient';
import { realtimeClient, IncomingCallEvent, RealtimeUser } from '../lib/realtimeClient';
import { buildMalviContextMemory } from '../lib/malviMemory';
import { billingClient, UserBillingSummaryResponse } from '../lib/billingClient';
import i18n from '../i18n';
import {
  startRingtone,
  startIncomingRingtone,
  playCallConnectedTone,
  playCallEndedTone,
  playChatMessageTone,
  playMessageSentTone,
  showBrowserNotification,
  RingtoneHandle,
} from '../utils/dtmfTones';
import {
  BillingTransaction,
  BillingInvoice,
  BillingSubscriptionPlan,
  UserSubscriptionState,
  BillingUsageSession,
  BillingPromotionalCredit,
  BillingDispute,
  BillingPreviewRequest,
  BillingPreviewResponse,
  EmergencyBillingControls,
  AdminPaymentGatewayDetails,
  CommunicationMinutePackage,
  MalviSubscriptionPlan,
  MalviSubscriptionTier,
  UserMalviSubscriptionState,
  LangpretationMeterData,
} from '../types/billing';
import type {
  NanivioUser,
  AccountRole,
  AccountStatus,
  VerificationStatus,
  ExpertApplication,
  BusinessApplication,
  DriverVerificationApplication,
  DriverSignUpData,
  AdminAuditLogEntry,
  UserDossierResponse,
  PersonalSignUpData,
  ExpertSignUpData,
  BusinessSignUpData,
} from '../types/auth';
import { authClient } from '../lib/authClient';

interface NanivioContextType {
  // Authentication & Permanent NV Identity
  authUser: NanivioUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  authMode: 'signin' | 'personal' | 'expert' | 'business' | 'admin' | 'driver';
  setAuthMode: (mode: 'signin' | 'personal' | 'expert' | 'business' | 'admin' | 'driver') => void;
  signIn: (identifier: string, password: string) => Promise<NanivioUser>;
  signUpPersonal: (data: PersonalSignUpData) => Promise<NanivioUser>;
  signUpExpert: (data: ExpertSignUpData) => Promise<NanivioUser>;
  signUpBusiness: (data: BusinessSignUpData) => Promise<NanivioUser>;
  signUpDriver: (data: DriverSignUpData) => Promise<NanivioUser>;
  signOut: () => Promise<void>;
  updateUserProfile: (updates: Partial<NanivioUser>) => Promise<void>;
  quickSwitchDemoUser: (role: 'personal' | 'expert' | 'business' | 'admin' | 'driver') => Promise<void>;
  signInWithAdminToken: (masterKey: string) => Promise<NanivioUser>;

  // Admin Operations & Review Queues
  adminUsersList: NanivioUser[];
  adminExpertsList: ExpertApplication[];
  adminBusinessesList: BusinessApplication[];
  adminDriversList: DriverVerificationApplication[];
  adminAuditLogs: AdminAuditLogEntry[];
  fetchAdminUsers: (q?: string, role?: AccountRole, status?: AccountStatus) => Promise<void>;
  searchDossierByNvId: (nvId: string) => Promise<UserDossierResponse | null>;
  updateUserStatus: (userId: string, status: AccountStatus, reason?: string) => Promise<void>;
  adminGrantUserSubscriptionOrMinutes: (
    userId: string,
    tier: string,
    minutes: number,
    isTrial: boolean,
    notes?: string
  ) => Promise<{ success: boolean; message: string; user: NanivioUser; subscription: any }>;
  fetchAdminExperts: (status?: VerificationStatus) => Promise<void>;
  reviewExpert: (appId: string, action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'SUSPEND', notes?: string) => Promise<void>;
  toggleExpertFeatured: (appId: string, featured: boolean) => Promise<void>;
  fetchAdminBusinesses: (status?: VerificationStatus) => Promise<void>;
  reviewBusiness: (appId: string, action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'SUSPEND', notes?: string) => Promise<void>;
  fetchAdminDrivers: (status?: VerificationStatus) => Promise<void>;
  reviewDriver: (appId: string, action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'SUSPEND', notes?: string) => Promise<void>;
  fetchAdminAuditLogs: (limit?: number, targetNvId?: string, action?: string) => Promise<void>;

  // Navigation & User
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  currentUser: Participant;
  inCallNotice: { type: 'warning' | 'fallback' | 'exhausted'; message: string; timestamp: number } | null;
  dismissInCallNotice: () => void;
  // Separated Language Concepts
  appLanguage: string;
  setAppLanguage: (lang: string) => void;
  speakingLanguage: string;
  setSpeakingLanguage: (lang: string) => void;
  translationLanguage: string;
  setTranslationLanguage: (lang: string) => void;
  myLanguage: SupportedLanguageCode;
  setMyLanguage: (lang: SupportedLanguageCode) => void;
  globalLangpretationEnabled: boolean;
  setGlobalLangpretationEnabled: (val: boolean) => void;
  
  // Cross-View Contextual Memory Layer for Malvi AI
  getMalviMemorySnapshot: () => MalviContextMemory;
  
  // Audio & Video Calling (Powered by Agora RTC Engine & Live WebRTC Signaling)
  activeCall: CallSession | null;
  incomingCall: IncomingCallEvent | null;
  onlineUsers: RealtimeUser[];
  agoraStats: AgoraTelemetryStats;
  callLogs: CallLogRecord[];
  clearCallLogs: () => void;
  start1on1Call: (contact: Participant, type: 'audio' | 'video', isExpert?: boolean, expert?: ExpertProvider) => void;
  startGroupCall: (participants: Participant[], type: 'audio' | 'video') => void;
  forceConnectCall: () => void;
  acceptIncomingCall: (callId?: string) => void;
  declineIncomingCall: (callId?: string) => void;
  endCall: () => void;
  toggleCallLangpretation: () => void;
  toggleCallMute: () => void;
  toggleCallVideo: () => void;
  simulateSpeakerUtterance: (speakerId: string, text: string) => Promise<void>;
  
  // Chat & Voice Notes (Powered by GetStream Chat)
  streamState: StreamClientState;
  conversations: Conversation[];
  activeConversationId: string;
  setActiveConversationId: (id: string) => void;
  messages: Record<string, ChatMessage[]>;
  chatNotificationToast: ChatNotificationToast | null;
  dismissChatNotificationToast: () => void;
  sendMessage: (text: string) => Promise<void>;
  sendVoiceNote: (duration: number, transcript: string) => Promise<void>;
  sendMediaMessage: (media: {
    type: 'image' | 'video' | 'document';
    url: string;
    caption?: string;
    fileName?: string;
    fileSize?: string;
  }) => Promise<void>;
  deleteMessage: (conversationId: string, messageId: string) => void;
  reactToMessage: (conversationId: string, messageId: string, emoji: string) => void;
  forwardMessage: (message: ChatMessage, targetConvIds: string[]) => Promise<void>;
  replyingToMessage: ChatMessage | null;
  setReplyingToMessage: (msg: ChatMessage | null) => void;
  pinConversation: (convId: string) => void;
  archiveConversation: (convId: string) => void;
  muteConversation: (convId: string) => void;
  createGroup: (title: string, description: string, participantIds: string[], avatar?: string) => Promise<Conversation>;
  updateGroup: (convId: string, updates: { title?: string; description?: string }) => void;
  addMembersToGroup: (convId: string, participantIds: string[]) => void;
  removeMemberFromGroup: (convId: string, participantId: string) => void;
  promoteGroupAdmin: (convId: string, participantId: string) => void;
  dismissGroupAdmin: (convId: string, participantId: string) => void;
  startDirectChatWithUser: (participant: Participant) => string;
  startDirectChatByNvId: (nvId: string) => Promise<{ success: boolean; conversationId?: string; error?: string }>;

  // User Settings, Privacy & Safety
  userSettings: UserSettings;
  updateUserSettings: (updates: Partial<UserSettings>) => void;
  userSecuritySessions: UserSecuritySession[];
  terminateOtherSessions: () => void;
  deleteAccount: (reason?: string) => Promise<void>;
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  restrictUser: (userId: string) => void;
  unrestrictUser: (userId: string) => void;
  submitSafetyReport: (report: Omit<SafetyReport, 'id' | 'timestamp'>, shouldBlock?: boolean, shouldRestrict?: boolean) => Promise<void>;

  // Settings & Edit Profile Modals
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: (open: boolean) => void;
  settingsActiveTab: 'privacy' | 'notifications' | 'data' | 'language' | 'theme' | 'security' | 'account' | 'about';
  setSettingsActiveTab: (tab: 'privacy' | 'notifications' | 'data' | 'language' | 'theme' | 'security' | 'account' | 'about') => void;
  isEditProfileModalOpen: boolean;
  setIsEditProfileModalOpen: (open: boolean) => void;

  // Saved Contacts & Directory Module
  contacts: SavedContact[];
  addContact: (contact: Omit<SavedContact, 'id' | 'createdAt'>) => Promise<SavedContact>;
  updateContact: (id: string, updates: Partial<SavedContact>) => void;
  deleteContact: (id: string) => void;
  toggleFavoriteContact: (id: string) => void;
  
  // Live Ads & Services
  experts: ExpertProvider[];
  ads: LiveAdCampaign[];
  selectedExpert: ExpertProvider | null;
  setSelectedExpert: (exp: ExpertProvider | null) => void;
  isLiveAdsCollapsed: boolean;
  toggleLiveAdsCollapse: () => void;
  
  // Fintech & Billing
  wallets: WalletCurrencyBalance[];
  transactions: FinancialTransaction[];
  currentPlan: UserBillingPlan;
  changePlan: (tier: PlanTier) => void;
  sendMoney: (recipientName: string, amount: number, currency: 'GHS' | 'USD', channel: string, note?: string) => Promise<boolean>;
  buyLangpretationBundle: (minutes: number, costGHS: number) => Promise<void>;
  depositViaGateway: (
    gateway: 'mobileMoney' | 'cardPayment' | 'payPal' | 'googlePay' | 'applePay' | 'bankPayment',
    amount: number,
    currency: string,
    details?: any
  ) => Promise<{ success: boolean; referenceId: string; message: string }>;
  transferP2PByNvId: (
    recipientNvId: string,
    amount: number,
    currency: string,
    note?: string
  ) => Promise<{ success: boolean; recipientName?: string; referenceId?: string; error?: string }>;
  subscribeWithGateway: (
    planTier: PlanTier,
    gateway: 'mobileMoney' | 'cardPayment' | 'payPal' | 'googlePay' | 'applePay' | 'bankPayment',
    cycle: 'MONTHLY' | 'ANNUAL',
    details?: any
  ) => Promise<{ success: boolean; referenceId: string; message: string }>;
  topUpMinutesWithGateway: (
    minutes: number,
    cost: number,
    currency: string,
    gateway: 'mobileMoney' | 'cardPayment' | 'payPal' | 'googlePay' | 'applePay' | 'bankPayment',
    details?: any
  ) => Promise<{ success: boolean; referenceId: string; message: string }>;

  // Universal Billing & Monetization Engine State & Methods
  billingSummary: UserBillingSummaryResponse | null;
  billingPlans: BillingSubscriptionPlan[];
  userInvoices: BillingInvoice[];
  userDisputes: BillingDispute[];
  activeUsageSession: BillingUsageSession | null;
  emergencyControls: EmergencyBillingControls | null;
  refreshBilling: () => Promise<void>;
  previewBillingCharge: (req: BillingPreviewRequest) => Promise<BillingPreviewResponse>;
  startBillingSession: (params: {
    sessionId: string;
    serviceType: string;
    usageType: string;
    currency?: string;
    isLangpretationActive?: boolean;
    providerId?: string;
    sourceLang?: string;
    targetLang?: string;
  }) => Promise<BillingUsageSession>;
  updateBillingMeter: (sessionId: string, elapsedSeconds: number) => Promise<BillingUsageSession | null>;
  completeBillingSession: (sessionId: string) => Promise<{ transaction: BillingTransaction; invoice: BillingInvoice } | null>;
  redeemBillingVoucher: (code: string) => Promise<{ credit: BillingPromotionalCredit; message: string }>;
  createBillingDispute: (params: { transactionId: string; reason: string; userExplanation: string }) => Promise<BillingDispute>;
  upgradeSubscriptionPlan: (tier: string, cycle?: 'MONTHLY' | 'ANNUAL') => Promise<UserSubscriptionState>;

  // Admin Center & Payment Gateway Settings
  adminFeatures: AdminFeatureSwitches;
  adminPricing: AdminPricingEngine;
  adminPaymentGateways: AdminPaymentGatewayDetails;
  updateAdminFeature: (key: keyof AdminFeatureSwitches, value: boolean) => void;
  updateAdminPricing: (key: keyof AdminPricingEngine, value: number) => void;
  updatePaymentGatewayDetails: (gatewayKey: keyof AdminPaymentGatewayDetails, updates: any) => void;
  adminAdjustUserMinutes: (minutesToAdd: number, reason?: string) => void;
  adminAdjustUserQuota: (newQuota: number) => void;
  
  // Subscription & Live Langpretation Meter State
  isSubscribed: boolean;
  isFreeTrialActive: boolean;
  freeTrialMinutesRemaining: number;
  usedLangpretationMinutes: number;
  startFreeTrial: () => void;
  adminSetMeterDigits: (remaining: number, quota: number, used?: number) => void;
  adminSetSubscriptionStatus: (isSubscribed: boolean, isFreeTrial: boolean, trialMinutes?: number) => void;

  // Communication Minutes, Separate Malvi Subscriptions & Production Live Meter
  communicationMinutePackages: CommunicationMinutePackage[];
  malviPlans: MalviSubscriptionPlan[];
  malviSubscription: UserMalviSubscriptionState | null;
  langpretationMeter: LangpretationMeterData | null;
  isMalviHubOpen: boolean;
  setIsMalviHubOpen: (open: boolean) => void;
  isMinutesModalOpen: boolean;
  setIsMinutesModalOpen: (open: boolean) => void;
  purchaseCommunicationMinutes: (packageId: string, paymentMethod?: 'SERVICE_VALUE' | 'PAYSTACK', currency?: string) => Promise<any>;
  subscribeMalviPlan: (tier: MalviSubscriptionTier, cycle?: 'MONTHLY' | 'ANNUAL', paymentMethod?: 'SERVICE_VALUE' | 'PAYSTACK', currency?: string) => Promise<any>;
  recordLangpretationUsage: (channel: 'AUDIO_CALL' | 'VIDEO_CALL' | 'GROUP_AUDIO' | 'VOICE_NOTE' | 'TEXT_CHAT', minutes: number, sourceLang?: string, targetLang?: string, sessionId?: string) => Promise<any>;
  recordMalviVideoUsage: (seconds: number) => Promise<any>;
  pendingBillingAction: {
    subTab?: 'overview' | 'flow' | 'plans' | 'transfer' | 'calculator' | 'invoices' | 'disputes' | 'b2b' | 'malvi';
    planTier?: string;
    cycle?: 'MONTHLY' | 'ANNUAL';
    purpose?: 'SUBSCRIPTION' | 'MALVI_SUBSCRIPTION' | 'COMMUNICATION_MINUTES';
  } | null;
  setPendingBillingAction: React.Dispatch<React.SetStateAction<{
    subTab?: 'overview' | 'flow' | 'plans' | 'transfer' | 'calculator' | 'invoices' | 'disputes' | 'b2b' | 'malvi';
    planTier?: string;
    cycle?: 'MONTHLY' | 'ANNUAL';
    purpose?: 'SUBSCRIPTION' | 'MALVI_SUBSCRIPTION' | 'COMMUNICATION_MINUTES';
  } | null>>;
  openBillingWithPlan: (tier: string, purpose?: 'SUBSCRIPTION' | 'MALVI_SUBSCRIPTION', cycle?: 'MONTHLY' | 'ANNUAL') => void;

  // Cinematic Video Effect
  activeCelebrationEffect: { show: boolean; mode: 'signin' | 'signup' | 'intro' } | null;
  triggerCelebrationEffect: (mode: 'signin' | 'signup' | 'intro') => void;
  clearCelebrationEffect: () => void;
  
  // Modals / UI
  isLanguageModalOpen: boolean;
  setIsLanguageModalOpen: (open: boolean) => void;
}

const NanivioContext = createContext<NanivioContextType | undefined>(undefined);

export const NanivioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Navigation - default to communication home experience
  const [activeTab, setActiveTab] = useState<NavigationTab>('home');
  const [inCallNotice, setInCallNotice] = useState<{ type: 'warning' | 'fallback' | 'exhausted'; message: string; timestamp: number } | null>(null);
  const dismissInCallNotice = useCallback(() => setInCallNotice(null), []);

  // Authentication & Permanent NV Identity State
  const [authUser, setAuthUser] = useState<NanivioUser | null>(() => authClient.getStoredUser());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!authClient.getToken());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'signin' | 'personal' | 'expert' | 'business' | 'admin' | 'driver'>('signin');
  const [activeCelebrationEffect, setActiveCelebrationEffect] = useState<{ show: boolean; mode: 'signin' | 'signup' | 'intro' } | null>(null);

  const triggerCelebrationEffect = useCallback((mode: 'signin' | 'signup' | 'intro') => {
    setActiveCelebrationEffect({ show: true, mode });
  }, []);

  const clearCelebrationEffect = useCallback(() => {
    setActiveCelebrationEffect(null);
  }, []);

  // Admin Review & Directory State
  const [adminUsersList, setAdminUsersList] = useState<NanivioUser[]>([]);
  const [adminExpertsList, setAdminExpertsList] = useState<ExpertApplication[]>([]);
  const [adminBusinessesList, setAdminBusinessesList] = useState<BusinessApplication[]>([]);
  const [adminDriversList, setAdminDriversList] = useState<DriverVerificationApplication[]>([]);
  const [adminAuditLogs, setAdminAuditLogs] = useState<AdminAuditLogEntry[]>([]);
  
  // User Profile & Language (Twi as default signature showcase)
  const [currentUser, setCurrentUser] = useState<Participant>(() => {
    const stored = authClient.getStoredUser();
    if (stored) {
      const initials = (stored.firstName.charAt(0) + stored.lastName.charAt(0)).toUpperCase() || 'NV';
      const mappedRole: 'user' | 'expert' | 'business' | 'admin' | 'driver' =
        stored.role === 'ADMIN'
          ? 'admin'
          : stored.role === 'EXPERT'
          ? 'expert'
          : stored.role === 'BUSINESS'
          ? 'business'
          : stored.role === 'DRIVER'
          ? 'driver'
          : 'user';
      return {
        id: stored.id,
        nvId: stored.nvId,
        nanivioNumber: stored.nvId,
        name: stored.displayName,
        email: stored.email,
        avatar: stored.avatar || '',
        initials,
        myLanguage: stored.preferredLanguage,
        country: stored.country,
        role: mappedRole,
        isExpert: stored.role === 'EXPERT',
      };
    }
    const guestNvId = getOrCreateGuestNvId();
    return {
      ...CURRENT_USER,
      nvId: guestNvId,
      nanivioNumber: guestNvId,
    };
  });

  const isAdmin = authUser?.role === 'ADMIN' || currentUser?.role === 'admin';

  const syncCurrentUserFromAuth = useCallback((user: NanivioUser) => {
    setAuthUser(user);
    const initials = (user.firstName.charAt(0) + user.lastName.charAt(0)).toUpperCase() || 'NV';
    const mappedRole: 'user' | 'expert' | 'business' | 'admin' | 'driver' =
      user.role === 'ADMIN'
        ? 'admin'
        : user.role === 'EXPERT'
        ? 'expert'
        : user.role === 'BUSINESS'
        ? 'business'
        : user.role === 'DRIVER'
        ? 'driver'
        : 'user';

    setCurrentUser({
      id: user.id,
      nvId: user.nvId,
      nanivioNumber: user.nvId,
      name: user.displayName,
      email: user.email,
      avatar: user.avatar || '',
      initials,
      myLanguage: user.preferredLanguage,
      country: user.country,
      role: mappedRole,
      isExpert: user.role === 'EXPERT',
      expertRatePerMin: user.role === 'EXPERT' ? 12.5 : undefined,
    });
    setMyLanguageState(user.preferredLanguage);
  }, []);

  // Sync session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const stored = authClient.getStoredUser();
        if (stored) {
          syncCurrentUserFromAuth(stored);
          setIsAuthenticated(true);
        }
        const serverUser = await authClient.getSession();
        if (serverUser) {
          syncCurrentUserFromAuth(serverUser);
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.warn('Session verification fallback to stored session:', err);
      }
    };
    checkSession();
  }, [syncCurrentUserFromAuth]);

  // Auth Operations
  const signIn = useCallback(async (identifier: string, password: string) => {
    const res = await authClient.signIn(identifier, password);
    syncCurrentUserFromAuth(res.user);
    setIsAuthenticated(true);
    setIsAuthModalOpen(false);
    setActiveTab(res.user.role === 'ADMIN' ? 'admin' : res.user.role === 'DRIVER' ? 'services' : 'account');
    setActiveCelebrationEffect({ show: true, mode: 'signin' });
    return res.user;
  }, [syncCurrentUserFromAuth]);

  const signUpPersonal = useCallback(async (data: PersonalSignUpData) => {
    const res = await authClient.registerPersonal(data);
    syncCurrentUserFromAuth(res.user);
    setIsAuthenticated(true);
    setIsAuthModalOpen(false);
    setActiveTab('account');
    setActiveCelebrationEffect({ show: true, mode: 'signup' });
    return res.user;
  }, [syncCurrentUserFromAuth]);

  const signUpExpert = useCallback(async (data: ExpertSignUpData) => {
    const res = await authClient.registerExpert(data);
    syncCurrentUserFromAuth(res.user);
    setIsAuthenticated(true);
    setIsAuthModalOpen(false);
    setActiveTab('account');
    setActiveCelebrationEffect({ show: true, mode: 'signup' });
    return res.user;
  }, [syncCurrentUserFromAuth]);

  const signUpBusiness = useCallback(async (data: BusinessSignUpData) => {
    const res = await authClient.registerBusiness(data);
    syncCurrentUserFromAuth(res.user);
    setIsAuthenticated(true);
    setIsAuthModalOpen(false);
    setActiveTab('account');
    setActiveCelebrationEffect({ show: true, mode: 'signup' });
    return res.user;
  }, [syncCurrentUserFromAuth]);

  const signUpDriver = useCallback(async (data: DriverSignUpData) => {
    const res = await authClient.registerDriver(data);
    syncCurrentUserFromAuth(res.user);
    setIsAuthenticated(true);
    setIsAuthModalOpen(false);
    setActiveTab('services');
    setActiveCelebrationEffect({ show: true, mode: 'signup' });
    return res.user;
  }, [syncCurrentUserFromAuth]);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    setAuthUser(null);
    setIsAuthenticated(false);
    setCurrentUser(CURRENT_USER);
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<NanivioUser>) => {
    const updated = await authClient.updateProfile(updates);
    syncCurrentUserFromAuth(updated);
  }, [syncCurrentUserFromAuth]);

  const quickSwitchDemoUser = useCallback(async (role: 'personal' | 'expert' | 'business' | 'admin' | 'driver') => {
    try {
      if (role === 'personal') {
        await signIn('0486782914', 'NanivioUser2026!');
      } else if (role === 'expert') {
        await signIn('0486482190', 'ExpertUser2026!');
      } else if (role === 'business') {
        await signIn('0486602188', 'BusinessUser2026!');
      } else if (role === 'admin') {
        await signIn('0486000001', 'NanivioAdmin2026!');
      } else if (role === 'driver') {
        await signIn('0486821940', 'DriverUser2026!');
      }
      setActiveTab(role === 'admin' ? 'admin' : role === 'driver' ? 'services' : 'account');
    } catch (err) {
      console.error('Quick switch demo failed:', err);
    }
  }, [signIn]);

  const signInWithAdminToken = useCallback(async (masterKey: string) => {
    const res = await authClient.signInWithAdminToken(masterKey);
    syncCurrentUserFromAuth(res.user);
    setIsAuthenticated(true);
    setIsAuthModalOpen(false);
    setActiveTab('admin');
    setActiveCelebrationEffect({ show: true, mode: 'signin' });
    return res.user;
  }, [syncCurrentUserFromAuth]);

  // Live services dynamic experts sync
  const refreshLiveExperts = useCallback(async () => {
    try {
      const liveApps = await authClient.getLiveVerifiedExperts();
      if (liveApps.length > 0) {
        const mapped: ExpertProvider[] = liveApps.map((app) => ({
          id: app.id,
          name: app.fullName,
          avatar: app.avatar,
          initials: app.fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'EX',
          title: app.title,
          category: (app.category as any) || 'Tech & AI',
          rating: 4.9,
          reviewCount: 32,
          bio: app.bio,
          location: app.location || app.country,
          primaryLanguage: app.languages[0] || 'en',
          supportedLanguages: app.languages,
          ratePerMinUSD: app.ratePerMinUSD,
          ratePerMinGHS: app.ratePerMinGHS,
          isOnline: app.isOnline !== false,
          isVerified: true,
          availableFor: app.consultationTypes,
          specialties: app.specialties,
        }));
        setExperts((prev) => {
          const existingIds = new Set(mapped.map((m) => m.id));
          const rest = prev.filter((p) => !existingIds.has(p.id));
          return [...mapped, ...rest];
        });
      }
    } catch (err) {
      console.warn('Failed to load dynamic live experts:', err);
    }
  }, []);

  useEffect(() => {
    refreshLiveExperts();
  }, [refreshLiveExperts]);

  // Admin operations
  const fetchAdminUsers = useCallback(async (q?: string, role?: AccountRole, status?: AccountStatus) => {
    const list = await authClient.getAdminUsers(q, role, status);
    setAdminUsersList(list);
  }, []);

  const searchDossierByNvId = useCallback(async (nvId: string) => {
    return await authClient.searchByNvId(nvId);
  }, []);

  const updateUserStatus = useCallback(async (userId: string, status: AccountStatus, reason?: string) => {
    await authClient.updateUserStatus(userId, status, reason);
    await fetchAdminUsers();
  }, [fetchAdminUsers]);

  const adminGrantUserSubscriptionOrMinutes = useCallback(async (
    userId: string,
    tier: string,
    minutes: number,
    isTrial: boolean,
    notes?: string
  ) => {
    const res = await authClient.grantUserSubscriptionOrMinutes(userId, tier, minutes, isTrial, notes);
    if (authUser && (authUser.id === userId || authUser.nvId === userId) && res.subscription) {
      setCurrentPlan((prev) => ({
        ...prev,
        tier: res.subscription.tier,
        planName: res.subscription.planName,
        status: res.subscription.status === 'ACTIVE' ? 'active' : 'trial',
        langpretationMinutesQuota: res.subscription.langpretationMinutesQuota,
        langpretationMinutesRemaining: res.subscription.langpretationMinutesRemaining,
        langpretationMinutesUsed: res.subscription.langpretationMinutesUsed || 0,
      }));
      if (res.subscription.status === 'TRIAL') {
        setIsFreeTrialActive(true);
        setFreeTrialMinutesRemaining(res.subscription.langpretationMinutesRemaining);
      }
    }
    await fetchAdminUsers();
    return res;
  }, [authUser, fetchAdminUsers]);

  const fetchAdminExperts = useCallback(async (status?: VerificationStatus) => {
    const list = await authClient.getAdminExperts(status);
    setAdminExpertsList(list);
  }, []);

  const reviewExpert = useCallback(async (appId: string, action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'SUSPEND', notes?: string) => {
    await authClient.reviewExpert(appId, action, notes);
    await fetchAdminExperts();
    if (action === 'APPROVE') {
      await refreshLiveExperts();
    }
  }, [fetchAdminExperts, refreshLiveExperts]);

  const toggleExpertFeatured = useCallback(async (appId: string, featured: boolean) => {
    await authClient.toggleExpertFeatured(appId, featured);
    await fetchAdminExperts();
  }, [fetchAdminExperts]);

  const fetchAdminBusinesses = useCallback(async (status?: VerificationStatus) => {
    const list = await authClient.getAdminBusinesses(status);
    setAdminBusinessesList(list);
  }, []);

  const reviewBusiness = useCallback(async (appId: string, action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'SUSPEND', notes?: string) => {
    await authClient.reviewBusiness(appId, action, notes);
    await fetchAdminBusinesses();
  }, [fetchAdminBusinesses]);

  const fetchAdminDrivers = useCallback(async (status?: VerificationStatus) => {
    const list = await authClient.getAdminDrivers(status);
    setAdminDriversList(list);
  }, []);

  const reviewDriver = useCallback(async (appId: string, action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'SUSPEND', notes?: string) => {
    await authClient.reviewDriver(appId, action, notes);
    await fetchAdminDrivers();
  }, [fetchAdminDrivers]);

  const fetchAdminAuditLogs = useCallback(async (limit?: number, targetNvId?: string, action?: string) => {
    const logs = await authClient.getAdminAuditLogs(limit, targetNvId, action);
    setAdminAuditLogs(logs);
  }, []);
  const [appLanguage, setAppLanguageState] = useState<string>(() => {
    try {
      return localStorage.getItem('nanivio_app_language') || 'en';
    } catch {
      return 'en';
    }
  });

  const [speakingLanguage, setSpeakingLanguageState] = useState<string>(() => {
    try {
      return localStorage.getItem('nanivio_speaking_language') || 'ak';
    } catch {
      return 'ak';
    }
  });

  const [translationLanguage, setTranslationLanguageState] = useState<string>(() => {
    try {
      return localStorage.getItem('nanivio_translation_language') || 'en';
    } catch {
      return 'en';
    }
  });

  const [myLanguage, setMyLanguageState] = useState<SupportedLanguageCode>(() => {
    try {
      return localStorage.getItem('nanivio_translation_language') || 'ak';
    } catch {
      return 'ak';
    }
  });
  const [globalLangpretationEnabled, setGlobalLangpretationEnabled] = useState<boolean>(true);
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState<boolean>(false);

  // Chat
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const saved = localStorage.getItem('nanivio_chat_conversations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (c: any) =>
              c.id &&
              !c.id.startsWith('conv_mr_nifty') &&
              !c.id.startsWith('conv_dr_kwame') &&
              !c.id.startsWith('conv_fatima') &&
              !c.id.startsWith('conv_nanivio_system') &&
              !['conv_1', 'conv_2', 'conv_3', 'conv_4'].includes(c.id)
          );
        }
      }
    } catch {
      // fallback
    }
    return [];
  });
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(() => {
    try {
      const saved = localStorage.getItem('nanivio_chat_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) {
          delete parsed['conv_mr_nifty'];
          delete parsed['conv_dr_kwame'];
          delete parsed['conv_fatima'];
          delete parsed['conv_nanivio_system'];
          delete parsed['conv_1'];
          delete parsed['conv_2'];
          delete parsed['conv_3'];
          delete parsed['conv_4'];
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    return {};
  });
  const [streamState, setStreamState] = useState<StreamClientState>(streamClient.getState());

  useEffect(() => {
    try {
      localStorage.setItem('nanivio_chat_conversations', JSON.stringify(conversations));
    } catch {}
  }, [conversations]);

  useEffect(() => {
    try {
      localStorage.setItem('nanivio_chat_messages', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Active tab & Active conversation refs for realtime filtering
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;

  // Clear unread count when user is viewing the conversation
  useEffect(() => {
    if (activeTab === 'chat' && activeConversationId) {
      setConversations((prev) => {
        const target = prev.find((c) => c.id === activeConversationId);
        if (!target || !target.unreadCount) return prev;
        return prev.map((c) => (c.id === activeConversationId ? { ...c, unreadCount: 0 } : c));
      });
    }
  }, [activeTab, activeConversationId]);

  // Subscription & Live Langpretation Meter State
  const [isSubscribed, setIsSubscribed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nanivio_is_subscribed');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const [isFreeTrialActive, setIsFreeTrialActive] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nanivio_is_free_trial');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const [freeTrialMinutesRemaining, setFreeTrialMinutesRemaining] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('nanivio_free_trial_remaining');
      return saved ? Number(saved) : 15;
    } catch {
      return 15;
    }
  });

  const [usedLangpretationMinutes, setUsedLangpretationMinutes] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('nanivio_used_langpretation_mins');
      return saved ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });

  // Billing & Plans - Digits show 0 when not subscribed unless on free trial
  const [currentPlan, setCurrentPlan] = useState<UserBillingPlan>(() => {
    try {
      const sub = localStorage.getItem('nanivio_is_subscribed') === 'true';
      const trial = localStorage.getItem('nanivio_is_free_trial') === 'true';
      const trialMins = localStorage.getItem('nanivio_free_trial_remaining');
      const savedMins = localStorage.getItem('nanivio_current_plan_rem');
      const savedQuota = localStorage.getItem('nanivio_current_plan_quota');

      if (sub) {
        const base = USER_PLANS[1]; // Individual Premium
        return {
          ...base,
          langpretationMinutesRemaining: savedMins !== null ? Number(savedMins) : base.langpretationMinutesRemaining,
          langpretationMinutesQuota: savedQuota !== null ? Number(savedQuota) : base.langpretationMinutesQuota,
        };
      }
      if (trial) {
        const mins = trialMins !== null ? Number(trialMins) : 15;
        return {
          ...USER_PLANS[0],
          name: '15-Minute Free Trial',
          langpretationMinutesRemaining: mins,
          langpretationMinutesQuota: 15,
        };
      }
      // Not subscribed and not on free trial: all digits show 0
      return {
        ...USER_PLANS[0],
        name: 'Unsubscribed',
        langpretationMinutesRemaining: 0,
        langpretationMinutesQuota: 0,
      };
    } catch {
      return {
        ...USER_PLANS[0],
        name: 'Unsubscribed',
        langpretationMinutesRemaining: 0,
        langpretationMinutesQuota: 0,
      };
    }
  });

  const [wallets, setWallets] = useState<WalletCurrencyBalance[]>(INITIAL_WALLETS);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>(INITIAL_TRANSACTIONS);

  // Admin Payment Gateways Configuration State
  const [adminPaymentGateways, setAdminPaymentGateways] = useState<AdminPaymentGatewayDetails>(() => {
    try {
      const saved = localStorage.getItem('nanivio_admin_payment_gateways');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load payment gateways from storage:', e);
    }
    return INITIAL_ADMIN_PAYMENT_GATEWAYS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('nanivio_admin_payment_gateways', JSON.stringify(adminPaymentGateways));
    } catch (e) {
      console.warn('Failed to save payment gateways:', e);
    }
  }, [adminPaymentGateways]);

  const updatePaymentGatewayDetails = useCallback((gatewayKey: keyof AdminPaymentGatewayDetails, updates: any) => {
    setAdminPaymentGateways((prev) => ({
      ...prev,
      [gatewayKey]: {
        ...prev[gatewayKey],
        ...updates,
      },
    }));
  }, []);

  const startFreeTrial = useCallback(() => {
    setIsFreeTrialActive(true);
    setIsSubscribed(false);
    setFreeTrialMinutesRemaining(15);
    try {
      localStorage.setItem('nanivio_is_free_trial', 'true');
      localStorage.setItem('nanivio_is_subscribed', 'false');
      localStorage.setItem('nanivio_free_trial_remaining', '15');
      localStorage.setItem('nanivio_current_plan_rem', '15');
      localStorage.setItem('nanivio_current_plan_quota', '15');
    } catch (_) {}
    setCurrentPlan({
      ...USER_PLANS[0],
      name: '15-Minute Free Trial',
      langpretationMinutesRemaining: 15,
      langpretationMinutesQuota: 15,
    });
    try {
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
    } catch (_) {}
  }, []);

  const adminSetMeterDigits = useCallback((remaining: number, quota: number, used?: number) => {
    setCurrentPlan((prev) => ({
      ...prev,
      langpretationMinutesRemaining: Math.max(0, remaining),
      langpretationMinutesQuota: Math.max(0, quota),
    }));
    if (used !== undefined) {
      setUsedLangpretationMinutes(Math.max(0, used));
      try {
        localStorage.setItem('nanivio_used_langpretation_mins', String(Math.max(0, used)));
      } catch (_) {}
    }
    try {
      localStorage.setItem('nanivio_current_plan_rem', String(Math.max(0, remaining)));
      localStorage.setItem('nanivio_current_plan_quota', String(Math.max(0, quota)));
    } catch (_) {}
  }, []);

  const adminSetSubscriptionStatus = useCallback((sub: boolean, trial: boolean, trialMins?: number) => {
    setIsSubscribed(sub);
    setIsFreeTrialActive(trial);
    try {
      localStorage.setItem('nanivio_is_subscribed', sub ? 'true' : 'false');
      localStorage.setItem('nanivio_is_free_trial', trial ? 'true' : 'false');
      if (trialMins !== undefined) {
        localStorage.setItem('nanivio_free_trial_remaining', String(trialMins));
        setFreeTrialMinutesRemaining(trialMins);
      }
    } catch (_) {}

    if (sub) {
      const plan = USER_PLANS[1];
      setCurrentPlan(plan);
      try {
        localStorage.setItem('nanivio_current_plan_rem', String(plan.langpretationMinutesRemaining));
        localStorage.setItem('nanivio_current_plan_quota', String(plan.langpretationMinutesQuota));
      } catch (_) {}
    } else if (trial) {
      const mins = trialMins ?? 15;
      setCurrentPlan({
        ...USER_PLANS[0],
        name: '15-Minute Free Trial',
        langpretationMinutesRemaining: mins,
        langpretationMinutesQuota: 15,
      });
      try {
        localStorage.setItem('nanivio_current_plan_rem', String(mins));
        localStorage.setItem('nanivio_current_plan_quota', '15');
      } catch (_) {}
    } else {
      setCurrentPlan({
        ...USER_PLANS[0],
        name: 'Unsubscribed',
        langpretationMinutesRemaining: 0,
        langpretationMinutesQuota: 0,
      });
      try {
        localStorage.setItem('nanivio_current_plan_rem', '0');
        localStorage.setItem('nanivio_current_plan_quota', '0');
      } catch (_) {}
    }
  }, []);

  const adminAdjustUserMinutes = useCallback((minutesToAdd: number, reason?: string) => {
    setCurrentPlan((prev) => {
      const nextVal = Math.max(0, prev.langpretationMinutesRemaining + minutesToAdd);
      try {
        localStorage.setItem('nanivio_current_plan_rem', String(nextVal));
      } catch (_) {}
      return {
        ...prev,
        langpretationMinutesRemaining: nextVal,
      };
    });
    if (minutesToAdd > 0) {
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.5 } });
    }
  }, []);

  const adminAdjustUserQuota = useCallback((newQuota: number) => {
    setCurrentPlan((prev) => {
      const nextQuota = Math.max(0, newQuota);
      try {
        localStorage.setItem('nanivio_current_plan_quota', String(nextQuota));
      } catch (_) {}
      return {
        ...prev,
        langpretationMinutesQuota: nextQuota,
      };
    });
  }, []);

  // Live Ads & Services
  const [experts, setExperts] = useState<ExpertProvider[]>(INITIAL_EXPERTS);
  const [ads, setAds] = useState<LiveAdCampaign[]>(INITIAL_ADS);
  const [selectedExpert, setSelectedExpert] = useState<ExpertProvider | null>(null);
  const [isLiveAdsCollapsed, setIsLiveAdsCollapsed] = useState<boolean>(false);

  // Saved Contacts Module
  const [contacts, setContacts] = useState<SavedContact[]>(() => {
    try {
      const saved = localStorage.getItem('nanivio_saved_contacts');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Filter out legacy mock contacts if present
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(
            (c: any) =>
              !['ct_1', 'ct_2', 'ct_3', 'ct_4', 'ct_5', 'ct_6', 'contact_mr_nifty', 'contact_dr_kwame', 'contact_fatima', 'contact_nanivio_system'].includes(c.id) &&
              !['0486000001', '0486821940', '0486910245', '0486100100'].includes(c.nvId) &&
              !c.name?.toLowerCase().includes('grace') &&
              !c.name?.toLowerCase().includes('nuuy') &&
              !['Ama Serwaa', 'Kwame Asante', 'Dr. Nathaniel Addo', 'Faustina Mensah', 'Jeffrey Blankson', 'Grace Osei', 'Emmanuel Kwarteng'].includes(c.name)
          );
          return cleaned;
        }
      }
    } catch (e) {
      console.warn('Failed to load saved contacts from storage:', e);
    }
    return INITIAL_SAVED_CONTACTS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('nanivio_saved_contacts', JSON.stringify(contacts));
    } catch (e) {
      console.warn('Failed to persist contacts to storage:', e);
    }
  }, [contacts]);

  // Call Logs History
  const [callLogs, setCallLogs] = useState<CallLogRecord[]>(() => {
    try {
      const saved = localStorage.getItem('nanivio_call_logs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load call logs:', e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('nanivio_call_logs', JSON.stringify(callLogs));
    } catch (e) {
      console.warn('Failed to save call logs:', e);
    }
  }, [callLogs]);

  const clearCallLogs = useCallback(() => {
    setCallLogs([]);
    try {
      localStorage.removeItem('nanivio_call_logs');
    } catch (_) {}
  }, []);

  // Global Chat Notification Toast
  const [chatNotificationToast, setChatNotificationToast] = useState<ChatNotificationToast | null>(null);

  const dismissChatNotificationToast = useCallback(() => {
    setChatNotificationToast(null);
  }, []);

  // Calling, WebRTC Signaling & Agora RTC Telemetry
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallEvent | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<RealtimeUser[]>([]);
  const [agoraStats, setAgoraStats] = useState<AgoraTelemetryStats>(agoraClient.getStats());
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callConnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeRingtoneRef = useRef<RingtoneHandle | null>(null);
  const incomingRingtoneRef = useRef<RingtoneHandle | null>(null);

  // Real-time WebSocket connection, presence tracking & call signaling setup
  useEffect(() => {
    if (currentUser?.id) {
      realtimeClient.registerUser(currentUser);
    }

    const unsubPresence = realtimeClient.on('presence_update', (users: RealtimeUser[]) => {
      if (Array.isArray(users)) {
        setOnlineUsers(users);
      }
    });

    const unsubIncoming = realtimeClient.on('call:incoming', (data: IncomingCallEvent) => {
      if (!data) return;
      setIncomingCall(data);
      if (incomingRingtoneRef.current) {
        incomingRingtoneRef.current.stop();
      }
      incomingRingtoneRef.current = startIncomingRingtone();
      showBrowserNotification(`Incoming ${data.callType === 'video' ? 'Video' : 'Audio'} Call`, {
        body: `${data.caller?.name || 'Nanivio Contact'} (${data.caller?.nvId || ''}) is calling you`,
      });
    });

    const unsubAccepted = realtimeClient.on('call:accepted', (data) => {
      if (callConnectTimerRef.current) {
        clearTimeout(callConnectTimerRef.current);
        callConnectTimerRef.current = null;
      }
      if (activeRingtoneRef.current) {
        activeRingtoneRef.current.stop();
        activeRingtoneRef.current = null;
      }
      playCallConnectedTone();
      setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : null));

      const isVideo = data?.callType === 'video';
      agoraClient.joinChannel(
        data.channelName,
        currentUser.id,
        currentUser.name,
        isVideo ? 'video' : 'audio',
        data.responder?.id,
        true // Caller is the initiator of WebRTC offer
      );
    });

    const unsubDeclined = realtimeClient.on('call:declined', () => {
      if (callConnectTimerRef.current) {
        clearTimeout(callConnectTimerRef.current);
        callConnectTimerRef.current = null;
      }
      if (activeRingtoneRef.current) {
        activeRingtoneRef.current.stop();
        activeRingtoneRef.current = null;
      }
      playCallEndedTone();
      setActiveCall(null);
    });

    const unsubEnded = realtimeClient.on('call:ended', (data?: any) => {
      if (callConnectTimerRef.current) {
        clearTimeout(callConnectTimerRef.current);
        callConnectTimerRef.current = null;
      }
      if (activeRingtoneRef.current) {
        activeRingtoneRef.current.stop();
        activeRingtoneRef.current = null;
      }
      if (incomingRingtoneRef.current) {
        incomingRingtoneRef.current.stop();
        incomingRingtoneRef.current = null;
      }
      playCallEndedTone();
      agoraClient.leaveChannel();
      setActiveCall(null);
      setIncomingCall(null);
      if (data?.endedBy === 'SYSTEM_BILLING_ENGINE') {
        setInCallNotice({
          type: 'exhausted',
          message: data.reason || 'Call terminated by server: Service Value exhausted.',
          timestamp: Date.now(),
        });
      }
    });

    const unsubSpeechTranscript = realtimeClient.on('call:speech_transcript', (data) => {
      if (!data) return;
      setActiveCall((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          activeSpeakerId: data.speakerId,
          currentTranscript: {
            speakerId: data.speakerId,
            speakerName: data.speakerName || 'Caller',
            speakerLang: data.sourceLang,
            textInReceiverLang: data.translatedText || data.originalText || '',
            timestamp: Date.now(),
          },
        };
      });
    });

    const unsubChat = realtimeClient.on('chat:message', (data) => {
      if (!data || !data.conversationId || !data.message) return;
      const { conversationId, message } = data;
      setMessages((prev) => {
        const existingList = prev[conversationId] || [];
        if (existingList.some((m) => m.id === message.id)) {
          return prev;
        }
        return {
          ...prev,
          [conversationId]: [...existingList, message],
        };
      });
      const isCurrentlyViewingThisChat =
        activeTabRef.current === 'chat' && activeConversationIdRef.current === conversationId;

      setConversations((prev) => {
        const found = prev.some((c) => c.id === conversationId);
        if (!found) {
          const newConv: Conversation = {
            id: conversationId,
            title: message.senderName || 'Nanivio Contact',
            avatar: message.senderAvatar || '',
            lastMessage: message.text || (message.isVoiceNote ? '🎤 Voice note' : 'New message'),
            lastMessageTime: message.timestamp || Date.now(),
            unreadCount: isCurrentlyViewingThisChat ? 0 : 1,
            isGroup: false,
            participants: [
              {
                id: message.senderId,
                name: message.senderName || 'Nanivio Contact',
                avatar: message.senderAvatar || '',
                nanivioNumber: '0486482199',
                myLanguage: message.senderLang || 'en',
                isOnline: true,
                role: 'user',
              },
              currentUser,
            ],
          };
          return [newConv, ...prev];
        }
        return prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessage: message.text || (message.isVoiceNote ? '🎤 Voice note' : 'New message'),
                lastMessageTime: message.timestamp || Date.now(),
                unreadCount: isCurrentlyViewingThisChat ? 0 : (c.unreadCount || 0) + 1,
              }
            : c
        );
      });

      // Incoming chat alert for messages from peer
      if (message.senderId !== currentUser.id) {
        playChatMessageTone();
        if (!isCurrentlyViewingThisChat) {
          setChatNotificationToast({
            id: `notif_${Date.now()}`,
            conversationId,
            senderName: message.senderName || 'Nanivio Contact',
            senderAvatar: message.senderAvatar,
            text: message.text || (message.isVoiceNote ? '🎤 Voice note' : 'New message'),
            timestamp: Date.now(),
          });
          showBrowserNotification(`Message from ${message.senderName || 'Nanivio Contact'}`, {
            body: message.text || (message.isVoiceNote ? '🎤 Voice note' : 'New message'),
          });
        }
      }
    });

    return () => {
      unsubPresence();
      unsubIncoming();
      unsubAccepted();
      unsubDeclined();
      unsubEnded();
      unsubSpeechTranscript();
      unsubChat();
    };
  }, [currentUser]);

  // Subscribe to Agora telemetry & Stream client
  useEffect(() => {
    const unsubAgora = agoraClient.subscribeTelemetry(setAgoraStats);
    const unsubStream = streamClient.subscribe(setStreamState);
    streamClient.connectUser(currentUser.id, currentUser.name);

    return () => {
      unsubAgora();
      unsubStream();
    };
  }, [currentUser.id, currentUser.name]);

  // Admin Controls
  const [adminFeatures, setAdminFeatures] = useState<AdminFeatureSwitches>({
    freeCallsForAllUsers: true, // Default: Free audio and video calls for all users
    audioCallsEnabled: true,
    videoCallsEnabled: true,
    liveAdsEnabled: true,
    liveServicesEnabled: true,
    expertsEnabled: true,
    langpretationEnabled: true,
    voiceNoteLangpretationEnabled: true,
    groupAudioEnabled: true,
    groupVideoEnabled: true,
    groupLangpretationEnabled: true,
    paidCallsEnabled: false, // Default: Free, no subscription meter enforced
    b2bPremiumEnabled: true,
    fintechEnabled: true,
    commFintechEnabled: true,
    maintenanceMode: false,
    allowPaidAdCollapse: true,
    nanivioDriveEnabled: true,
    rideHailingEnabled: true,
    googleMapsSdkEnabled: true,
    driverPartnerAppEnabled: true,
    driverInstantAcceptanceSimEnabled: true,
    realtimeGpsTrackingEnabled: true,
    malviAiAssistantEnabled: true,
  });

  const [adminPricing, setAdminPricing] = useState<AdminPricingEngine>({
    langpretationPerMinuteRateUSD: 0.15,
    langpretationPerMinuteRateGHS: 2.20,
    voiceNoteLangpretationRateGHS: 0.50,
    platformExpertCommissionPercent: 15,
    b2bSeatMonthlyRateUSD: 24.00,
    fintechTransferFeePercent: 1.2,
    freeTierLangpretationMinutes: 15,
    rideBaseFareGHS: 15.00,
    ridePerKmRateGHS: 5.50,
    ridePerMinuteRateGHS: 1.20,
    rideSurgeMultiplier: 1.2,
    driverCommissionPercent: 15,
    rideCancellationFeeGHS: 10.00,
  });

  // Universal Billing & Monetization Engine State
  const [billingSummary, setBillingSummary] = useState<UserBillingSummaryResponse | null>(null);
  const [billingPlans, setBillingPlans] = useState<BillingSubscriptionPlan[]>([]);
  const [userInvoices, setUserInvoices] = useState<BillingInvoice[]>([]);
  const [userDisputes, setUserDisputes] = useState<BillingDispute[]>([]);
  const [activeUsageSession, setActiveUsageSession] = useState<BillingUsageSession | null>(null);
  const [emergencyControls, setEmergencyControls] = useState<EmergencyBillingControls | null>(null);

  // Dedicated Communication Minutes & Malvi Subscription State
  const [communicationMinutePackages, setCommunicationMinutePackages] = useState<CommunicationMinutePackage[]>([]);
  const [malviPlans, setMalviPlans] = useState<MalviSubscriptionPlan[]>([]);
  const [malviSubscription, setMalviSubscription] = useState<UserMalviSubscriptionState | null>(null);
  const [langpretationMeter, setLangpretationMeter] = useState<LangpretationMeterData | null>(null);
  const [isMalviHubOpen, setIsMalviHubOpen] = useState<boolean>(false);
  const [isMinutesModalOpen, setIsMinutesModalOpen] = useState<boolean>(false);

  // Synchronize Universal Billing State with Server
  const refreshBilling = useCallback(async () => {
    try {
      const [summary, plans, invoices, disputes, minutePkgs, mPlans] = await Promise.all([
        billingClient.getSummary(currentUser.id),
        billingClient.getPlans(),
        billingClient.getInvoices(currentUser.id),
        billingClient.getDisputes(currentUser.id),
        billingClient.getCommunicationMinutePackages().catch(() => []),
        billingClient.getMalviPlans().catch(() => []),
      ]);
      setBillingSummary(summary);
      setBillingPlans(plans);
      setUserInvoices(invoices);
      setUserDisputes(disputes);
      setEmergencyControls(summary.emergencyControls);
      setCommunicationMinutePackages(minutePkgs);
      setMalviPlans(mPlans);

      if (summary.malviSubscription) {
        setMalviSubscription(summary.malviSubscription);
      }
      if (summary.langpretationMeter) {
        setLangpretationMeter(summary.langpretationMeter);
      }

      // Sync user wallets from billing server if available
      if (summary.wallets && summary.wallets.length > 0) {
        setWallets(
          summary.wallets.map((w) => ({
            currency: w.currency as 'GHS' | 'USD' | 'EUR' | 'NGN',
            balance: w.available,
            symbol: w.symbol,
          }))
        );
      }

      // Authoritative subscription sync from server DB
      if (summary.subscription) {
        setIsSubscribed(true);
        setCurrentPlan((prevPlan) => ({
          ...prevPlan,
          id: summary.subscription!.planId,
          name: summary.subscription!.planName,
          tier: summary.subscription!.tier,
          langpretationMinutesQuota: summary.subscription!.langpretationMinutesQuota,
          langpretationMinutesRemaining: summary.subscription!.langpretationMinutesRemaining,
        }));
      } else {
        const isTrial = localStorage.getItem('nanivio_is_free_trial') === 'true';
        if (!isTrial) {
          setIsSubscribed(false);
          setCurrentPlan((prevPlan) => {
            if (
              prevPlan.name === 'Unsubscribed' &&
              prevPlan.langpretationMinutesRemaining === 0 &&
              prevPlan.langpretationMinutesQuota === 0
            ) {
              return prevPlan;
            }
            return {
              ...USER_PLANS[0],
              name: 'Unsubscribed',
              tier: 'free',
              langpretationMinutesQuota: 0,
              langpretationMinutesRemaining: 0,
            };
          });
        }
      }
    } catch (err) {
      console.warn('Billing state sync fallback to local state:', err);
    }
  }, [currentUser.id]);

  useEffect(() => {
    refreshBilling();
  }, [refreshBilling]);

  const previewBillingCharge = useCallback(async (req: BillingPreviewRequest): Promise<BillingPreviewResponse> => {
    return await billingClient.previewCharge(req);
  }, []);

  const startBillingSession = useCallback(async (params: {
    sessionId: string;
    serviceType: string;
    usageType: string;
    currency?: string;
    isLangpretationActive?: boolean;
    providerId?: string;
    sourceLang?: string;
    targetLang?: string;
  }): Promise<BillingUsageSession> => {
    const session = await billingClient.startUsageSession(params);
    setActiveUsageSession(session);
    return session;
  }, []);

  const updateBillingMeter = useCallback(async (sessionId: string, elapsedSeconds: number): Promise<BillingUsageSession | null> => {
    try {
      const session = await billingClient.updateUsageMeter(sessionId, elapsedSeconds);
      setActiveUsageSession(session);
      return session;
    } catch (e) {
      return null;
    }
  }, []);

  const completeBillingSession = useCallback(async (
    sessionId: string
  ): Promise<{ transaction?: BillingTransaction; invoice?: BillingInvoice } | null> => {
    if (!sessionId) return null;
    try {
      const result = await billingClient.completeUsageSession(sessionId);
      setActiveUsageSession(null);
      await refreshBilling();
      return result;
    } catch (e) {
      // Gracefully handle already completed or uninitialized sessions without error noise
      setActiveUsageSession(null);
      return null;
    }
  }, [refreshBilling]);

  const redeemBillingVoucher = useCallback(async (code: string): Promise<{ credit: BillingPromotionalCredit; message: string }> => {
    const result = await billingClient.redeemPromoCode(code);
    await refreshBilling();
    try {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
    } catch (_) {}
    return result;
  }, [refreshBilling]);

  const createBillingDispute = useCallback(async (params: {
    transactionId: string;
    reason: string;
    userExplanation: string;
  }): Promise<BillingDispute> => {
    const dispute = await billingClient.createDispute(params);
    await refreshBilling();
    return dispute;
  }, [refreshBilling]);

  const upgradeSubscriptionPlan = useCallback(async (tier: string, cycle: 'MONTHLY' | 'ANNUAL' = 'MONTHLY'): Promise<UserSubscriptionState> => {
    const sub = await billingClient.changePlan(tier, cycle);
    await refreshBilling();
    try {
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
    } catch (_) {}
    return sub;
  }, [refreshBilling]);

  // Dedicated Communication Minutes Purchase Method
  const purchaseCommunicationMinutes = useCallback(async (
    packageId: string,
    paymentMethod: 'SERVICE_VALUE' | 'PAYSTACK' = 'SERVICE_VALUE',
    currency: string = 'GHS'
  ): Promise<any> => {
    const res = await billingClient.purchaseMinutePackage({ packageId, paymentMethod, currency });
    await refreshBilling();
    try {
      confetti({ particleCount: 75, spread: 65, origin: { y: 0.6 } });
    } catch (_) {}
    return res;
  }, [refreshBilling]);

  // Separate Malvi Subscription Activation Method
  const subscribeMalviPlan = useCallback(async (
    tier: MalviSubscriptionTier,
    cycle: 'MONTHLY' | 'ANNUAL' = 'MONTHLY',
    paymentMethod: 'SERVICE_VALUE' | 'PAYSTACK' = 'SERVICE_VALUE',
    currency: string = 'GHS'
  ): Promise<any> => {
    const res = await billingClient.changeMalviSubscription({ tier, billingCycle: cycle, paymentMethod, currency });
    await refreshBilling();
    try {
      confetti({ particleCount: 90, spread: 80, origin: { y: 0.5 } });
    } catch (_) {}
    return res;
  }, [refreshBilling]);

  // Live Langpretation Production Usage Deduction
  const recordLangpretationUsage = useCallback(async (
    channel: 'AUDIO_CALL' | 'VIDEO_CALL' | 'GROUP_AUDIO' | 'VOICE_NOTE' | 'TEXT_CHAT',
    minutes: number,
    sourceLang: string = myLanguage,
    targetLang: string = 'ak',
    sessionId?: string
  ): Promise<any> => {
    try {
      const res = await billingClient.recordLangpretationUsage({
        channel,
        minutes,
        sourceLang,
        targetLang,
        sessionId,
      });

      if (res && res.meter) {
        setLangpretationMeter(res.meter);
        setCurrentPlan((prev) => ({
          ...prev,
          langpretationMinutesRemaining: res.remainingAllowance,
          langpretationMinutesQuota: res.meter.monthlyQuota,
        }));
      }
      return res;
    } catch (e) {
      console.warn('Langpretation usage recording notice:', e);
      return null;
    }
  }, [myLanguage]);

  // Malvi Video Avatar Usage Tracking
  const recordMalviVideoUsage = useCallback(async (seconds: number): Promise<any> => {
    try {
      const res = await billingClient.recordMalviVideoUsage(seconds);
      if (res && typeof res.remainingMinutes === 'number') {
        setMalviSubscription((prev) => (prev ? {
          ...prev,
          videoMinutesRemaining: res.remainingMinutes,
          videoMinutesUsed: res.usedMinutes,
          status: res.isTrialExhausted ? 'EXPIRED' : prev.status,
        } : null));
      }
      return res;
    } catch (e) {
      console.warn('Malvi video usage recording notice:', e);
      return null;
    }
  }, []);

  // Automatic routing to Billing Section with pre-configured plan
  const [pendingBillingAction, setPendingBillingAction] = useState<{
    subTab?: 'overview' | 'flow' | 'plans' | 'transfer' | 'calculator' | 'invoices' | 'disputes' | 'b2b' | 'malvi';
    planTier?: string;
    cycle?: 'MONTHLY' | 'ANNUAL';
    purpose?: 'SUBSCRIPTION' | 'MALVI_SUBSCRIPTION' | 'COMMUNICATION_MINUTES';
  } | null>(null);

  const openBillingWithPlan = useCallback((
    tier: string,
    purpose: 'SUBSCRIPTION' | 'MALVI_SUBSCRIPTION' = 'SUBSCRIPTION',
    cycle: 'MONTHLY' | 'ANNUAL' = 'MONTHLY'
  ) => {
    setPendingBillingAction({
      subTab: purpose === 'MALVI_SUBSCRIPTION' ? 'malvi' : 'plans',
      planTier: tier,
      cycle,
      purpose,
    });
    setActiveTab('billing');
  }, []);

  // Fetch Admin state on initial load
  useEffect(() => {
    fetch('/api/admin/features')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setAdminFeatures(data); })
      .catch(() => {});

    fetch('/api/admin/pricing')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setAdminPricing(data); })
      .catch(() => {});
  }, []);

  const setAppLanguage = useCallback((lang: string) => {
    setAppLanguageState(lang);
    try {
      localStorage.setItem('nanivio_app_language', lang);
      i18n.changeLanguage(lang);
    } catch {}
    setCurrentUser((prev) => ({ ...prev, appLanguage: lang }));
    authClient.updateProfile({ preferredLanguage: lang } as any).catch(() => {});
  }, []);

  const setSpeakingLanguage = useCallback((lang: string) => {
    setSpeakingLanguageState(lang);
    try {
      localStorage.setItem('nanivio_speaking_language', lang);
    } catch {}
    setCurrentUser((prev) => ({ ...prev, speakingLanguage: lang }));
  }, []);

  const setTranslationLanguage = useCallback((lang: string) => {
    setTranslationLanguageState(lang);
    setMyLanguageState(lang);
    try {
      localStorage.setItem('nanivio_translation_language', lang);
    } catch {}
    setCurrentUser((prev) => ({ ...prev, myLanguage: lang, translationLanguage: lang }));
  }, []);

  const setMyLanguage = useCallback((lang: SupportedLanguageCode) => {
    setTranslationLanguage(lang);
  }, [setTranslationLanguage]);

  const updateAdminFeature = async (key: keyof AdminFeatureSwitches, value: boolean) => {
    const updated = { ...adminFeatures, [key]: value };
    setAdminFeatures(updated);
    try {
      await fetch('/api/admin/features/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (e) {
      console.error('Failed to sync feature switch:', e);
    }
  };

  const updateAdminPricing = async (key: keyof AdminPricingEngine, value: number) => {
    const updated = { ...adminPricing, [key]: value };
    setAdminPricing(updated);
    try {
      await fetch('/api/admin/pricing/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (e) {
      console.error('Failed to sync pricing:', e);
    }
  };

  const toggleLiveAdsCollapse = () => {
    if (!currentPlan.canCollapseAds && !adminFeatures.allowPaidAdCollapse) {
      alert('Collapsing live ads is a feature of Nanivio Individual Premium & Pro plans.');
      return;
    }
    setIsLiveAdsCollapsed(prev => !prev);
  };

  // -------------------------------------------------------------
  // CALLING LOGIC & REAL-TIME LANGPRETATION (AGORA RTC POWERED)
  // -------------------------------------------------------------
  const start1on1Call = (contact: Participant, type: 'audio' | 'video', isExpert = false, expert?: ExpertProvider) => {
    // Admin Master Switch enforcement
    if (type === 'audio' && adminFeatures.audioCallsEnabled === false) {
      alert('Audio calling is currently turned OFF by system administration.');
      return;
    }
    if (type === 'video' && adminFeatures.videoCallsEnabled === false) {
      alert('Video calling is currently turned OFF by system administration.');
      return;
    }

    // Clear any previous ringtone/timers
    if (activeRingtoneRef.current) {
      activeRingtoneRef.current.stop();
      activeRingtoneRef.current = null;
    }
    if (incomingRingtoneRef.current) {
      incomingRingtoneRef.current.stop();
      incomingRingtoneRef.current = null;
    }
    if (callConnectTimerRef.current) {
      clearTimeout(callConnectTimerRef.current);
      callConnectTimerRef.current = null;
    }

    const callType: CallType = type === 'audio' ? 'audio_1on1' : 'video_1on1';
    const rate = isExpert && expert ? expert.ratePerMinGHS : 0;
    const callId = `call_${Date.now()}`;
    const channelName = isExpert
      ? `nanivio_expert_${expert?.id || 'consult'}_${Date.now()}`
      : `nanivio_call_${contact.id}_${Date.now()}`;

    const newCall: CallSession = {
      id: callId,
      channelName,
      type: callType,
      status: 'ringing',
      host: currentUser,
      participants: [currentUser, contact],
      startedAt: Date.now(),
      durationSeconds: 0,
      langpretationEnabled: globalLangpretationEnabled && adminFeatures.langpretationEnabled,
      langpretationState: (globalLangpretationEnabled && adminFeatures.langpretationEnabled) ? 'ON' : 'OFF',
      isPaidServiceCall: isExpert,
      expertId: expert?.id,
      expertRatePerMin: rate,
      billedMinutes: 0,
      accruedCost: 0,
      langpretationMinutesUsed: 0,
    };

    if (type === 'video') {
      agoraClient.startLocalPreview('video');
    }

    setActiveCall(newCall);

    // Start realistic dual-tone outgoing telephone ringing audio
    activeRingtoneRef.current = startRingtone();

    // Broadcast live WebSocket signaling call invite to the recipient
    realtimeClient.initiateCall(
      callId,
      channelName,
      type,
      currentUser,
      contact.id,
      contact.nvId
    );

    // No auto-answering! Rings for up to 60s waiting for real recipient response
    callConnectTimerRef.current = setTimeout(() => {
      if (activeRingtoneRef.current) {
        activeRingtoneRef.current.stop();
        activeRingtoneRef.current = null;
      }
      playCallEndedTone();
      realtimeClient.endCall(callId, channelName, currentUser.id, contact.id);
      setActiveCall(null);
    }, 60000);
  };

  const startGroupCall = (participants: Participant[], type: 'audio' | 'video') => {
    if (activeRingtoneRef.current) {
      activeRingtoneRef.current.stop();
      activeRingtoneRef.current = null;
    }
    if (incomingRingtoneRef.current) {
      incomingRingtoneRef.current.stop();
      incomingRingtoneRef.current = null;
    }
    if (callConnectTimerRef.current) {
      clearTimeout(callConnectTimerRef.current);
      callConnectTimerRef.current = null;
    }

    const callType: CallType = type === 'audio' ? 'group_audio' : 'group_video';
    const allParticipants = [currentUser, ...participants];
    const callId = `grp_call_${Date.now()}`;
    const channelName = `nanivio_group_${Date.now()}`;

    const newCall: CallSession = {
      id: callId,
      channelName,
      type: callType,
      status: 'ringing',
      host: currentUser,
      participants: allParticipants,
      startedAt: Date.now(),
      durationSeconds: 0,
      langpretationEnabled: globalLangpretationEnabled && adminFeatures.groupLangpretationEnabled,
      langpretationState: (globalLangpretationEnabled && adminFeatures.groupLangpretationEnabled) ? 'ON' : 'OFF',
      isPaidServiceCall: false,
      expertRatePerMin: 0,
      billedMinutes: 0,
      accruedCost: 0,
      langpretationMinutesUsed: 0,
    };

    if (type === 'video') {
      agoraClient.startLocalPreview('video');
    }

    setActiveCall(newCall);
    activeRingtoneRef.current = startRingtone();

    // Signal all group participants via WebSocket
    participants.forEach((p) => {
      realtimeClient.initiateCall(
        callId,
        channelName,
        type,
        currentUser,
        p.id,
        p.nvId
      );
    });

    // No auto-answering! Rings for up to 60s waiting for group participants to join
    callConnectTimerRef.current = setTimeout(() => {
      if (activeRingtoneRef.current) {
        activeRingtoneRef.current.stop();
        activeRingtoneRef.current = null;
      }
      playCallEndedTone();
      setActiveCall(null);
    }, 60000);
  };

  const forceConnectCall = () => {
    if (callConnectTimerRef.current) {
      clearTimeout(callConnectTimerRef.current);
      callConnectTimerRef.current = null;
    }
    if (activeRingtoneRef.current) {
      activeRingtoneRef.current.stop();
      activeRingtoneRef.current = null;
    }
    playCallConnectedTone();

    setActiveCall(prev => {
      if (!prev) return null;
      const otherP = prev.participants.find(p => p.id !== currentUser.id) || prev.participants[1];
      const isVideo = prev.type === 'video_1on1' || prev.type === 'group_video';
      const chName = prev.channelName || `nanivio_call_${prev.id}`;
      agoraClient.joinChannel(
        chName,
        currentUser.id,
        currentUser.name,
        isVideo ? 'video' : 'audio',
        otherP?.id
      );
      realtimeClient.acceptCall(
        prev.id,
        chName,
        otherP || { id: 'usr_partner', name: 'Nanivio Recipient' },
        currentUser.id
      );

      // Server-authoritative live billing session initiation
      startBillingSession({
        sessionId: prev.id,
        serviceType: prev.isPaidServiceCall ? 'EXPERT_SERVICE' : 'COMMUNICATION',
        usageType: 'CALL_MINUTE',
        currency: 'GHS',
        isLangpretationActive: prev.langpretationEnabled,
        providerId: otherP?.id,
        sourceLang: (currentUser.myLanguage || 'en') as any,
        targetLang: (otherP?.myLanguage || 'en') as any,
      }).catch(() => {});

      return { ...prev, status: 'connected', startedAt: Date.now() };
    });
  };

  const acceptIncomingCall = (callId?: string) => {
    if (!incomingCall) return;

    if (incomingRingtoneRef.current) {
      incomingRingtoneRef.current.stop();
      incomingRingtoneRef.current = null;
    }
    playCallConnectedTone();

    const callType: CallType = incomingCall.callType === 'video' ? 'video_1on1' : 'audio_1on1';
    const caller = incomingCall.caller as Participant;

    const session: CallSession = {
      id: incomingCall.callId,
      channelName: incomingCall.channelName,
      type: callType,
      status: 'connected',
      host: caller,
      participants: [caller, currentUser],
      startedAt: Date.now(),
      durationSeconds: 0,
      langpretationEnabled: globalLangpretationEnabled && adminFeatures.langpretationEnabled,
      langpretationState: (globalLangpretationEnabled && adminFeatures.langpretationEnabled) ? 'ON' : 'OFF',
      isPaidServiceCall: false,
      expertRatePerMin: 0,
      billedMinutes: 0,
      accruedCost: 0,
      langpretationMinutesUsed: 0,
    };

    setActiveCall(session);

    // Send accept signal back to caller over WebSocket
    realtimeClient.acceptCall(
      incomingCall.callId,
      incomingCall.channelName,
      currentUser,
      caller.id
    );

    // Join Agora RTC channel & WebRTC media tracks (Responder waits for offer)
    agoraClient.joinChannel(
      incomingCall.channelName,
      currentUser.id,
      currentUser.name,
      incomingCall.callType,
      caller.id,
      false // Callee answers offer
    );

    // Server-authoritative live billing session initiation for responder
    startBillingSession({
      sessionId: session.id,
      serviceType: session.isPaidServiceCall ? 'EXPERT_SERVICE' : 'COMMUNICATION',
      usageType: 'CALL_MINUTE',
      currency: 'GHS',
      isLangpretationActive: session.langpretationEnabled,
      providerId: caller.id,
      sourceLang: (currentUser.myLanguage || 'en') as any,
      targetLang: (caller.myLanguage || 'en') as any,
    }).catch(() => {});

    setIncomingCall(null);
  };

  const declineIncomingCall = (callId?: string) => {
    if (incomingRingtoneRef.current) {
      incomingRingtoneRef.current.stop();
      incomingRingtoneRef.current = null;
    }
    if (incomingCall) {
      // Record missed / declined call in history
      const logItem: CallLogRecord = {
        id: `call_log_${Date.now()}`,
        participantId: incomingCall.caller.id,
        participantNvId: incomingCall.caller.nvId,
        participantName: incomingCall.caller.name,
        participantAvatar: incomingCall.caller.avatar,
        callType: incomingCall.callType === 'video' ? 'video' : 'audio',
        direction: 'missed',
        timestamp: Date.now(),
        durationSeconds: 0,
        hasLangpretation: globalLangpretationEnabled,
      };
      setCallLogs((prev) => [logItem, ...prev.slice(0, 49)]);

      realtimeClient.declineCall(incomingCall.callId, incomingCall.caller.id);
    }
    setIncomingCall(null);
  };

  const endCall = () => {
    if (activeRingtoneRef.current) {
      activeRingtoneRef.current.stop();
      activeRingtoneRef.current = null;
    }
    if (incomingRingtoneRef.current) {
      incomingRingtoneRef.current.stop();
      incomingRingtoneRef.current = null;
    }
    if (callConnectTimerRef.current) {
      clearTimeout(callConnectTimerRef.current);
      callConnectTimerRef.current = null;
    }
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    playCallEndedTone();
    agoraClient.leaveChannel();

    if (activeCall) {
      // Server-authoritative ledger finalization (only for calls that connected or initialized a billing session)
      if (activeCall.status === 'connected' || (activeUsageSession && activeUsageSession.sessionId === activeCall.id)) {
        completeBillingSession(activeCall.id).catch(() => {});
      }

      const otherP = activeCall.participants.find((p) => p.id !== currentUser.id) || activeCall.participants[1];
      
      // Real production Langpretation allowance deduction for remaining call duration
      if (activeCall.langpretationEnabled) {
        const remainingSeconds = (activeCall.durationSeconds || 0) % 60;
        if (remainingSeconds >= 5) {
          const fracMins = Number((remainingSeconds / 60).toFixed(2));
          const callChannel: 'AUDIO_CALL' | 'VIDEO_CALL' | 'GROUP_AUDIO' =
            activeCall.type.includes('video')
              ? 'VIDEO_CALL'
              : activeCall.isGroup
              ? 'GROUP_AUDIO'
              : 'AUDIO_CALL';
          recordLangpretationUsage(
            callChannel,
            fracMins,
            myLanguage,
            otherP?.myLanguage || 'en',
            activeCall.id
          ).catch(() => {});
        }
      }

      // Record in Call Logs
      if (otherP) {
        const isOutgoing = activeCall.host.id === currentUser.id;
        const logItem: CallLogRecord = {
          id: `call_log_${Date.now()}`,
          participantId: otherP.id,
          participantNvId: otherP.nvId,
          participantName: otherP.name,
          participantAvatar: otherP.avatar,
          callType: activeCall.type.includes('video') ? 'video' : 'audio',
          direction: isOutgoing ? 'outgoing' : 'incoming',
          timestamp: activeCall.startedAt || Date.now(),
          durationSeconds: activeCall.durationSeconds || 0,
          hasLangpretation: activeCall.langpretationEnabled,
          isExpertConsultation: activeCall.isPaidServiceCall,
          costGHS: activeCall.accruedCost > 0 ? activeCall.accruedCost : undefined,
        };
        setCallLogs((prev) => [logItem, ...prev.slice(0, 49)]);
      }

      realtimeClient.endCall(
        activeCall.id,
        activeCall.channelName || `nanivio_call_${activeCall.id}`,
        currentUser.id,
        otherP?.id
      );
    } else if (incomingCall) {
      realtimeClient.endCall(
        incomingCall.callId,
        incomingCall.channelName,
        currentUser.id,
        incomingCall.caller.id
      );
    }

    if (activeCall && activeCall.isPaidServiceCall && activeCall.accruedCost > 0) {
      // Deduct from GHS balance
      setWallets(prev => prev.map(w => w.currency === 'GHS' ? { ...w, amount: Math.max(0, w.amount - activeCall.accruedCost) } : w));
      setTransactions(prev => [
        {
          id: `tx_${Date.now()}`,
          type: 'expert_consultation',
          title: 'Expert Consultation Settled',
          description: `${activeCall.billedMinutes} min live session with ${activeCall.participants[1]?.name || 'Expert'}`,
          amount: activeCall.accruedCost,
          currency: 'GHS',
          fee: 0,
          status: 'completed',
          timestamp: Date.now(),
          channel: 'Nanivio Wallet',
        },
        ...prev
      ]);
    }
    setActiveCall(null);
    setIncomingCall(null);
  };

  const toggleCallLangpretation = () => {
    if (!adminFeatures.langpretationEnabled) {
      alert('Langpretation is temporarily disabled by system administrator.');
      return;
    }
    setActiveCall(prev => {
      if (!prev) return null;
      const newState = !prev.langpretationEnabled;
      return {
        ...prev,
        langpretationEnabled: newState,
        langpretationState: newState ? 'ON' : 'OFF',
      };
    });
  };

  const toggleCallMute = () => {
    setActiveCall(prev => {
      if (!prev) return null;
      const nextMuted = !prev.host.isMuted;
      agoraClient.setAudioMuted(nextMuted);
      return {
        ...prev,
        host: { ...prev.host, isMuted: nextMuted },
      };
    });
  };

  const toggleCallVideo = () => {
    setActiveCall(prev => {
      if (!prev) return null;
      const nextCameraOff = !prev.host.isCameraOff;
      agoraClient.setVideoOff(nextCameraOff);
      return {
        ...prev,
        host: { ...prev.host, isCameraOff: nextCameraOff },
      };
    });
  };

  // Call duration, billing meter, and quota ticker
  useEffect(() => {
    if (activeCall && activeCall.status === 'connected') {
      callTimerRef.current = setInterval(() => {
        setActiveCall(prev => {
          if (!prev) return null;
          const nextSec = prev.durationSeconds + 1;
          const billedMins = Math.ceil(nextSec / 60);
          const cost = prev.isPaidServiceCall ? billedMins * prev.expertRatePerMin : 0;

          // Live real-time Langpretation meter consumption (Subscription time consumed first)
          if (prev.langpretationEnabled && nextSec > 0 && nextSec % 60 === 0) {
            const callChannel: 'AUDIO_CALL' | 'VIDEO_CALL' | 'GROUP_AUDIO' =
              prev.type.includes('video')
                ? 'VIDEO_CALL'
                : prev.isGroup
                ? 'GROUP_AUDIO'
                : 'AUDIO_CALL';
            const otherP = prev.participants.find((p) => p.id !== currentUser.id);
            recordLangpretationUsage(
              callChannel,
              1,
              myLanguage,
              otherP?.myLanguage || 'en',
              prev.id
            ).catch(() => {});

            setCurrentPlan((planPrev) => {
              const quota = planPrev.langpretationMinutesQuota || 60;
              const remaining = planPrev.langpretationMinutesRemaining;

              if (remaining > 0) {
                const updatedRem = remaining - 1;
                try {
                  localStorage.setItem('nanivio_current_plan_rem', String(updatedRem));
                } catch (_) {}

                // Section 14: 80% usage threshold subtle notification (20% remaining)
                if (updatedRem === Math.round(quota * 0.2) && updatedRem > 0) {
                  setInCallNotice({
                    type: 'warning',
                    message: `80% of your Langpretation time used (${updatedRem} min remaining).`,
                    timestamp: Date.now(),
                  });
                }

                // Section 15: Value Fallback when subscription reaches 0
                if (updatedRem === 0) {
                  setInCallNotice({
                    type: 'fallback',
                    message: 'Your subscription time has been used. Nanivio Service Value is now being used.',
                    timestamp: Date.now(),
                  });
                }

                return {
                  ...planPrev,
                  langpretationMinutesRemaining: updatedRem,
                };
              } else {
                // Subscription time exhausted: Fallback to Nanivio Service Value
                const curBalance =
                  billingSummary?.communicationAccount?.balance ??
                  (wallets?.find((w) => w.currency === 'GHS')?.amount ?? 0.0);
                if (curBalance <= 0) {
                  setInCallNotice({
                    type: 'exhausted',
                    message: 'Your Nanivio Service Value is exhausted. Increase Value or upgrade your subscription to continue.',
                    timestamp: Date.now(),
                  });
                }
                return planPrev;
              }
            });

            setUsedLangpretationMinutes((usedPrev) => {
                const updatedUsed = usedPrev + 1;
                try {
                  localStorage.setItem('nanivio_used_langpretation_mins', String(updatedUsed));
                } catch (_) {}
                return updatedUsed;
              });
            }

            // Sync with server-authoritative meter every 5 seconds
            if (nextSec % 5 === 0) {
              updateBillingMeter(prev.id, nextSec).then((serverSession) => {
                if (serverSession) {
                  // Server-authoritative remaining minutes synchronization
                  if (typeof serverSession.langpretationMinutesRemaining === 'number') {
                    setCurrentPlan((planPrev) => ({
                      ...planPrev,
                      langpretationMinutesRemaining: serverSession.langpretationMinutesRemaining!,
                      langpretationMinutesQuota: serverSession.langpretationMinutesQuota ?? planPrev.langpretationMinutesQuota,
                    }));
                  }

                  if (serverSession.shouldTerminate) {
                    setInCallNotice({
                      type: 'exhausted',
                      message: serverSession.exhaustionMessage || 'Service Value exhausted. Grace period ended. Call terminated.',
                      timestamp: Date.now(),
                    });
                    setTimeout(() => {
                      endCall();
                    }, 1200);
                  } else if (serverSession.exhaustionNoticeType && serverSession.exhaustionMessage) {
                    setInCallNotice({
                      type: serverSession.exhaustionNoticeType,
                      message: serverSession.exhaustionMessage,
                      timestamp: Date.now(),
                    });
                  }
                }
              }).catch(() => {});
            }

            return {
            ...prev,
            durationSeconds: nextSec,
            billedMinutes: billedMins,
            accruedCost: cost,
          };
        });
      }, 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [activeCall?.status, billingSummary]);

  // Process and route speaker utterance with live Langpretation neural translation and vocalization
  const simulateSpeakerUtterance = async (speakerId: string, text: string) => {
    if (!activeCall) return;
    const speaker = activeCall.participants.find(p => p.id === speakerId) || activeCall.host;
    
    // Set speaking indicator
    setActiveCall(prev => {
      if (!prev) return null;
      return {
        ...prev,
        activeSpeakerId: speakerId,
        langpretationState: prev.langpretationEnabled ? 'Translating' : prev.langpretationState,
      };
    });

    try {
      // Execute translation via NanivioTranslatorEngine orchestrator (Khaya, Sunbird, Palabra, NLLB, Gemini)
      const engine = NanivioTranslatorEngine.getInstance();
      const mtResult = await engine.translateText(
        text,
        speaker.myLanguage || 'en',
        myLanguage || 'en'
      );
      const translatedText = mtResult.translatedText || text;

      // Update call receiver transcript display (ONLY in receiver's language!)
      setActiveCall(prev => {
        if (!prev) return null;
        return {
          ...prev,
          currentTranscript: {
            speakerId,
            speakerName: speaker.name,
            speakerLang: speaker.myLanguage,
            textInReceiverLang: translatedText,
            timestamp: Date.now(),
          },
          langpretationState: prev.langpretationEnabled ? 'ON' : 'OFF',
        };
      });

      // 1. Broadcast translated speech to remote call participants via WebSocket
      realtimeClient.sendCallSpeech(
        activeCall.id,
        text,
        speaker.myLanguage || 'en',
        myLanguage || 'en',
        speakerId,
        speaker.name
      );

      // 2. Synthesize audio waveform & inject into Agora / WebRTC peer connection audio track
      if (activeCall.langpretationEnabled) {
        try {
          const { NanivioTtsAudioGenerator } = await import('../lib/translator-engine/audio/ttsAudioGenerator');
          const audioBuf = await NanivioTtsAudioGenerator.generateSpokenAudioBuffer(
            translatedText,
            myLanguage || 'en'
          );
          if (audioBuf) {
            await agoraClient.injectTranslatedAudioToRemote(audioBuf);
          }
        } catch (audioErr) {
          console.warn('Audio track injection notice:', audioErr);
        }
      }

      // Clear speaker indicator after natural duration
      setTimeout(() => {
        setActiveCall(prev => prev ? { ...prev, activeSpeakerId: undefined } : null);
      }, 4500);

    } catch (e) {
      console.error('Translation processing error:', e);
      setActiveCall(prev => prev ? { ...prev, langpretationState: 'Error' } : null);
    }
  };

  // -------------------------------------------------------------
  // USER SETTINGS, PRIVACY, SAFETY & SESSIONS
  // -------------------------------------------------------------
  const [userSettings, setUserSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem('nanivio_user_settings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_USER_SETTINGS;
  });

  const updateUserSettings = useCallback((updates: Partial<UserSettings>) => {
    setUserSettings(prev => {
      const updated = {
        ...prev,
        ...updates,
        privacy: { ...prev.privacy, ...(updates.privacy || {}) },
        notifications: { ...prev.notifications, ...(updates.notifications || {}) },
        dataUsage: { ...prev.dataUsage, ...(updates.dataUsage || {}) },
      };
      try {
        localStorage.setItem('nanivio_user_settings', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const [userSecuritySessions, setUserSecuritySessions] = useState<UserSecuritySession[]>(INITIAL_SECURITY_SESSIONS);

  const terminateOtherSessions = useCallback(() => {
    setUserSecuritySessions(prev => prev.filter(s => s.isCurrent));
  }, []);

  const blockUser = useCallback((userId: string) => {
    updateUserSettings({
      privacy: {
        ...userSettings.privacy,
        blockedUsers: Array.from(new Set([...userSettings.privacy.blockedUsers, userId])),
      },
    });
  }, [userSettings.privacy, updateUserSettings]);

  const unblockUser = useCallback((userId: string) => {
    updateUserSettings({
      privacy: {
        ...userSettings.privacy,
        blockedUsers: userSettings.privacy.blockedUsers.filter(id => id !== userId),
      },
    });
  }, [userSettings.privacy, updateUserSettings]);

  const restrictUser = useCallback((userId: string) => {
    updateUserSettings({
      privacy: {
        ...userSettings.privacy,
        restrictedUsers: Array.from(new Set([...userSettings.privacy.restrictedUsers, userId])),
      },
    });
  }, [userSettings.privacy, updateUserSettings]);

  const unrestrictUser = useCallback((userId: string) => {
    updateUserSettings({
      privacy: {
        ...userSettings.privacy,
        restrictedUsers: userSettings.privacy.restrictedUsers.filter(id => id !== userId),
      },
    });
  }, [userSettings.privacy, updateUserSettings]);

  const submitSafetyReport = useCallback(async (
    report: Omit<SafetyReport, 'id' | 'timestamp'>,
    shouldBlock = false,
    shouldRestrict = false
  ) => {
    try {
      await fetch('/api/safety/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
    } catch (e) {
      console.warn('Backend safety report error:', e);
    }
    if (shouldBlock) blockUser(report.targetId);
    if (shouldRestrict) restrictUser(report.targetId);
  }, [blockUser, restrictUser]);

  const deleteAccount = useCallback(async (reason?: string) => {
    try {
      await fetch('/api/auth/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authClient.getToken() ? { Authorization: `Bearer ${authClient.getToken()}` } : {}),
        },
        body: JSON.stringify({ reason }),
      });
    } catch (e) {
      console.warn('Backend delete account error:', e);
    }
    await signOut();
  }, [signOut]);

  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [settingsActiveTab, setSettingsActiveTab] = useState<'privacy' | 'notifications' | 'data' | 'language' | 'theme' | 'security' | 'account' | 'about'>('privacy');
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState<boolean>(false);

  // -------------------------------------------------------------
  // CHAT & VOICE NOTE MESSAGING
  // -------------------------------------------------------------
  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    let targetConvId = activeConversationId;
    let activeConv = conversations.find(c => c.id === targetConvId);
    if (!activeConv && conversations.length > 0) {
      activeConv = conversations[0];
      targetConvId = activeConv.id;
      setActiveConversationId(targetConvId);
    }

    if (!activeConv) {
      // Create a direct support / verified line so chat never fails to send
      targetConvId = `conv_direct_${Date.now()}`;
      activeConv = {
        id: targetConvId,
        title: 'Nanivio Live Support & Services',
        participants: [
          currentUser,
          {
            id: 'usr_nanivio_service',
            nvId: '0486000000',
            name: 'Nanivio Support Desk',
            avatar: '',
            initials: 'NS',
            myLanguage: 'en',
            role: 'expert',
          }
        ],
        lastMessage: text,
        lastMessageTime: Date.now(),
        unreadCount: 0,
      };
      setConversations(prev => [activeConv!, ...prev]);
      setActiveConversationId(targetConvId);
    }

    // Realtime translation if recipient speaks a different language
    const otherParticipant = activeConv.participants.find(p => p.id !== currentUser.id);
    let translatedText: string | undefined;
    if (globalLangpretationEnabled && otherParticipant && otherParticipant.myLanguage && otherParticipant.myLanguage !== myLanguage) {
      try {
        const transResult = await NanivioTranslatorEngine.getInstance().translateText(
          text,
          myLanguage,
          otherParticipant.myLanguage
        );
        if (transResult && transResult.translatedText && transResult.translatedText !== text) {
          translatedText = transResult.translatedText;
          recordLangpretationUsage('TEXT_CHAT', 0.2, myLanguage, otherParticipant.myLanguage).catch(() => {});
        }
      } catch (err) {
        console.warn('Realtime chat translation notice:', err);
      }
    }

    const newMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar,
      senderLang: myLanguage,
      text,
      translatedText,
      timestamp: Date.now(),
      status: 'sent',
      replyTo: replyingToMessage ? {
        id: replyingToMessage.id,
        senderName: replyingToMessage.senderName,
        text: replyingToMessage.text,
      } : undefined,
    };

    setReplyingToMessage(null);

    setMessages(prev => ({
      ...prev,
      [targetConvId]: [...(prev[targetConvId] || []), newMsg],
    }));

    // Update conversation last message preview
    setConversations(prev => prev.map(c => c.id === targetConvId ? {
      ...c,
      lastMessage: text,
      lastMessageTime: Date.now(),
    } : c));

    // Broadcast message to all active WebSocket clients / tabs in real-time
    realtimeClient.sendChatMessage(targetConvId, newMsg);
    playMessageSentTone();

    // Mark as delivered
    setTimeout(() => {
      setMessages(prev => ({
        ...prev,
        [targetConvId]: (prev[targetConvId] || []).map(m => m.id === newMsg.id ? { ...m, status: 'delivered' } : m),
      }));
    }, 300);

    // If recipient is a verified support/expert line, provide instant responsive acknowledgment
    if (otherParticipant && (otherParticipant.role === 'expert' || otherParticipant.id === 'usr_nanivio_service')) {
      setTimeout(async () => {
        const replyText = `Message received on secure Nanivio line. Connecting for consultation...`;
        let replyTranslated: string | undefined;
        if (globalLangpretationEnabled && myLanguage !== 'en') {
          try {
            const repTrans = await NanivioTranslatorEngine.getInstance().translateText(replyText, 'en', myLanguage);
            if (repTrans && repTrans.translatedText) {
              replyTranslated = repTrans.translatedText;
            }
          } catch {}
        }
        const replyMsg: ChatMessage = {
          id: `msg_rep_${Date.now()}`,
          senderId: otherParticipant.id,
          senderName: otherParticipant.name,
          senderAvatar: otherParticipant.avatar,
          senderLang: otherParticipant.myLanguage || 'en',
          text: replyTranslated || replyText,
          timestamp: Date.now(),
          status: 'delivered',
        };
        setMessages(prev => ({
          ...prev,
          [targetConvId]: [...(prev[targetConvId] || []), replyMsg],
        }));
        setConversations(prev => prev.map(c => c.id === targetConvId ? {
          ...c,
          lastMessage: replyTranslated || replyText,
          lastMessageTime: Date.now(),
        } : c));
        playChatMessageTone();
      }, 1200);
    }
  };

  const sendMediaMessage = async (media: {
    type: 'image' | 'video' | 'document';
    url: string;
    caption?: string;
    fileName?: string;
    fileSize?: string;
  }) => {
    const activeConv = conversations.find(c => c.id === activeConversationId);
    if (!activeConv) return;

    const newMsg: ChatMessage = {
      id: `msg_media_${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar,
      senderLang: myLanguage,
      text: media.caption || (media.type === 'document' ? `📄 ${media.fileName || 'Document'}` : media.type === 'video' ? '📹 Short Video' : '📷 Photo'),
      mediaType: media.type,
      mediaUrl: media.url,
      mediaCaption: media.caption,
      mediaFileName: media.fileName,
      mediaFileSize: media.fileSize,
      timestamp: Date.now(),
      status: 'delivered',
      replyTo: replyingToMessage ? {
        id: replyingToMessage.id,
        senderName: replyingToMessage.senderName,
        text: replyingToMessage.text,
      } : undefined,
    };

    setReplyingToMessage(null);

    setMessages(prev => ({
      ...prev,
      [activeConversationId]: [...(prev[activeConversationId] || []), newMsg],
    }));

    setConversations(prev => prev.map(c => c.id === activeConversationId ? {
      ...c,
      lastMessage: `[${media.type.toUpperCase()}] ${media.caption || media.fileName || 'Media attached'}`,
      lastMessageTime: Date.now(),
    } : c));

    realtimeClient.sendChatMessage(activeConversationId, newMsg);
    playMessageSentTone();
  };

  const deleteMessage = useCallback((conversationId: string, messageId: string) => {
    setMessages(prev => ({
      ...prev,
      [conversationId]: (prev[conversationId] || []).filter(m => m.id !== messageId),
    }));
  }, []);

  const reactToMessage = useCallback((conversationId: string, messageId: string, emoji: string) => {
    setMessages(prev => {
      const convMsgs = prev[conversationId] || [];
      const updated = convMsgs.map(msg => {
        if (msg.id !== messageId) return msg;
        const currentReactions = msg.reactions || [];
        const existingIdx = currentReactions.findIndex(r => r.emoji === emoji);
        let nextReactions = [...currentReactions];
        if (existingIdx >= 0) {
          const rx = nextReactions[existingIdx];
          const hasUser = rx.users.includes(currentUser.id);
          if (hasUser) {
            const newUsers = rx.users.filter(u => u !== currentUser.id);
            if (newUsers.length === 0) {
              nextReactions.splice(existingIdx, 1);
            } else {
              nextReactions[existingIdx] = { ...rx, count: newUsers.length, users: newUsers };
            }
          } else {
            nextReactions[existingIdx] = { ...rx, count: rx.count + 1, users: [...rx.users, currentUser.id] };
          }
        } else {
          nextReactions.push({ emoji, count: 1, users: [currentUser.id] });
        }
        return { ...msg, reactions: nextReactions };
      });
      return { ...prev, [conversationId]: updated };
    });
  }, [currentUser.id]);

  const forwardMessage = useCallback(async (message: ChatMessage, targetConvIds: string[]) => {
    for (const convId of targetConvIds) {
      const fwdMsg: ChatMessage = {
        ...message,
        id: `msg_fwd_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderAvatar: currentUser.avatar,
        senderLang: myLanguage,
        timestamp: Date.now(),
        status: 'sent',
      };

      setMessages(prev => ({
        ...prev,
        [convId]: [...(prev[convId] || []), fwdMsg],
      }));

      setConversations(prev => prev.map(c => c.id === convId ? {
        ...c,
        lastMessage: fwdMsg.text || 'Forwarded message',
        lastMessageTime: Date.now(),
      } : c));

      realtimeClient.sendChatMessage(convId, fwdMsg);
    }
  }, [currentUser, myLanguage]);

  const pinConversation = useCallback((convId: string) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, isPinned: !c.isPinned } : c));
  }, []);

  const archiveConversation = useCallback((convId: string) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, isArchived: !c.isArchived } : c));
  }, []);

  const muteConversation = useCallback((convId: string) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, isMuted: !c.isMuted } : c));
  }, []);

  const createGroup = useCallback(async (
    title: string,
    description: string,
    participantIds: string[],
    avatar?: string
  ): Promise<Conversation> => {
    const selectedParticipants = contacts
      .filter(c => participantIds.includes(c.id) || participantIds.includes(c.nvId))
      .map(c => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        nvId: c.nvId,
        myLanguage: 'en' as SupportedLanguageCode,
        isOnline: true,
        role: 'user' as const,
      }));

    const newGroup: Conversation = {
      id: `conv_grp_${Date.now()}`,
      isGroup: true,
      title,
      groupDescription: description,
      avatar: avatar || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80',
      participants: [currentUser, ...selectedParticipants],
      groupAdmins: [currentUser.id],
      groupCreatedBy: currentUser.id,
      lastMessage: `Group created: "${title}"`,
      lastMessageTime: Date.now(),
      unreadCount: 0,
    };

    setConversations(prev => [newGroup, ...prev]);
    setActiveConversationId(newGroup.id);
    setActiveTab('chat');
    return newGroup;
  }, [contacts, currentUser]);

  const updateGroup = useCallback((convId: string, updates: { title?: string; description?: string }) => {
    setConversations(prev => prev.map(c => c.id === convId ? {
      ...c,
      ...(updates.title ? { title: updates.title } : {}),
      ...(updates.description !== undefined ? { groupDescription: updates.description } : {}),
    } : c));
  }, []);

  const addMembersToGroup = useCallback((convId: string, participantIds: string[]) => {
    const newMembers = contacts
      .filter(c => participantIds.includes(c.id) || participantIds.includes(c.nvId))
      .map(c => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        nvId: c.nvId,
        myLanguage: 'en' as SupportedLanguageCode,
        isOnline: true,
        role: 'user' as const,
      }));

    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      const existingIds = c.participants.map(p => p.id);
      const toAdd = newMembers.filter(m => !existingIds.includes(m.id));
      return {
        ...c,
        participants: [...c.participants, ...toAdd],
      };
    }));
  }, [contacts]);

  const removeMemberFromGroup = useCallback((convId: string, participantId: string) => {
    setConversations(prev => prev.map(c => c.id === convId ? {
      ...c,
      participants: c.participants.filter(p => p.id !== participantId),
      groupAdmins: (c.groupAdmins || []).filter(id => id !== participantId),
    } : c));
  }, []);

  const promoteGroupAdmin = useCallback((convId: string, participantId: string) => {
    setConversations(prev => prev.map(c => c.id === convId ? {
      ...c,
      groupAdmins: Array.from(new Set([...(c.groupAdmins || []), participantId])),
    } : c));
  }, []);

  const dismissGroupAdmin = useCallback((convId: string, participantId: string) => {
    setConversations(prev => prev.map(c => c.id === convId ? {
      ...c,
      groupAdmins: (c.groupAdmins || []).filter(id => id !== participantId),
    } : c));
  }, []);

  const sendVoiceNote = async (duration: number, transcript: string) => {
    const activeConv = conversations.find(c => c.id === activeConversationId);
    if (!activeConv) return;

    let translatedTranscript = transcript;
    let voiceNoteProvider = 'none';
    let voiceNoteLatency = 0;
    if (globalLangpretationEnabled) {
      try {
        const otherParticipant = activeConv.participants.find(p => p.id !== currentUser.id);
        const targetLang = otherParticipant ? otherParticipant.myLanguage : 'en';
        // Execute translation via central NanivioTranslatorEngine with cache, routing & fallback (Palabra, Khaya, Sunbird, NLLB)
        const engine = NanivioTranslatorEngine.getInstance();
        const mtResult = await engine.translateText(transcript, myLanguage, targetLang);
        if (mtResult && mtResult.translatedText) {
          translatedTranscript = mtResult.translatedText;
          voiceNoteProvider = mtResult.provider;
          voiceNoteLatency = mtResult.latencyMs;
          const minsUsed = Number((duration / 60).toFixed(2)) || 0.1;
          recordLangpretationUsage('VOICE_NOTE', minsUsed, myLanguage, targetLang).catch(() => {});
        }
      } catch (err) {
        console.warn('Voice note translation failed:', err);
      }
    }

    const voiceNoteData: VoiceNoteData = {
      id: `vn_${Date.now()}`,
      duration,
      waveform: [15, 30, 45, 60, 85, 70, 95, 80, 60, 40, 55, 75, 90, 65, 35, 20],
      transcript,
      translatedTranscript,
      hasLangpretation: globalLangpretationEnabled,
    };

    const newMsg: ChatMessage = {
      id: `msg_vn_${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar,
      senderLang: myLanguage,
      text: `🎤 Voice note (${duration}s)`,
      timestamp: Date.now(),
      isVoiceNote: true,
      voiceNote: voiceNoteData,
      status: 'delivered',
    };

    setMessages(prev => ({
      ...prev,
      [activeConversationId]: [...(prev[activeConversationId] || []), newMsg],
    }));

    setConversations(prev => prev.map(c => c.id === activeConversationId ? {
      ...c,
      lastMessage: `🎤 Voice note (${duration}s)`,
      lastMessageTime: Date.now(),
    } : c));

    // Broadcast voice note message in real-time
    realtimeClient.sendChatMessage(activeConversationId, newMsg);
  };

  // Start direct chat with a participant
  const startDirectChatWithUser = (participant: Participant): string => {
    const existing = conversations.find(
      c => !c.isGroup && c.participants.some(p => p.id === participant.id || (p.nvId && participant.nvId && p.nvId === participant.nvId))
    );
    if (existing) {
      setActiveConversationId(existing.id);
      setActiveTab('chat');
      return existing.id;
    }

    const newConvId = `conv_${participant.id || 'direct'}_${Date.now()}`;
    const newConv: Conversation = {
      id: newConvId,
      isGroup: false,
      title: participant.name,
      avatar: participant.avatar || '',
      participants: [currentUser, participant],
      lastMessage: 'Conversation started',
      lastMessageTime: Date.now(),
      unreadCount: 0,
    };

    setConversations(prev => [newConv, ...prev]);
    setMessages(prev => ({
      ...prev,
      [newConvId]: []
    }));
    setActiveConversationId(newConvId);
    setActiveTab('chat');
    return newConvId;
  };

  // Start direct chat by NV User ID lookup
  const startDirectChatByNvId = async (nvId: string): Promise<{ success: boolean; conversationId?: string; error?: string }> => {
    try {
      const user = await lookupNanivioUser(nvId);
      if (!user) {
        return { success: false, error: 'The Nanivio number entered does not exist or is not registered in the directory.' };
      }
      const convId = startDirectChatWithUser(user);
      return { success: true, conversationId: convId };
    } catch (err) {
      console.error('Error starting direct chat by NV ID:', err);
      return { success: false, error: 'Failed to lookup Nanivio number.' };
    }
  };

  // Contacts Management with Live Backend Synchronization
  const addContact = async (contactData: Omit<SavedContact, 'id' | 'createdAt'>): Promise<SavedContact> => {
    const newContact: SavedContact = {
      ...contactData,
      id: `ct_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      createdAt: Date.now(),
    };
    setContacts(prev => [newContact, ...prev]);

    // Async sync with server database
    try {
      await fetch('/api/contacts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact),
      });
    } catch (err) {
      // Local storage provides immediate resilient fallback
      console.warn('Backend contact sync notice:', err);
    }

    return newContact;
  };

  const updateContact = (id: string, updates: Partial<SavedContact>) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    try {
      fetch(`/api/contacts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).catch(() => {});
    } catch (_) {}
  };

  const deleteContact = (id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    try {
      fetch(`/api/contacts/${id}`, {
        method: 'DELETE',
      }).catch(() => {});
    } catch (_) {}
  };

  const toggleFavoriteContact = (id: string) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, isFavorite: !c.isFavorite } : c));
  };

  // -------------------------------------------------------------
  // FINTECH & BILLING
  // -------------------------------------------------------------
  const changePlan = (tier: PlanTier) => {
    const found = USER_PLANS.find(p => p.tier === tier);
    if (found) {
      if (tier === 'free') {
        setIsSubscribed(false);
        setIsFreeTrialActive(false);
        try {
          localStorage.setItem('nanivio_is_subscribed', 'false');
          localStorage.setItem('nanivio_is_free_trial', 'false');
          localStorage.setItem('nanivio_current_plan_rem', '0');
          localStorage.setItem('nanivio_current_plan_quota', '0');
        } catch (_) {}
        setCurrentPlan({
          ...found,
          name: 'Unsubscribed',
          langpretationMinutesQuota: 0,
          langpretationMinutesRemaining: 0,
        });
      } else {
        setIsSubscribed(true);
        setIsFreeTrialActive(false);
        try {
          localStorage.setItem('nanivio_is_subscribed', 'true');
          localStorage.setItem('nanivio_is_free_trial', 'false');
          localStorage.setItem('nanivio_current_plan_rem', String(found.langpretationMinutesRemaining));
          localStorage.setItem('nanivio_current_plan_quota', String(found.langpretationMinutesQuota));
        } catch (_) {}
        setCurrentPlan(found);
      }
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    }
  };

  const sendMoney = async (recipientName: string, amount: number, currency: 'GHS' | 'USD', channel: string, note?: string): Promise<boolean> => {
    const wallet = wallets.find(w => w.currency === currency);
    if (!wallet || wallet.amount < amount) {
      alert(`Insufficient ${currency} balance. Please deposit funds into your Nanivio wallet.`);
      return false;
    }

    const fee = amount * (adminPricing.fintechTransferFeePercent / 100);
    const totalDeduction = amount + fee;

    setWallets(prev => prev.map(w => w.currency === currency ? { ...w, amount: Math.max(0, w.amount - totalDeduction) } : w));

    const newTx: FinancialTransaction = {
      id: `tx_${Date.now()}`,
      type: 'transfer_sent',
      title: `Transfer to ${recipientName}`,
      description: note || `Cross-border transfer via ${channel}`,
      amount,
      currency,
      fee,
      status: 'completed',
      timestamp: Date.now(),
      recipient: recipientName,
      channel: channel as any,
    };

    setTransactions(prev => [newTx, ...prev]);
    confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });
    return true;
  };

  const buyLangpretationBundle = async (minutes: number, costGHS: number) => {
    const ghsWallet = wallets.find(w => w.currency === 'GHS');
    if (!ghsWallet || ghsWallet.amount < costGHS) {
      alert('Insufficient GH₵ balance to purchase Langpretation minute bundle.');
      return;
    }

    setWallets(prev => prev.map(w => w.currency === 'GHS' ? { ...w, amount: w.amount - costGHS } : w));
    setCurrentPlan(prev => ({
      ...prev,
      langpretationMinutesRemaining: prev.langpretationMinutesRemaining + minutes,
    }));

    setTransactions(prev => [
      {
        id: `tx_${Date.now()}`,
        type: 'langpretation_bundle',
        title: `+${minutes} Langpretation Minutes`,
        description: `Top-up bundle added to your Nanivio quota`,
        amount: costGHS,
        currency: 'GHS',
        fee: 0,
        status: 'completed',
        timestamp: Date.now(),
        channel: 'Nanivio Wallet',
      },
      ...prev
    ]);

    confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
  };

  const depositViaGateway = async (
    gateway: 'mobileMoney' | 'cardPayment' | 'payPal' | 'googlePay' | 'applePay' | 'bankPayment',
    amount: number,
    currency: string,
    details?: any
  ): Promise<{ success: boolean; referenceId: string; message: string }> => {
    const refId = `REF-DEP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const gatewayConfig = adminPaymentGateways[gateway];
    
    if (!gatewayConfig?.enabled) {
      return {
        success: false,
        referenceId: refId,
        message: `${gateway} is currently disabled by system administrator.`,
      };
    }

    const fee = amount * ((gatewayConfig.feePercent || 0) / 100);
    const netAmount = amount;

    // Credit the target currency wallet
    setWallets((prev) =>
      prev.map((w) =>
        w.currency === currency
          ? { ...w, amount: +(w.amount + netAmount).toFixed(2) }
          : w
      )
    );

    const channelNames: Record<string, string> = {
      mobileMoney: details?.network ? `${details.network} MoMo` : 'MTN Mobile Money',
      cardPayment: details?.brand ? `${details.brand} Card` : 'Visa / Mastercard',
      payPal: 'PayPal Express',
      googlePay: 'Google Pay',
      applePay: 'Apple Pay',
      bankPayment: 'Direct Bank Wire',
    };

    const newTx: FinancialTransaction = {
      id: `tx_${Date.now()}`,
      type: 'deposit',
      title: `Deposit via ${channelNames[gateway] || gateway}`,
      description: `Funding of ${currency} ${amount.toFixed(2)} [Ref: ${refId}]`,
      amount,
      currency,
      fee,
      status: 'completed',
      timestamp: Date.now(),
      channel: (channelNames[gateway] || 'Nanivio Wallet') as any,
    };

    setTransactions((prev) => [newTx, ...prev]);
    confetti({ particleCount: 90, spread: 75, origin: { y: 0.5 } });

    return {
      success: true,
      referenceId: refId,
      message: `Deposit of ${currency} ${amount.toFixed(2)} completed successfully via ${channelNames[gateway] || gateway}.`,
    };
  };

  const transferP2PByNvId = async (
    recipientNvId: string,
    amount: number,
    currency: string,
    note?: string
  ): Promise<{ success: boolean; recipientName?: string; referenceId?: string; error?: string }> => {
    const refId = `REF-P2P-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const wallet = wallets.find((w) => w.currency === currency);
    
    if (!wallet || wallet.amount < amount) {
      return {
        success: false,
        error: `Insufficient ${currency} balance. Current balance is ${wallet ? wallet.symbol + wallet.amount.toFixed(2) : 0}.`,
      };
    }

    const recipient = await lookupNanivioUser(recipientNvId);
    const recipientName = recipient ? recipient.name : `Nanivio User (${recipientNvId})`;

    // Deduct from sender wallet (0% fee for Nanivio ID to ID)
    setWallets((prev) =>
      prev.map((w) =>
        w.currency === currency
          ? { ...w, amount: Math.max(0, +(w.amount - amount).toFixed(2)) }
          : w
      )
    );

    const newTx: FinancialTransaction = {
      id: `tx_${Date.now()}`,
      type: 'transfer_sent',
      title: `Transfer to ${recipientName}`,
      description: note || `Instant P2P Transfer to Nanivio ID ${recipientNvId} [Ref: ${refId}]`,
      amount,
      currency,
      fee: 0,
      status: 'completed',
      timestamp: Date.now(),
      recipient: recipientName,
      channel: 'Nanivio Wallet',
    };

    setTransactions((prev) => [newTx, ...prev]);
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.5 } });

    return {
      success: true,
      recipientName,
      referenceId: refId,
    };
  };

  const subscribeWithGateway = async (
    planTier: PlanTier,
    gateway: 'mobileMoney' | 'cardPayment' | 'payPal' | 'googlePay' | 'applePay' | 'bankPayment',
    cycle: 'MONTHLY' | 'ANNUAL',
    details?: any
  ): Promise<{ success: boolean; referenceId: string; message: string }> => {
    const refId = `SUB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const targetPlan = USER_PLANS.find((p) => p.tier === planTier) || USER_PLANS[1];

    setIsSubscribed(true);
    setIsFreeTrialActive(false);
    try {
      localStorage.setItem('nanivio_is_subscribed', 'true');
      localStorage.setItem('nanivio_is_free_trial', 'false');
      localStorage.setItem('nanivio_current_plan_rem', String(targetPlan.langpretationMinutesRemaining));
      localStorage.setItem('nanivio_current_plan_quota', String(targetPlan.langpretationMinutesQuota));
    } catch (_) {}

    setCurrentPlan(targetPlan);

    const channelNames: Record<string, string> = {
      mobileMoney: details?.network ? `${details.network} MoMo` : 'MTN Mobile Money',
      cardPayment: details?.brand ? `${details.brand} Card` : 'Visa / Mastercard',
      payPal: 'PayPal Express',
      googlePay: 'Google Pay',
      applePay: 'Apple Pay',
      bankPayment: 'Direct Bank Wire',
    };

    const newTx: FinancialTransaction = {
      id: `tx_${Date.now()}`,
      type: 'subscription',
      title: `${targetPlan.name} Subscription (${cycle})`,
      description: `Activated via ${channelNames[gateway] || gateway} [Ref: ${refId}]`,
      amount: cycle === 'ANNUAL' ? targetPlan.monthlyPriceGHS * 10 : targetPlan.monthlyPriceGHS,
      currency: 'GHS',
      fee: 0,
      status: 'completed',
      timestamp: Date.now(),
      channel: (channelNames[gateway] || 'Nanivio Wallet') as any,
    };

    setTransactions((prev) => [newTx, ...prev]);
    confetti({ particleCount: 110, spread: 85, origin: { y: 0.5 } });

    return {
      success: true,
      referenceId: refId,
      message: `Upgraded to ${targetPlan.name} successfully via ${channelNames[gateway] || gateway}!`,
    };
  };

  const topUpMinutesWithGateway = async (
    minutes: number,
    cost: number,
    currency: string,
    gateway: 'mobileMoney' | 'cardPayment' | 'payPal' | 'googlePay' | 'applePay' | 'bankPayment',
    details?: any
  ): Promise<{ success: boolean; referenceId: string; message: string }> => {
    const refId = `TOPUP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    setCurrentPlan((prev) => ({
      ...prev,
      langpretationMinutesRemaining: prev.langpretationMinutesRemaining + minutes,
    }));

    const channelNames: Record<string, string> = {
      mobileMoney: details?.network ? `${details.network} MoMo` : 'MTN Mobile Money',
      cardPayment: details?.brand ? `${details.brand} Card` : 'Visa / Mastercard',
      payPal: 'PayPal Express',
      googlePay: 'Google Pay',
      applePay: 'Apple Pay',
      bankPayment: 'Direct Bank Wire',
    };

    const newTx: FinancialTransaction = {
      id: `tx_${Date.now()}`,
      type: 'langpretation_bundle',
      title: `+${minutes} Langpretation Minutes`,
      description: `Purchased via ${channelNames[gateway] || gateway} [Ref: ${refId}]`,
      amount: cost,
      currency,
      fee: 0,
      status: 'completed',
      timestamp: Date.now(),
      channel: (channelNames[gateway] || 'Nanivio Wallet') as any,
    };

    setTransactions((prev) => [newTx, ...prev]);
    confetti({ particleCount: 80, spread: 65, origin: { y: 0.6 } });

    return {
      success: true,
      referenceId: refId,
      message: `+${minutes} Langpretation Minutes credited to your account.`,
    };
  };

  // Assemble full cross-view contextual memory snapshot for Malvi
  const getMalviMemorySnapshot = useCallback((): MalviContextMemory => {
    return buildMalviContextMemory({
      wallets,
      transactions,
      currentPlan,
      conversations,
      activeConversationId,
      messages,
      activeCall,
      experts,
      currentUser,
      myLanguage,
      activeTab,
    });
  }, [
    wallets,
    transactions,
    currentPlan,
    conversations,
    activeConversationId,
    messages,
    activeCall,
    experts,
    currentUser,
    myLanguage,
    activeTab,
  ]);

  return (
    <NanivioContext.Provider
      value={{
        // Authentication & Identity
        authUser,
        isAuthenticated,
        isAdmin,
        isAuthModalOpen,
        setIsAuthModalOpen,
        authMode,
        setAuthMode,
        signIn,
        signUpPersonal,
        signUpExpert,
        signUpBusiness,
        signUpDriver,
        signOut,
        updateUserProfile,
        quickSwitchDemoUser,
        signInWithAdminToken,

        // Admin Management Queues
        adminUsersList,
        adminExpertsList,
        adminBusinessesList,
        adminDriversList,
        adminAuditLogs,
        fetchAdminUsers,
        searchDossierByNvId,
        updateUserStatus,
        adminGrantUserSubscriptionOrMinutes,
        fetchAdminExperts,
        reviewExpert,
        toggleExpertFeatured,
        fetchAdminBusinesses,
        reviewBusiness,
        fetchAdminDrivers,
        reviewDriver,
        fetchAdminAuditLogs,

        // Navigation & User
        activeTab,
        setActiveTab,
        currentUser,
        inCallNotice,
        dismissInCallNotice,
        appLanguage,
        setAppLanguage,
        speakingLanguage,
        setSpeakingLanguage,
        translationLanguage,
        setTranslationLanguage,
        myLanguage,
        setMyLanguage,
        globalLangpretationEnabled,
        setGlobalLangpretationEnabled,
        getMalviMemorySnapshot,
        
        activeCall,
        incomingCall,
        onlineUsers,
        agoraStats,
        callLogs,
        clearCallLogs,
        start1on1Call,
        startGroupCall,
        forceConnectCall,
        acceptIncomingCall,
        declineIncomingCall,
        endCall,
        toggleCallLangpretation,
        toggleCallMute,
        toggleCallVideo,
        simulateSpeakerUtterance,

        streamState,
        conversations,
        activeConversationId,
        setActiveConversationId,
        messages,
        chatNotificationToast,
        dismissChatNotificationToast,
        sendMessage,
        sendVoiceNote,
        sendMediaMessage,
        deleteMessage,
        reactToMessage,
        forwardMessage,
        replyingToMessage,
        setReplyingToMessage,
        pinConversation,
        archiveConversation,
        muteConversation,
        createGroup,
        updateGroup,
        addMembersToGroup,
        removeMemberFromGroup,
        promoteGroupAdmin,
        dismissGroupAdmin,
        startDirectChatWithUser,
        startDirectChatByNvId,

        userSettings,
        updateUserSettings,
        userSecuritySessions,
        terminateOtherSessions,
        deleteAccount,
        blockUser,
        unblockUser,
        restrictUser,
        unrestrictUser,
        submitSafetyReport,

        isSettingsModalOpen,
        setIsSettingsModalOpen,
        settingsActiveTab,
        setSettingsActiveTab,
        isEditProfileModalOpen,
        setIsEditProfileModalOpen,

        contacts,
        addContact,
        updateContact,
        deleteContact,
        toggleFavoriteContact,

        experts,
        ads,
        selectedExpert,
        setSelectedExpert,
        isLiveAdsCollapsed,
        toggleLiveAdsCollapse,

        wallets,
        transactions,
        currentPlan,
        changePlan,
        sendMoney,
        buyLangpretationBundle,
        depositViaGateway,
        transferP2PByNvId,
        subscribeWithGateway,
        topUpMinutesWithGateway,

        billingSummary,
        billingPlans,
        userInvoices,
        userDisputes,
        activeUsageSession,
        emergencyControls,
        refreshBilling,
        previewBillingCharge,
        startBillingSession,
        updateBillingMeter,
        completeBillingSession,
        redeemBillingVoucher,
        createBillingDispute,
        upgradeSubscriptionPlan,

        adminFeatures,
        adminPricing,
        adminPaymentGateways,
        updateAdminFeature,
        updateAdminPricing,
        updatePaymentGatewayDetails,
        adminAdjustUserMinutes,
        adminAdjustUserQuota,

        isSubscribed,
        isFreeTrialActive,
        freeTrialMinutesRemaining,
        usedLangpretationMinutes,
        startFreeTrial,
        adminSetMeterDigits,
        adminSetSubscriptionStatus,

        // Communication Minutes, Malvi Subscriptions & Production Meter
        communicationMinutePackages,
        malviPlans,
        malviSubscription,
        langpretationMeter,
        isMalviHubOpen,
        setIsMalviHubOpen,
        isMinutesModalOpen,
        setIsMinutesModalOpen,
        purchaseCommunicationMinutes,
        subscribeMalviPlan,
        recordLangpretationUsage,
        recordMalviVideoUsage,
        pendingBillingAction,
        setPendingBillingAction,
        openBillingWithPlan,

        activeCelebrationEffect,
        triggerCelebrationEffect,
        clearCelebrationEffect,

        isLanguageModalOpen,
        setIsLanguageModalOpen,
      }}
    >
      {children}
    </NanivioContext.Provider>
  );
};

export const useNanivio = () => {
  const context = useContext(NanivioContext);
  if (!context) {
    throw new Error('useNanivio must be used within a NanivioProvider');
  }
  return context;
};
