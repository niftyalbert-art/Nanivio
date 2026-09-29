import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  PhoneCall,
  CreditCard,
  Globe,
  Stethoscope,
  ChevronRight,
  Zap,
  Radio,
  Square,
  FastForward,
  Headphones,
  History,
  Copy,
  Check,
  MessageSquare,
  Trash2,
  Brain,
  Database,
  Briefcase,
  Video,
  AlertTriangle,
} from 'lucide-react';
import { MalviAvatar } from './MalviAvatar';
import { MalviVoiceWaveform } from './MalviVoiceWaveform';
import { MalviStage3DVisual } from './MalviStage3DVisual';
import { MalviChatHistoryModal } from './MalviChatHistoryModal';
import { MalviMemoryInspectorModal } from './MalviMemoryInspectorModal';
import { MalviSubscriptionHub } from './MalviSubscriptionHub';
import { MalviBusinessCollaborationRoom } from './MalviBusinessCollaborationRoom';
import { useNanivio } from '../../context/NanivioContext';
import { MalviChatMessage, MalviAvatarState, MalviActionCommand, SUPPORTED_LANGUAGES, MalviContextMemory } from '../../types';
import { LangpretationIcon } from '../common/LangpretationIcon';
import { billingClient } from '../../lib/billingClient';

const MALVI_STORAGE_KEY = 'nanivio_malvi_chat_history_v1';

const INITIAL_GREETING: MalviChatMessage = {
  id: 'msg_malvi_welcome',
  sender: 'malvi',
  text: "Hello! I'm Malvi, the intelligent universal companion and navigation assistant of Nanivio, developed by Nanivio Tech. Gh. under the vision of Mr. Albert Kwabena Atta Panyi (Mr. Nifty). I'm connected to your live communication, Langpretation language engines, verified experts, businesses, and wallets. How can I assist you today?",
  timestamp: Date.now(),
  emotion: 'warm',
  suggestedActions: [
    'Who is Mr. Nifty?',
    'What is Nanivio’s vision?',
    'How much is in my wallets?',
    'Find verified doctors online',
  ],
};

const SUGGESTION_TOPICS = [
  {
    category: 'Vision & Ecosystem',
    icon: Sparkles,
    color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    prompts: [
      'Who is Mr. Nifty and what is Nanivio’s vision?',
      'What is the Nanivio digital ecosystem?',
      'What is Nanivio Tech. Gh.’s core philosophy?',
      'What future capabilities is Nanivio developing?',
    ],
  },
  {
    category: 'Contextual Memory',
    icon: Brain,
    color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    prompts: [
      'What is my Communication call balance and minutes remaining?',
      'What was the last message in my conversations?',
      'What were my latest call logs in Communication Hub?',
      'How many Langpretation minutes do I have remaining?',
    ],
  },
  {
    category: 'Langpretation',
    icon: Globe,
    color: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
    prompts: [
      'Connect English and Arabic with Langpretation',
      'How does receiver-language priority work in video calls?',
      'Can I translate a voice note in Twi and French?',
    ],
  },
  {
    category: 'Doctors & Experts',
    icon: Stethoscope,
    color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    prompts: [
      'Find verified telemedicine doctors online',
      'Connect me with legal counsel for trade law',
      'Are there Arabic-speaking legal experts online?',
    ],
  },
  {
    category: 'Communication & Minutes',
    icon: CreditCard,
    color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    prompts: [
      'How do I top up my Communication and call balance?',
      'How do I buy a 100-minute Langpretation bundle?',
      'What are the international calling rates for Ghana and UK?',
    ],
  },
  {
    category: 'Smart Calling',
    icon: PhoneCall,
    color: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
    prompts: [
      'Help me start a high-definition video call with translation',
      'What is the Smart Live Services Strip during calls?',
      'How do group video calls work on Nanivio?',
    ],
  },
];

