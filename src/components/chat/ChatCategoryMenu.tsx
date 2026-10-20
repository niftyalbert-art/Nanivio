import React, { useEffect, useRef, useState } from 'react';
import { Layers, MessageSquare, MoreVertical } from 'lucide-react';

export type ChatCategory = 'conversations' | 'stream_channels';

interface ChatCategoryMenuProps {
  activeCategory: ChatCategory;
  connectionStatus: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | string;
  connectionLabel: string;
  onSelect: (category: ChatCategory) => void;
}

export const ChatCategoryMenu: React.FC<ChatCategoryMenuProps> = ({
  activeCategory,
  connectionStatus,
  connectionLabel,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const select = (category: ChatCategory) => {
    onSelect(category);
    setOpen(false);
  };

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Choose chat category"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-white hover:border-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 sm:min-w-0"
      >
        {activeCategory === 'conversations'
          ? <MessageSquare className="h-4 w-4 text-amber-400" />
          : <Layers className="h-4 w-4 text-amber-400" />}
        <span className="hidden text-xs font-semibold sm:inline">
          {activeCategory === 'conversations' ? 'Chats' : 'Community'}
        </span>
        <MoreVertical className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div role="menu" aria-label="Conversation categories" className="absolute right-0 top-full z-50 mt-2 w-60 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-700 bg-[#171b22] p-1.5 shadow-xl">
          <button type="button" role="menuitem" onClick={() => select('conversations')} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-white hover:bg-slate-800">
            <MessageSquare className="h-4 w-4 text-amber-400" /> Direct &amp; Group Chats
          </button>
          <button type="button" role="menuitem" onClick={() => select('stream_channels')} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-white hover:bg-slate-800">
            <Layers className="h-4 w-4 text-amber-400" /> Community Channels
          </button>
          <div role="status" aria-live="polite" className="mt-1 flex items-center gap-2 border-t border-slate-700 px-3 py-2 text-xs text-slate-300">
            <span className={`h-2 w-2 rounded-full ${connectionStatus === 'CONNECTED' ? 'bg-emerald-400' : connectionStatus === 'CONNECTING' ? 'bg-amber-400' : 'bg-rose-400'}`} />
            {connectionLabel}
          </div>
        </div>
      )}
    </div>
  );
};
