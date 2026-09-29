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
  Hash,
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
  Smile,
  SmilePlus,
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
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { LiveCameraModal } from './LiveCameraModal';
import { EditProfileModal } from '../account/EditProfileModal';
import { SettingsModal } from '../settings/SettingsModal';

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
    setActiveTab: setNavTab,
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
  const [searchTerm, setSearchTerm] = useState('');
  const [showMobileChatThread, setShowMobileChatThread] = useState(false);

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
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [quickReactionMsgId, setQuickReactionMsgId] = useState<string | null>(null);

  // Nanivio Number Direct Chat Entry State
  const [directNvInput, setDirectNvInput] = useState('');
  const [isLookingUpNv, setIsLookingUpNv] = useState(false);
  const [nvErrorModal, setNvErrorModal] = useState<string | null>(null);
  const [isQuickNvBarOpen, setIsQuickNvBarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeConv = (conversations || []).find((c) => c?.id === activeConversationId) || (conversations || [])[0];
  const rawActiveMessages = (activeConv && messages ? messages[activeConv.id] : []) || [];

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

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMsg.trim()) return;
    const text = inputMsg;
    setInputMsg('');
    await sendMessage(text);
  };

  const handleVoiceSend = async (duration: number, transcript: string) => {
    setIsRecordingVoice(false);
    await sendVoiceNote(duration, transcript);
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
    <div className="max-w-7xl mx-auto flex flex-col gap-3 p-2 sm:p-4">
      {/* Top Protocol & View Switcher + New Direct Chat Trigger */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-[#0c1424] border border-slate-800 rounded-2xl p-3 shadow-sm gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="tab-btn-direct-chat"
            onClick={() => setActiveTab('conversations')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'conversations'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Direct &amp; Group Chats</span>
          </button>

          <button
            id="tab-btn-stream-chat"
            onClick={() => setActiveTab('stream_channels')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'stream_channels'
                ? 'bg-purple-600 text-white shadow'
                : 'text-slate-300 hover:text-purple-300 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4 text-purple-400" />
            <span>Community Channels</span>
          </button>
        </div>

        {/* Quick Direct Chat by Nanivio Number Trigger & Contacts shortcut */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            id="btn-open-contacts-tab"
            onClick={() => setNavTab('contacts')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm text-slate-200 hover:text-emerald-400 font-medium transition-colors cursor-pointer"
          >
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Contacts ({contacts.length})</span>
          </button>

          <button
            id="btn-toggle-nv-chat-bar"
            onClick={() => setIsQuickNvBarOpen((prev) => !prev)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-sm font-bold text-emerald-300 transition-all hover:scale-105 cursor-pointer"
          >
            <Hash className="w-4 h-4 text-emerald-400" />
            <span>Chat by NV Number</span>
          </button>
        </div>
      </div>

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
              ✕ Close
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
        <StreamChatInterface />
      ) : (
        <div className="h-[calc(100vh-8.5rem)] flex flex-col md:flex-row gap-4">
          {/* Left Sidebar: Conversations List */}
          <div className={`w-full md:w-80 lg:w-96 bg-[#0c1424] border border-slate-800 rounded-2xl flex flex-col overflow-hidden shrink-0 ${showMobileChatThread ? 'hidden md:flex' : 'flex'}`}>
            {/* Header, Actions & Search */}
            <div className="p-3.5 border-b border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <h1 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Chats &amp; Groups</span>
                </h1>
                <div className="flex items-center gap-1.5">
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
                        isActive ? 'bg-emerald-500/10 border-l-4 border-emerald-400' : 'hover:bg-slate-900/60'
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
                            {pLang.flag}
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
                      <div className="absolute right-2 bottom-2 hidden group-hover:flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 rounded-lg p-1 shadow-lg backdrop-blur-xs">
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
            <div className={`flex-1 bg-[#0c1424] border border-slate-800 rounded-2xl flex flex-col overflow-hidden ${showMobileChatThread ? 'flex' : 'hidden md:flex'}`}>
              {/* Active Conversation Header */}
              <div className="p-3 sm:p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  {/* Mobile back to conversations list */}
                  <button
                    onClick={() => setShowMobileChatThread(false)}
                    className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold shrink-0 border border-slate-700 cursor-pointer"
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
                      {userSettings?.privacy?.onlineStatus !== false && (
                        <span className="text-emerald-400 flex items-center gap-1 shrink-0 text-[13px] font-medium">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          Online
                        </span>
                      )}
                      <span>•</span>
                      <span className="text-[12.5px] text-slate-300 truncate">
                        Language: <strong className="text-white">{myLangInfo.name}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Direct Call Actions & Tools */}
                <div className="flex items-center gap-1.5 sm:gap-2 relative">
                  {/* Search in chat toggle button */}
                  <button
                    onClick={() => setIsSearchInChatOpen((prev) => !prev)}
                    className={`p-2 rounded-xl border transition-all ${
                      isSearchInChatOpen
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                    }`}
                    title="Search messages in this conversation"
                  >
                    <Search className="w-4 h-4" />
                  </button>

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

                  {/* Settings gear */}
                  <button
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-colors"
                    title="Privacy & Notification Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>

                  {/* Header Menu Dropdown Trigger */}
                  <div className="relative">
                    <button
                      onClick={() => setIsHeaderMenuOpen((prev) => !prev)}
                      className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-colors"
                      title="More chat options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {isHeaderMenuOpen && (
                      <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-1.5 z-40 space-y-1 text-xs animate-in fade-in zoom-in-95">
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
                    Bilingual Langpretation active: messages translated into <strong>{myLangInfo.name}</strong>.
                  </span>
                </div>

                {copiedMsgId && (
                  <div className="fixed top-20 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl bg-slate-900 border border-emerald-500 text-emerald-400 text-xs font-mono shadow-xl z-50 animate-in fade-in">
                    ✓ Message copied to clipboard
                  </div>
                )}

                {activeMessages.map((msg) => {
                  const isMe = msg.senderId === currentUser.id;
                  const showOriginal = showOriginalMap[msg.id];
                  const senderLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === msg.senderLang);

                  return (
                    <div
                      key={msg.id}
                      className={`group relative flex items-start gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      {!isMe && (
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-700 shrink-0">
                          <img
                            src={msg.senderAvatar}
                            alt={msg.senderName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}

                      <div className={`max-w-md ${isMe ? 'items-end' : 'items-start'} flex flex-col relative`}>
                        {!isMe && (
                          <div className="flex items-center gap-1.5 mb-1 px-1">
                            <span className="text-[13.5px] font-bold text-emerald-400">{msg.senderName}</span>
                            {senderLangObj && (
                              <span className="text-[12px] text-emerald-300/80 font-mono">({senderLangObj.name})</span>
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
                            className={`rounded-2xl p-3.5 border shadow-md space-y-2.5 ${
                              isMe
                                ? 'bg-emerald-950/80 border-emerald-500/50 text-white'
                                : 'bg-slate-900 border-slate-700 text-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() =>
                                  setPlayingVoiceId(playingVoiceId === msg.id ? null : msg.id)
                                }
                                className="w-9 h-9 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center hover:scale-105 transition-transform shrink-0"
                              >
                                {playingVoiceId === msg.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                              </button>

                              <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-1 h-6">
                                  {msg.voiceNote.waveform.map((h, i) => (
                                    <div
                                      key={i}
                                      style={{ height: `${h}%` }}
                                      className={`w-1 rounded-full transition-all ${
                                        playingVoiceId === msg.id ? 'bg-emerald-400' : 'bg-slate-500'
                                      }`}
                                    />
                                  ))}
                                </div>
                                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                                  <span>0:0{msg.voiceNote.duration}</span>
                                  <span>Langpretation Voice</span>
                                </div>
                              </div>
                            </div>

                            {/* Receiver-language transcript */}
                            <div className="bg-slate-950/80 rounded-xl p-2 text-xs border border-emerald-500/30 text-emerald-200">
                              <div className="text-[9px] uppercase font-mono text-emerald-400 font-bold mb-0.5">
                                Transcript in {myLangInfo.name}:
                              </div>
                              <p>"{msg.voiceNote.translatedTranscript || msg.voiceNote.transcript}"</p>
                            </div>
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
                            className={`rounded-2xl px-4 py-2.5 border shadow-md space-y-1 ${
                              isMe
                                ? 'bg-emerald-600 text-white border-emerald-500 rounded-tr-none'
                                : 'bg-slate-900 text-slate-100 border-slate-700 rounded-tl-none'
                            }`}
                          >
                            {/* Display translated text in receiver's language — WhatsApp size */}
                            <p className="text-[15.5px] sm:text-[16px] leading-[22px] tracking-normal font-normal">
                              {!isMe && msg.translatedText && !showOriginal
                                ? msg.translatedText
                                : msg.text}
                            </p>

                            {/* Translation indicator and toggle */}
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
                        {quickReactionMsgId === msg.id && (
                          <div
                            className={`absolute -top-10 ${
                              isMe ? 'right-0' : 'left-0'
                            } flex items-center gap-1 bg-slate-900/95 border border-slate-700/90 rounded-2xl px-2 py-1 shadow-2xl z-30 animate-in fade-in zoom-in-95 backdrop-blur-md`}
                          >
                            {['👍', '❤️', '😂', '🔥', '🚀', '🇬🇭'].map((em) => (
                              <button
                                key={em}
                                type="button"
                                onClick={() => {
                                  reactToMessage(activeConv.id, msg.id, em);
                                  setQuickReactionMsgId(null);
                                }}
                                className="text-base hover:scale-135 transition-transform p-1 cursor-pointer"
                              >
                                {em}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setQuickReactionMsgId(null)}
                              className="text-xs text-slate-400 hover:text-white px-1 font-bold"
                            >
                              ✕
                            </button>
                          </div>
                        )}

                        {/* Hover Action Bar: React, Reply, Forward, Copy, Delete */}
                        <div
                          className={`absolute top-0 ${
                            isMe ? '-left-36' : '-right-36'
                          } hidden group-hover:flex items-center gap-0.5 bg-slate-900/95 border border-slate-700/80 rounded-xl px-1.5 py-1 shadow-xl backdrop-blur-xs z-20`}
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
                                  <span>{rx.emoji}</span>
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
                              {msg.status === 'read' ? (
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
                    onClick={() => setReplyingToMessage(null)}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Bottom Message Input or Voice Note Recorder */}
              <div className="relative p-3 sm:p-4 border-t border-slate-800 bg-slate-900/60">
                {/* Modern Chat Emoji Popover */}
                <EmojiPickerPopover
                  isOpen={isEmojiPickerOpen}
                  onClose={() => setIsEmojiPickerOpen(false)}
                  onSelectEmoji={(em) => {
                    setInputMsg((prev) => prev + em);
                  }}
                />

                {isRecordingVoice ? (
                  <VoiceNoteRecorder
                    onCancel={() => setIsRecordingVoice(false)}
                    onSend={handleVoiceSend}
                  />
                ) : (
                  <form onSubmit={handleSend} className="flex items-end gap-2 p-1">
                    {/* WhatsApp-Style Unified Rounded Input Bubble */}
                    <div className="relative flex-1 flex items-center bg-slate-950/90 border border-slate-700/80 focus-within:border-emerald-500 rounded-3xl px-3 py-1.5 transition-all shadow-inner">
                      {/* Left: Emoji Trigger Button */}
                      <button
                        type="button"
                        id="btn-chat-toggle-emoji"
                        onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
                        className={`p-2 rounded-full transition-all shrink-0 cursor-pointer ${
                          isEmojiPickerOpen
                            ? 'text-amber-400 bg-amber-500/15'
                            : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800/80'
                        }`}
                        title="Emoji & Reactions"
                      >
                        <Smile className="w-5 h-5 sm:w-6 sm:h-6" />
                      </button>

                      {/* Roomy WhatsApp-Sized Input / Auto-growing Textarea */}
                      <textarea
                        rows={1}
                        placeholder={`Type a message (speaks in ${myLangInfo.name})...`}
                        value={inputMsg}
                        onChange={(e) => {
                          setInputMsg(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        className="flex-1 bg-transparent border-0 text-[15px] sm:text-base text-white placeholder-slate-400 focus:outline-none px-2.5 py-2 resize-none max-h-32 min-h-[38px] leading-relaxed"
                      />

                      {/* Right: Media Attachment Trigger */}
                      <button
                        type="button"
                        id="btn-chat-attach-media"
                        onClick={() => setIsMediaModalOpen(true)}
                        className="p-2 rounded-full text-slate-400 hover:text-emerald-400 hover:bg-slate-800/80 transition-colors shrink-0 cursor-pointer"
                        title="Attach photo, video or document (15MB limit)"
                      >
                        <Paperclip className="w-5 h-5 -rotate-45" />
                      </button>

                      {/* Right: Instant Live Camera Trigger */}
                      <button
                        type="button"
                        id="btn-chat-live-camera"
                        onClick={() => setIsLiveCameraOpen(true)}
                        className="p-2 rounded-full text-slate-400 hover:text-emerald-400 hover:bg-slate-800/80 transition-colors shrink-0 cursor-pointer"
                        title="Take Instant Live Photo or Video"
                      >
                        <Camera className="w-5 h-5" />
                      </button>
                    </div>

                    {/* WhatsApp-Style Circular Action Button (Send or Mic) */}
                    {inputMsg.trim() ? (
                      <button
                        type="submit"
                        id="btn-chat-send-msg"
                        className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all shrink-0 hover:scale-105 flex items-center justify-center shadow-lg shadow-emerald-500/30 cursor-pointer"
                        title="Send Message"
                      >
                        <Send className="w-5 h-5 ml-0.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        id="btn-chat-record-voice"
                        onClick={() => setIsRecordingVoice(true)}
                        className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shrink-0 hover:scale-105 flex items-center justify-center shadow-lg shadow-emerald-500/30 cursor-pointer"
                        title="Record Voice Note with Langpretation"
                      >
                        <Mic className="w-5 h-5" />
                      </button>
                    )}
                  </form>
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
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
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
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
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
