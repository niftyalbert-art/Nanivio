import React, { useEffect, useState } from 'react';

interface MalviVoiceWaveformProps {
  active: boolean;
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted';
  size?: 'sm' | 'md' | 'lg';
}

export const MalviVoiceWaveform: React.FC<MalviVoiceWaveformProps> = ({
  active,
  state,
  size = 'md',
}) => {
  const [bars, setBars] = useState<number[]>([30, 45, 60, 80, 50, 70, 40, 65, 85, 55, 35, 75]);

  useEffect(() => {
    if (!active && state === 'idle') {
      setBars([15, 20, 25, 20, 15, 20, 25, 20, 15, 20, 15, 20]);
      return;
    }

    const interval = setInterval(() => {
      setBars((prev) =>
        prev.map(() => {
          if (state === 'speaking') {
            return Math.floor(Math.random() * 75) + 25;
          } else if (state === 'listening') {
            return Math.floor(Math.random() * 85) + 15;
          } else if (state === 'thinking') {
            return Math.floor(Math.random() * 40) + 30;
          } else if (state === 'interrupted') {
            return 10;
          }
          return 20;
        })
      );
    }, 90);

    return () => clearInterval(interval);
  }, [active, state]);

  const heightClass = size === 'sm' ? 'h-6' : size === 'lg' ? 'h-14' : 'h-9';
  const barWidth = size === 'sm' ? 'w-1' : size === 'lg' ? 'w-2' : 'w-1.5';

  const getColor = () => {
    if (state === 'listening') return 'bg-gradient-to-t from-emerald-500 to-teal-300 shadow-emerald-500/50';
    if (state === 'speaking') return 'bg-gradient-to-t from-cyan-500 to-blue-400 shadow-cyan-500/50';
    if (state === 'thinking') return 'bg-gradient-to-t from-purple-500 to-pink-400 shadow-purple-500/50';
    if (state === 'interrupted') return 'bg-gradient-to-t from-amber-500 to-orange-400';
    return 'bg-slate-700';
  };

  return (
    <div className={`flex items-center justify-center gap-1 sm:gap-1.5 ${heightClass} px-2`}>
      {bars.map((height, i) => (
        <div
          key={i}
          className={`${barWidth} rounded-full transition-all duration-100 ${getColor()}`}
          style={{
            height: `${height}%`,
            minHeight: '4px',
          }}
        />
      ))}
    </div>
  );
};
