import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  AudioLines,
  Check,
  Copy,
  Fingerprint,
  MessageCircle,
  Sparkles,
  Tv,
  Users,
  Eye,
  EyeOff,
  MoreHorizontal,
  Send,
  Wallet,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { LangpretationIcon } from '../common/LangpretationIcon';
import './HomeView.css';

const parseMoney = (value: unknown) => {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : undefined;
};

export const HomeView: React.FC = () => {
  const {
    currentUser,
    authUser,
    setActiveTab,
    billingSummary,
    setPendingBillingAction,
    conversations,
  } = useNanivio();
  const [copied, setCopied] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const nvId = authUser?.nvId || currentUser.nvId || currentUser.nanivioNumber || '';
  const firstName = currentUser?.name?.trim().split(/\s+/)[0];

  // Billing summaries are asynchronous and can briefly belong to the previous
  // account after a switch. Only render financial details for the current owner.
  const ownerId = authUser?.id || currentUser.id;
  const ownedSummary = billingSummary?.userId === ownerId ? billingSummary : null;
  const walletBalances = useMemo(() => {
    if (!ownedSummary) return [];
    const entries =
      ownedSummary.accounts?.communicationAccount?.wallets ??
      ownedSummary.communicationWallets ??
      [];
    return entries.filter((item) => parseMoney(item.available) !== undefined);
  }, [ownedSummary]);

  const goToWallet = () => {
    setPendingBillingAction({ subTab: 'overview' });
    setActiveTab('billing');
  };

  const copyId = async () => {
    if (!nvId) return;
    try {
      await navigator.clipboard.writeText(nvId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be unavailable in restricted browsers.
    }
  };

  const shortcuts = [
    { title: 'Chat', description: 'Messages', icon: MessageCircle, action: () => setActiveTab('chat'), accent: 'cyan' },
    { title: 'Call', description: 'Audio or video', icon: AudioLines, action: () => setActiveTab('calls'), accent: 'violet' },
    { title: 'Langpretation', description: 'Translate', icon: LangpretationIcon, action: () => setActiveTab('chat'), accent: 'cream' },
    { title: 'Send credits', description: 'To a friend', icon: Send, action: () => { setPendingBillingAction({ subTab: 'transfer' }); setActiveTab('billing'); }, accent: 'violet' },
    { title: 'My credits', description: 'Balance', icon: Wallet, action: goToWallet, accent: 'cyan' },
    { title: 'More', description: 'All features', icon: MoreHorizontal, action: () => setMoreOpen((open) => !open), accent: 'cream' },
  ];
  const moreShortcuts = [
    { title: 'Contacts', description: 'Your people', icon: Users, action: () => setActiveTab('contacts'), accent: 'cream' },
    { title: 'NV Number', description: 'Your ID', icon: Fingerprint, action: () => setActiveTab('nvnumber'), accent: 'violet' },
    { title: 'Services', description: 'Verified pros', icon: Tv, action: () => setActiveTab('services'), accent: 'cyan' },
    { title: 'Malvi', description: 'AI assistant', icon: Sparkles, action: () => setActiveTab('malvi'), accent: 'cream' },
  ];

  const unreadCount = conversations.reduce((count, item) => count + (item.unreadCount || 0), 0);
  const greeting = firstName ? `Hello, ${firstName}` : 'Hello';

  return (
    <div className="nv-home nv-home-dashboard home-dashboard mx-auto w-full max-w-7xl">
      <section className="home-overview" aria-label="Your Nanivio overview">
        <div className="nv-home-hero home-profile-card nv-neon-hero">
          <svg className="nv-hero-ribbons" viewBox="0 0 600 260" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="nv-ribbon-a" x1="0" x2="1">
                <stop offset="0" stopColor="#22d3ee" stopOpacity="0" />
                <stop offset=".35" stopColor="#22d3ee" />
                <stop offset=".7" stopColor="#8b5cf6" />
                <stop offset="1" stopColor="#ec4899" stopOpacity=".2" />
              </linearGradient>
              <linearGradient id="nv-ribbon-b" x1="0" x2="1">
                <stop offset="0" stopColor="#ec4899" stopOpacity="0" />
                <stop offset=".5" stopColor="#a855f7" />
                <stop offset="1" stopColor="#38bdf8" stopOpacity=".3" />
              </linearGradient>
            </defs>
            <path d="M-20 210 C 120 120, 220 250, 360 150 S 560 40, 640 90" stroke="url(#nv-ribbon-a)" strokeWidth="18" fill="none" />
            <path d="M-20 235 C 140 150, 250 260, 380 175 S 560 80, 640 120" stroke="url(#nv-ribbon-b)" strokeWidth="9" fill="none" />
            <path d="M-20 190 C 100 110, 240 220, 350 130 S 540 20, 640 60" stroke="url(#nv-ribbon-a)" strokeWidth="3" fill="none" />
          </svg>
          <div className="nv-hero-copy">
            <div className="nv-hero-hello">
              <span className="home-profile-avatar">
                {currentUser.avatar ? (
                  <img src={currentUser.avatar} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                ) : null}
                <span>{currentUser.initials || firstName?.slice(0, 1) || 'N'}</span>
                {currentUser.isOnline && <i aria-label="Online" />}
              </span>
              <span>{greeting}</span>
            </div>
            <h1 id="home-title">Connect Beyond Boundaries</h1>
            <div className="nv-hero-actions">
              <button type="button" className="nv-gradient-button" onClick={() => setActiveTab('chat')}>
                <MessageCircle size={16} /> Start Messaging
              </button>
              <div className="home-profile-id">
                <span><Fingerprint size={14} /> NV ID</span>
                <strong>{nvId || 'Not assigned'}</strong>
                {nvId && (
                  <button onClick={copyId} aria-label="Copy Nanivio ID">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="nv-hero-emblem" aria-hidden="true">
            <span className="nv-hero-emblem-glow" />
            <img src="/brand/nanivio-emblem.png" alt="" />
          </div>
        </div>

        <section className="home-wallet-card" aria-labelledby="wallet-heading">
          <div className="home-wallet-heading">
            <div>
              <h2 id="wallet-heading">Credits</h2>
            </div>
            <button
              className="home-icon-button"
              type="button"
              onClick={() => setBalanceVisible((visible) => !visible)}
              aria-label={balanceVisible ? 'Hide credit balances' : 'Show credit balances'}
              aria-pressed={!balanceVisible}
            >
              {balanceVisible ? <Eye size={17} /> : <EyeOff size={17} />}
            </button>
          </div>
          <div className="home-wallet-balances" aria-live="polite">
            {!ownedSummary ? (
              <div className="home-wallet-unknown">
                <strong>—</strong><span>Credit balance unavailable</span>
              </div>
            ) : walletBalances.length ? (
              walletBalances.slice(0, 3).map((item) => (
                <div className="home-wallet-amount" key={item.currency}>
                  <span>{item.currency}</span>
                  <strong>{balanceVisible ? `${Number(item.available).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} credits` : '••••••'}</strong>
                </div>
              ))
            ) : (
              <div className="home-wallet-unknown">
                <strong>—</strong><span>No credit balances available</span>
              </div>
            )}
          </div>
          <div className="home-wallet-footer">
            <span />
            <button type="button" onClick={goToWallet}>Manage <ArrowUpRight size={15} /></button>
          </div>
          <div className="home-wallet-light" aria-hidden="true" />
        </section>
      </section>

      <section className="home-shortcuts-section" aria-labelledby="home-shortcuts-title">
        <div className="home-section-title">
          <div><h2 id="home-shortcuts-title">Quick access</h2></div>
          {unreadCount > 0 && <button className="home-unread-link" onClick={() => setActiveTab('chat')}>{unreadCount} unread <ArrowUpRight size={14} /></button>}
        </div>
        <div className="home-shortcut-grid">
          {shortcuts.map(({ title, description, icon: Icon, action, accent }) => (
            <button className={`home-shortcut home-accent-${accent}`} key={title} onClick={action}
              aria-expanded={title === 'More' ? moreOpen : undefined}
              aria-controls={title === 'More' ? 'home-more-shortcuts' : undefined}>
              <span className="home-shortcut-icon"><Icon size={title === 'Langpretation' ? 28 : 19} strokeWidth={1.8} /></span>
              <span className="home-shortcut-copy"><strong>{title}</strong><small>{description}</small></span>
              <ArrowUpRight className="home-shortcut-arrow" size={15} />
            </button>
          ))}
        </div>
        {moreOpen && <div className="home-shortcut-grid home-more-shortcuts" id="home-more-shortcuts" aria-label="More Home destinations">
          {moreShortcuts.map(({ title, description, icon: Icon, action, accent }) => (
            <button className={`home-shortcut home-accent-${accent}`} key={title} onClick={action}>
              <span className="home-shortcut-icon"><Icon size={19} strokeWidth={1.8} /></span>
              <span className="home-shortcut-copy"><strong>{title}</strong><small>{description}</small></span>
              <ArrowUpRight className="home-shortcut-arrow" size={15} />
            </button>
          ))}
        </div>}
      </section>

    </div>
  );
};
