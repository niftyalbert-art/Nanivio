import React, { useState } from 'react';
import {
  X,
  Phone,
  Video,
  Delete,
  Users,
  ShieldCheck,
  Radio,
  Sparkles,
  PhoneCall,
  MessageSquare,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { Participant } from '../../types';
import { lookupNanivioUser } from '../../utils/userLookup';

interface PhoneDialerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PhoneDialerModal: React.FC<PhoneDialerModalProps> = ({ isOpen, onClose }) => {
  const {
    currentUser,
    start1on1Call,
    startDirectChatWithUser,
    contacts,
    globalLangpretationEnabled,
  } = useNanivio();

  const [dialedNumber, setDialedNumber] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const handleKeypadPress = (val: string) => {
    if (dialedNumber.length >= 15) return;
    setDialedNumber((prev) => prev + val);
    setLookupError(null);
  };

  const handleBackspace = () => {
    setDialedNumber((prev) => prev.slice(0, -1));
    setLookupError(null);
  };

  const handleClear = () => {
    setDialedNumber('');
    setLookupError(null);
  };

  const handleInitiateCall = async (targetNum: string, type: 'audio' | 'video') => {
    const rawNumber = targetNum.replace(/\s+/g, '');
    if (!rawNumber) {
      setLookupError('Please enter a valid Nanivio number to place a call.');
      return;
    }

    setIsVerifying(true);
    setLookupError(null);

    try {
      const realUser = await lookupNanivioUser(rawNumber);
      if (!realUser) {
        setLookupError(`NV Number "${rawNumber}" is not yet registered on the Nanivio network. Waiting for a real subscriber.`);
        setIsVerifying(false);
        return;
      }

      onClose();
      start1on1Call(realUser, type, globalLangpretationEnabled);
    } catch (err: any) {
      setLookupError(err.message || 'Error locating subscriber on network');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleInitiateChat = async (targetNum: string) => {
    const rawNumber = targetNum.replace(/\s+/g, '');
    if (!rawNumber) return;

    setIsVerifying(true);
    setLookupError(null);

    try {
      const realUser = await lookupNanivioUser(rawNumber);
      if (!realUser) {
        setLookupError(`NV Number "${rawNumber}" is not yet registered on the Nanivio network.`);
        setIsVerifying(false);
        return;
      }

      const targetUser = {
        id: realUser.id,
        name: realUser.name,
        avatar: realUser.avatar || '',
        initials: realUser.initials || 'NV',
        email: `${realUser.nvId || realUser.id}@nanivio.net`,
        nanivioNumber: realUser.nvId || rawNumber,
        role: (realUser.role as any) || 'user',
        balanceGHS: 0,
        balanceUSD: 0,
        verified: true,
        country: realUser.country || 'Ghana',
        preferredLanguage: realUser.myLanguage || 'en',
      };

      onClose();
      startDirectChatWithUser(targetUser);
    } catch (err: any) {
      setLookupError(err.message || 'Error connecting to subscriber');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-[#0b1424] border border-slate-700 rounded-3xl p-5 sm:p-6 max-w-4xl w-full shadow-2xl space-y-5 my-auto max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Nanivio Phone Dialer</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                  NV Lines Only
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Direct HD WebRTC calling with live Multilateral Langpretation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Dialer Keypad Section */}
          <div className="lg:col-span-6 bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 space-y-4">
            {/* Number Display with NV prefix */}
            <div className="bg-[#080d1a] border border-slate-700/80 rounded-2xl p-4 text-center relative">
              <div className="text-[10px] uppercase font-mono text-slate-500 tracking-wider">
                Nanivio Line Display
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-widest text-emerald-400 flex items-center justify-center gap-2 mt-1 min-h-[40px]">
                <span className="text-slate-500 text-lg font-bold">NV</span>
                <span>{dialedNumber || '0486XXXXXX'}</span>
              </div>
              {dialedNumber && (
                <button
                  onClick={handleBackspace}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-slate-800/60 transition-colors cursor-pointer"
                  title="Backspace"
                >
                  <Delete className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Error or Verification Banner */}
            {isVerifying && (
              <div className="flex items-center justify-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 py-2 px-3 rounded-xl animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Checking Nanivio directory for active subscriber...</span>
              </div>
            )}
            {lookupError && (
              <div className="flex items-start gap-2 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 py-2.5 px-3 rounded-xl">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{lookupError}</span>
              </div>
            )}

            {/* Keypad Grid */}
            <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto">
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
              ].map((k) => (
                <button
                  key={k.digit}
                  onClick={() => handleKeypadPress(k.digit)}
                  className="h-14 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-850 text-white font-mono flex flex-col items-center justify-center transition-all active:scale-95 shadow-sm cursor-pointer"
                >
                  <span className="text-lg font-bold leading-none">{k.digit}</span>
                  {k.sub && <span className="text-[8px] text-slate-400 tracking-widest mt-0.5">{k.sub}</span>}
                </button>
              ))}
            </div>

            {/* Action Buttons: Audio & Video Call */}
            <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto pt-1">
              <button
                onClick={() => handleInitiateCall(dialedNumber, 'audio')}
                disabled={!dialedNumber}
                className={`py-3 rounded-2xl font-extrabold text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  dialedNumber
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/25'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
              >
                <PhoneCall className="w-4 h-4" />
                <span>Audio Call</span>
              </button>

              <button
                onClick={() => handleInitiateCall(dialedNumber, 'video')}
                disabled={!dialedNumber}
                className={`py-3 rounded-2xl font-extrabold text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  dialedNumber
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 shadow-cyan-500/25'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
              >
                <Video className="w-4 h-4" />
                <span>Video Call</span>
              </button>
            </div>
          </div>

          {/* Directory & Speed Dial Section */}
          <div className="lg:col-span-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span>Quick Speed Dial (Saved Contacts)</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {contacts.length} {contacts.length === 1 ? 'Contact' : 'Contacts'}
              </span>
            </div>

            {contacts.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-3 bg-slate-950/70 rounded-2xl border border-dashed border-slate-800">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                  <Users className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-300">Quick Speed Dial is Empty</div>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    You haven't added any contacts yet. Once you add friends, colleagues, or specialists in your Contacts directory, they will appear here for fast 1-tap dialing.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {contacts.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-2xl bg-slate-950/80 hover:bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 transition-all"
                  >
                    <div
                      onClick={() => {
                        if (item.nvId) setDialedNumber(item.nvId);
                        else if (item.phone) setDialedNumber(item.phone);
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
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
                          {item.initials || item.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="truncate">
                        <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                          <span>{item.name}</span>
                          {item.category && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                              {item.category}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-emerald-400 font-bold">
                          {item.nvId ? `NV ${item.nvId}` : item.phone || 'Speed Dial'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleInitiateCall(item.nvId || item.phone || '', 'audio')}
                        className="w-7 h-7 rounded-full bg-slate-800 hover:bg-emerald-500 text-slate-300 hover:text-slate-950 flex items-center justify-center transition-all cursor-pointer"
                        title={`Audio call ${item.name}`}
                      >
                        <Phone className="w-3.5 h-3.5 fill-current" />
                      </button>
                      <button
                        onClick={() => handleInitiateCall(item.nvId || item.phone || '', 'video')}
                        className="w-7 h-7 rounded-full bg-slate-800 hover:bg-cyan-500 text-slate-300 hover:text-slate-950 flex items-center justify-center transition-all cursor-pointer"
                        title={`Video call ${item.name}`}
                      >
                        <Video className="w-3.5 h-3.5 fill-current" />
                      </button>
                      <button
                        onClick={() => handleInitiateChat(item.nvId || item.phone || '')}
                        className="w-7 h-7 rounded-full bg-slate-800 hover:bg-indigo-500 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                        title={`Chat with ${item.name}`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
