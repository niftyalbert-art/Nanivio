import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { MalviAvatar } from './MalviAvatar';

export const MalviFloatingWidget: React.FC<{ placement?: 'floating' | 'header' }> = ({ placement = 'floating' }) => {
  const { setActiveTab, activeTab, adminFeatures } = useNanivio();
  const inHeader = placement === 'header';

  if (adminFeatures && !adminFeatures.malviAiAssistantEnabled) return null;
  if (activeTab === ('malvi' as any)) return null;
  // Chat owns the bottom of the viewport for composing and sending messages.
  // Keep its launcher in normal header flow, never over the composer.
  if (inHeader ? activeTab !== 'chat' : activeTab === 'chat') return null;

  return (
    <aside
      aria-label="Nanivio assistant launcher"
      className={inHeader
        ? 'pointer-events-auto flex shrink-0'
        : 'pointer-events-auto fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 sm:right-6'}
    >
      <button
        type="button"
        onClick={() => setActiveTab('malvi' as any)}
        aria-label="Open Malvi"
        title="Open Malvi"
        className={`group flex touch-manipulation items-center gap-3 rounded-full border border-[#719184]/55 bg-[#142b29]/95 text-[#edf3ec] transition-[background-color,border-color,transform] hover:border-[#a0c2ad] hover:bg-[#1a3834] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#d6e7da] motion-reduce:transition-none ${inHeader
          ? 'min-h-11 min-w-11 px-3 py-1'
          : 'min-h-14 py-1.5 pl-1.5 pr-2.5 shadow-[0_12px_38px_rgba(7,24,22,0.36)] hover:-translate-y-0.5 active:translate-y-0 sm:pr-4 motion-reduce:hover:transform-none'}`}
      >
        <span className={`pointer-events-none relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-[#91af9f]/65 bg-[#183432] ${inHeader ? 'h-8 w-8' : 'h-11 w-11'}`}>
          <MalviAvatar size={inHeader ? 'xs' : 'sm'} showBadge={false} />
        </span>
        {inHeader ? <span className="pointer-events-none text-sm font-semibold">Malvi</span> : <span className="pointer-events-none hidden text-left sm:block">
          <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-[#a9c6b4]">
            Nanivio assistant
          </span>
          <span className="mt-0.5 block text-sm font-semibold tracking-wide">Open Malvi</span>
        </span>}
        <ArrowUpRight
          aria-hidden="true"
          size={15}
          className={`pointer-events-none text-[#bad3c3] ${inHeader ? '' : 'mr-1 hidden transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:block motion-reduce:transition-none'}`}
        />
      </button>
    </aside>
  );
};
