import React, { createContext, useContext, useState } from 'react';
import type { ChatMessage, Conversation, Participant, SavedContact } from './types';

const self = {
  id: 'sample-you',
  name: 'Ama Mensah',
  initials: 'AM',
  myLanguage: 'en',
  avatar: '',
  role: 'user',
};
const abena = {
  id: 'sample-abena',
  name: 'Abena',
  initials: 'AB',
  myLanguage: 'fr',
  avatar: '',
  role: 'user',
};
const conversationId = 'sample-coffee-conversation';
const sampleTime = new Date(2025, 5, 18, 15, 0).getTime();
const fixtureMessages: ChatMessage[] = [
  {
    id: 'sample-1', senderId: abena.id, senderName: abena.name, senderLang: 'fr',
    text: 'Salut Ama, ça te dirait de prendre un café samedi ?',
    translatedText: 'Hi Ama, would you like to get coffee on Saturday?',
    timestamp: sampleTime, status: 'sent',
  },
  {
    id: 'sample-2', senderId: self.id, senderName: self.name, senderLang: 'en',
    text: 'That sounds lovely! There’s a new café near the gardens.',
    translatedText: 'Ça me ferait très plaisir ! Il y a un nouveau café près des jardins.',
    timestamp: sampleTime + 60_000, status: 'read',
  },
  {
    id: 'sample-3', senderId: abena.id, senderName: abena.name, senderLang: 'fr',
    text: 'Parfait. On se retrouve vers 11 heures ?',
    translatedText: 'Perfect. Shall we meet around 11?',
    timestamp: sampleTime + 120_000, status: 'sent',
  },
];

const noop = () => {};
const noResult = async () => ({ success: false, error: 'This action is unavailable in the design preview.' });
interface DemoContext {
  currentUser: Participant;
  myLanguage: string;
  activeTab: string;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  activeConversationId: string;
  setActiveConversationId: React.Dispatch<React.SetStateAction<string>>;
  conversations: Conversation[];
  messages: Record<string, ChatMessage[]>;
  contacts: SavedContact[];
  callLogs: Array<{ direction: string }>;
  replyingToMessage: ChatMessage | null;
  setReplyingToMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>;
  currentPlan: { tier: string; groupCallLimit: number };
  userSettings: { privacy: { blockedUsers: string[]; restrictedUsers: string[] } };
  globalLangpretationEnabled: boolean;
  setGlobalLangpretationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  streamState: { status: string };
  adminFeatures: { malviAiAssistantEnabled: boolean; maintenanceMode: boolean };
  langpretationMeter: Record<string, never>;
  inCallNotice: null;
  wallets: unknown[];
  billingSummary: null;
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isEditProfileModalOpen: boolean;
  setIsEditProfileModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLanguageModalOpen: (isOpen?: boolean) => void;
  sendMessage: (text: string) => Promise<void>;
  sendVoiceNote: (...args: any[]) => void;
  sendMediaMessage: (...args: any[]) => void;
  deleteMessage: (...args: any[]) => void;
  reactToMessage: (...args: any[]) => void;
  forwardMessage: (...args: any[]) => void;
  pinConversation: (...args: any[]) => void;
  archiveConversation: (...args: any[]) => void;
  muteConversation: (...args: any[]) => void;
  createGroup: (title: string, desc: string, pIds: string[], avatar?: string) => Promise<void>;
  updateGroup: (id: string, updates: Record<string, unknown>) => void;
  addMembersToGroup: (id: string, ids: string[]) => void;
  removeMemberFromGroup: (id: string, personId: string) => void;
  promoteGroupAdmin: (id: string, personId: string) => void;
  dismissGroupAdmin: (id: string, personId: string) => void;
  start1on1Call: (...args: any[]) => void;
  startGroupCall: (...args: any[]) => void;
  startDirectChatWithUser: (...args: any[]) => void;
  startDirectChatByNvId: (id: string) => Promise<{ success: boolean; error?: string; conversationId?: string }>;
  blockUser: (...args: any[]) => void;
  restrictUser: (...args: any[]) => void;
}

const initialValue: DemoContext = {
  currentUser: self,
  myLanguage: 'en',
  activeTab: 'chat',
  setActiveTab: noop,
  activeConversationId: conversationId,
  setActiveConversationId: noop,
  conversations: [{
    id: conversationId, title: 'Abena', participants: [self, abena], unreadCount: 0,
    lastMessage: 'Parfait. On se retrouve vers 11 heures ?', lastMessageTime: sampleTime + 120_000,
    avatar: '', isGroup: false,
  }],
  messages: { [conversationId]: fixtureMessages },
  contacts: [],
  callLogs: [],
  replyingToMessage: null,
  setReplyingToMessage: noop,
  currentPlan: { tier: 'free', groupCallLimit: 4 },
  userSettings: { privacy: { blockedUsers: [], restrictedUsers: [] } },
  globalLangpretationEnabled: true,
  setGlobalLangpretationEnabled: noop,
  streamState: { status: 'DISCONNECTED' },
  adminFeatures: { malviAiAssistantEnabled: false, maintenanceMode: false },
  langpretationMeter: {},
  inCallNotice: null,
  wallets: [],
  billingSummary: null,
  isSettingsModalOpen: false,
  setIsSettingsModalOpen: noop,
  isEditProfileModalOpen: false,
  setIsEditProfileModalOpen: noop,
  setIsLanguageModalOpen: noop,
  sendMessage: async () => {},
  sendVoiceNote: noop,
  sendMediaMessage: noop,
  deleteMessage: noop,
  reactToMessage: noop,
  forwardMessage: noop,
  pinConversation: noop,
  archiveConversation: noop,
  muteConversation: noop,
  createGroup: async () => {},
  updateGroup: noop,
  addMembersToGroup: noop,
  removeMemberFromGroup: noop,
  promoteGroupAdmin: noop,
  dismissGroupAdmin: noop,
  start1on1Call: noop,
  startGroupCall: noop,
  startDirectChatWithUser: noop,
  startDirectChatByNvId: noResult,
  blockUser: noop,
  restrictUser: noop,
};

const NanivioContext = createContext<DemoContext>(initialValue);

export function NanivioProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({ [conversationId]: fixtureMessages });
  const [lastMessage, setLastMessage] = useState('Parfait. On se retrouve vers 11 heures ?');
  const [globalLangpretationEnabled, setGlobalLangpretationEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState('chat');
  const [activeConversationId, setActiveConversationId] = useState(conversationId);
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);

  const value = {
    ...initialValue,
    activeTab, setActiveTab, activeConversationId, setActiveConversationId,
    globalLangpretationEnabled, setGlobalLangpretationEnabled, replyingToMessage, setReplyingToMessage,
    isSettingsModalOpen, setIsSettingsModalOpen, isEditProfileModalOpen, setIsEditProfileModalOpen,
    messages,
    conversations: [{ ...initialValue.conversations[0], lastMessage }],
    sendMessage: async (text: string) => {
      const message = {
        id: `sample-local-${Date.now()}`, senderId: self.id, senderName: self.name, senderLang: 'en',
        text, timestamp: Date.now(), status: 'sent',
      };
      setMessages((current) => ({ ...current, [conversationId]: [...(current[conversationId] || []), message] }));
      setLastMessage(text);
    },
  };

  return <NanivioContext.Provider value={value}>{children}</NanivioContext.Provider>;
}

export function useNanivio() {
  return useContext(NanivioContext);
}
