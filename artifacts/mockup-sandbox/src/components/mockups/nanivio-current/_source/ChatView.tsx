import { TranslationUnavailableNotice } from './TranslationUnavailableNotice';
import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Mic,
  Phone,
  Video,
  Radio,
  Sparkles,
  Users,
  Search,
  Check,
  CheckCheck,
  Play,
  Pause,
  Globe,
  Info,
  Layers,
  MessageSquare,
  Activity,
  UserPlus,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Paperclip,
  MoreVertical,
  Pin,
  Archive,
  Bell,
  BellOff,
  Reply,
  Forward,
  Trash2,
  Copy,
  ShieldAlert,
  Settings,
  X,
  FileText,
  Download,
  Image as ImageIcon,
  Film,
  Maximize2,
  UserCheck,
  UserX,
  Camera,
  SmilePlus,
  Volume2,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { SUPPORTED_LANGUAGES, ChatMessage, Conversation, SavedContact } from '../../types';
import { normalizeNanivioNumber, lookupNanivioUser } from '../../utils/userLookup';
import { VoiceNoteRecorder } from './VoiceNoteRecorder';
import { StreamChatInterface } from './StreamChatInterface';
import { MediaAttachmentModal } from './MediaAttachmentModal';
import { ForwardMessageModal } from './ForwardMessageModal';
import { CreateGroupModal } from './CreateGroupModal';
import { GroupDetailsModal } from './GroupDetailsModal';
import { ReportSafetyModal } from './ReportSafetyModal';
import { LiveCameraModal } from './LiveCameraModal';
import { EditProfileModal } from '../account/EditProfileModal';
import { SettingsModal } from '../settings/SettingsModal';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { ChatCategoryMenu } from './ChatCategoryMenu';

const REACTION_LABELS: Record<string, string> = {
  '👍': 'Like',
  '❤️': 'Love',
  '😂': 'Laugh',
  '🔥': 'Fire',
  '🚀': 'Celebrate',
  '🇬🇭': 'Ghana',
};
const QUICK_REACTIONS = [
  { value: '👍', label: 'Like' },
  { value: '❤️', label: 'Love' },
  { value: '😂', label: 'Laugh' },
  { value: '🔥', label: 'Fire' },
  { value: '🚀', label: 'Celebrate' },
  { value: '🇬🇭', label: 'Ghana' },
];