export const MalviView: React.FC = () => {
  const {
    currentUser,
    myLanguage,
    appLanguage,
    speakingLanguage,
    translationLanguage,
    setActiveTab,
    setGlobalLangpretationEnabled,
    setSelectedExpert,
    experts,
    sendMoney,
    getMalviMemorySnapshot,
    wallets,
    currentPlan,
    malviSubscription,
    malviPlans,
    refreshBilling,
  } = useNanivio() as any;

  // Malvi Subscription Hub and Business Collaboration Room state
  const [isSubscriptionHubOpen, setIsSubscriptionHubOpen] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'companion' | 'business'>('companion');
  const [videoTrialRemaining, setVideoTrialRemaining] = useState<number>(() => {
    return malviSubscription?.videoInteractionMinutesRemaining ?? 3;
  });
  const [isTrialExhausted, setIsTrialExhausted] = useState<boolean>(() => {
    return (
      (malviSubscription?.tier === 'free' || !malviSubscription) &&
      (malviSubscription?.videoInteractionMinutesRemaining ?? 3) <= 0
    );
  });

  // Sync subscription state
  useEffect(() => {
    if (malviSubscription) {
      setVideoTrialRemaining(malviSubscription.videoInteractionMinutesRemaining ?? 0);
      if (malviSubscription.tier === 'free' && (malviSubscription.videoInteractionMinutesRemaining ?? 0) <= 0) {
        setIsTrialExhausted(true);
      } else {
        setIsTrialExhausted(false);
      }
    }
  }, [malviSubscription]);

  const [messages, setMessages] = useState<MalviChatMessage[]>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(MALVI_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch (err) {
      console.warn('Error loading persisted Malvi chat history:', err);
    }
    return [INITIAL_GREETING];
  });
  const [inputText, setInputText] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [avatarState, setAvatarState] = useState<MalviAvatarState>('idle');
  const [isListening, setIsListening] = useState(false);
  const [voiceSpeechEnabled, setVoiceSpeechEnabled] = useState(true);
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wakePhraseActive, setWakePhraseActive] = useState(false);
  const [currentlySpeakingText, setCurrentlySpeakingText] = useState<string | null>(null);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const currentLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === myLanguage) || SUPPORTED_LANGUAGES[0];

  const currentMemorySnapshot: MalviContextMemory = getMalviMemorySnapshot
    ? getMalviMemorySnapshot()
    : {
        wallets: [],
        recentTransactions: [],
        currentPlan: currentPlan
          ? {
              name: currentPlan.name,
              tier: currentPlan.tier,
              minutesRemaining: currentPlan.langpretationMinutesRemaining || 0,
              minutesQuota: currentPlan.langpretationMinutesQuota || 0,
              monthlyPriceGHS: currentPlan.monthlyPriceGHS,
              monthlyPriceUSD: currentPlan.monthlyPriceUSD,
            }
          : {
              name: 'Unsubscribed',
              tier: 'free',
              minutesRemaining: 0,
              minutesQuota: 0,
              monthlyPriceGHS: 0,
              monthlyPriceUSD: 0,
            },
        recentConversations: [],
        verifiedExperts: [],
        currentUser: {
          id: currentUser.id,
          name: currentUser.name,
          myLanguage: myLanguage,
          myLanguageName: currentLangObj.name,
          role: currentUser.role,
        },
        activeView: 'malvi',
        timestamp: Date.now(),
      };

  // Auto-persist messages to local storage whenever messages update
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(MALVI_STORAGE_KEY, JSON.stringify(messages));
      }
    } catch (err) {
      console.warn('Error saving Malvi chat history to localStorage:', err);
    }
  }, [messages]);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, avatarState, interimTranscript]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Web Speech API - Speech Synthesis (TTS) Playback with natural voice & interruption support
  const speakText = (text: string) => {
    if (!voiceSpeechEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = speechRate;
      utterance.pitch = 1.05;

      // Select high-quality natural female voice if available
      const voices = window.speechSynthesis.getVoices();
      let matchedVoice = voices.find(
        (v) =>
          (v.name.includes('Female') ||
            v.name.includes('Samantha') ||
            v.name.includes('Google UK English Female') ||
            v.name.includes('Google US English') ||
            v.name.includes('Karen') ||
            v.name.includes('Zira') ||
            v.name.includes('Victoria') ||
            v.name.includes('Natural')) &&
          (myLanguage === 'fr' ? v.lang.startsWith('fr') : myLanguage === 'ar' ? v.lang.startsWith('ar') : v.lang.startsWith('en'))
      );

      if (!matchedVoice && myLanguage !== 'en') {
        matchedVoice = voices.find((v) => v.lang.startsWith(myLanguage));
      }

      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }

      utterance.onstart = () => {
        setAvatarState('speaking');
        setCurrentlySpeakingText(text);
      };

      utterance.onend = () => {
        setAvatarState('idle');
        setCurrentlySpeakingText(null);

        // Hands-Free Conversational Voice Loop: If handsFreeMode is active, auto-listen for next user utterance
        if (handsFreeMode && !isProcessing) {
          setTimeout(() => {
            startSpeechRecognition();
          }, 350);
        }
      };

      utterance.onerror = (e) => {
        console.warn('Speech synthesis utterance error:', e);
        setAvatarState('idle');
        setCurrentlySpeakingText(null);
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
      setAvatarState('idle');
      setCurrentlySpeakingText(null);
    }
  };

  // Video interaction duration tick (every 10s of active speech or avatar listening, record 10s usage)
  useEffect(() => {
    if (malviSubscription?.tier === 'free' && isTrialExhausted) {
      return;
    }

    if (avatarState === 'speaking' || avatarState === 'listening' || isListening) {
      const interval = setInterval(async () => {
        try {
          const res = await billingClient.recordMalviVideoUsage(10);
          if (res && res.remainingMinutes !== undefined) {
            setVideoTrialRemaining(res.remainingMinutes);
            if (res.isTrialExhausted) {
              setIsTrialExhausted(true);
              if (voiceSpeechEnabled) {
                speakText(
                  'Your free 3-minute video trial with Malvi has concluded. Please subscribe to Malvi Basic, Premium, or Business to continue our interactive video companion experience.'
                );
              }
            }
          }
        } catch (e) {
          // ignore transient
        }
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [avatarState, isListening, malviSubscription, isTrialExhausted, voiceSpeechEnabled]);

  // Immediate Interruption Handler (Stops TTS instantly and transitions to listening)
  const interruptMalvi = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setCurrentlySpeakingText(null);
    setAvatarState('interrupted');
    setTimeout(() => {
      setAvatarState('idle');
    }, 300);
  };

  // Stop speaking
  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setCurrentlySpeakingText(null);
    if (avatarState === 'speaking' || avatarState === 'interrupted') {
      setAvatarState('idle');
    }
  };

  // Start speech recognition helper
  const startSpeechRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    // Stop speaking before listening
    stopSpeaking();

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true; // Real-time interim streaming!
      recognition.lang =
        myLanguage === 'ak'
          ? 'en-GH'
          : myLanguage === 'fr'
          ? 'fr-FR'
          : myLanguage === 'ar'
          ? 'ar-SA'
          : 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setAvatarState('listening');
        setInterimTranscript('');
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (interim) {
          setInterimTranscript(interim);
        }

        if (finalTranscript) {
          setInterimTranscript('');
          const trimmed = finalTranscript.trim();
          if (trimmed) {
            const lower = trimmed.toLowerCase();
            if (
              lower.startsWith('hi malvi') ||
              lower.startsWith('hey malvi') ||
              lower.startsWith('hello malvi') ||
              lower.startsWith('malvi')
            ) {
              setWakePhraseActive(true);
              setTimeout(() => setWakePhraseActive(false), 2000);
            }
            handleSendMessage(trimmed, 'voice');
          }
        }
      };

      recognition.onerror = (err: any) => {
        if (err.error !== 'no-speech') {
          console.warn('Speech recognition error:', err);
        }
        setIsListening(false);
        setInterimTranscript('');
        if (avatarState === 'listening') {
          setAvatarState('idle');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
        if (avatarState === 'listening') {
          setAvatarState('idle');
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('SpeechRecognition initialization error:', e);
      setIsListening(false);
      setInterimTranscript('');
      setAvatarState('idle');
    }
  };

  // Toggle Speech Recognition
  const toggleSpeechRecognition = () => {
    if (avatarState === 'speaking') {
      // Interruption: User taps mic while Malvi is talking
      interruptMalvi();
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
      setInterimTranscript('');
      setAvatarState('idle');
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please type your message.');
      return;
    }

    startSpeechRecognition();
  };

  // Send message to Malvi backend API & trigger vocal reply
  const handleSendMessage = async (textToSend?: string, mode: 'voice' | 'text' = 'text') => {
    const text = (textToSend || inputText).trim();
    if (!text || isProcessing) return;

    stopSpeaking();
    setInputText('');
    setInterimTranscript('');

    const userMessage: MalviChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: Date.now(),
      mode,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsProcessing(true);
    setAvatarState('thinking');

    try {
      const memoryPayload = getMalviMemorySnapshot ? getMalviMemorySnapshot() : undefined;

      const historyPayload = messages.slice(-8).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        text: m.text,
      }));

      const res = await fetch('/api/malvi/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          myLanguage,
          appLanguage,
          speakingLanguage,
          translationLanguage,
          currentPage: 'malvi',
          isAdmin: false,
          appContext: memoryPayload,
          contextMemory: memoryPayload,
        }),
      });

      const data = await res.json();

      if (data.success && data.reply) {
        const malviReply: MalviChatMessage = {
          id: `malvi_${Date.now()}`,
          sender: 'malvi',
          text: data.reply,
          timestamp: Date.now(),
          emotion: data.emotion || 'warm',
          detectedIntent: data.detectedIntent,
          suggestedActions: data.suggestedActions || [],
          actionCommand: data.actionCommand,
          proposal: data.proposal || null,
          isAdminResponse: data.isAdminResponse,
        };

        setMessages((prev) => [...prev, malviReply]);
        setAvatarState('idle');

        // Playback real-time voice response via Web Speech API
        if (voiceSpeechEnabled) {
          speakText(data.reply);
        }
      } else {
        throw new Error(data.error || 'Failed to get response');
      }
    } catch (error: any) {
      console.warn('Malvi chat error:', error);
      const fallbackReply: MalviChatMessage = {
        id: `malvi_err_${Date.now()}`,
        sender: 'malvi',
        text:
          "I'm right here with you. I can assist you directly with Langpretation, cross-border transfers, finding doctors, or smart calls across Nanivio.",
        timestamp: Date.now(),
        emotion: 'calm',
        suggestedActions: ['Turn on Langpretation', 'Browse Online Doctors', 'Check Communication Balance'],
      };
      setMessages((prev) => [...prev, fallbackReply]);
      setAvatarState('idle');
      if (voiceSpeechEnabled) {
        speakText(fallbackReply.text);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute integrated Nanivio action commands from Malvi
  const handleExecuteAction = (action: MalviActionCommand) => {
    if (!action) return;

    if (action.type === 'navigate' && action.target) {
      setActiveTab(action.target);
    } else if (action.type === 'langpretation') {
      if (action.enable !== undefined) {
        setGlobalLangpretationEnabled(action.enable);
      }
      setActiveTab('calls');
    } else if (action.type === 'find_expert') {
      if (action.expertName) {
        const found = experts.find((e: any) =>
          e.name.toLowerCase().includes(action.expertName!.toLowerCase())
        );
        if (found) {
          setSelectedExpert(found);
        }
      }
      setActiveTab('services');
    } else if (action.type === 'propose_send_money') {
      setActiveTab('billing');
    } else if (action.type === 'start_call') {
      setActiveTab('calls');
    }
  };

  // Execute and Authorize Structured Proposals (Fintech / Langpretation / Call)
  const handleConfirmProposal = async (msgId: string, proposal: any) => {
    if (proposal.type === 'transfer' && proposal.details) {
      const { recipient, amount, currency, channel } = proposal.details;
      const success = await sendMoney(
        recipient || 'Recipient',
        amount || 100,
        currency === 'GHS' ? 'GHS' : 'USD',
        channel || 'MTN MoMo',
        'Authorized via Malvi Voice & Natural Language'
      );

      if (success) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.proposal
              ? {
                  ...m,
                  proposal: { ...m.proposal, status: 'executed' },
                }
              : m
          )
        );

        const confirmReply: MalviChatMessage = {
          id: `malvi_conf_${Date.now()}`,
          sender: 'malvi',
          text: `Transfer of ${amount} ${currency} to ${recipient} has been authorized and completed successfully!`,
          timestamp: Date.now(),
          emotion: 'warm',
          suggestedActions: ['View Wallet Balance', 'View Transaction Receipt', 'Ask Malvi'],
        };
        setMessages((prev) => [...prev, confirmReply]);
        if (voiceSpeechEnabled) {
          speakText(confirmReply.text);
        }
      }
    } else if (proposal.type === 'langpretation') {
      setGlobalLangpretationEnabled(true);
      setActiveTab('calls');
    }
  };

  const handleCancelProposal = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.proposal
          ? {
              ...m,
              proposal: { ...m.proposal, status: 'cancelled' },
            }
          : m
      )
    );
  };

  const handleResetConversation = () => {
    stopSpeaking();
    setMessages([INITIAL_GREETING]);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(MALVI_STORAGE_KEY);
      }
    } catch (err) {
      console.warn('Failed to clear storage:', err);
    }
    setAvatarState('idle');
  };

  const handleCopyMessageText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4 w-full max-w-full overflow-x-hidden">
      {/* Top Identity Banner */}
      <div className="bg-[#0b1322] border border-cyan-500/30 rounded-3xl p-4 sm:p-5 shadow-xl relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3.5 z-10">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-emerald-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-md">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span>Malvi</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40">
                3D VOICE AI COMPANION
              </span>
            </h1>
            <p className="text-xs text-slate-300">
              Nanivio Human-Like AI • Real-Time Voice Conversation, Langpretation &amp; Service Navigation
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 z-10 justify-end">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <span>{currentLangObj.flag}</span>
            <span>{currentLangObj.name}</span>
          </span>

          {/* Persistent Chat History Button */}
          <button
            onClick={() => setIsHistoryModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 hover:border-cyan-500/60 text-xs font-bold text-cyan-300 hover:text-cyan-200 transition-all flex items-center gap-1.5 shadow-sm"
            title="Review past voice and text interactions with Malvi"
          >
            <History className="w-3.5 h-3.5 text-cyan-400" />
            <span>Chat History</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
              {messages.length}
            </span>
          </button>

          {/* Reset / New Chat Button */}
          <button
            onClick={handleResetConversation}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
            title="Start new conversation & clear history"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Malvi Subscription Hub Button */}
          <button
            onClick={() => setIsSubscriptionHubOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/20 to-teal-500/20 hover:from-cyan-500/30 hover:to-teal-500/30 border border-cyan-500/40 text-xs font-bold text-cyan-300 flex items-center gap-1.5 shadow-sm transition"
            title="View Malvi Subscription Plans (Basic, Premium, Business)"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Malvi Plans</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 font-mono uppercase text-cyan-200">
              {malviSubscription?.tier === 'malvi_business'
                ? 'Business'
                : malviSubscription?.tier === 'malvi_premium'
                ? 'Premium'
                : malviSubscription?.tier === 'malvi_basic'
                ? 'Basic'
                : 'Free'}
            </span>
          </button>

          <button
            onClick={() => setImmersiveMode(!immersiveMode)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              immersiveMode
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800'
            }`}
          >
            {immersiveMode ? 'Standard Split' : '3D Stage View'}
          </button>
        </div>
      </div>

      {/* Mode Navigation Tabs: Companion vs Business Collaboration Room */}
      <div className="flex items-center gap-2 p-1.5 bg-[#0b1322] border border-slate-800 rounded-2xl">
        <button
          onClick={() => setActiveSubTab('companion')}
          className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
            activeSubTab === 'companion'
              ? 'bg-gradient-to-r from-cyan-500/20 to-teal-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Video className="w-4 h-4 text-cyan-400" />
          <span>Interactive AI Companion</span>
          {malviSubscription?.tier === 'free' && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {videoTrialRemaining.toFixed(1)}m Trial
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('business')}
          className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
            activeSubTab === 'business'
              ? 'bg-gradient-to-r from-cyan-500/20 to-teal-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Briefcase className="w-4 h-4 text-cyan-400" />
          <span>Malvi Business Collaboration Room</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            Team AI Co-Pilot
          </span>
        </button>
      </div>

      {/* Trial Countdown / Exhaustion Alert Banner for Free Users */}
      {malviSubscription?.tier === 'free' && isTrialExhausted && activeSubTab === 'companion' && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/70 via-slate-900 to-amber-950/70 border border-amber-500/50 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>Free 3-Minute Video Trial Completed</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                  Trial Limit Reached
                </span>
              </div>
              <p className="text-xs text-slate-300">
                You have used your free introductory video interaction minutes with Malvi. Subscribe to Malvi Basic, Premium, or Business to continue continuous voice and video interaction.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsSubscriptionHubOpen(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-400 hover:from-amber-400 hover:to-orange-300 text-slate-950 font-bold text-xs shadow-lg shrink-0 flex items-center gap-1.5 transition"
          >
            <Sparkles className="w-3.5 h-3.5 fill-current" />
            <span>Subscribe for Full Experience</span>
          </button>
        </div>
      )}

      {/* Trial countdown ticker if free tier and still has minutes */}
      {malviSubscription?.tier === 'free' && !isTrialExhausted && activeSubTab === 'companion' && (
        <div className="p-2.5 px-4 rounded-xl bg-slate-900/90 border border-amber-500/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>
              Free User Trial: <strong className="text-amber-400 font-mono">{videoTrialRemaining.toFixed(1)} mins</strong> of interactive video companion remaining.
            </span>
          </div>
          <button
            onClick={() => setIsSubscriptionHubOpen(true)}
            className="text-cyan-400 hover:text-cyan-300 font-bold font-mono text-[11px] underline"
          >
            Upgrade Plan &rarr;
          </button>
        </div>
      )}

      {/* Real-time Contextual Memory Synchronizer Strip */}
      <div className="bg-[#0b1322]/90 border border-slate-800 hover:border-cyan-500/40 rounded-2xl p-3 px-4 shadow-lg flex flex-col md:flex-row items-center justify-between gap-3 text-xs transition-all">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-300 font-bold border border-emerald-500/30">
            <Brain className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Contextual Memory Layer Active</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-slate-400">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-emerald-300">
              <CreditCard className="w-3 h-3 text-emerald-400" />
              <span>Communication & Billing Hub</span>
            </span>

            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-cyan-300">
              <MessageSquare className="w-3 h-3 text-cyan-400" />
              <span>Real-time Messaging Active</span>
            </span>

            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-purple-300">
              <PhoneCall className="w-3 h-3 text-purple-400" />
              <span>{currentPlan?.langpretationMinutesRemaining ?? 15}m Langpretation</span>
            </span>

            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-emerald-300">
              <Stethoscope className="w-3 h-3 text-emerald-400" />
              <span>Services Directory</span>
            </span>
          </div>
        </div>

        <button
          onClick={() => setIsMemoryModalOpen(true)}
          className="w-full md:w-auto px-3.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 hover:border-cyan-500 flex items-center justify-center gap-1.5 transition-all text-xs shadow-sm"
        >
          <Database className="w-3.5 h-3.5 text-cyan-400" />
          <span>Inspect Context Memory</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* View Toggle: Companion vs Business Collaboration Room */}
      {activeSubTab === 'business' ? (
        <MalviBusinessCollaborationRoom
          onOpenSubscriptionHub={() => setIsSubscriptionHubOpen(true)}
        />
      ) : (
        /* Main Layout Grid: Bold 3D Stage on Left / Top + Conversation Stream */
        <div
          className={`grid gap-5 transition-all duration-300 ${
            immersiveMode ? 'grid-cols-1 max-w-4xl mx-auto' : 'grid-cols-1 lg:grid-cols-12 items-start'
          }`}
        >
        {/* Left / Top: Bold 3D Visual Stage */}
        <div className={immersiveMode ? 'w-full' : 'lg:col-span-5 xl:col-span-5'}>
          <div className="sticky top-20">
            <MalviStage3DVisual
              state={avatarState}
              isListening={isListening}
              isProcessing={isProcessing}
              currentlySpeakingText={currentlySpeakingText}
              interimTranscript={interimTranscript}
              voiceSpeechEnabled={voiceSpeechEnabled}
              handsFreeMode={handsFreeMode}
              speechRate={speechRate}
              onToggleMic={toggleSpeechRecognition}
              onInterrupt={interruptMalvi}
              onToggleVoice={() => {
                if (voiceSpeechEnabled) stopSpeaking();
                setVoiceSpeechEnabled(!voiceSpeechEnabled);
              }}
              onToggleHandsFree={() => {
                const next = !handsFreeMode;
                setHandsFreeMode(next);
                if (next && avatarState === 'idle') {
                  startSpeechRecognition();
                }
              }}
              onChangeSpeechRate={() => {
                const nextRate = speechRate === 1.0 ? 1.15 : speechRate === 1.15 ? 0.9 : 1.0;
                setSpeechRate(nextRate);
              }}
              onQuickPrompt={(prompt) => handleSendMessage(prompt)}
              immersiveMode={immersiveMode}
              onToggleImmersive={() => setImmersiveMode(!immersiveMode)}
            />
          </div>
        </div>

        {/* Right: Conversation Stream, Interactive Proposal Actions & Input Composer */}
        <div className={`space-y-4 ${immersiveMode ? 'w-full' : 'lg:col-span-7 xl:col-span-7'}`}>
          {/* Main Conversation Stream */}
          <div className="bg-[#090f1d] border border-slate-800/90 rounded-3xl p-4 sm:p-6 min-h-[440px] max-h-[580px] overflow-y-auto space-y-4 shadow-inner">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'malvi' && (
                  <div className="shrink-0 pt-0.5">
                    <MalviAvatar size="sm" state={avatarState === 'speaking' ? 'speaking' : 'idle'} showBadge={false} />
                  </div>
                )}

                <div
                  className={`max-w-[88%] sm:max-w-[80%] space-y-2.5 ${
                    msg.sender === 'user'
                      ? 'bg-emerald-600/90 text-white rounded-2xl rounded-tr-sm p-3.5 shadow-md'
                      : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl rounded-tl-sm p-4 shadow-lg'
                  }`}
                >
                  {/* Message Header for Malvi */}
                  {msg.sender === 'malvi' && (
                    <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-1.5">
                      <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-cyan-400" />
                        <span>Malvi</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {msg.emotion && (
                          <span className="text-[9px] px-2 py-0.2 rounded-full bg-slate-800 text-slate-300 uppercase tracking-wider font-mono">
                            {msg.emotion}
                          </span>
                        )}
                        {/* Replay voice button for this message */}
                        <button
                          onClick={() => speakText(msg.text)}
                          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors"
                          title="Play voice response"
                        >
                          <Headphones className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Message Body Text */}
                  <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                  {/* Contextual Action Card Attachment */}
                  {msg.actionCommand && (
                    <div className="pt-1">
                      <div className="p-3 rounded-xl bg-slate-950/80 border border-cyan-500/30 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {msg.actionCommand.type === 'navigate' ? (
                            <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
                          ) : msg.actionCommand.type === 'langpretation' ? (
                            <LangpretationIcon size={16} glow={true} />
                          ) : msg.actionCommand.type === 'find_expert' ? (
                            <Stethoscope className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <CreditCard className="w-4 h-4 text-emerald-400 shrink-0" />
                          )}
                          <div>
                            <div className="text-[11px] font-bold text-white">
                              {msg.actionCommand.type === 'navigate'
                                ? `Go to ${msg.actionCommand.target?.toUpperCase()}`
                                : msg.actionCommand.type === 'langpretation'
                                ? 'Enable Langpretation'
                                : msg.actionCommand.type === 'find_expert'
                                ? `Discover ${msg.actionCommand.category || 'Experts'}`
                                : 'Communication & Billing'}
                            </div>
                            <div className="text-[9px] text-slate-400">One-tap direct Nanivio action</div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleExecuteAction(msg.actionCommand!)}
                          className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition-all shrink-0"
                        >
                          <span>Take Me</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* High-Consequence Proposal Card (Fintech / Langpretation Confirmation) */}
                  {msg.proposal && (
                    <div className="pt-2">
                      <div
                        className={`p-3.5 rounded-xl border ${
                          msg.proposal.status === 'executed'
                            ? 'bg-emerald-950/40 border-emerald-500/40'
                            : msg.proposal.status === 'cancelled'
                            ? 'bg-slate-950/40 border-slate-700/60 opacity-60'
                            : 'bg-slate-950/90 border-amber-500/40 shadow-lg'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                            <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                              {msg.proposal.title}
                            </span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
                            {msg.proposal.status === 'executed'
                              ? '✓ Authorized'
                              : msg.proposal.status === 'cancelled'
                              ? 'Cancelled'
                              : 'Action Proposal'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-300 mb-3">{msg.proposal.description}</p>

                        {/* Proposal Details breakdown */}
                        {msg.proposal.details && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] mb-3">
                            {msg.proposal.details.recipient && (
                              <div>
                                <span className="text-slate-500 block text-[9px]">Recipient:</span>
                                <span className="font-semibold text-slate-200">{msg.proposal.details.recipient}</span>
                              </div>
                            )}
                            {msg.proposal.details.amount && (
                              <div>
                                <span className="text-slate-500 block text-[9px]">Amount:</span>
                                <span className="font-semibold text-amber-300">
                                  {msg.proposal.details.amount} {msg.proposal.details.currency || 'USD'}
                                </span>
                              </div>
                            )}
                            {msg.proposal.details.channel && (
                              <div>
                                <span className="text-slate-500 block text-[9px]">Channel:</span>
                                <span className="font-semibold text-slate-200">{msg.proposal.details.channel}</span>
                              </div>
                            )}
                            {msg.proposal.details.fee !== undefined && (
                              <div>
                                <span className="text-slate-500 block text-[9px]">Platform Fee:</span>
                                <span className="font-semibold text-slate-300">${msg.proposal.details.fee}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Proposal Actions */}
                        {msg.proposal.status !== 'executed' && msg.proposal.status !== 'cancelled' && (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => handleConfirmProposal(msg.id, msg.proposal)}
                              className="flex-1 py-2 px-3 rounded-lg bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Confirm &amp; Authorize</span>
                            </button>
                            <button
                              onClick={() => handleCancelProposal(msg.id)}
                              className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-medium text-xs transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Suggested Follow-Up Action Chips */}
                  {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Suggested follow-ups:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.suggestedActions.map((sug, i) => (
                          <button
                            key={i}
                            onClick={() => handleSendMessage(sug)}
                            className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 text-cyan-200 transition-all text-left"
                          >
                            {sug}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Message Bubble Footer: Mode tag, copy, voice replay, and timestamp */}
                  <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-slate-400 border-t border-slate-800/40">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-950/60 border border-slate-800 text-[9px] flex items-center gap-1">
                        {msg.mode === 'voice' ? (
                          <>
                            <Mic className="w-2.5 h-2.5 text-cyan-400" />
                            <span>Voice</span>
                          </>
                        ) : (
                          <>
                            <MessageSquare className="w-2.5 h-2.5 text-slate-400" />
                            <span>Text</span>
                          </>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopyMessageText(msg.id, msg.text)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        title="Copy message"
                      >
                        {copiedMsgId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <span className="text-[9px] text-slate-500 font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Real-Time Live Speech Recognition Interim Preview */}
            {isListening && interimTranscript && (
              <div className="flex gap-3 items-center justify-end">
                <div className="p-3.5 rounded-2xl rounded-tr-sm bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                  <span className="italic">&ldquo;{interimTranscript}&rdquo;</span>
                </div>
              </div>
            )}

            {/* Live Thinking / Generating Bubble */}
            {isProcessing && (
              <div className="flex gap-3 items-center">
                <MalviAvatar size="sm" state="thinking" showBadge={false} />
                <div className="p-3.5 rounded-2xl rounded-tl-sm bg-slate-900 border border-slate-800 flex items-center gap-2 text-xs text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span>Malvi is reasoning &amp; drafting vocal response...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Contextual Topics / Quick Prompts Tray */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
              Explore with Malvi
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SUGGESTION_TOPICS.map((topic, idx) => {
                const Icon = topic.icon;
                return (
                  <div
                    key={idx}
                    className="bg-[#0b1322] border border-slate-800 hover:border-cyan-500/40 p-3 rounded-2xl space-y-2 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg border ${topic.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-white">{topic.category}</span>
                    </div>
                    <div className="space-y-1">
                      {topic.prompts.slice(0, 2).map((p, pIdx) => (
                        <button
                          key={pIdx}
                          onClick={() => handleSendMessage(p)}
                          className="w-full text-left text-[11px] text-slate-400 hover:text-cyan-300 truncate hover:underline flex items-center justify-between"
                        >
                          <span className="truncate">{p}</span>
                          <ChevronRight className="w-3 h-3 shrink-0 text-slate-600" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Input Bar & Voice Controls */}
          <div className="bg-[#0b1322] border border-slate-800 rounded-3xl p-3 sm:p-4 shadow-xl space-y-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              {/* Microphone Voice Recognition Toggle */}
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                className={`p-3 rounded-2xl flex items-center justify-center transition-all ${
                  isListening
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/40 animate-pulse'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80'
                }`}
                title={isListening ? 'Stop listening' : 'Start real-time voice speech recognition'}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Text Input */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  isListening
                    ? 'Listening to your voice in real time...'
                    : `Speak or ask Malvi anything in ${currentLangObj.name} or English...`
                }
                className="flex-1 bg-slate-900/90 border border-slate-800 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/40 rounded-2xl px-4 py-3 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none transition-all"
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={!inputText.trim() || isProcessing}
                className={`p-3 rounded-2xl flex items-center justify-center font-bold transition-all ${
                  inputText.trim() && !isProcessing
                    ? 'bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 hover:opacity-90 shadow-md shadow-cyan-500/20'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
                title="Send to Malvi"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>

            <div className="flex items-center justify-between text-[10px] text-slate-500 px-2">
              <span>Web Speech API Real-Time STT/TTS • Hands-Free Conversational Voice Loop</span>
              <span className="font-mono">v2.5 Voice Engine</span>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Persistent Chat History Review Modal */}
      <MalviChatHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        messages={messages}
        onReplayVoice={(text) => speakText(text)}
        onClearHistory={handleResetConversation}
        onSelectPrompt={(text) => {
          handleSendMessage(text, 'text');
        }}
      />

      {/* Contextual Memory Layer Inspector Modal */}
      <MalviMemoryInspectorModal
        isOpen={isMemoryModalOpen}
        onClose={() => setIsMemoryModalOpen(false)}
        memory={currentMemorySnapshot}
        onSelectPrompt={(text) => {
          handleSendMessage(text, 'text');
        }}
      />

      {/* Malvi Subscription Hub Modal */}
      <MalviSubscriptionHub
        isOpen={isSubscriptionHubOpen}
        onClose={() => setIsSubscriptionHubOpen(false)}
        onSuccess={() => {
          setIsSubscriptionHubOpen(false);
          refreshBilling();
        }}
      />
    </div>
  );
};

