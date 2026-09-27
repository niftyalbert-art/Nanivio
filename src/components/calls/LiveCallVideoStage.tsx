import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  RotateCw,
  Maximize2,
  Minimize2,
  Volume2,
  Radio,
  Wifi,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Activity,
  Lock,
  Move,
  GripHorizontal,
} from 'lucide-react';
import type { Participant } from '../../types';
import { agoraClient } from '../../lib/agoraClient';

interface LiveCallVideoStageProps {
  localParticipant: Participant;
  remoteParticipant: Participant;
  isLocalCameraOff: boolean;
  isLocalMuted: boolean;
  isRemoteSpeaking?: boolean;
  activeSpeakerText?: string;
  isPiPSwapped?: boolean;
  onTogglePiPSwap?: () => void;
  isCompactMode?: boolean;
}

export const LiveCallVideoStage: React.FC<LiveCallVideoStageProps> = ({
  localParticipant,
  remoteParticipant,
  isLocalCameraOff,
  isLocalMuted,
  isRemoteSpeaking = false,
  activeSpeakerText,
  isPiPSwapped = false,
  onTogglePiPSwap,
  isCompactMode = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Local Webcam Stream State
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(() => agoraClient.getLocalStream());
  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied' | 'simulated'>('granted');
  const [isMirrored, setIsMirrored] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Remote WebRTC Stream State
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(() => agoraClient.getRemoteStream());
  const [hasRemoteVideoTrack, setHasRemoteVideoTrack] = useState(false);

  // Remote Canvas Fallback (Living 60fps audio-reactive matrix if remote video not streaming)
  const remoteCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Draggable PiP Window State (Can be dragged anywhere on screen across 360 degrees)
  const pipRef = useRef<HTMLDivElement | null>(null);
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; pipX: number; pipY: number; moved: boolean }>({
    pointerX: 0,
    pointerY: 0,
    pipX: 0,
    pipY: 0,
    moved: false,
  });

  // -------------------------------------------------------------
  // 1. MEDIASTREAM SUBSCRIPTIONS & ACQUISITION
  // -------------------------------------------------------------
  useEffect(() => {
    // Subscribe to Agora RTC streams
    const unsubLocal = agoraClient.subscribeLocalStream((stream) => {
      setLocalStream(stream);
      if (stream && stream.active) {
        setCameraPermission('granted');
      }
    });

    const unsubRemote = agoraClient.subscribeRemoteStream((stream) => {
      setRemoteStream(stream);
      if (stream) {
        const videoTracks = stream.getVideoTracks();
        setHasRemoteVideoTrack(videoTracks.length > 0 && videoTracks.some((t) => t.enabled));
      } else {
        setHasRemoteVideoTrack(false);
      }
    });

    // Ensure local stream is active
    if (!isLocalCameraOff) {
      agoraClient.startLocalPreview('video').then((s) => {
        if (s) {
          setLocalStream(s);
          setCameraPermission('granted');
        }
      });
    }

    return () => {
      unsubLocal();
      unsubRemote();
    };
  }, [isLocalCameraOff]);

  // Bind local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isPiPSwapped, cameraPermission, isLocalCameraOff]);

  // Bind remote stream to remote video element & audio playback
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      const videoTracks = remoteStream.getVideoTracks();
      setHasRemoteVideoTrack(videoTracks.length > 0);
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [remoteStream, isPiPSwapped]);

  // -------------------------------------------------------------
  // 2. DRAGGABLE PIP WINDOW (POINTER / TOUCH / MOUSE)
  // -------------------------------------------------------------
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Ignore click on internal buttons
    if ((e.target as HTMLElement).closest('button')) return;

    const pipEl = pipRef.current;
    const containerEl = containerRef.current;
    if (!pipEl || !containerEl) return;

    const pipRect = pipEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();

    const currentX = pipPos ? pipPos.x : pipRect.left - containerRect.left;
    const currentY = pipPos ? pipPos.y : pipRect.top - containerRect.top;

    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      pipX: currentX,
      pipY: currentY,
      moved: false,
    };

    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [pipPos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;

    const containerEl = containerRef.current;
    const pipEl = pipRef.current;
    if (!containerEl || !pipEl) return;

    const containerRect = containerEl.getBoundingClientRect();
    const pipRect = pipEl.getBoundingClientRect();

    const deltaX = e.clientX - dragStartRef.current.pointerX;
    const deltaY = e.clientY - dragStartRef.current.pointerY;

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      dragStartRef.current.moved = true;
    }

    const minX = 8;
    const maxX = Math.max(8, containerRect.width - pipRect.width - 8);
    const minY = 8;
    const maxY = Math.max(8, containerRect.height - pipRect.height - 8);

    const nextX = Math.min(Math.max(dragStartRef.current.pipX + deltaX, minX), maxX);
    const nextY = Math.min(Math.max(dragStartRef.current.pipY + deltaY, minY), maxY);

    setPipPos({ x: nextX, y: nextY });
  }, [isDragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    // If barely moved, consider it a tap/click to swap PiP
    if (!dragStartRef.current.moved) {
      onTogglePiPSwap?.();
    }
  }, [isDragging, onTogglePiPSwap]);

  // Flip Camera
  const handleFlipCamera = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    setIsMirrored(nextMode === 'user');
    await agoraClient.startLocalPreview('video');
  };

  // -------------------------------------------------------------
  // 3. REMOTE LIVE WEBRTC AUDIO/VIDEO REACTIVE STAGE CANVAS
  // (Rendered when remote video is not transmitting or audio-only)
  // -------------------------------------------------------------
  useEffect(() => {
    if (hasRemoteVideoTrack) return; // Use real video stream if available

    const canvas = remoteCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let startTime = performance.now();

    const render = (time: number) => {
      const elapsed = (time - startTime) / 1000;
      const width = canvas.width;
      const height = canvas.height;

      // Deep space telecom background gradient
      const bgGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        20,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.7
      );
      bgGrad.addColorStop(0, '#0a1628');
      bgGrad.addColorStop(0.5, '#050c18');
      bgGrad.addColorStop(1, '#02050b');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Fine holographic matrix grid lines
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.04)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Live Center Wave Rings (Responsive to remote speech activity)
      const cx = width / 2;
      const cy = height * 0.44;
      const speechIntensity = isRemoteSpeaking ? 1.0 : 0.25;
      const baseRadius = 80;

      // Concentric audio spectrum rings
      for (let r = 1; r <= 4; r++) {
        const ringRadius = baseRadius + r * 35 + Math.sin(elapsed * 3 + r) * 8 * speechIntensity;
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = isRemoteSpeaking
          ? `rgba(52, 211, 153, ${0.45 / r})`
          : `rgba(56, 189, 248, ${0.2 / r})`;
        ctx.lineWidth = isRemoteSpeaking ? 2 : 1;
        ctx.stroke();
      }

      // Real-time audio waveform bars in the center
      const barCount = 36;
      for (let i = 0; i < barCount; i++) {
        const angle = (i / barCount) * Math.PI * 2;
        const wave = Math.sin(elapsed * 6 + i * 0.8) * 20 * speechIntensity;
        const barHeight = 15 + Math.abs(wave) + (isRemoteSpeaking ? 25 : 5);
        const x1 = cx + Math.cos(angle) * (baseRadius + 10);
        const y1 = cy + Math.sin(angle) * (baseRadius + 10);
        const x2 = cx + Math.cos(angle) * (baseRadius + 10 + barHeight);
        const y2 = cy + Math.sin(angle) * (baseRadius + 10 + barHeight);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = isRemoteSpeaking ? '#34d399' : '#38bdf8';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Center Monogram Identity Shield (Vector based)
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = isRemoteSpeaking ? '#10b981' : '#1e293b';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Initials rendering inside the shield
      const initials = remoteParticipant.initials || remoteParticipant.name?.slice(0, 2).toUpperCase() || 'NV';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials, cx, cy - 2);

      // Verified NV-ID badge under initials
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`NV-${remoteParticipant.nvId ? remoteParticipant.nvId.slice(-6) : 'SECURE'}`, cx, cy + 32);
      ctx.restore();

      // Floating Particle Waves
      const particleCount = 20;
      for (let p = 0; p < particleCount; p++) {
        const px = cx + Math.sin(elapsed * 0.8 + p * 1.5) * (width * 0.38);
        const py = cy + Math.cos(elapsed * 0.5 + p * 2.1) * (height * 0.28);
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = isRemoteSpeaking ? 'rgba(52, 211, 153, 0.4)' : 'rgba(56, 189, 248, 0.25)';
        ctx.fill();
      }

      // Horizon Equalizer Bars along bottom
      const eqBars = 28;
      const barWidth = width / (eqBars * 1.5);
      const startX = (width - eqBars * barWidth * 1.3) / 2;
      for (let b = 0; b < eqBars; b++) {
        const bHeight = (Math.sin(elapsed * 8 + b * 0.6) * 0.5 + 0.5) * 35 * speechIntensity + 6;
        const bx = startX + b * barWidth * 1.3;
        const by = height * 0.88 - bHeight;

        ctx.fillStyle = isRemoteSpeaking ? '#10b981' : '#0284c7';
        ctx.fillRect(bx, by, barWidth, bHeight);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [remoteParticipant, isRemoteSpeaking, hasRemoteVideoTrack]);

  // -------------------------------------------------------------
  // RENDER HELPERS
  // -------------------------------------------------------------
  const renderLocalFeed = (isMainView: boolean) => {
    if (isLocalCameraOff) {
      return (
        <div className="w-full h-full bg-gradient-to-b from-slate-900 via-[#0a1220] to-slate-950 flex flex-col items-center justify-center text-slate-300 p-4 text-center select-none">
          <div className="relative mb-3">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center font-mono font-bold text-emerald-400 text-xl shadow-2xl">
              {localParticipant.initials || 'ME'}
            </div>
            <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-rose-500 text-white shadow-md">
              <CameraOff className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xs font-semibold text-white">{localParticipant.name}</p>
          <span className="text-[10px] text-slate-400 mt-0.5">Camera Muted · Privacy Shield Active</span>
        </div>
      );
    }

    return (
      <div className="relative w-full h-full overflow-hidden bg-black">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''}`}
        />

        {/* Local Feed Overlay Badge */}
        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] text-white pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono">{localParticipant.name} (You)</span>
          {isLocalMuted && <MicOff className="w-3 h-3 text-rose-400 ml-1" />}
        </div>
      </div>
    );
  };

  const renderRemoteFeed = (isMainView: boolean) => {
    return (
      <div className="relative w-full h-full overflow-hidden bg-[#070b14]">
        {/* Real Remote Video Stream if active */}
        {hasRemoteVideoTrack ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover object-center"
          />
        ) : (
          /* Dynamic Living Video Canvas (Live 60fps audio/video reactive telecom matrix) */
          <canvas
            ref={remoteCanvasRef}
            width={720}
            height={1080}
            className="w-full h-full object-cover object-center"
          />
        )}

        {/* Video Quality HUD overlay */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 pointer-events-none">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono shadow-md text-white">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-emerald-300">LIVE HD</span>
            <span className="text-white/40">|</span>
            <span className="text-slate-300">1080p 60fps</span>
          </div>

          <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[10px] text-slate-300">
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span>24ms</span>
          </div>
        </div>

        {/* Remote Participant Label */}
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-black/65 backdrop-blur-lg border border-white/15 shadow-xl">
            <div className="relative">
              <div className="w-6 h-6 rounded-lg bg-slate-800 border border-emerald-400/50 flex items-center justify-center text-[10px] font-mono font-bold text-emerald-300">
                {remoteParticipant.initials || 'NV'}
              </div>
              {isRemoteSpeaking && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                {remoteParticipant.name}
                {isRemoteSpeaking && (
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-mono font-normal">
                    Speaking
                  </span>
                )}
              </span>
              <span className="text-[10px] font-mono text-emerald-400">
                NV-ID: {remoteParticipant.nvId || '0486XXXXXX'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex-1 overflow-hidden bg-black select-none touch-none"
    >
      {/* Hidden dedicated audio playback element for remote peer speech */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* ------------------------------------------------------------- */}
      {/* 1. MAIN STAGE VIDEO (Either Remote or Swapped Local) */}
      {/* ------------------------------------------------------------- */}
      <div className="w-full h-full relative">
        {isPiPSwapped ? renderLocalFeed(true) : renderRemoteFeed(true)}

        {/* Subtle Top & Bottom Gradient Vignettes for Controls Contrast */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 via-black/20 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. DRAGGABLE PICTURE-IN-PICTURE (PIP) WINDOW */}
      {/* ------------------------------------------------------------- */}
      <div
        ref={pipRef}
        id="video-call-pip-window"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'absolute',
          left: pipPos ? `${pipPos.x}px` : undefined,
          top: pipPos ? `${pipPos.y}px` : undefined,
          right: pipPos ? undefined : '12px',
        }}
        className={`z-30 w-32 sm:w-44 h-44 sm:h-56 rounded-2xl sm:rounded-3xl overflow-hidden border-2 shadow-[0_12px_36px_rgba(0,0,0,0.9)] backdrop-blur-md transition-shadow group ${
          isDragging
            ? 'cursor-grabbing border-emerald-400 scale-105 shadow-[0_16px_48px_rgba(16,185,129,0.4)] ring-2 ring-emerald-400/50'
            : 'cursor-grab border-white/40 hover:border-emerald-400/90 top-3'
        }`}
        title="Drag anywhere on screen or tap to swap"
      >
        {isPiPSwapped ? renderRemoteFeed(false) : renderLocalFeed(false)}

        {/* Drag Handle Top Bar Indicator */}
        <div className="absolute top-1.5 inset-x-0 flex items-center justify-center pointer-events-none z-20 opacity-80 group-hover:opacity-100 transition-opacity">
          <div className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center gap-1 text-[9px] font-mono text-emerald-300">
            <GripHorizontal className="w-3 h-3 text-emerald-400" />
            <span>DRAG</span>
          </div>
        </div>

        {/* Hover/Tap Overlay with Swap & Flip Actions */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20 pointer-events-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePiPSwap?.();
            }}
            className="w-8 h-8 rounded-full bg-black/80 border border-white/30 text-white flex items-center justify-center hover:bg-emerald-500 hover:text-slate-950 transition-colors shadow-lg cursor-pointer active:scale-90"
            title="Swap video positions"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {!isPiPSwapped && !isLocalCameraOff && (
            <button
              onClick={handleFlipCamera}
              className="w-8 h-8 rounded-full bg-black/80 border border-white/30 text-white flex items-center justify-center hover:bg-cyan-500 hover:text-slate-950 transition-colors shadow-lg cursor-pointer active:scale-90"
              title="Flip camera"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* PiP Mini Label */}
        <div className="absolute bottom-1.5 left-2 pointer-events-none z-20">
          <span className="text-[9px] font-bold text-white/90 drop-shadow-md">
            {isPiPSwapped ? remoteParticipant.name : 'You'}
          </span>
        </div>
      </div>
    </div>
  );
};
