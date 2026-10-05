import React from 'react';
import { PhoneMissed, PhoneCall, Video, X, Clock, UserCheck, MessageSquare } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { Participant } from '../../types';
import { lookupNanivioUser } from '../../utils/userLookup';

interface MissedCallsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MissedCallsModal: React.FC<MissedCallsModalProps> = ({ isOpen, onClose }) => {
  const {
    callLogs,
    start1on1Call,
    startDirectChatWithUser,
    setActiveConversationId,
    setActiveTab,
    clearCallLogs,
  } = useNanivio();

  if (!isOpen) return null;

  const missedLogs = callLogs.filter((l) => l.direction === 'missed');

  const handleReturnCall = async (log: any, callType: 'audio' | 'video') => {
    onClose();
    let targetParticipant: Participant | null = null;
    if (log.participantNvId) {
      targetParticipant = await lookupNanivioUser(log.participantNvId);
    }
    if (!targetParticipant) {
      targetParticipant = {
        id: log.participantId || `caller_${Date.now()}`,
        nvId: log.participantNvId,
        name: log.participantName || 'Nanivio Contact',
        avatar: log.participantAvatar || '',
        initials: (log.participantName || 'NV').slice(0, 2).toUpperCase(),
        myLanguage: 'en',
        role: 'user',
      };
    }
    start1on1Call(targetParticipant, callType, true);
  };

  const handleChatBack = async (log: any) => {
    onClose();
    let targetParticipant: Participant | null = null;
    if (log.participantNvId) {
      targetParticipant = await lookupNanivioUser(log.participantNvId);
    }
    if (!targetParticipant) {
      targetParticipant = {
        id: log.participantId || `caller_${Date.now()}`,
        nvId: log.participantNvId,
        name: log.participantName || 'Nanivio Contact',
        avatar: log.participantAvatar || '',
        initials: (log.participantName || 'NV').slice(0, 2).toUpperCase(),
        myLanguage: 'en',
        role: 'user',
      };
    }
    const convId = startDirectChatWithUser(targetParticipant);
    setActiveConversationId(convId);
    setActiveTab('chat');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0b1424] border border-red-500/40 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center">
              <PhoneMissed className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <span>Missed Calls &amp; Alerts</span>
                {missedLogs.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-mono text-xs font-bold border border-red-500/30">
                    {missedLogs.length} New
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">Caller details, Nanivio NV numbers &amp; quick redial</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Missed Calls List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {missedLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs space-y-2">
              <UserCheck className="w-8 h-8 mx-auto text-slate-600" />
              <p>No unread missed calls. You are all caught up!</p>
            </div>
          ) : (
            missedLogs.map((log) => {
              const formattedNvNumber = log.participantNvId
                ? log.participantNvId.startsWith('NV ')
                  ? log.participantNvId
                  : `NV ${log.participantNvId}`
                : 'NV Line';

              return (
                <div
                  key={log.id}
                  className="p-4 bg-slate-950/90 border border-red-500/20 hover:border-red-500/40 rounded-2xl space-y-3 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {log.participantAvatar ? (
                        <img
                          src={log.participantAvatar}
                          alt={log.participantName}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-2xl object-cover border border-slate-700"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 text-white font-bold flex items-center justify-center text-sm shadow-md">
                          {log.participantName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-2">
                          <span>{log.participantName}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-mono font-bold">
                            MISSED
                          </span>
                        </div>
                        <div className="text-xs font-mono text-emerald-400 font-semibold mt-0.5">
                          {formattedNvNumber}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5 font-mono">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{new Date(log.timestamp).toLocaleDateString()} at {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Audio Call Back, Video Call Back, Direct Chat Back */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-900 flex-wrap">
                    <button
                      onClick={() => handleReturnCall(log, 'audio')}
                      className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>Audio Call</span>
                    </button>

                    <button
                      onClick={() => handleReturnCall(log, 'video')}
                      className="flex-1 py-2 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all border border-cyan-500/30 cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Video</span>
                    </button>

                    <button
                      onClick={() => handleChatBack(log)}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-emerald-500/50 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      title="Send message to caller"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Chat</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {missedLogs.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-mono text-[11px]">
              Tap call back or chat to respond immediately
            </span>
            <button
              onClick={() => {
                clearCallLogs();
                onClose();
              }}
              className="text-slate-400 hover:text-red-400 text-xs font-bold transition-colors cursor-pointer"
            >
              Clear Missed Calls
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
