import React, { useEffect, useRef, useState } from 'react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Radio,
  Volume2,
  Globe,
} from 'lucide-react';
import { agoraClient } from '../../lib/agoraClient';
import { Participant } from '../../types';

interface IncomingCallBannerProps {
  caller: Participant;
  callType: 'audio' | 'video';
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallBanner: React.FC<IncomingCallBannerProps> = ({
  caller,
  callType,
  onAccept,
  onDecline,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(() => agoraClient.getLocalStream());
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMirrored, setIsMirrored] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // -------------------------------------------------------------
  // 1. FOR VIDEO CALLS: OPEN RECEIVER'S CAMERA ON FULL SCREEN IMMEDIATELY
  // -------------------------------------------------------------
  useEffect(() => {
    let active = true;

    if (callType === 'video') {
      agoraClient.startLocalPreview('video').then((stream) => {
        if (!active) return;
        if (stream) {
          setLocalStream(stream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        }
      });
    }

    return () => {
      active = false;
    };
  }, [callType, facingMode]);

  // Bind stream to video element whenever it changes
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Handle Flip Camera
  const handleFlipCamera = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    setIsMirrored(nextMode === 'user');
    const stream = await agoraClient.startLocalPreview('video');
    if (stream && localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
  };

  // Handle Camera Toggle
  const handleToggleCamera = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCameraActive((prev) => {
      const next = !prev;
      if (localStream) {
        localStream.getVideoTracks().forEach((t) => (t.enabled = next));
      }
      return next;
    });
  };

  // Handle Mic Toggle
  const handleToggleMic = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted((prev) => {
      const next = !prev;
      if (localStream) {
        localStream.getAudioTracks().forEach((t) => (t.enabled = !next));
      }
      return next;
    });
  };

