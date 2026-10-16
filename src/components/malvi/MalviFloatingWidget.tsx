import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { MalviAvatar } from './MalviAvatar';

export const MalviFloatingWidget: React.FC = () => {
  const { setActiveTab, activeTab, adminFeatures } = useNanivio();

  if (adminFeatures && !adminFeatures.malviAiAssistantEnabled) return null;
  if (activeTab === ('malvi' as any)) return null;

  return (
    <aside
      aria-label="Nanivio assistant launcher"
      className="pointer-events-auto fixed bottom-20 right-4 z-40 sm:bottom-6 sm:right-6"
    >
      <button
        type="button"
        onClick={() => setActiveTab('malvi' as any)}
        aria-label="Open Malvi"
        title="Open Malvi"
        className="group flex min-h-14 items-center gap-3 rounded-full border border-[#719184]/55 bg-[#142b29]/95 py-1.5 pl-1.5 pr-2.5 text-[#edf3ec] shadow-[0_12px_38px_rgba(7,24,22,0.36)] backdrop-blur-md transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-[#a0c2ad] hover:bg-[#1a3834] active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#d6e7da] sm:pr-4 motion-reduce:transition-none motion-reduce:hover:transform-none"
      >
        <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-[#91af9f]/65 bg-[#183432]">
          <MalviAvatar size="sm" showBadge={false} />
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-[#a9c6b4]">
            Nanivio assistant
          </span>
          <span className="mt-0.5 block text-sm font-semibold tracking-wide">Open Malvi</span>
        </span>
        <ArrowUpRight
          aria-hidden="true"
          size={15}
          className="mr-1 hidden text-[#bad3c3] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:block motion-reduce:transition-none"
        />
      </button>
    </aside>
  );
};
