import React from 'react';
import {
  Brain,
  X,
  Wallet,
  MessageSquare,
  PhoneCall,
  Stethoscope,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Layers,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { MalviContextMemory } from '../../types';

interface MalviMemoryInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  memory: MalviContextMemory;
  onSelectPrompt: (prompt: string) => void;
}

export const MalviMemoryInspectorModal: React.FC<MalviMemoryInspectorModalProps> = ({
  isOpen,
  onClose,
  memory,
  onSelectPrompt,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0b1322] border border-cyan-500/40 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-[#0b1322] via-[#0e1a30] to-[#0b1322]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-md">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  Malvi Contextual Memory Layer
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Synchronized
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Real-time snapshot across MoneyView, ChatView, CallsView, and ServicesView
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Memory Streams Grid */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 custom-scrollbar text-xs">
          {/* Stream 1: Multi-Currency Wallets & Transactions (MoneyView) */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-amber-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <Wallet className="w-4 h-4 text-amber-400" />
                <span>Financial Hub &amp; Multi-Currency Wallets (MoneyView)</span>
              </div>
              <button
                onClick={() => {
                  onSelectPrompt('How much money do I have across all my wallets?');
                  onClose();
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold text-[11px] border border-amber-500/30 flex items-center gap-1 transition-all"
              >
                <span>Ask Malvi</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* Currency Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {memory.wallets.map((w) => (
                <div key={w.currency} className="p-2 rounded-xl bg-slate-950/70 border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                    <span>{w.flag}</span>
                    <span>{w.currency}</span>
                  </div>
                  <div className="font-bold text-white font-mono mt-0.5">
                    {w.symbol}{Number(w.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>

            {/* Recent Transactions List */}
            {memory.recentTransactions && memory.recentTransactions.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-400">Latest Recorded Transactions:</div>
                <div className="space-y-1">
                  {memory.recentTransactions.slice(0, 3).map((tx) => (
                    <div
                      key={tx.id}
                      className="p-2 rounded-xl bg-slate-950/40 border border-slate-800/60 flex items-center justify-between text-slate-300 text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <span className="font-medium text-white">{tx.title}</span>
                        <span className="text-[10px] text-slate-500">({tx.timeAgo})</span>
                      </div>
                      <div className="font-mono font-bold text-amber-300">
                        {tx.currency} {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stream 2: Chat Conversations & Transcripts (ChatView) */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyan-300 font-bold">
                <MessageSquare className="w-4 h-4 text-cyan-400" />
                <span>Active Chat &amp; Multilingual Transcripts (ChatView)</span>
              </div>
              <button
                onClick={() => {
                  onSelectPrompt("What is the latest message across my conversations?");
                  onClose();
                }}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-semibold text-[11px] border border-cyan-500/30 flex items-center gap-1 transition-all"
              >
                <span>Ask Malvi</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {memory.recentConversations.map((conv) => (
                <div key={conv.id} className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white truncate">{conv.title}</span>
                    {conv.unreadCount > 0 && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                        {conv.unreadCount} new
                      </span>
                    )}
                  </div>
                  {conv.lastMessage && (
                    <p className="text-[11px] text-slate-400 line-clamp-1 italic">
                      "{conv.lastMessage}"
                    </p>
                  )}
                </div>
              ))}
            </div>

            {memory.activeConversation && memory.activeConversation.messages.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80">
                <div className="text-[11px] font-semibold text-cyan-400 mb-1.5">
                  Live Active Transcript ({memory.activeConversation.title}):
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto custom-scrollbar p-1">
                  {memory.activeConversation.messages.slice(-3).map((m) => (
                    <div key={m.id} className="p-1.5 rounded-lg bg-slate-950/50 text-[11px] text-slate-300">
                      <span className="font-bold text-white">{m.senderName}:</span> {m.text}
                      {m.translatedText && (
                        <span className="text-cyan-300 block text-[10px] mt-0.5">
                          ↳ Langpretated: {m.translatedText}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stream 3: Calling & Agora RTC Telemetry (CallsView) */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-purple-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-300 font-bold">
                <PhoneCall className="w-4 h-4 text-purple-400" />
                <span>Calling &amp; Langpretation Engine (CallsView)</span>
              </div>
              <button
                onClick={() => {
                  onSelectPrompt("What is the status of my Langpretation calling quota?");
                  onClose();
                }}
                className="px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 font-semibold text-[11px] border border-purple-500/30 flex items-center gap-1 transition-all"
              >
                <span>Ask Malvi</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                <span className="text-slate-400">Current Plan &amp; Allocation:</span>
                <div className="text-white font-bold">{memory.currentPlan.name}</div>
                <div className="text-purple-300 font-mono">
                  {memory.currentPlan.minutesRemaining} / {memory.currentPlan.minutesQuota} mins remaining
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                <span className="text-slate-400">Active Call State:</span>
                {memory.activeCall && memory.activeCall.status === 'connected' ? (
                  <div>
                    <div className="text-emerald-400 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      In Call ({memory.activeCall.durationFormatted})
                    </div>
                    <div className="text-slate-300 text-[10px]">
                      With {memory.activeCall.participants.join(', ')}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500">No active call in progress</div>
                )}
              </div>
            </div>
          </div>

          {/* Stream 4: Online Doctors & Verified Experts (ServicesView) */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <Stethoscope className="w-4 h-4 text-emerald-400" />
                <span>Verified Online Doctors &amp; Consultants (ServicesView)</span>
              </div>
              <button
                onClick={() => {
                  onSelectPrompt("Which verified doctors are currently online in the Services Hub?");
                  onClose();
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold text-[11px] border border-emerald-500/30 flex items-center gap-1 transition-all"
              >
                <span>Ask Malvi</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {memory.verifiedExperts.slice(0, 4).map((exp) => (
                <div key={exp.id} className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{exp.name}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                        exp.isOnline
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {exp.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400">{exp.title}</div>
                  <div className="text-[10px] text-emerald-400 font-mono">
                    GH₵ {exp.ratePerMinGHS.toFixed(2)}/min (${exp.ratePerMinUSD.toFixed(2)}/min)
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer with quick prompt triggers */}
        <div className="p-4 border-t border-slate-800 bg-[#090f1d] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-400 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Malvi references all of these state variables live in conversation.</span>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
