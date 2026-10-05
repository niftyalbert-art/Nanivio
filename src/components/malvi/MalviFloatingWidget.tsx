import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  X,
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ChevronUp,
  ChevronDown,
  MessageSquare,
  Maximize2,
  Bot,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { MalviAvatar } from './MalviAvatar';
import { MalviVoiceWaveform } from './MalviVoiceWaveform';
import { MalviAvatarState } from '../../types';

interface FloatingMessage {
  sender: 'malvi' | 'user';
  text: string;
}

export const MalviFloatingWidget: React.FC = () => {
  const { setActiveTab, activeTab, currentUser, adminFeatures } = useNanivio();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [avatarState, setAvatarState] = useState<MalviAvatarState>('warm_idle');
  const [isListening, setIsListening] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [inputText, setInputText] = useState('');
  const [showGreetingTooltip, setShowGreetingTooltip] = useState(true);
  const [messages, setMessages] = useState<FloatingMessage[]>([
    {
      sender: 'malvi',
      text: `Hello ${currentUser?.name?.split(' ')[0] || 'there'}! I'm Malvi, your intelligent companion. How can I assist you across Nanivio today?`,
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-hide greeting tooltip after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowGreetingTooltip(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // If Malvi AI Assistant is disabled by admin, do not render
  if (adminFeatures && !adminFeatures.malviAiAssistantEnabled) {
    return null;
  }

  // If user is already on the full Malvi tab, hide the floating widget to avoid duplicate UI
  if (activeTab === 'malvi' as any) {
    return null;
  }

  const handleSend = (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query) return;

    setMessages((prev) => [...prev, { sender: 'user', text: query }]);
    setInputText('');
    setAvatarState('thinking');

    // Intelligent Malvi responses
    setTimeout(() => {
      setAvatarState('speaking');
      let reply = "I'm analyzing that for you with Nanivio's neural intelligence.";

      const lower = query.toLowerCase();
      if (lower.includes('who is') || lower.includes('mr. nifty') || lower.includes('albert')) {
        reply = "Mr. Albert Kwabena Atta Panyi (popularly known as Mr. Nifty) is the visionary founder and executive architect of Nanivio Tech. Gh., dedicated to bridging human and linguistic barriers across the globe.";
      } else if (lower.includes('call') || lower.includes('dial')) {
        reply = "You can initiate encrypted HD audio/video calls with instant Langpretation in the Communication Space. Shall I switch you to Calls?";
      } else if (lower.includes('langpretation') || lower.includes('language') || lower.includes('translate')) {
        reply = "Nanivio Langpretation provides real-time neural speech translation across 120+ languages and dialects including Twi, Ga, Ewe, Yoruba, Hausa, Arabic, and French.";
      } else if (lower.includes('balance') || lower.includes('wallet') || lower.includes('meter')) {
        reply = "You can inspect your dual communication balances and fintech wallets anytime in the Universal Billing Hub.";
      } else if (lower.includes('ride') || lower.includes('driver') || lower.includes('trip')) {
        reply = "Nanivio Drive connects you directly to verified local drivers and airport chauffeurs with live GPS tracking and zero surge gouging.";
      } else {
        reply = `I understand you're asking about "${query}". I'm here to guide you across calling, rides, verified services, and billing. Tap "Open Full Studio" for extended capabilities!`;
      }

      setMessages((prev) => [...prev, { sender: 'malvi', text: reply }]);

      // Speak response if voice is not muted
      if (!isVoiceMuted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          const utterance = new SpeechSynthesisUtterance(reply);
          utterance.rate = 1.05;
          utterance.pitch = 1.05;
          utterance.onend = () => setAvatarState('warm_idle');
          window.speechSynthesis.speak(utterance);
        } catch {
          setAvatarState('warm_idle');
        }
      } else {
        setTimeout(() => setAvatarState('warm_idle'), 2000);
      }
    }, 900);
  };

  const toggleVoiceListen = () => {
    if (isListening) {
      setIsListening(false);
      setAvatarState('warm_idle');
      return;
    }

    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      try {
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRec();
        recognition.lang = 'en-US';
        recognition.interimResults = false;

        recognition.onstart = () => {
          setIsListening(true);
          setAvatarState('listening');
        };

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setIsListening(false);
          setAvatarState('warm_idle');
          handleSend(transcript);
        };

        recognition.onerror = () => {
          setIsListening(false);
          setAvatarState('warm_idle');
        };

        recognition.onend = () => {
          setIsListening(false);
          setAvatarState('warm_idle');
        };

        recognition.start();
      } catch {
        setIsListening(false);
      }
    } else {
      // Fallback quick prompt
      handleSend("What can you do, Malvi?");
    }
  };

  return (
    <aside
      aria-label="Malvi AI Floating Assistant"
      className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 flex flex-col items-end pointer-events-auto"
    >
      {/* Greeting Tooltip Banner */}
      {!isOpen && showGreetingTooltip && (
        <div className="mb-2 max-w-xs p-3 rounded-2xl bg-[#091120]/95 border border-emerald-500/30 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Malvi is Online</span>
            </div>
            <button
              onClick={() => setShowGreetingTooltip(false)}
              className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[11px] text-slate-300 mt-1 leading-snug">
            Tap to talk with Malvi for instant assistance with calls, Langpretation, rides, or billing.
          </p>
        </div>
      )}

      {/* Expanded Floating Assistant Drawer */}
      {isOpen && (
        <div
          className={`w-[90vw] sm:w-96 rounded-3xl bg-slate-950/95 border border-slate-800 shadow-2xl shadow-emerald-950/40 backdrop-blur-xl mb-3 overflow-hidden flex flex-col transition-all duration-300 ${
            isMinimized ? 'h-16' : 'h-[460px] max-h-[75vh]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-[#091120] to-[#040812] border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="relative w-8 h-8 rounded-full overflow-hidden border border-emerald-500/50 shadow-md">
                <MalviAvatar state={avatarState} size="sm" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-black text-white">Malvi AI</h4>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <p className="text-[9px] text-emerald-400/80 font-mono">Universal Companion</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsVoiceMuted(!isVoiceMuted)}
                className={`p-1.5 rounded-lg border transition-colors ${
                  isVoiceMuted
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                }`}
                title={isVoiceMuted ? 'Unmute voice replies' : 'Mute voice replies'}
              >
                {isVoiceMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  setActiveTab('malvi' as any);
                }}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition-colors"
                title="Open Full Malvi Screen"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition-colors"
                title={isMinimized ? 'Expand' : 'Minimize'}
              >
                {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 border border-slate-700/80 transition-colors"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Voice Waveform Activity */}
              {(isListening || avatarState === 'speaking') && (
                <div className="px-4 py-2 bg-[#060c18] border-b border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                    {isListening ? 'Listening...' : 'Malvi Speaking'}
                  </span>
                  <MalviVoiceWaveform isSpeaking={avatarState === 'speaking'} isListening={isListening} />
                </div>
              )}

              {/* Chat Thread Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-3.5 py-2 leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-br-none shadow-md'
                          : 'bg-slate-900/90 text-slate-200 border border-slate-800 rounded-bl-none shadow-sm'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Suggested Quick Prompts */}
              <div className="px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto border-t border-slate-800/60 scrollbar-none bg-slate-950/60">
                {['Who is Mr. Nifty?', 'Langpretation languages', 'Check my wallets', 'Call with translation'].map(
                  (action) => (
                    <button
                      key={action}
                      onClick={() => handleSend(action)}
                      className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-700/70 text-[10px] text-slate-300 hover:text-white whitespace-nowrap transition-colors shrink-0"
                    >
                      {action}
                    </button>
                  )
                )}
              </div>

              {/* Chat Input Bar */}
              <div className="p-2.5 bg-slate-950 border-t border-slate-800 flex items-center gap-1.5">
                <button
                  onClick={toggleVoiceListen}
                  className={`p-2 rounded-xl transition-all ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse shadow-md shadow-rose-500/30'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 border border-slate-700'
                  }`}
                  title={isListening ? 'Stop listening' : 'Speak to Malvi'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSend();
                  }}
                  placeholder="Ask Malvi anything..."
                  className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />

                <button
                  onClick={() => handleSend()}
                  disabled={!inputText.trim()}
                  className="p-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-emerald-500/20"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Main Hovering Action Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setShowGreetingTooltip(false);
        }}
        className="group relative flex items-center gap-2.5 p-1.5 sm:p-2 rounded-full bg-gradient-to-br from-[#091120] to-[#040812] hover:from-[#0d1b32] hover:to-[#07111e] border-2 border-emerald-500/60 hover:border-emerald-400 shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-300 cursor-pointer transform hover:scale-105 active:scale-95"
        title="Malvi Intelligent Universal Companion"
      >
        <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-full overflow-hidden flex items-center justify-center bg-slate-950 border border-emerald-500/40">
          <MalviAvatar state={avatarState} size="sm" />
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-950 animate-pulse" />
        </div>

        <div className="hidden sm:flex flex-col text-left pr-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black text-white group-hover:text-emerald-300 transition-colors">
              Malvi AI
            </span>
            <Sparkles className="w-3 h-3 text-emerald-400" />
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Universal Assistant</span>
        </div>
      </button>
    </aside>
  );
};
