import React from 'react';

interface NanivioLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  compact?: boolean;
}

export const NanivioLogo: React.FC<NanivioLogoProps> = ({
  className = '',
  size = 'md',
  showTagline = false,
  compact = false,
}) => {
  // Dimensions based on size
  const iconSizes = {
    sm: 24,
    md: 32,
    lg: 48,
    xl: 64,
  };

  const currentIconSize = iconSizes[size];

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      {/* 3D Glowing "N" Emblem with Holographic Globe and Orbital Rings */}
      <div
        className="relative shrink-0 flex items-center justify-center"
        style={{ width: currentIconSize, height: currentIconSize }}
      >
        <img
          src="/brand/nanivio-emblem.png"
          alt={compact ? 'Nanivio' : ''}
          width={currentIconSize}
          height={currentIconSize}
          loading="eager"
          decoding="async"
          className="block w-full h-full object-contain"
        />
      </div>

      {/* Typography: "NANIVIO" */}
      {!compact && (
        <div className="flex flex-col">
          <div className="flex items-center tracking-wider font-extrabold text-white text-base leading-none">
            <span className="nanivio-wordmark bg-gradient-to-r from-white via-slate-100 to-slate-200 bg-clip-text text-transparent">
              NANIVI
            </span>
            {/* The 'O' with gradient cyan-to-violet ring */}
            <span className="ml-[1px] bg-gradient-to-tr from-cyan-400 via-sky-400 to-purple-500 bg-clip-text text-transparent">
              O
            </span>
          </div>

          {showTagline && (
            <span className="text-[7px] font-bold tracking-[0.2em] bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-400 bg-clip-text text-transparent uppercase mt-0.5">
              CONNECT. UNDERSTAND. TRANSACT.
            </span>
          )}
        </div>
      )}
    </div>
  );
};
