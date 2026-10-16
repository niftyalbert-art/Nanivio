import React from 'react';
import { MALVI_PORTRAIT } from '../../lib/malviIdentity';
import { MalviAvatarState } from '../../types';

interface MalviLivingMotionAvatarProps {
  state: MalviAvatarState;
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  onInteract?: (interactionType: string) => void;
  className?: string;
}

/**
 * A still portrait preview until the real LiveAvatar media stream is connected.
 * State props remain accepted for compatibility with existing callers.
 */
export const MalviLivingMotionAvatar: React.FC<MalviLivingMotionAvatarProps> = ({
  state,
  onInteract,
  className = '',
}) => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onInteract || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onInteract('click_greet');
  };

  return (
    <div
      onClick={onInteract ? () => onInteract('click_greet') : undefined}
      onKeyDown={handleKeyDown}
      role={onInteract ? 'button' : undefined}
      tabIndex={onInteract ? 0 : undefined}
      aria-label={onInteract ? 'Open Malvi assistant' : 'Malvi portrait preview'}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit] bg-[#142c2c] ${onInteract ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#d3e6d9]' : ''} ${className}`}
      data-assistant-state={state}
    >
      <img
        src={MALVI_PORTRAIT}
        alt="Malvi, Nanivio's AI assistant"
        className="h-full w-full object-cover object-[50%_36%]"
        draggable={false}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#10201f]/70 via-transparent to-[#10201f]/10"
      />
    </div>
  );
};
