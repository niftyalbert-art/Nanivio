import React from 'react';
import type { MalviAvatarState } from '../../types';
import './MalviAuraFace.css';

/** Malvi's animated identity mark, shown until her live video stream is connected. */
export const MalviAuraFace: React.FC<{ state?: MalviAvatarState; className?: string; label?: string }> = ({
  state = 'idle', className = '', label = 'Malvi, Nanivio’s AI assistant',
}) => (
  <div className={`malvi-aura ${className}`} data-state={state} role="img" aria-label={label}>
    <span className="malvi-aura-glow" aria-hidden="true" />
    <span className="malvi-aura-ring malvi-aura-ring-a" aria-hidden="true" />
    <span className="malvi-aura-ring malvi-aura-ring-b" aria-hidden="true" />
    <svg className="malvi-aura-figure" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="malvi-aura-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7df3ff" />
          <stop offset=".55" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#f0abfc" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="36" r="15" fill="url(#malvi-aura-fill)" opacity=".92" />
      <path d="M22 86c2-17 13-28 28-28s26 11 28 28" fill="url(#malvi-aura-fill)" opacity=".78" />
      <circle cx="44.5" cy="35" r="1.9" fill="#0b1026" className="malvi-aura-eye" />
      <circle cx="55.5" cy="35" r="1.9" fill="#0b1026" className="malvi-aura-eye" />
    </svg>
  </div>
);
