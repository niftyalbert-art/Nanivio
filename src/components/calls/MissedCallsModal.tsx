import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PhoneMissed, PhoneCall, Video, X, Clock, UserCheck, MessageSquare, MessageCircle } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { Participant } from '../../types';
import { lookupNanivioUser } from '../../utils/userLookup';
import { aggregateRecentCommunications } from '../../lib/recentCommunication';

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
    clearMissedCallLogs,
    currentUser,
    authUser,
    conversations,
    messages,
    adminFeatures,
  } = useNanivio();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = (): HTMLElement[] => Array.from<HTMLElement>(
      dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []
    );
    (focusable()[0] || dialog)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (document.activeElement === items[0] || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (!event.shiftKey && (document.activeElement === items[items.length - 1] || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        items[0].focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const recentCommunications = aggregateRecentCommunications({
    callLogs,
    conversations,
    messages,
    selfIds: [currentUser?.id, authUser?.id],
    selfNumbers: [currentUser?.nvId, currentUser?.nanivioNumber, authUser?.nvId],
  });
  const alerts = recentCommunications.filter((item) => item.missedCount > 0 || item.unreadCount > 0);
  const missedTotal = alerts.reduce((total, item) => total + item.missedCount, 0);
  const unreadTotal = alerts.reduce((total, item) => total + item.unreadCount, 0);
  const audioEnabled = adminFeatures?.audioCallsEnabled !== false;
  const videoEnabled = adminFeatures?.videoCallsEnabled !== false;

  const resolveParticipant = async (record: (typeof recentCommunications)[number]): Promise<Participant | null> => {
    if (!record.participantId && !record.participantNvId) return null;
    if (record.participantNvId) {
      try {
        const found = await lookupNanivioUser(record.participantNvId);
        if (found) return found;
      } catch {
        // A temporary directory failure should not prevent responding to a known call record.
      }
    }
    return {
      id: String(record.participantId || record.participantNvId),
      nvId: record.participantNvId,
      name: record.participantName || 'Nanivio contact',
      avatar: record.participantAvatar || '',
      initials: (record.participantName || 'NV').slice(0, 2).toUpperCase(),
      myLanguage: currentUser?.myLanguage || 'en',
      role: 'user',
    };
  };

  const handleReturnCall = async (record: (typeof recentCommunications)[number], callType: 'audio' | 'video') => {
    if (callType === 'audio' ? !audioEnabled : !videoEnabled) return;
    const targetParticipant = await resolveParticipant(record);
    if (!targetParticipant) return;
    onClose();
    start1on1Call(targetParticipant, callType);
  };

  const handleChatBack = async (record: (typeof recentCommunications)[number]) => {
    const targetParticipant = await resolveParticipant(record);
    if (!targetParticipant) return;
    onClose();
    const convId = startDirectChatWithUser(targetParticipant);
    if (convId) setActiveConversationId(convId);
    setActiveTab('chat');
  };
  const formatTimestamp = (value?: number) => value
    ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    createPortal(
    <div className="nv-theme-dark nv-portal-backdrop fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="missed-calls-title" tabIndex={-1} className="nv-alerts-dialog max-w-2xl w-full max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${missedTotal ? 'bg-red-500/20 text-red-400' : 'bg-[#e2bb62]/15 text-[#e2bb62]'}`}>
              {missedTotal ? <PhoneMissed className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
            </div>
            <div>
              <h3 id="missed-calls-title" className="font-bold text-base text-white flex items-center gap-2">
                <span>Recent alerts</span>
                {(missedTotal > 0 || unreadTotal > 0) && (
                  <span className="px-2 py-0.5 rounded-full bg-[#29271f] text-[#e2bb62] font-mono text-xs font-bold border border-[#51482f]">
                    {missedTotal} missed · {unreadTotal} unread
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">One person per row. Unread counts are messages, not chat attempts.</p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close missed calls"
            className="min-w-11 min-h-11 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3 pr-1 pt-3">
          {alerts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs space-y-2">
              <UserCheck className="w-8 h-8 mx-auto text-slate-600" />
              <p>You are all caught up.</p>
            </div>
          ) : (
            alerts.map((record) => {
              const canContact = Boolean(record.participantId || record.participantNvId);
              return (
                <article key={record.key} className="nv-alert-person">
                  <div className="flex items-start gap-3">
                    {record.participantAvatar ? <img src={record.participantAvatar} alt="" referrerPolicy="no-referrer" className="nv-alert-avatar" /> : (
                      <span className="nv-alert-avatar nv-alert-initials">{record.participantName.slice(0, 2).toUpperCase()}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <strong className="nv-alert-name">{record.participantName}</strong>
                      <div className="nv-alert-id">{record.participantNvId ? `NV ${record.participantNvId.replace(/^NV[\s-]*/i, '')}` : 'Nanivio contact'}</div>
                      <div className="nv-alert-activity">
                        {record.missedCount > 0 && <span className="is-missed"><PhoneMissed size={13} /> {record.missedCount} missed ({record.missedAudioCount} audio, {record.missedVideoCount} video)</span>}
                        {record.unreadCount > 0 && <span className="is-unread"><MessageSquare size={13} /> {record.unreadCount} unread {record.unreadCount === 1 ? 'message' : 'messages'}</span>}
                      </div>
                      <div className="nv-alert-times">
                        {record.latestMissedTimestamp && <span><Clock size={12} /> Missed {formatTimestamp(record.latestMissedTimestamp)}</span>}
                        {record.latestChatTimestamp && <span><Clock size={12} /> Chat {formatTimestamp(record.latestChatTimestamp)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="nv-alert-actions">
                    <button
                      onClick={() => handleReturnCall(record, 'audio')}
                      disabled={!canContact || !audioEnabled}
                      aria-label={`Audio call ${record.participantName}`}
                    >
                      <PhoneCall size={15} /><span>Audio call</span>
                    </button>
                    <button
                      onClick={() => handleReturnCall(record, 'video')}
                      disabled={!canContact || !videoEnabled}
                      aria-label={`Video call ${record.participantName}`}
                    >
                      <Video size={15} /><span>Video call</span>
                    </button>
                    <button
                      onClick={() => handleChatBack(record)}
                      disabled={!canContact}
                      aria-label={`Chat back with ${record.participantName}`}
                    >
                      <MessageCircle size={15} /><span>Chat back</span>
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {missedTotal > 0 && (
          <div className="nv-alert-footer">
            <span>Clearing removes missed-call records only.</span>
            <button
              onClick={clearMissedCallLogs}
            >
              Clear missed calls
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
    )
  );
};