export const ChatView: React.FC = () => {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    messages,
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
    start1on1Call,
    startGroupCall,
    startDirectChatWithUser,
    startDirectChatByNvId,
    contacts,
    currentUser,
    currentPlan,
    myLanguage,
    globalLangpretationEnabled,
    streamState,
    userSettings,
    blockUser,
    restrictUser,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isEditProfileModalOpen,
    setIsEditProfileModalOpen,
  } = useNanivio();

  const [activeTab, setActiveTab] = useState<'conversations' | 'stream_channels'>('conversations');
  const [convFilterTab, setConvFilterTab] = useState<'all' | 'groups' | 'archived'>('all');
  const [inputMsg, setInputMsg] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [showOriginalMap, setShowOriginalMap] = useState<Record<string, boolean>>({});
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [voicePlaybackErrorId, setVoicePlaybackErrorId] = useState<string | null>(null);
  const [playingVoiceTrack, setPlayingVoiceTrack] = useState<Record<string, 'translated' | 'original'>>({});
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showMobileChatThread, setShowMobileChatThread] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [sendMessageError, setSendMessageError] = useState<string | null>(null);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

  // Social suite modal states
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isGroupDetailsOpen, setIsGroupDetailsOpen] = useState(false);
  const [safetyTarget, setSafetyTarget] = useState<{ id: string; name: string; avatar?: string; nvId?: string; isGroup?: boolean } | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [isSearchInChatOpen, setIsSearchInChatOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [quickReactionMsgId, setQuickReactionMsgId] = useState<string | null>(null);
  const [messageMenuMsgId, setMessageMenuMsgId] = useState<string | null>(null);

  // Nanivio Number Direct Chat Entry State
  const [directNvInput, setDirectNvInput] = useState('');
  const [isLookingUpNv, setIsLookingUpNv] = useState(false);
  const [nvErrorModal, setNvErrorModal] = useState<string | null>(null);
  const [isQuickNvBarOpen, setIsQuickNvBarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateHeight = () => {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--nv-chat-visual-height', `${height}px`);
    };
    updateHeight();
    viewport?.addEventListener('resize', updateHeight);
    window.addEventListener('resize', updateHeight);
    return () => {
      viewport?.removeEventListener('resize', updateHeight);
      window.removeEventListener('resize', updateHeight);
      document.documentElement.style.removeProperty('--nv-chat-visual-height');
    };
  }, []);

  useEffect(() => {
    if (!isHeaderMenuOpen && !isAttachmentMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!headerMenuRef.current?.contains(target)) setIsHeaderMenuOpen(false);
      if (!attachmentMenuRef.current?.contains(target)) setIsAttachmentMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHeaderMenuOpen(false);
        setIsAttachmentMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isHeaderMenuOpen, isAttachmentMenuOpen]);

  const activeConv = (conversations || []).find((c) => c?.id === activeConversationId) || (conversations || [])[0];
  useEffect(() => {
    if (activeConv && activeConv.id !== activeConversationId) setActiveConversationId(activeConv.id);
  }, [activeConv?.id, activeConversationId, setActiveConversationId]);
  const rawActiveMessages = (activeConv && messages ? messages[activeConv.id] : []) || [];
  const streamConnectionLabel =
    streamState.status === 'CONNECTED'
      ? 'Channels connected'
      : streamState.status === 'CONNECTING'
      ? 'Connecting to channels'
      : 'Channels unavailable';

  // Filter messages by search in chat query if active
  const activeMessages = chatSearchQuery.trim()
    ? rawActiveMessages.filter(
        (m) =>
          (m.text || '').toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
          (m.translatedText && m.translatedText.toLowerCase().includes(chatSearchQuery.toLowerCase())) ||
          (m.mediaCaption && m.mediaCaption.toLowerCase().includes(chatSearchQuery.toLowerCase())) ||
          (m.mediaFileName && m.mediaFileName.toLowerCase().includes(chatSearchQuery.toLowerCase()))
      )
    : rawActiveMessages;

  // Auto-select first conversation if none is active
  useEffect(() => {
    if (conversations && conversations.length > 0) {
      const exists = conversations.some((c) => c.id === activeConversationId);
      if (!activeConversationId || !exists) {
        setActiveConversationId(conversations[0].id);
      }
    }
  }, [conversations, activeConversationId, setActiveConversationId]);

  // When user selects a conversation or on load, open mobile chat thread
  const prevActiveIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeConversationId) {
      if (prevActiveIdRef.current !== activeConversationId) {
        setShowMobileChatThread(true);
        setIsHeaderMenuOpen(false);
        setIsSearchInChatOpen(false);
        setChatSearchQuery('');
      }
    }
    prevActiveIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length]);

  useEffect(() => {
    const input = messageInputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    if (inputMsg) input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
  }, [inputMsg]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMsg.trim() || isSendingMessage) return;
    const text = inputMsg;
    setIsSendingMessage(true);
    setSendMessageError(null);
    try {
      await sendMessage(text);
      setInputMsg('');
    } catch {
      setSendMessageError('Message not sent. Your draft is still here—try again.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleVoiceSend = async (payload: any) => {
    if (payload && typeof payload === 'object' && payload.duration) {
      await sendVoiceNote(
        payload.duration,
        payload.transcript,
        payload.audioBlobUrl,
        payload.isLangpretation,
        payload.translatedAudioUrl,
        payload.translatedTranscript,
        payload.targetLang
      );
    } else {
      await sendVoiceNote(payload || 3, 'Voice note');
    }
    setIsRecordingVoice(false);
  };

  const handleTogglePlayVoice = (msg: ChatMessage) => {
    if (!msg.voiceNote) return;

    if (playingVoiceId === msg.id) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      setPlayingVoiceId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }

    const currentTrack = playingVoiceTrack[msg.id] || (msg.voiceNote.hasLangpretation && msg.voiceNote.translatedAudioUrl ? 'translated' : 'original');
    const audioUrl = currentTrack === 'translated'
      ? (msg.voiceNote.translatedAudioUrl || msg.voiceNote.audioBlobUrl)
      : (msg.voiceNote.audioBlobUrl || msg.voiceNote.translatedAudioUrl);

    if (audioUrl) {
      try {
        const audio = new Audio(audioUrl);
        audioPlayerRef.current = audio;
        setVoicePlaybackErrorId(null);
        setPlayingVoiceId(msg.id);

        audio.onended = () => {
          setPlayingVoiceId(null);
          audioPlayerRef.current = null;
        };
        audio.onerror = () => {
          setPlayingVoiceId(null);
          audioPlayerRef.current = null;
          setVoicePlaybackErrorId(msg.id);
        };

        audio.play().catch(() => {
          setPlayingVoiceId(null);
          setVoicePlaybackErrorId(msg.id);
        });
      } catch (err) {
        console.warn('Audio playback error:', err);
        setPlayingVoiceId(null);
        setVoicePlaybackErrorId(msg.id);
      }
    } else {
      setVoicePlaybackErrorId(msg.id);
    }
  };

  const handleSendMedia = async (media: {
    type: 'image' | 'video' | 'document';
    url: string;
    caption?: string;
    fileName?: string;
    fileSize?: string;
  }) => {
    await sendMediaMessage(media);
  };

  const handleCopyMessage = (text: string, msgId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const toggleShowOriginal = (msgId: string) => {
    setShowOriginalMap((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  // Direct Nanivio Number Chat Submission
  const handleStartDirectChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanNum = normalizeNanivioNumber(directNvInput);
    if (!cleanNum) {
      setNvErrorModal('Please enter a valid Nanivio user number (e.g. 0486482190).');
      return;
    }

    setIsLookingUpNv(true);
    try {
      const result = await startDirectChatByNvId(cleanNum);
      if (result.success) {
        if (result.conversationId) {
          setActiveConversationId(result.conversationId);
        }
        setActiveTab('conversations');
        setShowMobileChatThread(true);
        setIsHeaderMenuOpen(false);
        setIsSearchInChatOpen(false);
        setChatSearchQuery('');
        setDirectNvInput('');
        setIsQuickNvBarOpen(false);
      } else {
        setNvErrorModal(result.error || 'Wrong number or never exists in the directory.');
      }
    } catch (err) {
      setNvErrorModal('Wrong number or never exists. Please check the Nanivio ID and try again.');
    } finally {
      setIsLookingUpNv(false);
    }
  };

  const myLangInfo = SUPPORTED_LANGUAGES.find((l) => l.code === myLanguage) || SUPPORTED_LANGUAGES[0];

  const filteredConversations = (conversations || [])
    .filter((c) => {
      if (!c) return false;
      const titleStr = c.title || '';
      const lastMsgStr = c.lastMessage || '';
      const search = searchTerm.toLowerCase();
      const matchesSearch =
        titleStr.toLowerCase().includes(search) ||
        lastMsgStr.toLowerCase().includes(search);
      if (!matchesSearch) return false;

      if (convFilterTab === 'archived') return !!c.isArchived;
      if (convFilterTab === 'groups') return !c.isArchived && !!c.isGroup;
      return !c.isArchived;
    })
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
    });

  return (
    <div className="nv-chat-page flex min-h-0 w-full flex-1 flex-col">
      {/* Dedicated Nanivio Number Direct Chat Entry Card */}
      {isQuickNvBarOpen && (
        <div className="bg-gradient-to-r from-[#0d1b2a] via-[#0b1626] to-[#091322] border border-emerald-500/30 rounded-2xl p-5 shadow-xl space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono text-sm font-bold">
                NV
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">Direct Chat by Nanivio Number</h3>
                <p className="text-xs sm:text-sm text-slate-300">
                  Enter recipient's Nanivio number to start an instant translated direct conversation
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsQuickNvBarOpen(false)}
              className="text-slate-400 hover:text-slate-200 text-sm px-2 py-1 rounded cursor-pointer"
            >
                Close
            </button>
          </div>

          <form onSubmit={handleStartDirectChat} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-mono font-bold text-emerald-400">
                NV-
              </span>
              <input
                id="input-direct-nv-chat"
                type="text"
                placeholder="0486482190 (e.g. 0486...)"
                value={directNvInput}
                onChange={(e) => setDirectNvInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-14 pr-4 py-3 text-sm sm:text-base text-white font-mono tracking-wider placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              id="btn-submit-nv-chat"
              disabled={isLookingUpNv || !directNvInput.trim()}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-sm hover:scale-105 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              {isLookingUpNv ? (
                <span className="animate-pulse">Checking...</span>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  <span>Start Chat</span>
                </>
              )}
            </button>
          </form>

          {/* Quick chip suggestions from saved contacts */}
          {contacts.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto text-xs sm:text-sm">
              <span className="text-slate-400 shrink-0 font-medium">Quick saved:</span>
              {contacts.slice(0, 5).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setDirectNvInput(c.nvId)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 hover:text-emerald-300 font-mono text-xs transition-colors whitespace-nowrap cursor-pointer"
                >
                  {c.name} ({c.nvId.slice(-4)})
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Conditionally Render Stream Chat Interface or Standard Chat View */}
      {activeTab === 'stream_channels' ? (
        <StreamChatInterface onCategorySelect={setActiveTab} />
      ) : (
        <div className="nv-chat-workspace flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Left Sidebar: Conversations List */}
          <div className={`w-full lg:w-[340px] xl:w-[380px] bg-white border border-[#e1eae3] rounded-2xl flex flex-col overflow-hidden shrink-0 ${showMobileChatThread ? 'hidden lg:flex' : 'flex'}`}>
            {/* Header, Actions & Search */}
            <div className="p-4 border-b border-[#e8eee9] space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-base font-bold text-white flex items-center gap-2">
                  <ChatCategoryMenu activeCategory="conversations" connectionStatus={streamState.status} connectionLabel={streamConnectionLabel} onSelect={setActiveTab} />
                  <span>Chats &amp; Groups</span>
                </h1>
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    id="btn-new-group-modal"
                    onClick={() => setIsCreateGroupOpen(true)}
                    className="text-[11px] font-medium px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors"
                    title="Create new group chat"
                  >
                    <Users className="w-3 h-3 text-emerald-400" />
                    <span>+ Group</span>
                  </button>
                  <button
                    onClick={() => setIsQuickNvBarOpen(true)}
                    className="text-[11px] font-mono px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 flex items-center gap-1 transition-colors"
                    title="Direct chat by Nanivio Number"
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>+ NV Chat</span>
                  </button>
                </div>
              </div>

              {/* Filter Tabs: All, Groups, Archived */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800/80 text-xs">
                <button
                  type="button"
                  onClick={() => setConvFilterTab('all')}
                  className={`flex-1 py-1 px-2 rounded-lg font-medium transition-all text-center ${
                    convFilterTab === 'all'
                      ? 'bg-slate-800 text-emerald-400 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All ({conversations.filter((c) => !c.isArchived).length})
                </button>
                <button
                  type="button"
                  onClick={() => setConvFilterTab('groups')}
                  className={`flex-1 py-1 px-2 rounded-lg font-medium transition-all text-center ${
                    convFilterTab === 'groups'
                      ? 'bg-slate-800 text-emerald-400 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Groups ({conversations.filter((c) => !c.isArchived && c.isGroup).length})
                </button>
                <button
                  type="button"
                  onClick={() => setConvFilterTab('archived')}
                  className={`flex-1 py-1 px-2 rounded-lg font-medium transition-all text-center ${
                    convFilterTab === 'archived'
                      ? 'bg-slate-800 text-amber-400 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Archived ({conversations.filter((c) => c.isArchived).length})
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* List of Contacts/Chats */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
              {filteredConversations.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                    <MessageSquare className="w-5 h-5 text-slate-500" />
                  </div>
                  <p className="text-xs font-medium text-slate-300">No conversations in this view</p>
                  <p className="text-[11px] text-slate-500">Tap "+ Group" or "+ NV Chat" above to start messaging.</p>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isActive = conv.id === activeConv?.id;
                  const otherP = conv.participants.find((p) => p.id !== currentUser.id) || conv.participants[0];
                  const pLang = SUPPORTED_LANGUAGES.find((l) => l.code === otherP?.myLanguage);

                  return (
                    <div
                      key={conv.id}
                      className={`group relative w-full p-3.5 flex items-start gap-3 text-left transition-all cursor-pointer ${
                        isActive ? 'bg-slate-800 border-l-4 border-amber-400' : 'hover:bg-slate-900/60'
                      }`}
                      onClick={() => {
                        setActiveConversationId(conv.id);
                        setShowMobileChatThread(true);
                      }}
                    >
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full overflow-hidden border border-slate-700 bg-slate-800 flex items-center justify-center">
                          {conv.isGroup ? (
                            <Users className="w-6 h-6 text-emerald-400" />
                          ) : conv.avatar ? (
                            <img
                              src={conv.avatar}
                              alt={conv.title}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-sm font-bold text-emerald-400 font-mono">
                              {conv.title?.slice(0, 2).toUpperCase() || 'NV'}
                            </span>
                          )}
                        </div>
                        {pLang && !conv.isGroup && (
                          <span className="absolute -bottom-1 -right-1 text-sm bg-slate-950 rounded-full px-0.5 border border-slate-800">
                            {pLang.code.toUpperCase()}
                          </span>
                        )}
                        {conv.isPinned && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500/90 text-slate-950 rounded-full flex items-center justify-center text-[10px] shadow" title="Pinned conversation">
                            <Pin className="w-2.5 h-2.5 fill-slate-950" />
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="text-[16px] sm:text-[16.5px] font-semibold text-white truncate max-w-[170px]">{conv.title}</h3>
                            {conv.isMuted && (
                              <BellOff className="w-3.5 h-3.5 text-slate-500 shrink-0" title="Muted" />
                            )}
                          </div>
                          {conv.lastMessageTime && (
                            <span className="text-[12px] text-slate-400 font-mono">
                              {new Date(conv.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>

                        <p className="text-[14px] sm:text-[14.5px] text-slate-300 truncate mt-0.5">{conv.lastMessage || 'No messages yet'}</p>

                        <div className="mt-1.5 flex items-center gap-1.5">
                          {conv.isGroup ? (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-[12px] text-slate-300 font-medium">
                              {conv.participants.length} members
                            </span>
                          ) : (
                            <span className="text-[12px] text-emerald-400 font-mono font-medium">
                              Speaks: {pLang?.name || otherP?.myLanguage}
                            </span>
                          )}
                        </div>
                      </div>

                      {conv.unreadCount > 0 && (
                        <span className="min-w-5 h-5 px-1 rounded-full bg-emerald-500 text-slate-950 font-bold text-[11.5px] flex items-center justify-center shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}

                      {/* Hover action quick buttons */}
                      <div className="absolute right-2 bottom-2 hidden group-hover:flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded-lg p-1 shadow-lg">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            pinConversation(conv.id);
                          }}
                          className={`p-1 rounded hover:bg-slate-800 ${conv.isPinned ? 'text-amber-400' : 'text-slate-400 hover:text-white'}`}
                          title={conv.isPinned ? 'Unpin chat' : 'Pin chat'}
                        >
                          <Pin className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            muteConversation(conv.id);
                          }}
                          className={`p-1 rounded hover:bg-slate-800 ${conv.isMuted ? 'text-rose-400' : 'text-slate-400 hover:text-white'}`}
                          title={conv.isMuted ? 'Unmute chat' : 'Mute chat'}
                        >
                          {conv.isMuted ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            archiveConversation(conv.id);
                          }}
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                          title={conv.isArchived ? 'Unarchive' : 'Archive'}
                        >
                          <Archive className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Main Chat Thread */}
          {activeConv ? (
            <div className={`chat-thread-surface flex-1 min-w-0 bg-white border border-[#e1eae3] rounded-2xl flex flex-col overflow-hidden ${showMobileChatThread ? 'flex' : 'hidden lg:flex'}`}>
              {/* Active Conversation Header */}
              <div className="p-3 sm:p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  {/* Mobile back to conversations list */}
                  <button
                    onClick={() => setShowMobileChatThread(false)}
                    className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold shrink-0 border border-slate-700 cursor-pointer"
                    title="Back to all conversations"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Chats</span>
                  </button>

                  <div
                    onClick={() => {
                      if (activeConv.isGroup) {
                        setIsGroupDetailsOpen(true);
                      }
                    }}
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden border border-slate-700 bg-slate-800 flex items-center justify-center shrink-0 ${
                      activeConv.isGroup ? 'cursor-pointer hover:border-emerald-500 transition-colors' : ''
                    }`}
                  >
                    {activeConv.isGroup ? (
                      <Users className="w-5 h-5 text-emerald-400" />
                    ) : activeConv.avatar ? (
                      <img
                        src={activeConv.avatar}
                        alt={activeConv.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-xs sm:text-sm font-bold text-emerald-400 font-mono">
                        {activeConv.title?.slice(0, 2).toUpperCase() || 'NV'}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <h2
                        onClick={() => {
                          if (activeConv.isGroup) setIsGroupDetailsOpen(true);
                        }}
                        className={`text-[16px] sm:text-[17.5px] font-semibold text-white truncate ${
                          activeConv.isGroup ? 'cursor-pointer hover:text-emerald-400 transition-colors' : ''
                        }`}
                      >
                        {activeConv.title}
                      </h2>
                      {activeConv.isGroup && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[12px] font-mono border border-emerald-500/20 shrink-0">
                          {activeConv.participants.length} members
                        </span>
                      )}
                      {activeConv.isExpertChat && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[12px] font-bold border border-amber-500/30 shrink-0">
                          Expert
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
                      <span className="text-[12.5px] text-slate-300 truncate">
                        Language: <strong className="text-white">{myLangInfo.name}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Direct Call Actions & Tools */}
                <div className="flex items-center gap-1.5 sm:gap-2 relative">
                  <button
                    id="btn-chat-start-audio"
                    onClick={() => {
                      if (activeConv.isGroup) {
                        startGroupCall(activeConv.participants.filter((p) => p.id !== currentUser.id), 'audio');
                      } else {
                        const otherP = activeConv.participants.find((p) => p.id !== currentUser.id);
                        if (otherP) start1on1Call(otherP, 'audio');
                      }
                    }}
                    className="p-2 sm:p-2.5 rounded-xl bg-slate-800 hover:bg-emerald-600/20 text-slate-200 hover:text-emerald-300 border border-slate-700 hover:border-emerald-500/50 transition-all shadow-sm"
                    title="Start Audio Call with Langpretation"
                  >
                    <Phone className="w-4 h-4" />
                  </button>

                  <button
                    id="btn-chat-start-video"
                    onClick={() => {
                      if (activeConv.isGroup) {
                        startGroupCall(activeConv.participants.filter((p) => p.id !== currentUser.id), 'video');
                      } else {
                        const otherP = activeConv.participants.find((p) => p.id !== currentUser.id);
                        if (otherP) start1on1Call(otherP, 'video');
                      }
                    }}
                    className="p-2 sm:p-2.5 rounded-xl bg-slate-800 hover:bg-emerald-600/20 text-slate-200 hover:text-emerald-300 border border-slate-700 hover:border-emerald-500/50 transition-all shadow-sm"
                    title="Start Video Call with Langpretation"
                  >
                    <Video className="w-4 h-4" />
                  </button>

                  {/* Header Menu Dropdown Trigger */}
                  <div className="relative" ref={headerMenuRef}>
                    <button
                      onClick={() => setIsHeaderMenuOpen((prev) => !prev)}
                      className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-colors"
                      aria-label="More conversation actions"
                      aria-expanded={isHeaderMenuOpen}
                      title="More"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {isHeaderMenuOpen && (
                      <div role="menu" aria-label="More conversation actions" className="absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-1rem)] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-1.5 z-40 space-y-1 text-xs">
                        <button
                          onClick={() => {
                            setIsHeaderMenuOpen(false);
                            setIsSearchInChatOpen((prev) => !prev);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                        >
                          <Search className="w-4 h-4 text-slate-500" />
                          <span>{isSearchInChatOpen ? 'Close chat search' : 'Search in conversation'}</span>
                        </button>
                        <button
                          onClick={() => {
                            setIsHeaderMenuOpen(false);
                            setIsSettingsModalOpen(true);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                        >
                          <Settings className="w-4 h-4 text-slate-500" />
                          <span>Privacy &amp; notification settings</span>
                        </button>
                        <div className="border-t border-slate-800 my-1" />
                        {activeConv.isGroup ? (
                          <button
                            onClick={() => {
                              setIsHeaderMenuOpen(false);
                              setIsGroupDetailsOpen(true);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                          >
                            <Users className="w-4 h-4 text-emerald-400" />
                            <span>Group Info &amp; Members</span>
                          </button>
                        ) : null}

                        <button
                          onClick={() => {
                            setIsHeaderMenuOpen(false);
                            pinConversation(activeConv.id);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                        >
                          <Pin className="w-4 h-4 text-amber-400" />
                          <span>{activeConv.isPinned ? 'Unpin Conversation' : 'Pin Conversation'}</span>
                        </button>

                        <button
                          onClick={() => {
                            setIsHeaderMenuOpen(false);
                            muteConversation(activeConv.id);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                        >
                          <BellOff className="w-4 h-4 text-slate-400" />
                          <span>{activeConv.isMuted ? 'Unmute Notifications' : 'Mute Notifications'}</span>
                        </button>

                        <button
                          onClick={() => {
                            setIsHeaderMenuOpen(false);
                            archiveConversation(activeConv.id);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                        >
                          <Archive className="w-4 h-4 text-slate-400" />
                          <span>{activeConv.isArchived ? 'Unarchive Chat' : 'Archive Chat'}</span>
                        </button>

                        <div className="border-t border-slate-800 my-1" />

                        {/* Safety options */}
                        <button
                          onClick={() => {
                            setIsHeaderMenuOpen(false);
                            const otherP = activeConv.participants.find((p) => p.id !== currentUser.id) || activeConv.participants[0];
                            setSafetyTarget({
                              id: otherP.id,
                              name: activeConv.title,
                              avatar: activeConv.avatar,
                              nvId: otherP.nvId,
                              isGroup: activeConv.isGroup,
                            });
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-950/30 text-rose-300 flex items-center gap-2"
                        >
                          <ShieldAlert className="w-4 h-4 text-rose-400" />
                          <span>Report or Restrict</span>
                        </button>

                        {!activeConv.isGroup && (
                          <button
                            onClick={() => {
                              setIsHeaderMenuOpen(false);
                              const otherP = activeConv.participants.find((p) => p.id !== currentUser.id);
                              if (otherP) blockUser(otherP.id);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-950/30 text-rose-400 flex items-center gap-2"
                          >
                            <UserX className="w-4 h-4 text-rose-500" />
                            <span>Block Contact</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* In-Chat Search Bar */}
              {isSearchInChatOpen && (
                <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center gap-2">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search in this chat..."
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                    autoFocus
                    className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                  {chatSearchQuery && (
                    <span className="text-[11px] text-slate-400 font-mono shrink-0">
                      {activeMessages.length} matches
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setIsSearchInChatOpen(false);
                      setChatSearchQuery('');
                    }}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Messages Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Langpretation Banner Info */}
                <div className="mx-auto max-w-md bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-2 text-center text-xs text-emerald-200/90 flex items-center justify-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>
                    Translations appear in {myLangInfo.name} when available.
                  </span>
                </div>

                {copiedMsgId && (
                  <div className="fixed top-20 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl bg-slate-900 border border-emerald-500 text-emerald-400 text-xs font-mono shadow-xl z-50 animate-in fade-in">
                    Message copied to clipboard
                  </div>
                )}

                {activeMessages.map((msg, messageIndex) => {
                  const isMe = msg.senderId === currentUser.id;
                  const showOriginal = showOriginalMap[msg.id];
                  const senderLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === msg.senderLang);
                  const voiceWaveform = Array.isArray(msg.voiceNote?.waveform) ? msg.voiceNote.waveform : [];
                  const messageDate = new Date(msg.timestamp);
                  const previousMessageDate = messageIndex > 0 ? new Date(activeMessages[messageIndex - 1].timestamp) : null;
                  const hasDateChanged = !previousMessageDate || messageDate.toDateString() !== previousMessageDate.toDateString();

                  return (
                    <React.Fragment key={msg.id}>
                    {hasDateChanged && (
                      <div className="nv-chat-date-separator" aria-label={`Messages from ${messageDate.toLocaleDateString()}`}>
                        <span>{messageDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                      </div>
                    )}
                    <div
                      className={`nv-chat-message-row group relative flex min-w-0 w-full items-start gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      {!isMe && (
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-700 bg-slate-800 shrink-0 flex items-center justify-center text-[10px] font-bold text-emerald-700">
                          {msg.senderAvatar ? (
                            <img
                              src={msg.senderAvatar}
                              alt={msg.senderName}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            (msg.senderName || 'NV').slice(0, 2).toUpperCase()
                          )}
                        </div>
                      )}

                      <div className={`min-w-0 max-w-md ${isMe ? 'items-end' : 'items-start'} flex flex-col relative`}>
                        {!isMe && (
                          <div className="nv-chat-sender flex min-w-0 max-w-full flex-wrap items-center gap-1.5 mb-1 px-1">
                            <span className="min-w-0 break-words text-[13.5px] font-bold">{msg.senderName}</span>
                            {senderLangObj && (
                              <span className="text-[12px] text-slate-400 font-mono">({senderLangObj.name})</span>
                            )}
                          </div>
                        )}

                        {/* Quoted reply bubble if this message was a reply */}
                        {msg.replyTo && (
                          <div className="mb-1.5 p-2.5 rounded-xl bg-slate-900/90 border-l-2 border-emerald-400 text-xs text-slate-300 max-w-full">
                            <span className="font-bold text-emerald-400 text-[12.5px] block truncate">
                              {msg.replyTo.senderName}
                            </span>
                            <span className="text-slate-300 text-[13.5px] truncate block mt-0.5">
                              {msg.replyTo.text}
                            </span>
                          </div>
                        )}

                        {/* Voice Note Bubble */}
                        {msg.isVoiceNote && msg.voiceNote ? (
                          <div
                            className={`rounded-2xl p-3.5 border shadow-md space-y-2.5 max-w-sm sm:max-w-md ${
                              isMe
                                ? 'bg-gradient-to-br from-emerald-950/90 to-slate-900 border-emerald-500/50 text-white'
                                : 'bg-gradient-to-br from-slate-900 to-[#0c1424] border-slate-700 text-slate-100'
                            }`}
                          >
                            {/* Track Selector for Langpretation Voice Notes */}
                            {msg.voiceNote.hasLangpretation && msg.voiceNote.translatedAudioUrl && (
                              <div className="flex items-center justify-between pb-1.5 border-b border-white/10 text-[10px] font-mono">
                                <span className="flex items-center gap-1 text-emerald-400 font-bold">
                                  <Sparkles className="w-3 h-3" />
                                  <span>Langpretation Audio</span>
                                </span>
                                <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10">
                                  <button
                                    onClick={() => setPlayingVoiceTrack((prev) => ({ ...prev, [msg.id]: 'translated' }))}
                                    className={`px-2 py-0.5 rounded text-[9.5px] font-bold transition-all cursor-pointer ${
                                      (playingVoiceTrack[msg.id] || 'translated') === 'translated'
                                        ? 'bg-emerald-500 text-slate-950 font-extrabold shadow'
                                        : 'text-slate-400 hover:text-white'
                                    }`}
                                  >
                                    Translated
                                  </button>
                                  <button
                                    onClick={() => setPlayingVoiceTrack((prev) => ({ ...prev, [msg.id]: 'original' }))}
                                    className={`px-2 py-0.5 rounded text-[9.5px] font-bold transition-all cursor-pointer ${
                                      playingVoiceTrack[msg.id] === 'original'
                                        ? 'bg-slate-700 text-white font-extrabold shadow'
                                        : 'text-slate-400 hover:text-white'
                                    }`}
                                  >
                                    Original
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Player Bar */}
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleTogglePlayVoice(msg)}
                                className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center hover:scale-105 transition-transform shrink-0 shadow-lg shadow-emerald-500/30 cursor-pointer"
                                title={playingVoiceId === msg.id ? 'Pause Voice Note' : 'Play Voice Note'}
                              >
                                {playingVoiceId === msg.id ? (
                                  <Pause className="w-4 h-4 fill-slate-950" />
                                ) : (
                                  <Play className="w-4 h-4 ml-0.5 fill-slate-950" />
                                )}
                              </button>

                              <div className="flex-1 space-y-1">
                                <div aria-label="Voice note waveform" className="flex items-center gap-1 h-6">
                                  {voiceWaveform.length === 0 && (
                                    <span className="sr-only">Waveform unavailable. Voice note playback is still available.</span>
                                  )}
                                  {voiceWaveform.map((h, i) => (
                                    <div
                                      key={i}
                                      style={{ height: `${h}%` }}
                                      className={`w-1 rounded-full transition-all ${
                                        playingVoiceId === msg.id
                                          ? 'bg-emerald-400 animate-pulse'
                                          : 'bg-slate-600'
                                      }`}
                                    />
                                  ))}
                                </div>
                                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                                  {typeof msg.voiceNote.duration === 'number' && (
                                    <span>0:{msg.voiceNote.duration.toString().padStart(2, '0')}</span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Volume2 className="w-3 h-3 text-emerald-400" />
                                    <span>
                                      {msg.voiceNote.hasLangpretation
                                        ? `Langpretation (${(playingVoiceTrack[msg.id] || 'translated').toUpperCase()})`
                                        : 'Normal Voice Note'}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>

                            {voicePlaybackErrorId === msg.id && (
                              <p role="alert" className="text-[11px] text-[#9d352c]">Audio unavailable for this voice note.</p>
                            )}

                            {/* Keep transcript detail compact until opened. */}
                            {msg.voiceNote.hasLangpretation && msg.voiceNote.translatedTranscript ? (
                              <details className="bg-slate-950/90 rounded-xl px-2.5 py-1.5 text-xs border border-emerald-500/30 text-emerald-200">
                                <summary className="cursor-pointer font-semibold text-emerald-400">Translation &amp; transcript</summary>
                                <div className="pt-2 space-y-1">
                                <div className="flex items-center justify-between text-[9.5px] uppercase font-mono text-emerald-400 font-bold">
                                  <span>Translated to {myLangInfo.name}:</span>
                                </div>
                                <p className="text-[13px] leading-relaxed text-white">
                                  "{msg.voiceNote.translatedTranscript}"
                                </p>
                                {msg.voiceNote.transcript && (
                                  <details className="text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                                    <summary className="cursor-pointer hover:text-slate-200">
                                      View original transcription
                                    </summary>
                                    <p className="mt-1 text-slate-300 italic">"{msg.voiceNote.transcript}"</p>
                                  </details>
                                )}
                                </div>
                              </details>
                            ) : msg.voiceNote.transcript ? (
                              <details className="bg-slate-950/80 rounded-xl px-2.5 py-1.5 text-xs border border-slate-800 text-slate-300">
                                <summary className="cursor-pointer text-slate-500">View transcription</summary>
                                <p className="text-[12.5px] mt-1">"{msg.voiceNote.transcript}"</p>
                              </details>
                            ) : null}
                          </div>
                        ) : msg.mediaType === 'image' && msg.mediaUrl ? (
                          /* Photo Attachment Bubble */
                          <div className="rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950 max-w-xs shadow-md">
                            <div
                              onClick={() => setLightboxImage(msg.mediaUrl || null)}
                              className="relative cursor-pointer group/img"
                            >
                              <img
                                src={msg.mediaUrl}
                                alt={msg.mediaCaption || 'Attached photo'}
                                className="w-full h-auto max-h-60 object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Maximize2 className="w-5 h-5" />
                              </div>
                            </div>
                            {msg.mediaCaption && (
                              <p className="p-2.5 text-xs text-slate-200">{msg.mediaCaption}</p>
                            )}
                          </div>
                        ) : msg.mediaType === 'video' && msg.mediaUrl ? (
                          /* Video Attachment Bubble */
                          <div className="rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950 max-w-xs shadow-md">
                            <video
                              controls
                              className="w-full max-h-60 rounded-t-xl bg-black"
                              src={msg.mediaUrl}
                              preload="metadata"
                            />
                            {msg.mediaCaption && (
                              <p className="p-2.5 text-xs text-slate-200">{msg.mediaCaption}</p>
                            )}
                          </div>
                        ) : msg.mediaType === 'document' ? (
                          /* Document Attachment Bubble */
                          <div className="rounded-2xl p-3 border border-slate-700/80 bg-slate-900 flex items-center gap-3 max-w-xs shadow-md">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-white truncate">
                                {msg.mediaFileName || 'Document.pdf'}
                              </p>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {msg.mediaFileSize || '1.4 MB'}
                              </span>
                            </div>
                            <a
                              href={msg.mediaUrl || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        ) : (
                          /* Standard Text Message Bubble */
                          <div
                            className={`min-w-0 max-w-full rounded-2xl px-4 py-2.5 border shadow-md space-y-1 ${
                              isMe
                                ? 'chat-outgoing-bubble bg-slate-800 text-white border-amber-500 rounded-tr-none'
                                : 'chat-incoming-bubble bg-slate-900 text-slate-100 border-slate-700 rounded-tl-none'
                            }`}
                          >
                            {/* Display translated text in receiver's language — WhatsApp size */}
                            <p className="whatsapp-msg-text whitespace-pre-wrap text-[15.5px] sm:text-[16px] leading-[22px] tracking-normal font-normal">
                              {!isMe && msg.translatedText && !showOriginal
                                ? msg.translatedText
                                : msg.text}
                            </p>

                            {/* Translation indicator and toggle */}
                            <TranslationUnavailableNotice state={msg} isMe={isMe} viewerLanguage={myLanguage} />
                            {!isMe && msg.translatedText && (
                              <div className="pt-1 border-t border-slate-700/60 flex items-center justify-between text-[11.5px] text-emerald-300 font-mono">
                                <span className="flex items-center gap-1">
                                  <Sparkles className="w-3.5 h-3.5" />
                                  Translated to {myLangInfo.name}
                                </span>
                                <button
                                  onClick={() => toggleShowOriginal(msg.id)}
                                  className="text-slate-400 hover:text-white underline ml-2"
                                >
                                  {showOriginal ? 'View translation' : 'View original'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Quick Reaction Popup if active for this message */}
                        <div className="nv-message-menu-trigger absolute -top-2 right-0 z-20 md:hidden">
                          <button
                            type="button"
                            aria-label="More message actions"
                            aria-expanded={messageMenuMsgId === msg.id}
                            onClick={() => setMessageMenuMsgId((id) => id === msg.id ? null : msg.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 shadow-lg"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {messageMenuMsgId === msg.id && (
                            <div role="menu" aria-label="Message actions" className="absolute right-0 top-9 z-30 w-48 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl">
                              <button role="menuitem" onClick={() => { setQuickReactionMsgId(msg.id); setMessageMenuMsgId(null); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">React</button>
                              <button role="menuitem" onClick={() => { setReplyingToMessage(msg); setMessageMenuMsgId(null); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">Reply</button>
                              <button role="menuitem" onClick={() => { setForwardingMessage(msg); setMessageMenuMsgId(null); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">Forward</button>
                              <button role="menuitem" onClick={() => { handleCopyMessage(msg.text || msg.voiceNote?.transcript || '', msg.id); setMessageMenuMsgId(null); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">Copy text</button>
                              <button role="menuitem" onClick={() => { deleteMessage(activeConv.id, msg.id); setMessageMenuMsgId(null); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-slate-800">Delete message</button>
                            </div>
                          )}
                        </div>

                        {quickReactionMsgId === msg.id && (
                          <div
                            className={`absolute -top-10 ${
                              isMe ? 'right-0' : 'left-0'
                            } flex items-center gap-1 bg-slate-900 border border-slate-700/90 rounded-2xl px-2 py-1 shadow-2xl z-30`}
                          >
                            {QUICK_REACTIONS.map(({ value, label }) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => {
                                  reactToMessage(activeConv.id, msg.id, value);
                                  setQuickReactionMsgId(null);
                                }}
                                className="rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                              >
                                {label}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setQuickReactionMsgId(null)}
                              className="text-xs text-slate-400 hover:text-white px-1 font-bold"
                            >
                              Close
                            </button>
                          </div>
                        )}

                        {/* Hover Action Bar: React, Reply, Forward, Copy, Delete */}
                        <div
                          className={`absolute top-0 ${
                            isMe ? '-left-36' : '-right-36'
                          } hidden group-hover:flex items-center gap-0.5 bg-slate-900 border border-slate-700/80 rounded-xl px-1.5 py-1 shadow-xl z-20`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setQuickReactionMsgId(quickReactionMsgId === msg.id ? null : msg.id)
                            }
                            className="p-1 text-slate-400 hover:text-amber-400 rounded transition-colors"
                            title="Add reaction"
                          >
                            <SmilePlus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setReplyingToMessage(msg)}
                            className="p-1 text-slate-400 hover:text-emerald-400 rounded transition-colors"
                            title="Reply"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setForwardingMessage(msg)}
                            className="p-1 text-slate-400 hover:text-emerald-400 rounded transition-colors"
                            title="Forward"
                          >
                            <Forward className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg.text || msg.voiceNote?.transcript || '', msg.id)}
                            className="p-1 text-slate-400 hover:text-white rounded transition-colors"
                            title="Copy text"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMessage(activeConv.id, msg.id)}
                            className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors"
                            title="Delete message"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Render Message Reactions */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1 px-1">
                            {msg.reactions.map((rx, rIdx) => {
                              const hasReacted = rx.users.includes(currentUser.id);
                              return (
                                <button
                                  key={rIdx}
                                  type="button"
                                  onClick={() => reactToMessage(activeConv.id, msg.id, rx.emoji)}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono border transition-all ${
                                    hasReacted
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                                      : 'bg-slate-900/80 text-slate-300 border-slate-700/80 hover:border-slate-500'
                                  }`}
                                  title={`${rx.users.length} reaction${rx.users.length > 1 ? 's' : ''}`}
                                >
                                  <span>{REACTION_LABELS[rx.emoji] || 'Reaction'}</span>
                                  <span className="text-[10px] font-bold">{rx.count}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Time & Read Receipts */}
                        <div className="flex items-center gap-1.5 mt-1 px-1 text-[11.5px] text-slate-400 font-mono">
                          <span>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isMe && (
                            <span>
                              {msg.status === 'failed' ? (
                                <span className="text-red-400 font-sans" title="Private channel membership or the chat connection could not be verified.">Not sent</span>
                              ) : msg.status === 'sending' ? (
                                <span className="font-sans">Sending…</span>
                              ) : msg.status === 'read' ? (
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" title="Read" />
                              ) : msg.status === 'delivered' ? (
                                <CheckCheck className="w-3.5 h-3.5 text-slate-400" title="Delivered" />
                              ) : (
                                <Check className="w-3.5 h-3.5 text-slate-400" title="Sent" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    </React.Fragment>
                  );
                })}

                <div ref={messagesEndRef} />
              </div>

              {/* Replying-To preview bar */}
              {replyingToMessage && (
                <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Reply className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <div className="truncate">
                      <span className="font-bold text-emerald-400">Replying to {replyingToMessage.senderName}: </span>
                      <span className="text-slate-300">{replyingToMessage.text}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Cancel reply"
                    onClick={() => setReplyingToMessage(null)}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Bottom Message Input or Voice Note Recorder */}
              <div className="chat-composer relative p-3 sm:p-4 border-t border-slate-800 bg-slate-900/60">
                {isRecordingVoice ? (
                  <VoiceNoteRecorder
                    onCancel={() => setIsRecordingVoice(false)}
                    onSend={handleVoiceSend}
                  />
                ) : (
                  <>
                  <form onSubmit={handleSend} className="flex w-full items-end gap-1 p-0.5 sm:gap-2">
                    {/* WhatsApp-Style Unified Rounded Input Bubble */}
                    <div className="relative flex min-w-0 w-full flex-1 items-end bg-slate-950/90 border border-slate-700/80 focus-within:border-emerald-500 rounded-[1.45rem] px-2 py-1 transition-colors">
                      {/* Roomy WhatsApp-Sized Input / Auto-growing Textarea */}
                      <textarea
                        ref={messageInputRef}
                        aria-label="Write a message"
                        rows={1}
                        disabled={isSendingMessage}
                        placeholder="Message"
                        value={inputMsg}
                        onChange={(e) => {
                          setInputMsg(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`;
                        }}
                        onKeyDown={(e) => {
                          const isMobile = window.matchMedia('(max-width: 767px)').matches;
                          if (e.key === 'Enter' && !e.shiftKey && !isMobile && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        className="flex-1 min-w-0 w-full bg-transparent border-0 text-base text-white placeholder-slate-400 focus:outline-none px-1.5 py-2 resize-none max-h-32 min-h-[44px] leading-[1.45] whitespace-pre-wrap break-words sm:px-2.5"
                      />

                      {/* One attachment menu keeps media and voice actions together. */}
                      <button
                        type="button"
                        aria-label="Open emoji picker"
                        aria-expanded={isEmojiPickerOpen}
                        onClick={() => setIsEmojiPickerOpen((open) => !open)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 hover:text-amber-400"
                      >
                        <SmilePlus className="h-5 w-5" />
                      </button>
                      <div className="relative shrink-0" ref={attachmentMenuRef}>
                        <button
                          type="button"
                          id="btn-chat-attach-media"
                          aria-haspopup="menu"
                          aria-expanded={isAttachmentMenuOpen}
                          onClick={() => setIsAttachmentMenuOpen((open) => !open)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl p-0 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-amber-400 transition-colors sm:w-auto sm:px-2.5"
                          title="Attach media or record a voice note"
                        >
                          <Paperclip className="w-4 h-4" />
                          <span className="hidden sm:inline">Attach</span>
                        </button>
                        {isAttachmentMenuOpen && (
                          <div role="menu" aria-label="Attachment options" className="absolute right-0 bottom-full mb-2 w-52 max-w-[calc(100vw-1rem)] max-h-[40dvh] overflow-y-auto rounded-xl border border-slate-700 bg-[#fbf9f2] p-1.5 shadow-[0_12px_32px_rgba(24,35,31,.2)] z-30">
                            <button type="button" role="menuitem" onClick={() => { setIsAttachmentMenuOpen(false); setIsMediaModalOpen(true); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#26342d] hover:bg-[#f0ece2]">
                              <Paperclip className="h-4 w-4 text-[#17654b]" /> Photo, video or document
                            </button>
                            <button type="button" role="menuitem" onClick={() => { setIsAttachmentMenuOpen(false); setIsLiveCameraOpen(true); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#26342d] hover:bg-[#f0ece2]">
                              <Camera className="h-4 w-4 text-[#17654b]" /> Take photo or video
                            </button>
                            <button type="button" role="menuitem" onClick={() => { setIsAttachmentMenuOpen(false); setIsRecordingVoice(true); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#26342d] hover:bg-[#f0ece2]">
                              <Mic className="h-4 w-4 text-[#17654b]" /> Record voice note
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type={inputMsg.trim() ? 'submit' : 'button'}
                      id="btn-chat-send-msg"
                      aria-label={inputMsg.trim() ? 'Send message' : 'Record voice note'}
                      title={inputMsg.trim() ? 'Send message' : 'Record voice note'}
                      onClick={!inputMsg.trim() ? () => setIsRecordingVoice(true) : undefined}
                      disabled={isSendingMessage}
                      className="chat-send-button h-11 w-11 min-w-[44px] rounded-full font-bold text-sm transition-colors shrink-0 inline-flex items-center justify-center disabled:opacity-75 sm:w-12 sm:h-12"
                    >
                      {isSendingMessage ? <span className="animate-pulse text-xs">…</span> : inputMsg.trim() ? <Send className="w-4 h-4" /> : <Mic className="w-5 h-5" />}
                    </button>
                  </form>
                  <EmojiPickerPopover
                    isOpen={isEmojiPickerOpen}
                    onClose={() => setIsEmojiPickerOpen(false)}
                    onSelectEmoji={(emoji) => {
                      const input = messageInputRef.current;
                      if (!input) return;
                      const start = input.selectionStart ?? input.value.length;
                      const end = input.selectionEnd ?? start;
                      const next = input.value.slice(0, start) + emoji + input.value.slice(end);
                      setInputMsg(next);
                      requestAnimationFrame(() => {
                        input.focus();
                        const cursor = start + emoji.length;
                        input.setSelectionRange(cursor, cursor);
                      });
                    }}
                  />
                  {sendMessageError && <p role="alert" className="mt-1 px-2 text-xs font-medium text-[#9d352c]">{sendMessageError}</p>}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-[#0c1424] border border-slate-800 rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 shadow-xl">
                <MessageSquare className="w-8 h-8" />
              </div>
              <div className="max-w-sm space-y-1">
                <h3 className="text-base font-bold text-white">Live Langpretation Chat</h3>
                <p className="text-xs text-slate-400">
                  Select a contact or enter any Nanivio User ID (e.g. 0486XXXXXX) to start instant bilingual messaging with voice note translation.
                </p>
              </div>
              <button
                onClick={() => setIsQuickNvBarOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all inline-flex items-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <UserPlus className="w-4 h-4" />
                <span>Start Direct Chat by NV ID</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Media Attachment Modal */}
      <MediaAttachmentModal
        isOpen={isMediaModalOpen}
        onClose={() => setIsMediaModalOpen(false)}
        onSendMedia={handleSendMedia}
        onOpenLiveCamera={() => setIsLiveCameraOpen(true)}
        userTier={currentPlan?.tier === 'free' ? 'free' : 'pro'}
      />

      {/* Live Instant Video / Image Taking Camera Modal with Free Tier Limits */}
      <LiveCameraModal
        isOpen={isLiveCameraOpen}
        onClose={() => setIsLiveCameraOpen(false)}
        onSendMedia={handleSendMedia}
        userTier={currentPlan?.tier === 'free' ? 'free' : 'pro'}
      />

      {/* Forward Message Modal */}
      <ForwardMessageModal
        isOpen={!!forwardingMessage}
        message={forwardingMessage}
        onClose={() => setForwardingMessage(null)}
      />

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        contacts={contacts || []}
        onCreateGroup={async (title, desc, pIds, avatar) => {
          await createGroup(title, desc, pIds, avatar);
        }}
      />

      {/* Group Details & Member Management Modal */}
      {isGroupDetailsOpen && activeConv && (
        <GroupDetailsModal
          isOpen={isGroupDetailsOpen}
          onClose={() => setIsGroupDetailsOpen(false)}
          conversation={activeConv}
          currentUserId={currentUser.id}
          allContacts={contacts}
          onUpdateGroup={(updates) => updateGroup(activeConv.id, updates)}
          onAddMembers={(pIds) => addMembersToGroup(activeConv.id, pIds)}
          onRemoveMember={(pId) => removeMemberFromGroup(activeConv.id, pId)}
          onPromoteAdmin={(pId) => promoteGroupAdmin(activeConv.id, pId)}
          onDismissAdmin={(pId) => dismissGroupAdmin(activeConv.id, pId)}
          onMuteGroup={() => muteConversation(activeConv.id)}
          onReportGroup={() => setSafetyTarget({ id: activeConv.id, name: activeConv.title, isGroup: true })}
          onExitGroup={() => removeMemberFromGroup(activeConv.id, currentUser.id)}
        />
      )}

      {/* Report & Restrict Safety Modal */}
      <ReportSafetyModal
        isOpen={!!safetyTarget}
        target={safetyTarget}
        onClose={() => setSafetyTarget(null)}
      />

      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={isEditProfileModalOpen}
        onClose={() => setIsEditProfileModalOpen(false)}
      />

      {/* Settings Modal (Privacy, Notifications, Theme, Account) */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      {/* Full-size Photo Lightbox Modal */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
            <img
              src={lightboxImage}
              alt="Preview"
              className="w-full h-full object-contain max-h-[85vh]"
              referrerPolicy="no-referrer"
            />
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-900/80 text-white flex items-center justify-center hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Prominent "Wrong number or never exists" Alert Prompt Modal */}
      {nvErrorModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-rose-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Wrong Number or Never Exists</h3>
                <p className="text-xs text-rose-300">Nanivio Directory Lookup Notice</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-950/30 border border-rose-500/20 rounded-2xl text-xs text-slate-300 leading-relaxed space-y-2">
              <p>{nvErrorModal}</p>
              <p className="text-[11px] text-slate-400 font-mono">
                • Please check that the Nanivio Number (e.g. 0486482190) is typed correctly.
                <br />
                • The user must have a registered Nanivio account.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setNvErrorModal(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
              >
                Dismiss &amp; Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
