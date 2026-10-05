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
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          style={{
            filter: 'drop-shadow(0 0 8px rgba(0, 216, 255, 0.6)) drop-shadow(0 0 16px rgba(168, 85, 247, 0.4))',
          }}
        >
          <defs>
            {/* 3D N Gradient (Cyan to Deep Blue to Violet) */}
            <linearGradient id="nStrokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="35%" stopColor="#2563EB" />
              <stop offset="70%" stopColor="#7C3AED" />
              <stop offset="100%" stopColor="#C084FC" />
            </linearGradient>

            {/* Right stem teal highlight */}
            <linearGradient id="nRightStemGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2DD4BF" />
              <stop offset="100%" stopColor="#A855F7" />
            </linearGradient>

            {/* Orbital Ring Cyan Gradient */}
            <linearGradient id="orbitCyan" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#A855F7" stopOpacity="0.9" />
            </linearGradient>

            {/* Globe dots pattern */}
            <radialGradient id="globeGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0284C7" stopOpacity="0.25" />
              <stop offset="80%" stopColor="#0F172A" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Background Glow */}
          <circle cx="50" cy="50" r="46" fill="url(#globeGlow)" />

          {/* Holographic Wireframe Globe / Orbit Rings */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="url(#orbitCyan)"
            strokeWidth="1.2"
            opacity="0.7"
          />
          <ellipse
            cx="50"
            cy="50"
            rx="42"
            ry="24"
            fill="none"
            stroke="#0ea5e9"
            strokeWidth="0.8"
            opacity="0.35"
            transform="rotate(-25 50 50)"
          />
          <ellipse
            cx="50"
            cy="50"
            rx="42"
            ry="18"
            fill="none"
            stroke="#a855f7"
            strokeWidth="0.8"
            opacity="0.4"
            transform="rotate(35 50 50)"
          />

          {/* Holographic sparkle dots */}
          <circle cx="28" cy="22" r="1" fill="#38bdf8" />
          <circle cx="74" cy="28" r="1.2" fill="#c084fc" />
          <circle cx="22" cy="72" r="0.8" fill="#38bdf8" />
          <circle cx="82" cy="68" r="1" fill="#67e8f9" />

          {/* 3D Sculpted 'N' Glyph */}
          {/* Left Vertical Pillar */}
          <rect
            x="24"
            y="25"
            width="13"
            height="50"
            rx="6.5"
            fill="url(#nStrokeGrad)"
          />
          {/* Diagonal Bridge */}
          <path
            d="M 28 28
               C 34 26, 42 34, 52 48
               L 66 68
               C 70 74, 76 72, 76 66
               L 76 33
               C 76 27, 70 27, 66 33
               L 52 53
               Z"
            fill="url(#nStrokeGrad)"
            opacity="0.95"
          />
          {/* Right Vertical Pillar with Bright Top */}
          <rect
            x="63"
            y="25"
            width="13"
            height="50"
            rx="6.5"
            fill="url(#nRightStemGrad)"
          />

          {/* 3D Specular Highlight on Left Top Curve */}
          <path
            d="M 25 32 C 25 27, 30 26, 34 29"
            stroke="#E0F2FE"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          {/* 3D Specular Highlight on Right Top Curve */}
          <path
            d="M 64 32 C 64 27, 69 26, 73 29"
            stroke="#CCFBF1"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>

      {/* Typography: "NANIVIO" */}
      {!compact && (
        <div className="flex flex-col">
          <div className="flex items-center tracking-wider font-extrabold text-white text-base leading-none">
            <span className="bg-gradient-to-r from-white via-slate-100 to-slate-200 bg-clip-text text-transparent">
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
