import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Eye, Heart, Volume2, Move, Smile } from 'lucide-react';
import malviImage from '../../assets/images/malvi_avatar.jpg';
import { MalviAvatarState } from '../../types';

interface MalviLivingMotionAvatarProps {
  state: MalviAvatarState;
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  onInteract?: (interactionType: string) => void;
  className?: string;
}

export const MalviLivingMotionAvatar: React.FC<MalviLivingMotionAvatarProps> = ({
  state,
  isSpeaking,
  isListening,
  isThinking,
  onInteract,
  className = '',
}) => {
  // Gaze & Aim tracking
  const [gaze, setGaze] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Blinking cycle state
  const [isBlinking, setIsBlinking] = useState<boolean>(false);

  // Mouth motion phoneme state
  const [mouthOpen, setMouthOpen] = useState<number>(0);

  // Breathing state & respiration phase
  const [breathPhase, setBreathPhase] = useState<'inhale' | 'exhale'>('inhale');

  // Interaction feedback reaction
  const [reactionText, setReactionText] = useState<string | null>(null);

  // Eye-blinking loop (natural semi-random interval)
  useEffect(() => {
    let blinkTimeout: NodeJS.Timeout;
    let closeTimeout: NodeJS.Timeout;

    const triggerBlink = () => {
      setIsBlinking(true);
      closeTimeout = setTimeout(() => {
        setIsBlinking(false);

        // 25% chance of a quick double-blink
        if (Math.random() < 0.25) {
          setTimeout(() => {
            setIsBlinking(true);
            setTimeout(() => setIsBlinking(false), 120);
          }, 150);
        }

        // Schedule next blink between 2.5s and 5.5s
        const nextInterval = 2500 + Math.random() * 3000;
        blinkTimeout = setTimeout(triggerBlink, nextInterval);
      }, 140);
    };

    blinkTimeout = setTimeout(triggerBlink, 2000);

    return () => {
      clearTimeout(blinkTimeout);
      clearTimeout(closeTimeout);
    };
  }, []);

  // Breathing cycle ticker
  useEffect(() => {
    const breathingInterval = setInterval(() => {
      setBreathPhase((prev) => (prev === 'inhale' ? 'exhale' : 'inhale'));
    }, 2400); // ~12.5 breaths/min

    return () => clearInterval(breathingInterval);
  }, []);

  // Mouth motion while speaking
  useEffect(() => {
    if (!isSpeaking) {
      setMouthOpen(0);
      return;
    }

    // Audio-reactive mouth phoneme simulation
    const mouthInterval = setInterval(() => {
      // Rapid speech aperture changes between 0.2 and 1.0
      setMouthOpen(0.25 + Math.random() * 0.75);
    }, 110);

    return () => clearInterval(mouthInterval);
  }, [isSpeaking]);

  // Cursor Aiming / Gaze tracking
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Normalized offset between -1 and +1
    const normX = Math.max(-1, Math.min(1, (e.clientX - centerX) / (rect.width / 2)));
    const normY = Math.max(-1, Math.min(1, (e.clientY - centerY) / (rect.height / 2)));

    // Dampened angle for natural head turn and gaze aim (max ±6 deg)
    setGaze({
      x: Number((normX * 6).toFixed(2)),
      y: Number((normY * 5).toFixed(2)),
    });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    // Smooth reset gaze to forward center
    setGaze({ x: 0, y: 0 });
  };

  const handleAvatarClick = () => {
    const greetings = [
      'Hello! I am Malvi, your AI companion.',
      'I am listening attentively!',
      'Ready to assist with Langpretation or Fintech.',
      'Always here for you on Nanivio!',
    ];
    const picked = greetings[Math.floor(Math.random() * greetings.length)];
    setReactionText(picked);
    setTimeout(() => setReactionText(null), 2500);

    if (onInteract) {
      onInteract('click_greet');
    }
  };

  // 3D Transform values
  const transformStyle = {
    transform: `perspective(700px) rotateY(${gaze.x}deg) rotateX(${-gaze.y}deg) scale(${
      isHovered ? 1.02 : 1
    })`,
    transition: 'transform 0.15s ease-out',
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={handleAvatarClick}
      className={`relative w-full h-full rounded-[22px] overflow-hidden bg-slate-950 flex items-center justify-center cursor-pointer select-none group ${className}`}
      style={transformStyle}
      title="Malvi AI Living Motion Model — Click to interact"
    >
      {/* ------------------------------------------------------------- */}
      {/* BREATHING MOTION WRAPPER */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`w-full h-full relative transition-all duration-[2400ms] ease-in-out ${
          breathPhase === 'inhale'
            ? 'scale-[1.018] -translate-y-0.5'
            : 'scale-[1.0] translate-y-0.5'
        }`}
      >
        {/* Base High-Resolution Portrait */}
        <img
          src={malviImage || '/malvi_avatar.jpg'}
          alt="Malvi AI Living Avatar"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/malvi_avatar.jpg';
          }}
          className={`w-full h-full object-cover object-top transition-all duration-500 ${
            isSpeaking
              ? 'brightness-105'
              : isListening
              ? 'brightness-100'
              : 'brightness-95'
          }`}
        />

        {/* ------------------------------------------------------------- */}
        {/* EYE BLINKING OVERLAY */}
        {/* ------------------------------------------------------------- */}
        {isBlinking && (
          <div className="absolute top-[28%] left-[28%] right-[28%] h-[12%] pointer-events-none z-20 flex items-center justify-between px-2">
            {/* Left Eye Eyelid */}
            <div className="w-[38%] h-2.5 bg-[#543b2f]/90 rounded-full shadow-inner blur-[0.5px] animate-pulse" />
            {/* Right Eye Eyelid */}
            <div className="w-[38%] h-2.5 bg-[#543b2f]/90 rounded-full shadow-inner blur-[0.5px] animate-pulse" />
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MOUTH MOTION & SPEECH PHONEMES */}
        {/* ------------------------------------------------------------- */}
        {isSpeaking && mouthOpen > 0 && (
          <div
            className="absolute top-[48%] left-[42%] w-[16%] pointer-events-none z-20 transition-all duration-75 flex items-center justify-center"
            style={{
              height: `${Math.max(4, mouthOpen * 14)}px`,
            }}
          >
            {/* Realistic lip shadow & phoneme aperture */}
            <div
              className="w-full bg-[#69332e]/85 rounded-full shadow-sm border-t border-[#8f4f46]/40 blur-[0.3px]"
              style={{
                height: `${Math.max(3, mouthOpen * 11)}px`,
                transform: `scaleX(${0.85 + mouthOpen * 0.25})`,
              }}
            />
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* GAZE & AIM RETICLE / EYE REFLECTION ACCENT */}
        {/* ------------------------------------------------------------- */}
        <div
          className="absolute top-[30%] left-[32%] right-[32%] h-[6%] pointer-events-none z-10 transition-transform duration-100 flex items-center justify-between px-3 opacity-60"
          style={{
            transform: `translate(${gaze.x * 1.5}px, ${gaze.y * 1.2}px)`,
          }}
        >
          {/* Subtle corneal specular highlight tracking cursor aim */}
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-200/70 shadow-sm shadow-cyan-300" />
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-200/70 shadow-sm shadow-cyan-300" />
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* DEPTH LIGHTING & SHADOW OVERLAYS */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#080d18] via-transparent to-transparent opacity-85 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/25 via-transparent to-transparent pointer-events-none" />

      {/* Speaking Glow Aura */}
      {isSpeaking && (
        <div className="absolute inset-0 bg-gradient-to-t from-cyan-950/40 via-transparent to-transparent pointer-events-none animate-pulse" />
      )}

      {/* Listening Glow Aura */}
      {isListening && (
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/30 via-transparent to-transparent pointer-events-none" />
      )}

      {/* ------------------------------------------------------------- */}
      {/* LIVE MOTION HUD & STATUS PILL */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 pointer-events-none">
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950/80 backdrop-blur-md border border-cyan-500/30 text-[9px] font-mono text-cyan-300">
          <Heart className="w-2.5 h-2.5 text-rose-400 animate-pulse" />
          <span>{breathPhase === 'inhale' ? 'Breath In' : 'Breath Out'}</span>
        </div>

        {isHovered && (
          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950/80 backdrop-blur-md border border-amber-500/30 text-[9px] font-mono text-amber-300">
            <Move className="w-2.5 h-2.5 text-amber-400" />
            <span>Aim: {gaze.x > 0 ? `+${gaze.x}` : gaze.x}°</span>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* INTERACTIVE POPUP TOAST REACTION */}
      {/* ------------------------------------------------------------- */}
      {reactionText && (
        <div className="absolute top-12 inset-x-4 z-40 p-2.5 rounded-2xl bg-cyan-950/90 backdrop-blur-md border border-cyan-400 text-white text-xs font-semibold text-center shadow-2xl animate-in zoom-in-95 fade-in duration-200">
          <span className="flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>{reactionText}</span>
          </span>
        </div>
      )}

      {/* Subtle bottom hint for interactive user discovery */}
      <div className="absolute bottom-2 inset-x-2 flex items-center justify-center z-10 pointer-events-none">
        <span className="text-[9px] font-mono text-slate-400/80 bg-slate-950/60 px-2 py-0.5 rounded-full backdrop-blur-sm">
          Interactive Motion • Move cursor to aim • Click to greet
        </span>
      </div>
    </div>
  );
};
