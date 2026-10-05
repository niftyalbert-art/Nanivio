import React, { useState, useMemo } from 'react';
import {
  History,
  X,
  Search,
  Mic,
  MessageSquare,
  Volume2,
  Trash2,
  Download,
  Copy,
  Check,
  Calendar,
  Sparkles,
  Zap,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { MalviChatMessage } from '../../types';

interface MalviChatHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: MalviChatMessage[];
  onReplayVoice: (text: string) => void;
  onClearHistory: () => void;
  onSelectPrompt: (text: string) => void;
}

export const MalviChatHistoryModal: React.FC<MalviChatHistoryModalProps> = ({
  isOpen,
  onClose,
  messages,
  onReplayVoice,
  onClearHistory,
  onSelectPrompt,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'voice' | 'text' | 'actions'>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportCopied, setExportCopied] = useState(false);

  // Filter messages based on search & category
  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      // Search term filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesText = msg.text.toLowerCase().includes(query);
        const matchesIntent = msg.detectedIntent?.toLowerCase().includes(query);
        const matchesAction = msg.actionCommand?.type?.toLowerCase().includes(query);
        if (!matchesText && !matchesIntent && !matchesAction) return false;
      }

      // Mode filter
      if (filterMode === 'voice') {
        return msg.mode === 'voice' || msg.sender === 'malvi';
      }
      if (filterMode === 'text') {
        return msg.mode === 'text' || (!msg.mode && msg.sender === 'user');
      }
      if (filterMode === 'actions') {
        return !!msg.actionCommand || !!msg.proposal;
      }

      return true;
    });
  }, [messages, searchQuery, filterMode]);

  // Group messages by relative date
  const groupedMessages: Record<string, MalviChatMessage[]> = useMemo(() => {
    const groups: Record<string, MalviChatMessage[]> = {};
    const now = new Date();
    const todayStr = now.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    filteredMessages.forEach((msg) => {
      const msgDate = new Date(msg.timestamp);
      const msgDateStr = msgDate.toDateString();

      let label = 'Earlier';
      if (msgDateStr === todayStr) {
        label = 'Today';
      } else if (msgDateStr === yesterdayStr) {
        label = 'Yesterday';
      } else {
        label = msgDate.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }

      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(msg);
    });

    return groups;
  }, [filteredMessages]);

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportHistory = () => {
    const transcript = messages
      .map(
        (m) =>
          `[${new Date(m.timestamp).toLocaleString()}] ${
            m.sender === 'user' ? 'You' : 'Malvi'
          } (${m.mode || 'text'}): ${m.text}`
      )
      .join('\n\n');

    navigator.clipboard.writeText(transcript);
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2500);
  };

  const handleDownloadJSON = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(messages, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `malvi_chat_history_${Date.now()}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0b1322] border border-cyan-500/30 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/90 flex items-center justify-between gap-3 bg-slate-950/50 backdrop-blur-sm relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-sm">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Persistent Interaction History</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono border border-cyan-500/30">
                  {messages.length} Records
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Review your saved voice transcriptions, text conversations, and Malvi responses
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Control Bar: Search & Filter Chips */}
        <div className="p-3 sm:p-4 border-b border-slate-800/80 bg-slate-900/40 space-y-3 relative z-10">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search history by keyword, action, or intent..."
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-slate-500 outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Actions: Export / Clear */}
            <div className="flex items-center gap-1.5 shrink-0 justify-end">
              <button
                onClick={handleExportHistory}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Copy entire transcript to clipboard"
              >
                {exportCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownloadJSON}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs transition-colors"
                title="Download JSON file"
              >
                <Download className="w-4 h-4 text-cyan-400" />
              </button>

              <button
                onClick={() => setShowClearConfirm(true)}
                className="px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-300 hover:text-red-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Clear all saved history"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear History</span>
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-500 text-[11px] font-mono flex items-center gap-1 shrink-0">
              <Filter className="w-3 h-3" />
              <span>Filter:</span>
            </span>

            {[
              { id: 'all', label: 'All Interactions', count: messages.length },
              {
                id: 'voice',
                label: 'Voice Interactions',
                icon: Mic,
                count: messages.filter((m) => m.mode === 'voice').length,
              },
              {
                id: 'text',
                label: 'Text Messages',
                icon: MessageSquare,
                count: messages.filter((m) => m.mode === 'text' || (!m.mode && m.sender === 'user')).length,
              },
              {
                id: 'actions',
                label: 'Proposals & Actions',
                icon: Zap,
                count: messages.filter((m) => m.actionCommand || m.proposal).length,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilterMode(tab.id as any)}
                  className={`px-3 py-1 rounded-full whitespace-nowrap text-[11px] font-medium border flex items-center gap-1.5 transition-all ${
                    filterMode === tab.id
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 font-semibold shadow-sm'
                      : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-800'
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  <span>{tab.label}</span>
                  <span className="text-[10px] opacity-70">({tab.count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Clear Confirmation Banner */}
        {showClearConfirm && (
          <div className="p-4 bg-red-950/80 border-b border-red-500/50 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="text-xs text-red-200 text-center sm:text-left">
              <span className="font-bold block">Are you sure you want to clear your chat history?</span>
              <span>This will erase your stored conversation from browser memory.</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  onClearHistory();
                  setShowClearConfirm(false);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors"
              >
                Yes, Clear All
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Conversation List Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-h-[60vh]">
          {filteredMessages.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                <History className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-300">No matching interactions found</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {searchQuery
                    ? `No messages match "${searchQuery}". Try a different search term.`
                    : 'Your saved voice and text conversation with Malvi will appear here.'}
                </p>
              </div>
            </div>
          ) : (
            Object.entries(groupedMessages).map(([dateGroup, groupMsgs]) => (
              <div key={dateGroup} className="space-y-3">
                {/* Date Header Separator */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    <span>{dateGroup}</span>
                  </span>
                  <div className="flex-1 h-px bg-slate-800/80" />
                </div>

                {/* Messages in this group */}
                <div className="space-y-2.5">
                  {groupMsgs.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        msg.sender === 'user'
                          ? 'bg-slate-900/90 border-slate-800 hover:border-emerald-500/40'
                          : 'bg-[#091122] border-cyan-500/20 hover:border-cyan-500/40'
                      }`}
                    >
                      {/* Item Top Bar */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[11px] font-bold flex items-center gap-1.5 ${
                              msg.sender === 'user' ? 'text-emerald-300' : 'text-cyan-300'
                            }`}
                          >
                            {msg.sender === 'user' ? (
                              <>
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                <span>You</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3 h-3 text-cyan-400" />
                                <span>Malvi</span>
                              </>
                            )}
                          </span>

                          {/* Mode tag */}
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-400 flex items-center gap-1">
                            {msg.mode === 'voice' ? (
                              <>
                                <Mic className="w-2.5 h-2.5 text-cyan-400" />
                                <span>Voice</span>
                              </>
                            ) : (
                              <>
                                <MessageSquare className="w-2.5 h-2.5 text-slate-400" />
                                <span>Text</span>
                              </>
                            )}
                          </span>

                          {msg.emotion && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                              {msg.emotion}
                            </span>
                          )}
                        </div>

                        {/* Timestamp & Copy/Replay */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>

                          {msg.sender === 'malvi' && (
                            <button
                              onClick={() => onReplayVoice(msg.text)}
                              className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors"
                              title="Play vocal response"
                            >
                              <Volume2 className="w-3 h-3" />
                            </button>
                          )}

                          <button
                            onClick={() => handleCopyText(msg.id, msg.text)}
                            className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                            title="Copy text"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Content */}
                      <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {msg.text}
                      </p>

                      {/* Action Attached / Proposal info */}
                      {msg.actionCommand && (
                        <div className="mt-2.5 p-2 rounded-xl bg-slate-950/80 border border-cyan-500/30 flex items-center justify-between text-[11px]">
                          <span className="text-cyan-300 flex items-center gap-1 font-semibold">
                            <Zap className="w-3 h-3" />
                            <span>Action: {msg.actionCommand.type}</span>
                          </span>
                          <button
                            onClick={() => {
                              onSelectPrompt(msg.text);
                              onClose();
                            }}
                            className="text-xs text-cyan-400 hover:underline flex items-center gap-0.5"
                          >
                            <span>Resume</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800/80 bg-slate-950/70 backdrop-blur-md flex items-center justify-between text-xs text-slate-400">
          <span className="text-[11px]">
            Saved locally in encrypted browser storage. Never sent to third parties.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
