import React from 'react';

interface LangpretationIconProps {
  className?: string;
  size?: number;
  glow?: boolean;
}

export const LangpretationIcon: React.FC<LangpretationIconProps> = ({
  className = '',
  size = 48,
  glow = true,
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Outer Rainbow Gradient Ring */}
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        style={{
          filter: glow
            ? 'drop-shadow(0 0 12px rgba(168, 85, 247, 0.75)) drop-shadow(0 0 4px rgba(6, 182, 212, 0.6))'
            : undefined,
        }}
      >
        <defs>
          {/* Conic rainbow-style ring gradient */}
          <linearGradient id="rainbowRing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00E5FF" />
            <stop offset="25%" stopColor="#3B82F6" />
            <stop offset="50%" stopColor="#A855F7" />
            <stop offset="75%" stopColor="#EC4899" />
            <stop offset="90%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#FBBF24" />
          </linearGradient>

          {/* Blue-Cyan Top-Left Arrow Gradient */}
          <linearGradient id="blueArrowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="30%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#00D8FF" />
          </linearGradient>

          {/* Orange-Magenta Bottom-Right Arrow Gradient */}
          <linearGradient id="orangeArrowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FB923C" />
            <stop offset="40%" stopColor="#F43F5E" />
            <stop offset="100%" stopColor="#C026D3" />
          </linearGradient>

          {/* Audio Diamond Equalizer Gradient */}
          <linearGradient id="diamondGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#D946EF" />
            <stop offset="50%" stopColor="#EC4899" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>

          {/* Shadow filters for 3D depth */}
          <filter id="innerGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Circular Rainbow Border (2px) */}
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#rainbowRing)"
          strokeWidth="3.5"
        />

        {/* Dark Disc Background */}
        <circle cx="50" cy="50" r="44.5" fill="#060913" />

        {/* Inner subtle glow vignette */}
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="#1e293b"
          strokeWidth="0.5"
          opacity="0.4"
        />

        {/* --- Top-Left Arrow (Blue to Purple) --- */}
        {/* Curved rounded path starting at bottom-left, going up, turning right with arrowhead pointing right */}
        <g filter="url(#innerGlow)">
          <path
            d="M 27 57
               L 27 34
               C 27 25, 34 22, 44 22
               L 63 22"
            fill="none"
            stroke="url(#blueArrowGrad)"
            strokeWidth="6.5"
            strokeLinecap="round"
          />
          {/* Arrowhead at (68, 22) */}
          <polygon
            points="63,14 77,22 63,30"
            fill="url(#blueArrowGrad)"
          />
        </g>

        {/* --- Bottom-Right Arrow (Orange to Magenta) --- */}
        {/* Curved rounded path starting at top-right, going down, turning left with arrowhead pointing left */}
        <g filter="url(#innerGlow)">
          <path
            d="M 73 43
               L 73 66
               C 73 75, 66 78, 56 78
               L 37 78"
            fill="none"
            stroke="url(#orangeArrowGrad)"
            strokeWidth="6.5"
            strokeLinecap="round"
          />
          {/* Arrowhead at (32, 78) */}
          <polygon
            points="37,70 23,78 37,86"
            fill="url(#orangeArrowGrad)"
          />
        </g>

        {/* --- Center Diamond Audio Equalizer / Waveform --- */}
        <g transform="translate(50, 50)" filter="url(#innerGlow)">
          {/* Bar 1 (Left outermost - shortest) */}
          <rect x="-13" y="-3.5" width="2.5" height="7" rx="1.2" fill="url(#diamondGrad)" opacity="0.85" />
          {/* Bar 2 */}
          <rect x="-8" y="-7.5" width="2.5" height="15" rx="1.2" fill="url(#diamondGrad)" />
          {/* Bar 3 (Center - tallest) */}
          <rect x="-3" y="-12.5" width="3" height="25" rx="1.5" fill="url(#diamondGrad)" />
          {/* Bar 4 */}
          <rect x="2.5" y="-9" width="2.5" height="18" rx="1.2" fill="url(#diamondGrad)" />
          {/* Bar 5 (Right outermost - shortest) */}
          <rect x="7.5" y="-4" width="2.5" height="8" rx="1.2" fill="url(#diamondGrad)" opacity="0.85" />
        </g>
      </svg>
    </div>
  );
};
