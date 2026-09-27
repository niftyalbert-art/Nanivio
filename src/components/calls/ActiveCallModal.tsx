import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  Phone,
  Radio,
  Sparkles,
  Volume2,
  Maximize2,
  Users,
  Shield,
  Coins,
  Send,
  MessageSquare,
  Activity,
  Server,
  Zap,
  Info,
  X,
  CheckCircle2,
  Hash,
  VolumeX,
  Delete,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { SUPPORTED_LANGUAGES, Participant } from '../../types';
import { VideoCallScreen } from './VideoCallScreen';
import { agoraClient } from '../../lib/agoraClient';

// Realistic DTMF key tone synthesizer
const playDtmfTone = (digit: string) => {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const freqs: Record<string, number> = {
      '1': 697, '2': 697, '3': 697,
      '4': 770, '5': 770, '6': 770,
      '7': 852, '8': 852, '9': 852,
      '*': 941, '0': 941, '#': 941,
    };
    osc.frequency.setValueAtTime(freqs[digit] || 750, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {
    // Non-blocking
  }
};

export const ActiveCallModal: React.FC = () => {
  const {
    activeCall,
    agoraStats,
    endCall,
    toggleCallLangpretation,
    toggleCallMute,
    toggleCallVideo,
    myLanguage,
    adminFeatures,
    messages,
    sendMessage,
    langpretationMeter,
  } = useNanivio();

  const [showAgoraStats, setShowAgoraStats] = useState(false);
  const [showInCallChat, setShowInCallChat] = useState(false);
  const [showCallerKeypad, setShowCallerKeypad] = useState(false);
  const [callerDialedKeys, setCallerDialedKeys] = useState('');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [chatInputText, setChatInputText] = useState('');
  const [localRingingStream, setLocalRingingStream] = useState<MediaStream | null>(() => agoraClient.getLocalStream());
  const ringingVideoRef = useRef<HTMLVideoElement | null>(null);

  // Subscribe to local media stream during ringing preview
  useEffect(() => {
    const isVideo = activeCall?.type === 'video_1on1' || activeCall?.type === 'group_video';
    const isRinging = activeCall?.status === 'ringing' || activeCall?.status === 'calling';

    if (isVideo && isRinging) {
      agoraClient.startLocalPreview('video').then((s) => {
        if (s) setLocalRingingStream(s);
      });
    }

    const unsub = agoraClient.subscribeLocalStream((stream) => {
      setLocalRingingStream(stream);
    });

    return () => unsub();
  }, [activeCall?.type, activeCall?.status]);

  // Bind local stream to ringing video element
  useEffect(() => {
    if (ringingVideoRef.current && localRingingStream) {
      ringingVideoRef.current.srcObject = localRingingStream;
    }
  }, [localRingingStream, activeCall?.status]);

  // Remote WebRTC audio stream playback
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const unsub = agoraClient.subscribeRemoteStream((stream) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        if (stream) {
          remoteAudioRef.current.play().catch(() => {});
        }
      }
    });
    return () => unsub();
  }, []);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!activeCall) return null;

  const otherParticipant =
    activeCall.participants.find((p) => p.id !== activeCall.host.id) ||
    activeCall.participants[1] ||
    activeCall.host;
  const isVideo = activeCall.type === 'video_1on1' || activeCall.type === 'group_video';
  const isGroup = activeCall.type === 'group_audio' || activeCall.type === 'group_video';
  const myLangInfo = SUPPORTED_LANGUAGES.find((l) => l.code === myLanguage) || SUPPORTED_LANGUAGES[0];
  const isRinging = activeCall.status === 'ringing' || activeCall.status === 'calling';

  // If it's a 1-on-1 video call and connected, render the dedicated VideoCallScreen
  if (isVideo && !isGroup && !isRinging) {
    return <VideoCallScreen onEndCall={endCall} />;
  }

  const handleSendInCallChatMessage = async () => {
    if (!chatInputText.trim()) return;
    const textToSend = chatInputText;
    setChatInputText('');
    await sendMessage(textToSend);
  };

  // -------------------------------------------------------------
  // OUTGOING RINGING SCREEN (ACTIVE TELECOM CALL SIGNALING)
  // -------------------------------------------------------------
  if (isRinging) {
    return (
      <div className="fixed inset-0 z-50 bg-[#040810] text-white flex flex-col justify-between p-6 sm:p-10 select-none animate-in fade-in duration-300 overflow-hidden">
        {/* Fullscreen Live Camera Background for Video Calls */}
        {isVideo && (
          <div className="absolute inset-0 z-0 bg-slate-950 overflow-hidden">
            <video
              ref={ringingVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            {/* Ambient gradients for text legibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/80 pointer-events-none" />
            <div className="absolute inset-0 backdrop-blur-[1px] pointer-events-none" />
          </div>
        )}

        {/* Top Telecom Status Header */}
        <div className="relative z-10 flex items-center justify-between max-w-2xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-xs font-mono font-bold text-slate-200 tracking-wider uppercase drop-shadow-md">
              Nanivio Telecom Edge
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-slate-900/80 border border-emerald-500/40 text-emerald-300 text-xs font-mono backdrop-blur-md shadow-lg">
              {isVideo ? '● LIVE CAMERA PREVIEW' : 'HD AUDIO VOICE'}
            </span>
          </div>
        </div>

        {/* Center Stage: Radar Rings, Recipient Identity & Equalizer Waves */}
        <div className="relative z-10 flex flex-col items-center justify-center my-auto space-y-6 text-center">
          {/* Pulsating Avatar Container with Concentric Radar Wave Rings */}
          <div className="relative flex items-center justify-center">
            {/* Outer Ring 1 */}
            <div className="absolute w-48 h-48 sm:w-56 sm:h-56 rounded-full bg-emerald-500/20 border border-emerald-500/30 animate-ping duration-1000" />
            {/* Outer Ring 2 */}
            <div className="absolute w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-cyan-500/20 border border-cyan-500/40 animate-pulse duration-700" />

            {/* Main Center Avatar / Monogram Shield */}
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-slate-950/90 border-4 border-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.5)] flex items-center justify-center overflow-hidden z-10 backdrop-blur-md">
              {isGroup ? (
                <div className="w-full h-full flex items-center justify-center bg-slate-900 text-emerald-400">
                  <Users className="w-14 h-14" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center">
                  <span className="font-mono font-black text-2xl sm:text-3xl text-emerald-300">
                    {otherParticipant.initials || otherParticipant.name?.slice(0, 2).toUpperCase() || 'NV'}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 mt-0.5">TELECOM</span>
                </div>
              )}
            </div>

            {/* Small Floating Ringing Badge */}
            <div className="absolute bottom-0 right-1 z-20 w-8 h-8 rounded-full bg-emerald-500 border-2 border-slate-950 flex items-center justify-center shadow-lg animate-bounce">
              <Phone className="w-4 h-4 fill-slate-950 text-slate-950" />
            </div>
          </div>

          {/* Caller / Recipient Name & NV ID */}
          <div className="space-y-2 max-w-sm mx-auto backdrop-blur-sm bg-black/40 p-4 rounded-2xl border border-white/10 shadow-2xl">
            <div className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 font-bold flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Calling Recipient</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-md">
              {isGroup ? 'Multilateral Group Call' : otherParticipant.name}
            </h1>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 text-xs font-mono text-slate-200 shadow-md">
              <span className="text-emerald-400 font-bold">NV-ID:</span>
              <span>{otherParticipant.nvId || '0486XXXXXX'}</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>

          {/* Ringing Sound Wave Visualizer & Status */}
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-1.5 h-6">
              {[25, 60, 95, 45, 80, 100, 70, 50, 85, 30].map((h, i) => (
                <div
                  key={i}
                  style={{ height: `${h}%` }}
                  className="w-1.5 rounded-full bg-gradient-to-t from-emerald-400 to-teal-300 animate-pulse shadow-sm"
                />
              ))}
            </div>
            <div className="text-xs text-slate-200 font-mono flex flex-col items-center justify-center gap-1 drop-shadow-md">
              <span className="text-emerald-300 font-bold animate-pulse text-sm">Ringing...</span>
              <span className="text-slate-400 text-[11px]">Waiting for recipient to answer • Secure End-to-End Signaling</span>
            </div>
          </div>
        </div>

        {/* In-Call Caller Keypad Drawer (Toggleable with the Keys button) */}
        {showCallerKeypad && (
          <div className="relative z-20 max-w-xs mx-auto w-full mb-4 p-4 rounded-3xl bg-slate-950/90 border border-slate-700/80 backdrop-blur-xl shadow-2xl animate-in slide-in-from-bottom-6 duration-200">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <span className="text-[11px] font-mono text-emerald-400 uppercase font-bold tracking-wider">In-Call Keypad</span>
              <button
                type="button"
                onClick={() => setShowCallerKeypad(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Dialed string display */}
            <div className="h-8 mb-3 px-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
              <span className="font-mono text-lg tracking-widest text-emerald-300 font-bold">
                {callerDialedKeys || <span className="text-xs text-slate-600 font-normal">Touch keys below</span>}
              </span>
              {callerDialedKeys && (
                <button
                  type="button"
                  onClick={() => setCallerDialedKeys((prev) => prev.slice(0, -1))}
                  className="text-slate-400 hover:text-rose-400 p-1"
                >
                  <Delete className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 3x4 Keys Grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { digit: '1', sub: '' },
                { digit: '2', sub: 'ABC' },
                { digit: '3', sub: 'DEF' },
                { digit: '4', sub: 'GHI' },
                { digit: '5', sub: 'JKL' },
                { digit: '6', sub: 'MNO' },
                { digit: '7', sub: 'PQRS' },
                { digit: '8', sub: 'TUV' },
                { digit: '9', sub: 'WXYZ' },
                { digit: '*', sub: '' },
                { digit: '0', sub: '+' },
                { digit: '#', sub: '' },
              ].map(({ digit, sub }) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => {
                    playDtmfTone(digit);
                    setCallerDialedKeys((prev) => prev + digit);
                  }}
                  className="h-12 rounded-2xl bg-slate-900/90 hover:bg-emerald-500/20 active:bg-emerald-500/40 border border-slate-800 hover:border-emerald-500/50 text-white flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95"
                >
                  <span className="text-base font-bold font-mono leading-none">{digit}</span>
                  {sub && <span className="text-[8px] font-mono text-slate-400 tracking-wider leading-none mt-0.5">{sub}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Caller Controls: Call/Cancel buttons together with the Keys, Mute, & Speaker */}
        <div className="relative z-10 max-w-lg mx-auto w-full flex items-center justify-around sm:justify-center sm:gap-6 pb-6 pt-2 px-4">
          {/* Mute Mic */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              id="btn-caller-toggle-mute"
              type="button"
              onClick={toggleCallMute}
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center border transition-all cursor-pointer shadow-lg active:scale-95 ${
                activeCall.isMuted
                  ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                  : 'bg-slate-900/80 border-slate-700 text-slate-200 hover:border-emerald-400'
              }`}
              title={activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {activeCall.isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>
            <span className="text-[11px] font-medium text-slate-300">
              {activeCall.isMuted ? 'Muted' : 'Mute'}
            </span>
          </div>

          {/* Toggle In-Call Keys / Keypad */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              id="btn-caller-toggle-keys"
              type="button"
              onClick={() => setShowCallerKeypad((prev) => !prev)}
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center border transition-all cursor-pointer shadow-lg active:scale-95 ${
                showCallerKeypad
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-emerald-500/30 font-bold'
                  : 'bg-slate-900/80 border-slate-700 text-slate-200 hover:border-cyan-400'
              }`}
              title="Toggle DTMF Keypad"
            >
              <Hash className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <span className="text-[11px] font-medium text-slate-300">Keys</span>
          </div>

          {/* Cancel Call (Caller Red Hang Up Button) */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              id="btn-cancel-ringing-call"
              type="button"
              onClick={endCall}
              className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-gradient-to-tr from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 active:scale-95 text-white flex items-center justify-center shadow-2xl shadow-rose-600/60 transition-all hover:scale-105 cursor-pointer border-2 border-rose-400/40"
              title="Cancel / End Call"
            >
              <PhoneOff className="w-7 h-7 sm:w-8 sm:h-8" />
            </button>
            <span className="text-xs font-bold text-rose-400 drop-shadow-md">Cancel</span>
          </div>

          {/* Speaker Toggle */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              id="btn-caller-toggle-speaker"
              type="button"
              onClick={() => setIsSpeakerOn((prev) => !prev)}
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center border transition-all cursor-pointer shadow-lg active:scale-95 ${
                isSpeakerOn
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                  : 'bg-slate-900/80 border-slate-700 text-slate-400'
              }`}
              title={isSpeakerOn ? 'Speaker On' : 'Speaker Off'}
            >
              {isSpeakerOn ? <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" /> : <VolumeX className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>
            <span className="text-[11px] font-medium text-slate-300">Speaker</span>
          </div>

          {/* Video Camera Toggle (If Video Call) */}
          {isVideo && (
            <div className="flex flex-col items-center gap-1.5">
              <button
                id="btn-caller-toggle-camera"
                type="button"
                onClick={toggleCallVideo}
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center border transition-all cursor-pointer shadow-lg active:scale-95 ${
                  activeCall.isVideoOff
                    ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                    : 'bg-slate-900/80 border-slate-700 text-slate-200 hover:border-emerald-400'
                }`}
                title={activeCall.isVideoOff ? 'Turn Video On' : 'Turn Video Off'}
              >
                {activeCall.isVideoOff ? <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <VideoIcon className="w-5 h-5 sm:w-6 sm:h-6" />}
              </button>
              <span className="text-[11px] font-medium text-slate-300">Camera</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // CONNECTED CALL SCREEN (AUDIO & GROUP & IN-CALL LIVE CHAT)
  // -------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 bg-[#070d18] text-white flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* Hidden remote WebRTC audio playback element */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Top Floating Call Header Bar */}
      <div className="absolute top-0 inset-x-0 z-30 p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between">
        {/* Remote participant or group info */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center font-mono font-bold text-sm text-emerald-300">
              {isGroup ? (
                <Users className="w-5 h-5 text-emerald-400" />
              ) : (
                otherParticipant.initials || otherParticipant.name?.slice(0, 2).toUpperCase() || 'NV'
              )}
            </div>
            {/* Online/call pulse */}
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-950 animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white leading-tight">
                {isGroup ? 'Multilateral Group Call' : otherParticipant.name}
              </h2>
              {otherParticipant.isExpert && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                  Expert
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="font-mono text-emerald-400">{formatTime(activeCall.durationSeconds)}</span>
              <span>•</span>
              <span className="text-[11px] text-slate-400 capitalize">{activeCall.type.replace('_', ' ')}</span>
            </div>
          </div>
        </div>

        {/* Status Badges: In-Call Chat, Agora RTC Telemetry, Langpretation */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* In-Call Live Chat Toggle */}
          <button
            onClick={() => setShowInCallChat(!showInCallChat)}
            className={`px-3 py-1 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all shadow-md ${
              showInCallChat
                ? 'bg-indigo-600 border-indigo-400 text-white shadow-indigo-600/30'
                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-slate-200'
            }`}
            title="Toggle In-Call Live Chat"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">In-Call Chat</span>
          </button>

          {/* Nanivio HD Voice & Video Telemetry Badge */}
          <button
            onClick={() => setShowAgoraStats(!showAgoraStats)}
            className="px-2.5 py-1 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5 shadow-lg text-xs font-mono transition-all"
            title="Click to inspect live stream telemetry"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="hidden sm:inline font-bold">HD Voice</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
              {agoraStats.rttMs}ms
            </span>
          </button>

          {/* Paid Expert Billing Meter */}
          {activeCall.isPaidServiceCall && (
            <div className="px-3 py-1 rounded-xl bg-amber-950/80 border border-amber-500/40 flex items-center gap-2 shadow-lg">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <div className="text-right font-mono">
                <div className="text-[10px] text-amber-300/80">Accrued ({activeCall.billedMinutes}m)</div>
                <div className="text-xs font-bold text-amber-300">GH₵{activeCall.accruedCost.toFixed(2)}</div>
              </div>
            </div>
          )}

          {/* Langpretation State & Production Allowance Badge */}
          <div
            className={`px-3 py-1 rounded-xl border flex items-center gap-2 shadow-lg transition-all ${
              activeCall.langpretationEnabled
                ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300 glow-crystal-subtle'
                : 'bg-slate-900/80 border-slate-800 text-slate-400'
            }`}
          >
            <Radio
              className={`w-3.5 h-3.5 ${
                activeCall.langpretationEnabled ? 'text-emerald-400 animate-pulse' : 'text-slate-500'
              }`}
            />
            <div className="text-left hidden sm:block">
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
                <span>Langpretation</span>
                {activeCall.langpretationEnabled && langpretationMeter && (
                  <span className="font-mono text-emerald-400 font-bold">
                    • {langpretationMeter.remainingAllowance.toFixed(1)}m left
                  </span>
                )}
              </div>
              <div className="text-xs font-semibold text-white">
                {activeCall.langpretationEnabled ? `ON (${myLangInfo.name})` : 'OFF'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Nanivio HD Telemetry HUD Drawer */}
      {showAgoraStats && (
        <div className="absolute top-20 right-4 sm:right-6 z-40 w-80 bg-slate-950/95 border border-emerald-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 text-xs space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 font-bold text-white">
              <Server className="w-4 h-4 text-emerald-400" />
              <span>Nanivio HD Audio/Video Telemetry</span>
            </div>
            <button
              onClick={() => setShowAgoraStats(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Channel</span>
              <span className="text-emerald-300 font-bold truncate block">{agoraStats.channelName}</span>
            </div>
            <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Client UID</span>
              <span className="text-white font-bold">{agoraStats.uid}</span>
            </div>
            <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">RTT Latency</span>
              <span className="text-emerald-400 font-bold">{agoraStats.rttMs} ms</span>
            </div>
            <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Packet Loss</span>
              <span className="text-slate-200 font-bold">{agoraStats.packetLossPercent}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Call View Area */}
      <div className="flex-1 relative flex items-center justify-center p-4">
        {/* 1:1 Audio-Only Call UI */}
        {!isGroup && !isVideo && (
          <div className="w-full max-w-2xl flex flex-col items-center justify-center space-y-12">
            <div className="flex items-center justify-center gap-8 sm:gap-16">
              {/* Host / You Tile */}
              <div className="flex flex-col items-center space-y-3">
                <div
                  className={`w-28 h-28 sm:w-36 sm:h-36 rounded-3xl bg-slate-900 border-4 ${
                    activeCall.activeSpeakerId === activeCall.host.id
                      ? 'border-emerald-400 shadow-2xl shadow-emerald-500/40 scale-105'
                      : 'border-slate-800'
                  } flex flex-col items-center justify-center overflow-hidden transition-all duration-300 relative`}
                >
                  <span className="font-mono font-black text-2xl sm:text-3xl text-emerald-300">
                    {activeCall.host.initials || 'YOU'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 mt-1">
                    NV-{activeCall.host.nvId ? activeCall.host.nvId.slice(-4) : 'ID'}
                  </span>
                  {activeCall.host.isMuted && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <MicOff className="w-6 h-6 text-rose-400" />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-white">You</div>
                  <div className="text-[11px] text-emerald-400 font-mono">My Language: {myLangInfo.name}</div>
                </div>
              </div>

              {/* Connecting Waveform / Network Signal */}
              <div className="flex flex-col items-center space-y-1">
                <div className="flex items-center gap-1">
                  {[40, 70, 90, 60, 80, 50, 30].map((h, i) => (
                    <div
                      key={i}
                      style={{ height: `${activeCall.activeSpeakerId ? h : 15}px` }}
                      className={`w-1 rounded-full transition-all duration-200 ${
                        activeCall.langpretationEnabled ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">
                  {activeCall.langpretationEnabled ? 'Translating' : 'Normal Voice'}
                </span>
              </div>

              {/* Remote Participant Tile */}
              <div className="flex flex-col items-center space-y-3">
                <div
                  className={`w-28 h-28 sm:w-36 sm:h-36 rounded-3xl bg-slate-900 border-4 ${
                    activeCall.activeSpeakerId === otherParticipant.id
                      ? 'border-emerald-400 shadow-2xl shadow-emerald-500/40 scale-105 animate-pulse'
                      : 'border-slate-800'
                  } flex flex-col items-center justify-center overflow-hidden transition-all duration-300 relative`}
                >
                  <span className="font-mono font-black text-2xl sm:text-3xl text-emerald-300">
                    {otherParticipant.initials || otherParticipant.name?.slice(0, 2).toUpperCase() || 'NV'}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 mt-1">
                    NV-{otherParticipant.nvId ? otherParticipant.nvId.slice(-4) : 'ID'}
                  </span>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-white">{otherParticipant.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Speaks:{' '}
                    {SUPPORTED_LANGUAGES.find((l) => l.code === otherParticipant.myLanguage)?.name ||
                      otherParticipant.myLanguage}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Group Calling Grid */}
        {isGroup && (
          <div className="w-full max-w-5xl max-h-[70vh] overflow-y-auto">
            <div className="mb-3 flex items-center justify-between px-2">
              <div className="text-xs text-slate-400">
                Group Langpretation Fan-Out Active · Output routed per participant language
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                {activeCall.participants.length} Participants
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {activeCall.participants.map((p) => {
                const isSpeaker = activeCall.activeSpeakerId === p.id;
                const pLang = SUPPORTED_LANGUAGES.find((l) => l.code === p.myLanguage) || SUPPORTED_LANGUAGES[0];

                return (
                  <div
                    key={p.id}
                    className={`relative rounded-2xl bg-slate-900 p-4 border transition-all duration-200 flex flex-col items-center justify-center text-center ${
                      isSpeaker
                        ? 'border-emerald-400 bg-emerald-950/20 glow-crystal-subtle'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="relative mb-2">
                      <div className="w-16 h-16 rounded-2xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center font-mono font-bold text-emerald-400 text-lg">
                        {p.initials || p.name?.slice(0, 2).toUpperCase() || 'NV'}
                      </div>
                      {isSpeaker && (
                        <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-slate-950 flex items-center justify-center">
                          <Volume2 className="w-2.5 h-2.5 text-slate-950" />
                        </span>
                      )}
                    </div>

                    <div className="text-xs font-bold text-white truncate max-w-[120px]">
                      {p.id === activeCall.host.id ? 'You' : p.name}
                    </div>

                    <div className="mt-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-[10px] text-emerald-300 font-mono">
                      <span>{pLang.flag}</span>
                      <span>{pLang.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Transcript Overlay */}
        {activeCall.langpretationEnabled && activeCall.currentTranscript && (
          <div className="absolute bottom-28 inset-x-4 max-w-xl mx-auto z-30 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-gradient-to-r from-[#064e3b]/90 via-[#047857]/90 to-[#065f46]/90 border border-emerald-400/50 rounded-2xl px-4 py-2.5 shadow-2xl backdrop-blur-md glow-crystal text-center">
              <div className="flex items-center justify-center gap-1.5 mb-0.5">
                <Sparkles className="w-3 h-3 text-emerald-200 animate-pulse" />
                <span className="text-[10px] font-mono font-bold text-emerald-200 tracking-wider uppercase">
                  {activeCall.currentTranscript.speakerName} → ({myLangInfo.name})
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-white tracking-wide leading-relaxed">
                "{activeCall.currentTranscript.textInReceiverLang}"
              </p>
            </div>
          </div>
        )}

        {/* IN-CALL LIVE CHAT SLIDE-OVER DRAWER */}
        {showInCallChat && (
          <div className="absolute right-0 top-0 bottom-0 z-40 w-full sm:w-88 bg-slate-950/95 border-l border-slate-800 backdrop-blur-xl flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-bold text-white">In-Call Live Chat</span>
              </div>
              <button
                onClick={() => setShowInCallChat(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chat Messages Stream */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
              <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 text-[11px] leading-relaxed">
                💬 Live in-call text channel. Messages are translated into each participant's preferred language.
              </div>
            </div>

            {/* Message Input */}
            <div className="p-3 border-t border-slate-800 bg-slate-900/90 flex items-center gap-2">
              <input
                type="text"
                value={chatInputText}
                onChange={(e) => setChatInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendInCallChatMessage();
                }}
                placeholder="Type in-call message..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleSendInCallChatMessage}
                disabled={!chatInputText.trim()}
                className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Call Controls Dock */}
      <div className="bg-[#050a14] border-t border-slate-800/80 px-4 py-4 z-30">
        <div className="max-w-lg mx-auto flex items-center justify-around sm:justify-center gap-3 sm:gap-8">
          {/* 1. Video Option Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              id="call-btn-video"
              onClick={toggleCallVideo}
              className={`w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all shadow-md cursor-pointer ${
                activeCall.host.isCameraOff || !isVideo
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-emerald-500/20'
              }`}
              title={activeCall.host.isCameraOff ? 'Turn on video camera' : 'Turn off video camera'}
            >
              {activeCall.host.isCameraOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
            </button>
            <span className="text-[11px] font-bold text-slate-300">Video</span>
          </div>

          {/* 2. Langpretation Option Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              id="call-btn-langpretation"
              onClick={toggleCallLangpretation}
              className={`px-4 h-13 sm:h-14 rounded-full flex items-center gap-2 font-bold text-xs transition-all shadow-md cursor-pointer ${
                activeCall.langpretationEnabled
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
              title="Toggle real-time Langpretation live translation"
            >
              <Radio
                className={`w-4 h-4 ${
                  activeCall.langpretationEnabled ? 'text-slate-950 animate-pulse' : 'text-slate-400'
                }`}
              />
              <span className="hidden xs:inline">
                {activeCall.langpretationEnabled ? 'Langpretation ON' : 'Langpretation OFF'}
              </span>
            </button>
            <span className="text-[11px] font-bold text-emerald-400">Langpretation</span>
          </div>

          {/* 3. In-Call Chat Option Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              id="call-btn-chat"
              onClick={() => setShowInCallChat(!showInCallChat)}
              className={`w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all shadow-md cursor-pointer ${
                showInCallChat
                  ? 'bg-indigo-600 text-white shadow-indigo-600/30 border border-indigo-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
              title="In-call chat"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <span className="text-[11px] font-bold text-slate-300">Chat</span>
          </div>

          {/* 4. Mute Option Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              id="call-btn-mute"
              onClick={toggleCallMute}
              className={`w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all shadow-md cursor-pointer ${
                activeCall.host.isMuted
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
              }`}
              title={activeCall.host.isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {activeCall.host.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <span className="text-[11px] font-bold text-slate-300">
              {activeCall.host.isMuted ? 'Unmute' : 'Mute'}
            </span>
          </div>

          {/* 5. End Option Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              id="call-btn-end"
              onClick={endCall}
              className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-all hover:scale-105 cursor-pointer"
              title="End call"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <span className="text-[11px] font-bold text-rose-400">End</span>
          </div>
        </div>
      </div>
    </div>
  );
};
