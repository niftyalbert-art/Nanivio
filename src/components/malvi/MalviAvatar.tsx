import React from 'react';
import { Sparkles, Mic, Volume2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { MalviAvatarState } from '../../types';
import malviImage from '../../assets/images/malvi_avatar.jpg';

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
    idle: 'ring-cyan-500/40 shadow-cyan-500/20',
    listening: 'ring-emerald-400 shadow-emerald-500/40 animate-pulse',
    thinking: 'ring-purple-400 shadow-purple-500/40 animate-pulse',
    speaking: 'ring-cyan-400 shadow-cyan-400/50',
    interrupted: 'ring-amber-400 shadow-amber-500/40',
    processing: 'ring-amber-400 shadow-amber-500/30',
    success: 'ring-emerald-400 shadow-emerald-500/50',
    warning: 'ring-amber-500 shadow-amber-500/40',
    error: 'ring-rose-500 shadow-rose-500/40',
  };

  return (
    <div
      onClick={interactive ? onClick : undefined}
      className={`relative inline-flex items-center justify-center select-none ${
        interactive ? 'cursor-pointer group' : ''
      } ${className}`}
    >
      {/* Dynamic Animated Pulse Rings for Listening / Speaking / Thinking */}
      {state === 'listening' && (
        <span className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping duration-1000 scale-125" />
      )}
      {state === 'speaking' && (
        <span className="absolute inset-0 rounded-full bg-cyan-500/25 animate-ping duration-700 scale-110" />
      )}
      {state === 'thinking' && (
        <span className="absolute -inset-1.5 rounded-full border-2 border-dashed border-purple-400/80 animate-spin duration-3000" />
      )}

      {/* Main Avatar Container with gentle living breathing motion */}
      <div
        className={`relative ${sizeMap[size]} rounded-full overflow-hidden ring-2 ${ringGlowMap[state]} shadow-lg transition-all duration-300 bg-slate-950 flex items-center justify-center`}
      >
        <img
          src={malviImage || '/malvi_avatar.jpg'}
          alt="Malvi — Nanivio AI Assistant"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/malvi_avatar.jpg';
          }}
          className={`w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ${
            state === 'speaking' ? 'scale-105' : 'scale-100'
          }`}
        />

        {/* Subtle organic breathing respiration overlay */}
        <div className="absolute inset-0 bg-cyan-400/5 pointer-events-none animate-pulse duration-[3000ms]" />

        {/* Overlay subtle gradient highlight */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent pointer-events-none" />

        {/* State Overlays */}
        {state === 'thinking' && (
          <div className="absolute inset-0 bg-purple-950/40 backdrop-blur-[1px] flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-purple-200 animate-spin" />
          </div>
        )}
      </div>

      {/* State Status Badge */}
      {showBadge && (
        <div
          className={`absolute -bottom-0.5 -right-0.5 rounded-full p-1 border-2 border-slate-950 flex items-center justify-center shadow-md transition-all ${
            state === 'listening'
              ? 'bg-emerald-500 text-slate-950 scale-110'
              : state === 'speaking'
              ? 'bg-cyan-500 text-slate-950 scale-110'
              : state === 'thinking'
              ? 'bg-purple-500 text-white animate-spin'
              : state === 'error'
              ? 'bg-rose-500 text-white'
              : state === 'warning'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-gradient-to-tr from-cyan-500 to-emerald-400 text-slate-950'
          }`}
        >
          {state === 'listening' ? (
            <Mic className="w-2.5 h-2.5" />
          ) : state === 'speaking' ? (
            <Volume2 className="w-2.5 h-2.5 animate-bounce" />
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
