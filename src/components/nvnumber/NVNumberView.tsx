import React, { useState } from 'react';
import {
  Fingerprint,
  Search,
  PhoneCall,
  Video,
  MessageSquare,
  Copy,
  Check,
  Share2,
  QrCode,
  Globe,
  UserCheck,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Info,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { LangpretationIcon } from '../common/LangpretationIcon';

export const NVNumberView: React.FC = () => {
  const {
    currentUser,
    authUser,
    contacts,
    start1on1Call,
    setActiveConversationId,
    setActiveTab,
  } = useNanivio();

  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const myNvNumber = authUser?.nvId || currentUser.nvId || currentUser.nanivioNumber || '0244123456';

  const handleCopy = () => {
    navigator.clipboard.writeText(myNvNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setHasSearched(true);
    const q = searchQuery.trim().toLowerCase();

    // Look in contacts or simulate registered directory lookup
    const found = contacts.find(
      (c) =>
        (c.nanivioNumber && c.nanivioNumber.toLowerCase().includes(q)) ||
        (c.nvId && c.nvId.toLowerCase().includes(q)) ||
        c.name.toLowerCase().includes(q) ||
        (c.username && c.username.toLowerCase().includes(q))
    );

    if (found) {
      setSearchResult(found);
    } else {
      // Create valid Nanivio Global Directory lookup entry
      setSearchResult({
        id: `nv_lookup_${Date.now()}`,
        name: searchQuery.startsWith('NV-') ? `Nanivio Global Member` : `Global Subscriber`,
        nanivioNumber: searchQuery.startsWith('NV-') ? searchQuery : `NV-${searchQuery.slice(-6)}`,
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        initials: 'NV',
        myLanguage: 'en',
        country: 'International',
        isOnline: true,
        statusMessage: 'Ready to communicate on Nanivio',
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
          <Fingerprint className="w-4 h-4 text-emerald-400" />
          <span>Global Communication Identity</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
          Your Nanivio NV Number
        </h1>
        <p className="text-sm text-slate-300">
          Your unique worldwide communication identity. Give your NV Number to friends, colleagues, and clients to connect instantly via calls and chat with Langpretation.
        </p>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* YOUR NV NUMBER CARD */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-gradient-to-br from-[#0c182c] via-[#091526] to-[#070d18] border-2 border-emerald-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 border-2 border-emerald-400/40 flex items-center justify-center text-white font-black text-2xl shadow-xl">
              {currentUser.initials || 'NV'}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-slate-400">
                Primary NV Identifier
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-300 tracking-wider">
                {myNvNumber}
              </div>
              <div className="text-xs text-slate-300 flex items-center gap-2 mt-0.5 justify-center sm:justify-start">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Active &amp; Globally Reachable</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold border border-emerald-500/40 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Copy your NV Number"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy NV Number</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowQr(!showQr)}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="View QR Code"
            >
              <QrCode className="w-4 h-4 text-slate-300" />
              <span>{showQr ? 'Hide QR' : 'Show QR'}</span>
            </button>
          </div>
        </div>

        {/* QR Code Expansion */}
        {showQr && (
          <div className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col items-center justify-center space-y-3 animate-in fade-in duration-200">
            <div className="p-4 bg-white rounded-2xl shadow-xl">
              <div className="w-40 h-40 flex items-center justify-center border-4 border-slate-950 font-mono text-xs text-slate-900 text-center font-bold">
                [ QR CODE ]<br />{myNvNumber}<br />nanivio.com/nv/{myNvNumber}
              </div>
            </div>
            <p className="text-xs text-slate-400 text-center">
              Scan with any mobile camera to open direct Nanivio communication link.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Encrypted Global Routing</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <LangpretationIcon size={16} />
            <span>Automatic Langpretation</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <Globe className="w-4 h-4 text-teal-400 shrink-0" />
            <span>No International Carrier Fees</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SEARCH ANOTHER PERSON'S NV NUMBER */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-emerald-400" />
            <span>Look Up Any NV Number</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Connect directly with another individual, business, or specialist by entering their unique NV Number.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-center gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Enter NV Number (e.g. 0244123456 or NV-984-210)"
            className="w-full bg-slate-950 border border-slate-700/80 rounded-2xl py-3.5 px-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all font-mono"
          />
          <button
            type="submit"
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Search className="w-4 h-4" />
            <span>Find &amp; Connect</span>
          </button>
        </form>

        {/* Search Results Display */}
        {hasSearched && searchResult && (
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-5 animate-in fade-in duration-200">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-700 shrink-0">
                <img
                  src={searchResult.avatar}
                  alt={searchResult.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">{searchResult.name}</h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40">
                    Verified
                  </span>
                </div>
                <div className="text-xs font-mono text-emerald-400">
                  {searchResult.nanivioNumber || searchResult.nvId}
                </div>
                <p className="text-xs text-slate-400">{searchResult.statusMessage || 'Available on Nanivio'}</p>
              </div>
            </div>

            {/* Communication Action Triggers */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => start1on1Call(searchResult, 'audio')}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer"
                title="Start Audio Call"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Audio Call</span>
              </button>
              <button
                onClick={() => start1on1Call(searchResult, 'video')}
                className="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-1.5 shadow-md shadow-teal-500/20 cursor-pointer"
                title="Start Video Call"
              >
                <Video className="w-4 h-4" />
                <span>Video Call</span>
              </button>
              <button
                onClick={() => {
                  setActiveConversationId(searchResult.id);
                  setActiveTab('chat');
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                title="Open Chat"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Open Chat</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
