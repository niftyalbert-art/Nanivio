import React, { useState } from 'react';
import {
  Share2,
  X,
  Search,
  CheckCircle2,
  Users,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';
import { Conversation, ChatMessage } from '../../types';

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: ChatMessage | null;
  conversations: Conversation[];
  onForward: (targetConvIds: string[]) => void;
}

export const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({
  isOpen,
  onClose,
  message,
  conversations,
  onForward,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConvIds, setSelectedConvIds] = useState<string[]>([]);

  if (!isOpen || !message) return null;

  const toggleSelect = (id: string) => {
    setSelectedConvIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleConfirm = () => {
    if (selectedConvIds.length === 0) return;
    onForward(selectedConvIds);
    setSelectedConvIds([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0b1424] border border-slate-700/80 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Forward Message</h3>
              <p className="text-xs text-slate-400">Select one or more chats to forward to</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Snippet to Forward */}
        <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex items-start gap-2.5">
          <div className="w-1.5 self-stretch bg-cyan-500 rounded-full shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-bold text-cyan-400">{message.senderName}</span>
            <p className="text-xs text-slate-300 truncate">
              {message.mediaType && message.mediaType !== 'text'
                ? `[${message.mediaType.toUpperCase()}] ${message.mediaCaption || message.text}`
                : message.text}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-800 bg-slate-900/40">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="p-3 space-y-1.5 overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-6">No matching conversations found.</p>
          ) : (
            filtered.map((conv) => {
              const isSelected = selectedConvIds.includes(conv.id);
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => toggleSelect(conv.id)}
                  className={`w-full p-2.5 rounded-2xl border flex items-center justify-between text-left transition-all ${
                    isSelected
                      ? 'bg-cyan-950/40 border-cyan-500 text-white shadow-md shadow-cyan-500/10'
                      : 'bg-slate-900/40 border-slate-800/80 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-700 bg-slate-800 flex items-center justify-center shrink-0">
                      {conv.isGroup ? (
                        <Users className="w-4 h-4 text-cyan-400" />
                      ) : conv.avatar ? (
                        <img
                          src={conv.avatar}
                          alt={conv.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-xs font-bold text-cyan-400 font-mono">
                          {conv.title.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{conv.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {conv.isGroup ? `${conv.participants.length} members` : conv.lastMessage || 'Direct chat'}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                      isSelected
                        ? 'bg-cyan-500 border-cyan-500 text-slate-950'
                        : 'border-slate-700 bg-slate-950 text-transparent'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {selectedConvIds.length === 0
              ? 'None selected'
              : `${selectedConvIds.length} chat${selectedConvIds.length > 1 ? 's' : ''} selected`}
          </span>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={selectedConvIds.length === 0}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 font-bold text-xs hover:scale-105 transition-all disabled:opacity-40 disabled:hover:scale-100 flex items-center gap-2 shadow-lg shadow-cyan-500/20"
          >
            <span>Forward</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
