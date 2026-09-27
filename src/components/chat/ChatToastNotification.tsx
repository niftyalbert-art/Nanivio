import React, { useEffect } from 'react';
import { MessageSquare, X, ArrowRight } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';

export const ChatToastNotification: React.FC = () => {
  const {
    chatNotificationToast,
    dismissChatNotificationToast,
    setActiveConversationId,
    setActiveTab,
  } = useNanivio();

  useEffect(() => {
    if (!chatNotificationToast) return;
    const timer = setTimeout(() => {
      dismissChatNotificationToast();
    }, 7000);
    return () => clearTimeout(timer);
  }, [chatNotificationToast, dismissChatNotificationToast]);

  if (!chatNotificationToast) return null;

  const handleOpenChat = () => {
    setActiveConversationId(chatNotificationToast.conversationId);
    setActiveTab('chat');
    dismissChatNotificationToast();
  };

  return (
    <aside
      id="incoming-chat-wake-toast"
      aria-label="Incoming Message Notification"
      className="fixed top-4 right-4 z-50 max-w-sm w-full bg-[#0b1424]/95 border-2 border-indigo-500/60 rounded-2xl p-4 shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-4 duration-300 select-none cursor-pointer group"
      onClick={handleOpenChat}
    >
      <div className="flex items-start gap-3">
        {/* Avatar or Icon with animated wake indicator light */}
        <div className="relative shrink-0">
          {chatNotificationToast.senderAvatar ? (
            <img
              src={chatNotificationToast.senderAvatar}
              alt={chatNotificationToast.senderName}
              className="w-11 h-11 rounded-full object-cover border border-indigo-400/50"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-indigo-300">
              <MessageSquare className="w-5 h-5" />
            </div>
          )}
          {/* Green active ping indicator */}
          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 shadow-sm shadow-emerald-400"></span>
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-mono uppercase font-bold text-indigo-400 tracking-wider">
              Incoming Message
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                dismissChatNotificationToast();
              }}
              className="text-slate-400 hover:text-white p-0.5 rounded-lg hover:bg-slate-800 transition-colors"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <h4 className="text-xs font-bold text-white truncate mt-0.5">
            {chatNotificationToast.senderName}
          </h4>

          <p className="text-xs text-slate-300 line-clamp-2 mt-1 leading-relaxed">
            {chatNotificationToast.text}
          </p>

          <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 mt-2 group-hover:translate-x-0.5 transition-transform">
            <span>Tap to reply</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>
    </aside>
  );
};
