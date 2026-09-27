import {
  MalviContextMemory,
  WalletCurrencyBalance,
  FinancialTransaction,
  UserBillingPlan,
  Conversation,
  ChatMessage,
  CallSession,
  ExpertProvider,
  Participant,
  SupportedLanguageCode,
  SUPPORTED_LANGUAGES,
} from '../types';

function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / (1000 * 60));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export interface BuildMemoryParams {
  wallets: WalletCurrencyBalance[];
  transactions: FinancialTransaction[];
  currentPlan: UserBillingPlan;
  conversations: Conversation[];
  activeConversationId?: string;
  messages: Record<string, ChatMessage[]>;
  activeCall: CallSession | null;
  experts: ExpertProvider[];
  currentUser: Participant;
  myLanguage: SupportedLanguageCode;
  activeTab: string;
}

export function buildMalviContextMemory(params: BuildMemoryParams): MalviContextMemory {
  const {
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
  } = params;

  const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === myLanguage);
  const myLanguageName = langObj ? `${langObj.name} (${langObj.nativeName})` : myLanguage;

  // Active conversation message transcript slice
  const activeConv = conversations.find((c) => c.id === activeConversationId) || conversations[0];
  const activeMsgList = activeConv && messages[activeConv.id] ? messages[activeConv.id] : [];

  return {
    wallets: wallets.map((w) => ({
      currency: w.currency,
      symbol: w.symbol,
      amount: w.amount,
      flag: w.flag,
    })),
    recentTransactions: transactions.slice(0, 6).map((tx) => ({
      id: tx.id,
      type: tx.type,
      title: tx.title,
      description: tx.description,
      amount: tx.amount,
      currency: tx.currency,
      fee: tx.fee,
      status: tx.status,
      timestamp: tx.timestamp,
      timeAgo: formatTimeAgo(tx.timestamp),
      recipient: tx.recipient,
      channel: tx.channel,
    })),
    currentPlan: {
      name: currentPlan.name,
      tier: currentPlan.tier,
      minutesRemaining: currentPlan.langpretationMinutesRemaining,
      minutesQuota: currentPlan.langpretationMinutesQuota,
      monthlyPriceGHS: currentPlan.monthlyPriceGHS,
      monthlyPriceUSD: currentPlan.monthlyPriceUSD,
    },
    recentConversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      isGroup: c.isGroup,
      unreadCount: c.unreadCount,
      lastMessage: c.lastMessage,
      lastMessageTimeAgo: c.lastMessageTime ? formatTimeAgo(c.lastMessageTime) : undefined,
    })),
    activeConversation: activeConv
      ? {
          id: activeConv.id,
          title: activeConv.title,
          isGroup: activeConv.isGroup,
          messages: activeMsgList.slice(-6).map((m) => ({
            id: m.id,
            senderName: m.senderName,
            text: m.text,
            translatedText: m.translatedText,
            senderLang: m.senderLang,
            isVoiceNote: m.isVoiceNote,
            voiceTranscript: m.voiceNote?.transcript,
            timeAgo: formatTimeAgo(m.timestamp),
          })),
        }
      : undefined,
    activeCall: activeCall
      ? {
          id: activeCall.id,
          type: activeCall.type,
          status: activeCall.status,
          hostName: activeCall.host.name,
          participants: activeCall.participants.map((p) => p.name),
          durationSeconds: activeCall.durationSeconds,
          durationFormatted: formatCallDuration(activeCall.durationSeconds),
          langpretationState: activeCall.langpretationState,
          billedMinutes: activeCall.billedMinutes,
          currentTranscript: activeCall.currentTranscript?.textInReceiverLang,
        }
      : null,
    verifiedExperts: experts
      .filter((e) => e.isOnline || e.isVerified)
      .slice(0, 6)
      .map((e) => ({
        id: e.id,
        name: e.name,
        title: e.title,
        category: e.category,
        rating: e.rating,
        ratePerMinGHS: e.ratePerMinGHS,
        ratePerMinUSD: e.ratePerMinUSD,
        isOnline: e.isOnline,
        isVerified: e.isVerified,
        location: e.location,
        specialties: e.specialties,
      })),
    currentUser: {
      id: currentUser.id,
      name: currentUser.name,
      myLanguage,
      myLanguageName,
      role: currentUser.role || 'user',
    },
    activeView: activeTab,
    timestamp: Date.now(),
  };
}
