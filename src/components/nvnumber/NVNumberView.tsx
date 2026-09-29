import React, { useState, useEffect } from 'react';
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
  ShieldCheck,
  Sparkles,
  Download,
  AlertCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useNanivio } from '../../context/NanivioContext';
import { LangpretationIcon } from '../common/LangpretationIcon';
import { lookupNanivioUser, normalizeNanivioNumber } from '../../utils/userLookup';
import { Participant } from '../../types';

export const NVNumberView: React.FC = () => {
  const {
    currentUser,
    authUser,
    start1on1Call,
    startDirectChatWithUser,
  } = useNanivio();

  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<Participant | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const myNvNumber = authUser?.nvId || currentUser.nvId || currentUser.nanivioNumber || '0486482190';
  const qrTargetUrl = `https://nanivio.tech/nv/${encodeURIComponent(myNvNumber)}`;

  // Generate live vector/high-res QR code locally without any third-party external dependencies
  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(qrTargetUrl, {
      width: 360,
      margin: 2,
      color: {
        dark: '#030712',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        if (isMounted) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate live QR code:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [qrTargetUrl]);

  const handleCopy = () => {
    navigator.clipboard.writeText(myNvNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(qrTargetUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = searchQuery.trim();
    if (!clean) return;

    setHasSearched(true);
    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      const user = await lookupNanivioUser(clean);
      if (user) {
        setSearchResult(user);
      } else {
        setSearchError(`Nanivio number "${clean}" could not be found in the live directory.`);
      }
    } catch (err) {
      setSearchError('Error looking up number. Please verify connectivity and try again.');
    } finally {
      setIsSearching(false);
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

        {/* Live Authenticated Dynamic QR Code Expansion */}
        {showQr && (
          <div className="p-6 rounded-2xl bg-slate-950/90 border border-emerald-500/30 flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-200">
            <div className="p-3 bg-white rounded-2xl shadow-2xl border-2 border-emerald-400/40 flex items-center justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`Live QR Code for NV Number ${myNvNumber}`}
                  className="w-52 h-52 sm:w-60 sm:h-60 object-contain rounded-lg"
                />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-slate-600 font-mono text-xs">
                  Generating Live QR...
                </div>
              )}
            </div>
            <div className="text-center space-y-1">
              <div className="font-mono text-sm font-bold text-emerald-400">
                NV {myNvNumber}
              </div>
              <p className="text-xs text-slate-300 max-w-sm">
                Scan with any mobile camera to open direct live communication and profile connection.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-700 hover:border-emerald-500 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {linkCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copy Profile Link</span>
                  </>
                )}
              </button>
              {qrDataUrl && (
                <a
                  href={qrDataUrl}
                  download={`nanivio_qr_${myNvNumber}.png`}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-medium border border-emerald-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Live QR</span>
                </a>
              )}
            </div>
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
            placeholder="Enter NV Number (e.g. 0486482190 or NV-0486XXXXXX)"
            className="w-full bg-slate-950 border border-slate-700/80 rounded-2xl py-3.5 px-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all font-mono"
          />
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            {isSearching ? (
              <span className="animate-pulse">Searching...</span>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Find &amp; Connect</span>
              </>
            )}
          </button>
        </form>

        {/* Search Results Display */}
        {hasSearched && searchResult && (
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-5 animate-in fade-in duration-200">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-700 bg-slate-800 flex items-center justify-center shrink-0">
                {searchResult.avatar ? (
                  <img
                    src={searchResult.avatar}
                    alt={searchResult.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-base font-bold text-emerald-400 font-mono">
                    {searchResult.initials || 'NV'}
                  </span>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">{searchResult.name}</h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40">
                    Verified
                  </span>
                </div>
                <div className="text-xs font-mono text-emerald-400">
                  {searchResult.nvId ? `NV ${searchResult.nvId}` : 'Nanivio Subscriber'}
                </div>
                <p className="text-xs text-slate-400">{searchResult.country || 'Global Network'}</p>
              </div>
            </div>

            {/* Communication Action Triggers */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => start1on1Call(searchResult, 'audio')}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer"
                title="Start Audio Call"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Audio Call</span>
              </button>
              <button
                type="button"
                onClick={() => start1on1Call(searchResult, 'video')}
                className="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-1.5 shadow-md shadow-teal-500/20 cursor-pointer"
                title="Start Video Call"
              >
                <Video className="w-4 h-4" />
                <span>Video Call</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  startDirectChatWithUser(searchResult);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                title="Open Chat"
              >
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span>Open Chat</span>
              </button>
            </div>
          </div>
        )}

        {hasSearched && !searchResult && !isSearching && searchError && (
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3 text-slate-400 text-xs">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}
      </div>
    </div>
  );
};