  return (
    <div
      id="incoming-call-fullscreen-container"
      className="fixed inset-0 z-50 overflow-hidden bg-slate-950 text-white flex flex-col justify-between select-none animate-in fade-in duration-300"
    >
      {/* ------------------------------------------------------------- */}
      {/* 1. BACKGROUND LAYER: FULL SCREEN CAMERA (VIDEO CALL) OR ACOUSTIC STAGE */}
      {/* ------------------------------------------------------------- */}
      {callType === 'video' ? (
        <div className="absolute inset-0 z-0 bg-black overflow-hidden">
          {isCameraActive ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-transform ${
                isMirrored ? 'scale-x-[-1]' : ''
              }`}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400">
              <VideoOff className="w-16 h-16 text-slate-600 mb-3" />
              <p className="text-sm font-semibold">Camera is paused</p>
            </div>
          )}

          {/* Vignette gradients for legibility */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/30 to-black/90 pointer-events-none" />
          <div className="absolute inset-0 bg-emerald-950/15 mix-blend-overlay pointer-events-none" />
        </div>
      ) : (
        /* Acoustic Audio Calling Canvas */
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#070e1c] via-[#050b16] to-[#03060c] overflow-hidden flex items-center justify-center">
          {/* Animated concentric acoustic pulse waves */}
          <div className="absolute w-[500px] h-[500px] rounded-full border border-emerald-500/20 animate-ping opacity-30" />
          <div className="absolute w-[360px] h-[360px] rounded-full border border-emerald-400/25 animate-pulse" />
          <div className="absolute w-[240px] h-[240px] rounded-full border border-teal-500/30" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent pointer-events-none" />
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. TOP HEADER OVERLAY: CALL STATUS & PROTOCOL BADGES */}
      {/* ------------------------------------------------------------- */}
      <div className="relative z-10 p-6 sm:p-8 flex items-center justify-between">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 text-xs text-white shadow-xl">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="font-mono uppercase tracking-wider font-bold text-emerald-300">
            Incoming {callType === 'video' ? 'HD Video' : 'Voice'} Call
          </span>
        </div>

        <div className="flex items-center gap-2">
          {callType === 'video' && (
            <button
              onClick={handleFlipCamera}
              className="p-2.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-xl border border-white/20 text-white transition-all active:scale-90"
              title="Flip camera"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 text-[11px] font-mono text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">E2EE</span>
            <span>HD Voice Network</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. CENTER OVERLAY: CALLER DETAILS & PHONE RINGING RADAR */}
      {/* ------------------------------------------------------------- */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 space-y-4">
        {/* Caller Avatar / Monogram with Pulsing Ring Indicator */}
        <div className="relative">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-slate-900/90 border-2 border-emerald-400/80 p-1 shadow-[0_0_50px_rgba(16,185,129,0.5)] overflow-hidden flex items-center justify-center">
            {caller.avatar ? (
              <img
                src={caller.avatar}
                alt={caller.name}
                className="w-full h-full object-cover rounded-2xl"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-900 flex items-center justify-center text-white font-black text-2xl">
                {caller.initials || 'NV'}
              </div>
            )}
          </div>

          <span className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-emerald-500 border-2 border-slate-950 flex items-center justify-center shadow-lg">
            {callType === 'video' ? (
              <Video className="w-3.5 h-3.5 text-slate-950" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-slate-950" />
            )}
          </span>
        </div>

        {/* Caller Identity Text */}
        <div className="space-y-1 max-w-md">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight drop-shadow-lg">
            {caller.name}
          </h2>
          <div className="flex items-center justify-center gap-2 text-xs font-mono text-slate-300">
            <span className="px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-emerald-300">
              NV-ID: {caller.nvId || '0486XXXXXX'}
            </span>
            {caller.country && (
              <span className="px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-slate-200">
                {caller.country}
              </span>
            )}
          </div>
        </div>

        {/* Dynamic Ringing Sound Indicator */}
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 backdrop-blur-xl border border-emerald-400/40 text-xs text-emerald-300 font-semibold shadow-lg animate-pulse">
          <Radio className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
          <span>Phone is Ringing...</span>
        </div>

        {callType === 'video' && (
          <div className="text-[11px] text-emerald-300/90 font-mono px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-emerald-500/30">
            Full Screen Camera Preview Active
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. BOTTOM OVERLAY: PRE-ANSWER CONTROLS & ACCEPT / DECLINE ACTIONS */}
      {/* ------------------------------------------------------------- */}
      <div className="relative z-10 p-6 sm:p-10 space-y-6 max-w-lg mx-auto w-full">
        {/* Pre-Answer Mic / Video Quick Toggles */}
        {callType === 'video' && (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleToggleMic}
              className={`p-3 rounded-2xl backdrop-blur-xl border transition-all ${
                isMuted
                  ? 'bg-rose-500/30 border-rose-500/50 text-rose-300'
                  : 'bg-black/60 border-white/20 text-white hover:bg-black/80'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <button
              onClick={handleToggleCamera}
              className={`p-3 rounded-2xl backdrop-blur-xl border transition-all ${
                !isCameraActive
                  ? 'bg-rose-500/30 border-rose-500/50 text-rose-300'
                  : 'bg-black/60 border-white/20 text-white hover:bg-black/80'
              }`}
              title={isCameraActive ? 'Turn off camera' : 'Turn on camera'}
            >
              {!isCameraActive ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>

            <button
              onClick={handleFlipCamera}
              className="p-3 rounded-2xl bg-black/60 border border-white/20 text-white hover:bg-black/80 backdrop-blur-xl transition-all"
              title="Switch camera"
            >
              <RotateCw className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Primary Accept and Decline Call Buttons */}
        <div className="flex items-center justify-around gap-6">
          {/* Decline Button */}
          <div className="flex flex-col items-center gap-2">
            <button
              id="btn-incoming-call-decline"
              onClick={onDecline}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-[0_0_35px_rgba(225,29,72,0.6)] border-2 border-rose-400 transition-all active:scale-95 cursor-pointer"
              title="Decline Call"
            >
              <PhoneOff className="w-7 h-7 sm:w-8 sm:h-8" />
            </button>
            <span className="text-xs font-bold text-slate-300">Decline</span>
          </div>

          {/* Accept Button */}
          <div className="flex flex-col items-center gap-2">
            <button
              id="btn-incoming-call-accept"
              onClick={onAccept}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.8)] border-2 border-emerald-300 transition-all active:scale-95 cursor-pointer animate-bounce"
              title="Accept Call"
            >
              {callType === 'video' ? (
                <Video className="w-7 h-7 sm:w-8 sm:h-8 fill-slate-950" />
              ) : (
                <Phone className="w-7 h-7 sm:w-8 sm:h-8 fill-slate-950" />
              )}
            </button>
            <span className="text-xs font-black text-emerald-400">Accept {callType === 'video' ? 'Video' : 'Call'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
