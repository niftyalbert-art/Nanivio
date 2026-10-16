import React from 'react';
import { Sparkles, Mic, Volume2, Loader2, AlertCircle } from 'lucide-react';
import { MalviAvatarState } from '../../types';
import { MALVI_PORTRAIT } from '../../lib/malviIdentity';

interface MalviAvatarProps {
  state?: MalviAvatarState;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  showBadge?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
}

export const MalviAvatar: React.FC<MalviAvatarProps> = ({
  state = 'idle',
  size = 'md',
  showBadge = true,
  interactive = false,
  onClick,
  className = '',
}) => {
  const sizeMap = {
    xs: 'w-7 h-7',
    sm: 'w-10 h-10',
    md: 'w-14 h-14',
    lg: 'w-20 h-20',
    xl: 'w-28 h-28',
    hero: 'w-36 h-36 sm:w-44 sm:h-44',
  };

  const ringGlowMap = {
    idle: 'ring-teal-700/50 shadow-teal-950/30',
    listening: 'ring-teal-400 shadow-teal-900/40',
    thinking: 'ring-indigo-300 shadow-indigo-950/40',
    speaking: 'ring-teal-300 shadow-teal-900/40',
    interrupted: 'ring-amber-300 shadow-amber-950/30',
    processing: 'ring-amber-300 shadow-amber-950/30',
    success: 'ring-emerald-300 shadow-emerald-950/40',
    warning: 'ring-amber-400 shadow-amber-950/30',
    error: 'ring-rose-400 shadow-rose-950/40',
  };

  return (
    <div
      onClick={interactive ? onClick : undefined}
      className={`relative inline-flex items-center justify-center select-none ${
        interactive ? 'cursor-pointer group' : ''
      } ${className}`}
    >
      {/* This portrait is a still identity image; real motion appears only in the live session overlay. */}
      <div
        className={`relative ${sizeMap[size]} rounded-full overflow-hidden ring-2 ${ringGlowMap[state]} shadow-lg transition-colors duration-300 bg-[#132d31] flex items-center justify-center`}
      >
        <img
          src={MALVI_PORTRAIT}
          alt="Malvi, Nanivio's AI assistant"
          className="h-full w-full object-cover object-[50%_35%]"
        />

        {/* State Overlays */}
        {state === 'thinking' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#102628]/55 backdrop-blur-[1px]">
            <Loader2 className="h-5 w-5 text-[#d8eee5] animate-spin" />
          </div>
        )}
      </div>

      {/* State Status Badge */}
      {showBadge && (
        <div
          className={`absolute -bottom-0.5 -right-0.5 rounded-full p-1 border-2 border-[#132d31] flex items-center justify-center shadow-md transition-colors ${
            state === 'listening'
              ? 'bg-[#a7d9c3] text-[#173b36]'
              : state === 'speaking'
              ? 'bg-[#b5d8d0] text-[#173b36]'
              : state === 'thinking'
              ? 'bg-[#d1c7e8] text-[#30274a]'
              : state === 'error'
              ? 'bg-[#e7b7b1] text-[#4b2525]'
              : state === 'warning'
              ? 'bg-[#e9d29d] text-[#42351b]'
              : 'bg-[#d3e6d9] text-[#173b36]'
          }`}
        >
          {state === 'listening' ? (
            <Mic className="w-2.5 h-2.5" />
          ) : state === 'speaking' ? (
            <Volume2 className="w-2.5 h-2.5" />
          ) : state === 'thinking' ? (
            <Loader2 className="w-2.5 h-2.5" />
          ) : state === 'error' ? (
            <AlertCircle className="w-2.5 h-2.5" />
          ) : (
            <Sparkles className="w-2.5 h-2.5" />
          )}
        </div>
      )}
    </div>
  );
};
