export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'ak', name: 'Akan', flag: '🇬🇭' },
];

export interface LanguageInfo {
  code: string;
  name: string;
  flag: string;
}

export interface Participant {
  id: string;
  name: string;
  initials?: string;
  myLanguage?: string;
  avatar?: string;
  role?: string;
  nvId?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderLang: string;
  text: string;
  translatedText?: string;
  timestamp: number;
  status?: string;
  voiceNote?: { waveform?: number[]; [key: string]: any };
  reactions?: Array<{ emoji: string; users: string[]; count: number }>;
  [key: string]: any;
}

export interface Conversation {
  id: string;
  title: string;
  participants: Participant[];
  unreadCount: number;
  lastMessage?: string;
  lastMessageTime?: number;
  avatar?: string;
  isGroup?: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  [key: string]: any;
}

export interface SavedContact extends Participant {
  nvId: string;
  [key: string]: any;
}
