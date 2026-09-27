import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Sparkles,
  Paperclip,
  Smile,
  Phone,
  Video,
  Hash,
  Users,
  Server,
  Activity,
  CheckCheck,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Key,
  ShieldCheck,
  Radio,
  Plus,
  X,
  MessageSquare,
  Globe,
  Heart,
  ThumbsUp,
  Flame,
  Lightbulb,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import {
  streamClient,
  StreamChannelData,
  StreamChatMessage,
  StreamEventLog,
} from '../../lib/streamClient';
import { realtimeClient } from '../../lib/realtimeClient';
import { SUPPORTED_LANGUAGES } from '../../types';

interface StreamChatInterfaceProps {
  onClose?: () => void;
}

const QUICK_REACTIONS = [
  { type: 'thumbs_up', icon: '👍', label: 'Agree' },
  { type: 'heart', icon: '❤️', label: 'Love' },
  { type: 'fire', icon: '🔥', label: 'Fire' },
  { type: 'lightbulb', icon: '💡', label: 'Insight' },
  { type: 'globe', icon: '🌍', label: 'Global' },
];

export const StreamChatInterface: React.FC<StreamChatInterfaceProps> = () => {
  const {
    currentUser,
    myLanguage,
    start1on1Call,
    startGroupCall,
    streamState,
  } = useNanivio();

  const [channels, setChannels] = useState<StreamChannelData[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('conv_alex');
  const [messages, setMessages] = useState<StreamChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [logs, setLogs] = useState<StreamEventLog[]>([]);
  const [isTypingRemote, setIsTypingRemote] = useState(false);
  const [showOriginalMap, setShowOriginalMap] = useState<Record<string, boolean>>({});
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [attachmentSimulation, setAttachmentSimulation] = useState<{
    name: string;
    type: 'file' | 'image';
    url: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load channels on mount
  useEffect(() => {
    loadChannels();
  }, []);

  // Real-time WebSocket event subscription for live messaging across users & tabs
  useEffect(() => {
    const unsubMsg = realtimeClient.on('chat:message', (payload) => {
      const { channelId, conversationId, message } = payload || {};
      const targetChan = channelId || conversationId;

      if (targetChan && (targetChan === selectedChannelId || targetChan === `messaging:${selectedChannelId}`)) {
        if (message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === message.id)) {
              return prev.map((m) => (m.id === message.id ? message : m));
            }
            return [...prev, message];
          });
        }
      }
      loadChannels(); // Refresh channel previews
    });

    const unsubReaction = realtimeClient.on('chat:reaction_updated', (payload) => {
      const { channelId, message } = payload || {};
      if (channelId === selectedChannelId && message) {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
      }
    });

    const unsubTyping = realtimeClient.on('chat:typing', (payload) => {
      const { channelId, isTyping, user } = payload || {};
      if (channelId === selectedChannelId && user?.userId !== currentUser.id) {
        setIsTypingRemote(!!isTyping);
      }
    });

    return () => {
      unsubMsg();
      unsubReaction();
      unsubTyping();
    };
  }, [selectedChannelId, currentUser.id]);

  // Load messages when channel changes
  useEffect(() => {
    if (selectedChannelId) {
      loadMessages(selectedChannelId);
      streamClient.setActiveChannel(selectedChannelId);
    }
  }, [selectedChannelId]);

  // Periodic polling fallback for logs & channels
  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedChannelId) {
        streamClient.fetchMessages(selectedChannelId).then(setMessages);
      }
      if (showInspector) {
        streamClient.fetchLogs().then(setLogs);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedChannelId, showInspector]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const loadChannels = async () => {
    setIsLoading(true);
    const list = await streamClient.fetchChannels();
    setChannels(list);
    if (list.length > 0 && !selectedChannelId) {
      setSelectedChannelId(list[0].id);
    }
    setIsLoading(false);
  };

  const loadMessages = async (channelId: string) => {
    const msgs = await streamClient.fetchMessages(channelId);
    setMessages(msgs);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !attachmentSimulation) return;

    const textToSend = inputText.trim();
    setInputText('');
    setIsSending(true);

    const attachments = attachmentSimulation
      ? [
          {
            type: attachmentSimulation.type as 'image' | 'file',
            url: attachmentSimulation.url,
            name: attachmentSimulation.name,
            size: '240 KB',
          },
        ]
      : undefined;

    setAttachmentSimulation(null);

    // Determine target language (from receiver)
    const activeCh = channels.find((c) => c.id === selectedChannelId);
    const otherMember = activeCh?.members.find((m) => m.userId !== currentUser.id);
    const targetLang = otherMember?.language || 'fr';

    // Optimistic message
    const tempMsg: StreamChatMessage = {
      id: `temp_${Date.now()}`,
      channelId: selectedChannelId,
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatar: currentUser.avatar,
      text: textToSend,
      sourceLang: myLanguage,
      targetLang,
      createdAt: Date.now(),
      reactions: [],
      attachments,
    };
    setMessages((prev) => [...prev, tempMsg]);

    const created = await streamClient.sendMessage(
      selectedChannelId,
      textToSend,
      myLanguage,
      targetLang,
      currentUser.avatar,
      attachments
    );

    if (created) {
      setMessages((prev) => prev.map((m) => (m.id === tempMsg.id ? created : m)));
      loadChannels(); // Refresh channel last message preview
    }
    setIsSending(false);
  };

  const handleToggleReaction = async (msgId: string, reactionType: string) => {
    const updated = await streamClient.toggleReaction(selectedChannelId, msgId, reactionType);
    if (updated) {
      setMessages((prev) => prev.map((m) => (m.id === msgId ? updated : m)));
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    const newId = `chan_${Date.now()}`;
    const newChan = await streamClient.createChannel(newId, newChannelName.trim(), [
      { userId: currentUser.id, name: currentUser.name, role: 'admin', language: myLanguage, online: true },
    ]);

    if (newChan) {
      setChannels((prev) => [newChan, ...prev]);
      setSelectedChannelId(newChan.id);
      setIsCreatingChannel(false);
      setNewChannelName('');
    }
  };

  const currentChannel = channels.find((c) => c.id === selectedChannelId) || channels[0];
  const myLangInfo = SUPPORTED_LANGUAGES.find((l) => l.code === myLanguage) || SUPPORTED_LANGUAGES[0];

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-[#080e1a] rounded-2xl border border-slate-800 overflow-hidden shadow-2xl h-[calc(100vh-6rem)]">
      {/* ------------------------------------------------------------- */}
      {/* LEFT: Stream Channels Navigation */}
      {/* ------------------------------------------------------------- */}
      <div className="w-full md:w-80 bg-[#0c1424] border-r border-slate-800 flex flex-col shrink-0">
        {/* Stream Brand & Status Header */}
        <div className="p-4 border-b border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-black text-xs shadow-md">
                S
              </div>
              <div>
                <h3 className="text-sm font-bold text-white leading-none">Stream Chat</h3>
                <span className="text-[10px] text-slate-400 font-mono">GetStream Protocol API</span>
              </div>
            </div>

            <button
              onClick={() => {
                setShowInspector(!showInspector);
                if (!showInspector) streamClient.fetchLogs().then(setLogs);
              }}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-all text-xs flex items-center gap-1"
              title="Toggle GetStream API Developer Inspector"
            >
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[10px] font-mono hidden sm:inline">SDK Stats</span>
            </button>
          </div>

          {/* Connection Status Pill */}
          <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300 font-mono text-[11px]">Stream Client:</span>
              <span className="text-emerald-400 font-bold font-mono text-[11px]">{streamState.status}</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">HS256 JWT</span>
          </div>
        </div>

        {/* Channels List Header & Add button */}
        <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-800/60 bg-slate-900/30">
          <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400 font-mono">
            Active Channels ({channels.length})
          </span>
          <button
            onClick={() => setIsCreatingChannel(!isCreatingChannel)}
            className="p-1 rounded-md bg-slate-800 hover:bg-purple-600/30 text-slate-300 hover:text-purple-300 border border-slate-700 transition-colors"
            title="Create new Stream channel"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Modal / Inline Add Channel */}
        {isCreatingChannel && (
          <form onSubmit={handleCreateChannel} className="p-3 bg-slate-950 border-b border-slate-800 space-y-2">
            <div className="text-[11px] font-bold text-white flex items-center justify-between">
              <span>New Stream Channel</span>
              <button type="button" onClick={() => setIsCreatingChannel(false)} className="text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Channel name (e.g. Cocoa Exports)..."
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              autoFocus
            />
            <button
              type="submit"
              className="w-full py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow"
            >
              Create Channel
            </button>
          </form>
        )}

        {/* Channels Scroll List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
          {channels.map((chan) => {
            const isSelected = chan.id === selectedChannelId;
            return (
              <button
                key={chan.id}
                onClick={() => setSelectedChannelId(chan.id)}
                className={`w-full p-3 flex items-start gap-3 text-left transition-all ${
                  isSelected
                    ? 'bg-purple-950/30 border-l-4 border-purple-500'
                    : 'hover:bg-slate-900/60'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-purple-400 shrink-0">
                  <Hash className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white truncate">{chan.name}</h4>
                    {chan.lastMessageAt && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(chan.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {chan.lastMessage || 'No messages yet'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-purple-400">
                      {chan.members.length} members
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Live Stream
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* CENTER: Stream Messages Stream & Input */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0a1120]">
        {/* Channel Header Bar */}
        <div className="p-3.5 border-b border-slate-800 bg-[#0c1424]/90 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">{currentChannel?.name || 'Channel'}</h3>
                <span className="px-2 py-0.2 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-mono">
                  GetStream Channel
                </span>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <span>Translates to: <strong className="text-emerald-300">{myLangInfo.name}</strong></span>
                <span>•</span>
                <span>{currentChannel?.members.length || 2} members in sync</span>
              </p>
            </div>
          </div>

          {/* Action buttons: Agora Call triggers & SDK toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const other = currentChannel?.members.find((m) => m.userId !== currentUser.id);
                if (other) {
                  start1on1Call(
                    {
                      id: other.userId,
                      name: other.name,
                      avatar: other.avatar || '',
                      myLanguage: (other.language as any) || 'fr',
                      role: 'user',
                    },
                    'audio'
                  );
                }
              }}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 hover:border-emerald-500/50 transition-all shadow-sm"
              title="Launch HD Audio Call"
            >
              <Phone className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                const other = currentChannel?.members.find((m) => m.userId !== currentUser.id);
                if (other) {
                  start1on1Call(
                    {
                      id: other.userId,
                      name: other.name,
                      avatar: other.avatar || '',
                      myLanguage: (other.language as any) || 'fr',
                      role: 'user',
                    },
                    'video'
                  );
                }
              }}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 hover:border-emerald-500/50 transition-all shadow-sm"
              title="Launch HD Video Call"
            >
              <Video className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Messages Scroll Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Stream System Welcome Pill */}
          <div className="mx-auto max-w-md bg-purple-950/40 border border-purple-500/30 rounded-xl p-2.5 text-center text-xs text-purple-200 flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
            <span>
              Connected to GetStream Channel. Real-time Langpretation translates cross-language dialogues seamlessly.
            </span>
          </div>

          {messages.map((msg) => {
            const isMe = msg.userId === currentUser.id;
            const showOriginal = showOriginalMap[msg.id];
            const senderLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === msg.sourceLang);
            const avatarSrc = msg.userAvatar || (isMe ? currentUser.avatar : '');

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 group ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* User Avatar */}
                <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-700 bg-slate-800 shrink-0 flex items-center justify-center text-xs font-bold text-emerald-400 font-mono">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt={msg.userName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{msg.userName?.slice(0, 2).toUpperCase() || 'NV'}</span>
                  )}
                </div>

                <div className={`max-w-md flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {/* Sender Name & Flag */}
                  <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px]">
                    <span className="font-bold text-slate-300">{msg.userName}</span>
                    {senderLangObj && (
                      <span className="text-[10px] text-purple-400 font-mono">
                        ({senderLangObj.name})
                      </span>
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`rounded-2xl px-4 py-3 border shadow-md space-y-2 ${
                      isMe
                        ? 'bg-purple-600 text-white border-purple-500 rounded-tr-none'
                        : 'bg-slate-900 text-slate-100 border-slate-700 rounded-tl-none'
                    }`}
                  >
                    {/* Attachments if any */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="space-y-1.5 pb-1">
                        {msg.attachments.map((att, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 p-2 bg-slate-950/60 rounded-xl border border-white/10 text-xs"
                          >
                            <FileText className="w-4 h-4 text-purple-300 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="block truncate font-bold">{att.name || 'Document'}</span>
                              <span className="text-[10px] text-slate-400">{att.size || 'Attachment'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Text content with Langpretation Translation */}
                    <p className="text-xs sm:text-sm leading-relaxed">
                      {!isMe && msg.translatedText && !showOriginal
                        ? msg.translatedText
                        : msg.text}
                    </p>

                    {/* Translation Pill & Switcher */}
                    {!isMe && msg.translatedText && (
                      <div className="pt-1.5 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-purple-300 font-mono">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-purple-400" />
                          Langpretation in {myLangInfo.name}
                        </span>
                        <button
                          onClick={() =>
                            setShowOriginalMap((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                          }
                          className="text-slate-400 hover:text-white underline ml-2"
                        >
                          {showOriginal ? 'View translation' : 'View original'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Message Reactions Toolbar & Read Info */}
                  <div className="flex items-center gap-2 mt-1.5 px-1">
                    {/* Existing Reaction Chips */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="flex items-center gap-1">
                        {Object.entries(
                          msg.reactions.reduce((acc, r) => {
                            acc[r.type] = (acc[r.type] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>)
                        ).map(([type, count]) => {
                          const rx = QUICK_REACTIONS.find((q) => q.type === type);
                          return (
                            <button
                              key={type}
                              onClick={() => handleToggleReaction(msg.id, type)}
                              className="px-1.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] flex items-center gap-1 hover:border-purple-500 text-slate-300"
                            >
                              <span>{rx?.icon || '👍'}</span>
                              <span className="font-bold font-mono">{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Quick Reaction Adder (visible on hover) */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-slate-900/90 border border-slate-700 rounded-full px-1.5 py-0.5">
                      {QUICK_REACTIONS.map((rx) => (
                        <button
                          key={rx.type}
                          onClick={() => handleToggleReaction(msg.id, rx.type)}
                          className="hover:scale-125 transition-transform text-xs"
                          title={rx.label}
                        >
                          {rx.icon}
                        </button>
                      ))}
                    </div>

                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isMe && <CheckCheck className="w-3.5 h-3.5 text-purple-400" />}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-800 bg-[#0c1424]/90 space-y-2">
          {/* Attachment Preview Chip */}
          {attachmentSimulation && (
            <div className="flex items-center justify-between p-2 bg-slate-900 border border-purple-500/40 rounded-xl text-xs text-purple-300">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span>{attachmentSimulation.name}</span>
              </div>
              <button
                onClick={() => setAttachmentSimulation(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => {
                setAttachmentSimulation({
                  name: 'Cocoa_Shipping_Bill_of_Lading.pdf',
                  type: 'file',
                  url: 'https://example.com/docs/cocoa_shipping.pdf',
                });
              }}
              className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-purple-300 border border-slate-700 transition-colors"
              title="Attach Contract / Invoice"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Main Text Input */}
            <input
              type="text"
              placeholder={`Send message to GetStream Channel (Speaks in ${myLangInfo.name})...`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={(!inputText.trim() && !attachmentSimulation) || isSending}
              className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold transition-all shadow-md hover:scale-105 flex items-center justify-center shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* RIGHT: Developer & Stream API Telemetry Inspector Drawer */}
      {/* ------------------------------------------------------------- */}
      {showInspector && (
        <div className="w-full md:w-80 bg-[#070d17] border-l border-slate-800 flex flex-col shrink-0 text-xs font-mono p-4 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-white font-bold">
              <Server className="w-4 h-4 text-purple-400" />
              <span>GetStream SDK Console</span>
            </div>
            <button
              onClick={() => setShowInspector(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* User Token Details */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Authenticated User</span>
              <span className="text-white font-bold">{currentUser.name}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">User ID</span>
              <span className="text-purple-300">{currentUser.id}</span>
            </div>
            <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
              <span className="block text-slate-500 mb-1">JWT User Token (HS256):</span>
              <div className="p-1.5 bg-slate-900 rounded-lg text-emerald-400 truncate select-all">
                {streamState.userToken || 'jwt_stream_token_sample'}
              </div>
            </div>
          </div>

          {/* Live Webhook & Event Log Stream */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-300">Live Webhook Events</span>
              <button
                onClick={() => streamClient.fetchLogs().then(setLogs)}
                className="text-[10px] text-purple-400 hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {logs.length === 0 ? (
                <div className="p-3 text-center text-slate-500 text-[11px] bg-slate-950 rounded-xl border border-slate-800">
                  No webhook events recorded yet
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2 bg-slate-950/80 border border-slate-800/80 rounded-lg text-[10px] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-purple-300 font-bold">{log.type}</span>
                      <span className="text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString([], { second: '2-digit' })}
                      </span>
                    </div>
                    {log.channelId && (
                      <div className="text-slate-400">
                        channel: <span className="text-slate-200">{log.channelId}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Engine capabilities info */}
          <div className="p-3 bg-purple-950/20 border border-purple-500/20 rounded-xl text-[10px] text-purple-300 space-y-1">
            <div className="font-bold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              <span>Full-Stack Stream Architecture</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Tokens generated server-side using cryptographic HMAC signatures, keeping Stream secrets protected.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
