import React, { useState, useEffect } from 'react';
import {
  Phone,
  Video,
  Delete,
  AlertTriangle,
  CheckCircle2,
  Users,
  Search,
  Sparkles,
  Radio,
  ArrowRight,
  ShieldAlert,
  X,
  Volume2,
  UserCheck,
  MessageSquare,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { Participant, SavedContact } from '../../types';
import { playDtmfTone, playErrorBuzzer } from '../../utils/dtmfTones';
import { lookupNanivioUser, normalizeNanivioNumber } from '../../utils/userLookup';

interface DialerKey {
  digit: string;
  sub: string;
}

const KEYPAD_KEYS: DialerKey[] = [
  { digit: '1', sub: '~' },
  { digit: '2', sub: 'ABC' },
  { digit: '3', sub: 'DEF' },
  { digit: '4', sub: 'GHI' },
  { digit: '5', sub: 'JKL' },
  { digit: '6', sub: 'MNO' },
  { digit: '7', sub: 'PQRS' },
  { digit: '8', sub: 'TUV' },
  { digit: '9', sub: 'WXYZ' },
  { digit: '*', sub: '+' },
  { digit: '0', sub: '+' },
  { digit: '#', sub: '#' },
];

export const PhoneDialerCallingPage: React.FC = () => {
  const { start1on1Call, contacts, setActiveTab, startDirectChatByNvId, startDirectChatWithUser } = useNanivio();
  const [dialedNumber, setDialedNumber] = useState('');
  const [matchedContact, setMatchedContact] = useState<Participant | null>(null);
  const [isDialing, setIsDialing] = useState(false);
  const [wrongNumberPrompt, setWrongNumberPrompt] = useState<{
    isOpen: boolean;
    number: string;
    message: string;
  } | null>(null);

  // Live match contact while typing
  useEffect(() => {
    const clean = normalizeNanivioNumber(dialedNumber);
    if (clean.length >= 4 && contacts.length > 0) {
      const match = contacts.find(
        (c) => normalizeNanivioNumber(c.nvId || '') === clean || (c.nvId && c.nvId.includes(clean))
      );
      if (match) {
        setMatchedContact({
          id: match.id,
          nvId: match.nvId,
          name: match.name,
          avatar: match.avatar,
          initials: match.initials,
          myLanguage: match.preferredLanguage || 'en',
          role: 'user',
        });
      } else {
        setMatchedContact(null);
      }
    } else {
      setMatchedContact(null);
    }
  }, [dialedNumber, contacts]);

  // Keypad click handler with audio DTMF feedback
  const handleKeyPress = (digit: string) => {
    playDtmfTone(digit);
    setDialedNumber((prev) => (prev.length < 15 ? prev + digit : prev));
  };

  const handleBackspace = () => {
    setDialedNumber((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setDialedNumber('');
    setMatchedContact(null);
  };

  // Initiate call after entering valid NV number (supports audio or video)
  const handleInitiateCall = async (overrideNumber?: string, type: 'audio' | 'video' = 'audio') => {
    const numberToCall = (overrideNumber || dialedNumber).trim();
    const clean = normalizeNanivioNumber(numberToCall);

    if (!clean || clean.length < 4) {
      setWrongNumberPrompt({
        isOpen: true,
        number: numberToCall || 'Empty',
        message: 'Please enter a valid 10-digit Nanivio number (NV 0486XXXXXX) before pressing call.',
      });
      playErrorBuzzer();
      return;
    }

    setIsDialing(true);

    try {
      // Lookup the number across verified directory and backend
      const recipient = await lookupNanivioUser(numberToCall);

      if (recipient) {
        // Valid NV user found: call straight away with selected audio/video mode!
        playDtmfTone('5', 180);
        start1on1Call(recipient, type);
      } else {
        // Wrong number or never exist
        playErrorBuzzer();
        setWrongNumberPrompt({
          isOpen: true,
          number: numberToCall,
          message: `The dialed Nanivio number "${numberToCall}" is not reachable. Please verify the 10-digit Nanivio number (NV 0486XXXXXX) and try again.`,
        });
      }
    } catch (err) {
      playErrorBuzzer();
      setWrongNumberPrompt({
        isOpen: true,
        number: numberToCall,
        message: 'Could not connect to the Nanivio directory server. Please check your network connection.',
      });
    } finally {
      setIsDialing(false);
    }
  };

  // Initiate direct chat from dialer
  const handleInitiateChat = async (overrideNumber?: string) => {
    const numberToChat = (overrideNumber || dialedNumber).trim();
    const clean = normalizeNanivioNumber(numberToChat);

    if (!clean || clean.length < 4) {
      setWrongNumberPrompt({
        isOpen: true,
        number: numberToChat || 'Empty',
        message: 'Please enter a valid Nanivio number (NV 0486XXXXXX) before starting a chat.',
      });
      playErrorBuzzer();
      return;
    }

    setIsDialing(true);
    try {
      const res = await startDirectChatByNvId(clean);
      if (!res.success) {
        playErrorBuzzer();
        setWrongNumberPrompt({
          isOpen: true,
          number: numberToChat,
          message: res.error || `The destination number "${numberToChat}" could not be found for direct chat.`,
        });
      }
    } catch (err) {
      playErrorBuzzer();
      setWrongNumberPrompt({
        isOpen: true,
        number: numberToChat,
        message: 'Unable to initiate chat. Please check your network and try again.',
      });
    } finally {
      setIsDialing(false);
    }
  };

  const handleQuickDial = (contact: Participant, type: 'audio' | 'video' = 'audio') => {
    playDtmfTone('2', 150);
    start1on1Call(contact, type);
  };

  const handleQuickChat = async (contact: Participant) => {
    playDtmfTone('7', 150);
    await startDirectChatWithUser(contact);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* WRONG NUMBER / DOES NOT EXIST PROMPT MODAL */}
      {wrongNumberPrompt && wrongNumberPrompt.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
          <div
            id="modal-wrong-number"
            className="w-full max-w-md bg-[#0a1220] border-2 border-rose-500/60 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-500/50 mx-auto flex items-center justify-center text-rose-400 animate-bounce">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-white">Wrong Number or Never Exists</h2>
              <div className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-rose-300 inline-block">
                Dialed: {wrongNumberPrompt.number}
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pt-1">
                {wrongNumberPrompt.message}
              </p>
            </div>

            <div className="bg-slate-950/90 border border-slate-800/80 rounded-2xl p-3 text-left space-y-1.5">
              <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Nanivio Number Guidelines:</span>
              </div>
              <p className="text-[11px] text-slate-400">
                All Nanivio user numbers strictly start with <strong className="text-emerald-400 font-mono">0486</strong> followed by 6 unique digits (e.g.{' '}
                <span className="text-emerald-300 font-mono">0486482190</span>).
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                id="btn-dismiss-wrong-number"
                onClick={() => setWrongNumberPrompt(null)}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
              >
                Dismiss
              </button>
              <button
                id="btn-retry-dial"
                onClick={() => {
                  setWrongNumberPrompt(null);
                  handleClear();
                }}
                className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors shadow-lg shadow-rose-600/30"
              >
                Clear &amp; Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SMARTPHONE CALLING PAGE CONTAINER */}
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: THE PHYSICAL PHONE DIALER INTERFACE */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div className="w-full max-w-sm sm:max-w-md bg-gradient-to-b from-[#0e1726] to-[#080f1d] border border-slate-700/80 rounded-[2.5rem] p-5 sm:p-7 shadow-2xl relative overflow-hidden">
            {/* Top Ear Piece Speaker & Telecom Status */}
            <div className="flex flex-col items-center mb-4">
              <div className="w-16 h-1.5 bg-slate-700 rounded-full mb-3 shadow-inner" />
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono font-bold text-slate-300 tracking-wider uppercase">
                  Nanivio Network
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                  E2EE VOICE &amp; VIDEO
                </span>
              </div>
            </div>

            {/* SCREEN DISPLAY & NUMBER INPUT */}
            <div className="bg-[#050b14] border border-slate-800 rounded-2xl p-4 mb-5 shadow-inner relative flex flex-col justify-center min-h-[115px]">
              <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <span>Routing:</span>
                  <span className="text-slate-200 font-bold">
                    ✨ Nanivio HD E2EE Direct Line
                  </span>
                </span>
                <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>NV USER CORE</span>
                </span>
              </div>

              {/* Input & Display */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono font-bold text-emerald-300 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>NV</span>
                </div>

                <div className="flex-1">
                  <input
                    id="input-nanivio-dial-number"
                    type="text"
                    value={dialedNumber}
                    onChange={(e) => setDialedNumber(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleInitiateCall();
                    }}
                    placeholder="0486XXXXXX"
                    className="w-full bg-transparent font-mono text-lg sm:text-2xl font-black text-white tracking-wider placeholder-slate-600 focus:outline-none"
                  />
                </div>

                {dialedNumber && (
                  <button
                    id="btn-dialer-backspace"
                    onClick={handleBackspace}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all shrink-0 cursor-pointer"
                    title="Backspace"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Matched Contact Peek if typing recognized NV number */}
              {matchedContact && (
                <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2 truncate">
                    <img
                      src={matchedContact.avatar}
                      alt={matchedContact.name}
                      className="w-6 h-6 rounded-full object-cover border border-emerald-400/50"
                    />
                    <span className="text-xs font-bold text-emerald-300 truncate">
                      {matchedContact.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({matchedContact.nvId?.startsWith('NV ') ? matchedContact.nvId : `NV ${matchedContact.nvId}`})
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleInitiateCall(matchedContact.nvId, 'audio')}
                      className="p-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 transition-colors"
                      title="Audio Call"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleInitiateCall(matchedContact.nvId, 'video')}
                      className="p-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 transition-colors"
                      title="Video Call"
                    >
                      <Video className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleInitiateChat(matchedContact.nvId)}
                      className="p-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500 text-indigo-300 hover:text-slate-950 transition-colors"
                      title="Start Chat"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* NUMERIC KEYPAD GRID (1 to #) */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
              {KEYPAD_KEYS.map((key) => (
                <button
                  key={key.digit}
                  id={`keypad-btn-${key.digit === '*' ? 'star' : key.digit === '#' ? 'hash' : key.digit}`}
                  type="button"
                  onClick={() => handleKeyPress(key.digit)}
                  className="group relative flex flex-col items-center justify-center h-16 sm:h-18 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-slate-600 transition-all shadow-md cursor-pointer select-none"
                >
                  <span className="text-2xl sm:text-3xl font-bold text-white group-hover:text-emerald-300 transition-colors">
                    {key.digit}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 group-hover:text-slate-300 uppercase tracking-widest leading-none mt-0.5">
                    {key.sub}
                  </span>
                </button>
              ))}
            </div>

            {/* CALL ACTION BUTTONS (Audio, Video, Chat, Clear) */}
            <div className="flex items-center justify-center gap-3 sm:gap-4 pt-1">
              {/* Clear button */}
              {dialedNumber ? (
                <button
                  id="btn-clear-dialpad"
                  type="button"
                  onClick={handleClear}
                  className="w-11 h-11 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center border border-slate-800 transition-all shrink-0"
                  title="Clear all digits"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <div className="w-11 h-11" />
              )}

              {/* 1. Big Green Audio Call Button */}
              <button
                id="btn-place-audio-call"
                type="button"
                onClick={() => handleInitiateCall(undefined, 'audio')}
                disabled={isDialing}
                className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 hover:from-emerald-500 hover:to-teal-300 active:scale-90 text-slate-950 flex flex-col items-center justify-center shadow-xl shadow-emerald-500/40 border-2 border-emerald-300 transition-all hover:scale-105 cursor-pointer disabled:opacity-50"
                title="Start Audio Call"
              >
                <Phone className="w-7 h-7 fill-slate-950 text-slate-950" />
              </button>

              {/* 2. Cyan Video Call Button */}
              <button
                id="btn-place-video-call"
                type="button"
                onClick={() => handleInitiateCall(undefined, 'video')}
                disabled={isDialing}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-cyan-600 via-cyan-500 to-sky-400 hover:from-cyan-500 hover:to-sky-300 active:scale-90 text-slate-950 flex items-center justify-center shadow-xl shadow-cyan-500/40 border-2 border-cyan-300 transition-all hover:scale-105 cursor-pointer disabled:opacity-50"
                title="Start Video Call"
              >
                <Video className="w-6 h-6 fill-slate-950 text-slate-950" />
              </button>

              {/* 3. Direct Chat Button */}
              <button
                id="btn-place-chat"
                type="button"
                onClick={() => handleInitiateChat()}
                disabled={isDialing}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-indigo-600/90 hover:bg-indigo-500 active:scale-90 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 border border-indigo-400/40 transition-all hover:scale-105 cursor-pointer disabled:opacity-50"
                title="Start Direct Chat"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
            </div>

            {/* Prompt subtext */}
            <div className="text-center mt-5 pt-3 border-t border-slate-800/80">
              <p className="text-[11px] text-slate-400">
                Enter a 10-digit Nanivio number (0486XXXXXX) for instant HD Audio, Video, or Chat.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SPEED DIAL DIRECTORY & QUICK TEST CONTACTS */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#0b1424] border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm sm:text-base font-black text-white">
                  Speed Dial &amp; Directory
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Audio · Video · Chat
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Select any registered Nanivio contact below to initiate an instant HD voice call, video call, or translated direct chat:
            </p>

            {/* Contacts Speed Dial Cards */}
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {contacts.length === 0 ? (
                <div className="py-8 px-4 text-center rounded-2xl bg-slate-900/50 border border-slate-800 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                    <Users className="w-6 h-6 text-slate-500" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-200">No Saved Contacts</h4>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                      Add friends, colleagues, or businesses to your contacts to access 1-tap HD speed dial here.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('contacts')}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md inline-flex items-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Go to Contacts Directory</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-mono font-bold text-emerald-400 mb-2">
                    My Saved Contacts ({contacts.length})
                  </div>
                  {contacts.map((c) => {
                    const participant: Participant = {
                      id: c.id,
                      nvId: c.nvId,
                      name: c.name,
                      avatar: c.avatar,
                      initials: c.initials,
                      myLanguage: c.preferredLanguage || 'en',
                      role: 'user',
                    };

                    return (
                      <div
                        key={c.id}
                        className="p-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800/80 hover:border-emerald-500/30 flex items-center justify-between gap-3 transition-all group"
                      >
                        <div
                          onClick={() => handleQuickDial(participant, 'audio')}
                          className="flex items-center gap-3 truncate flex-1 cursor-pointer"
                        >
                          <img
                            src={c.avatar}
                            alt={c.name}
                            className="w-10 h-10 rounded-full object-cover border border-slate-700 group-hover:border-emerald-400/50"
                          />
                          <div className="truncate">
                            <div className="text-xs font-bold text-white group-hover:text-emerald-300 truncate">
                              {c.name}
                            </div>
                            <div className="text-[11px] font-mono text-emerald-400 font-semibold">
                              NV: {c.nvId || '0486XXXXXX'}
                            </div>
                            {c.notes && (
                              <div className="text-[10px] text-slate-400 truncate">{c.notes}</div>
                            )}
                          </div>
                        </div>

                        {/* Quick action buttons for Audio, Video, and Chat */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Audio */}
                          <button
                            onClick={() => handleQuickDial(participant, 'audio')}
                            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-emerald-500 text-slate-300 hover:text-slate-950 flex items-center justify-center transition-all shadow-sm"
                            title={`Audio call ${c.name}`}
                          >
                            <Phone className="w-3.5 h-3.5 fill-current" />
                          </button>
                          {/* Video */}
                          <button
                            onClick={() => handleQuickDial(participant, 'video')}
                            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-cyan-500 text-slate-300 hover:text-slate-950 flex items-center justify-center transition-all shadow-sm"
                            title={`Video call ${c.name}`}
                          >
                            <Video className="w-3.5 h-3.5 fill-current" />
                          </button>
                          {/* Chat */}
                          <button
                            onClick={() => handleQuickChat(participant)}
                            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-indigo-500 text-slate-300 hover:text-white flex items-center justify-center transition-all shadow-sm"
                            title={`Chat with ${c.name}`}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Verified Nanivio Network Directory */}
              {/* Dynamic Contacts Directory */}
              <div className="pt-3 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-[10px] uppercase font-mono font-bold text-slate-400">
                  <span>Saved Network Directory</span>
                  <span className="text-emerald-400">{contacts.length} Contacts</span>
                </div>

                {contacts.length === 0 ? (
                  <div className="p-4 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-xs text-slate-400">
                    No saved contacts yet. Dial any 10-digit Nanivio ID above to start calling or chatting.
                  </div>
                ) : (
                  contacts.slice(0, 8).map((item) => (
                    <div
                      key={item.id || item.nvId}
                      className="p-2.5 rounded-2xl bg-slate-900/60 hover:bg-slate-800 border border-slate-800/80 hover:border-emerald-500/40 flex items-center justify-between gap-3 transition-all"
                    >
                      <div
                        onClick={() => {
                          setDialedNumber(item.nvId);
                          handleInitiateCall(item.nvId, 'audio');
                        }}
                        className="flex items-center gap-2.5 truncate flex-1 cursor-pointer"
                      >
                        {item.avatar ? (
                          <img
                            src={item.avatar}
                            alt={item.name}
                            className="w-9 h-9 rounded-full object-cover border border-slate-700"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-emerald-400 font-mono shrink-0">
                            {item.initials || item.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="truncate">
                          <div className="text-xs font-bold text-slate-100 hover:text-emerald-300 truncate flex items-center gap-1.5">
                            <span>{item.name}</span>
                            {item.isExpert && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-normal">
                                Expert
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-emerald-400 font-semibold">
                            NV: {item.nvId}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setDialedNumber(item.nvId);
                            handleInitiateCall(item.nvId, 'audio');
                          }}
                          className="w-7 h-7 rounded-full bg-slate-800 hover:bg-emerald-500 text-slate-300 hover:text-slate-950 flex items-center justify-center transition-all shadow-sm"
                          title={`Audio call ${item.name}`}
                        >
                          <Phone className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDialedNumber(item.nvId);
                            handleInitiateCall(item.nvId, 'video');
                          }}
                          className="w-7 h-7 rounded-full bg-slate-800 hover:bg-cyan-500 text-slate-300 hover:text-slate-950 flex items-center justify-center transition-all shadow-sm"
                          title={`Video call ${item.name}`}
                        >
                          <Video className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDialedNumber(item.nvId);
                            handleInitiateChat(item.nvId);
                          }}
                          className="w-7 h-7 rounded-full bg-slate-800 hover:bg-indigo-500 text-slate-300 hover:text-white flex items-center justify-center transition-all shadow-sm"
                          title={`Chat with ${item.name}`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
