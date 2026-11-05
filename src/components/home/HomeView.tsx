import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  AudioLines,
  Check,
  Copy,
  Fingerprint,
  MessageCircle,
  ShieldCheck,
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
    { title: 'Chat', description: 'Pick up a conversation', icon: MessageCircle, action: () => setActiveTab('chat'), accent: 'cyan' },
    { title: 'Call', description: 'Audio or video', icon: AudioLines, action: () => setActiveTab('calls'), accent: 'violet' },
    { title: 'Langpretation', description: 'Language controls in chat', icon: LangpretationIcon, action: () => setActiveTab('chat'), accent: 'cream' },
    { title: 'Send credits', description: 'Nanivio credits to another user', icon: Send, action: () => { setPendingBillingAction({ subTab: 'transfer' }); setActiveTab('billing'); }, accent: 'violet' },
    { title: 'My credits', description: 'Credits & billing', icon: Wallet, action: goToWallet, accent: 'cyan' },
    { title: 'More', description: 'Explore Nanivio', icon: MoreHorizontal, action: () => setMoreOpen((open) => !open), accent: 'cream' },
  ];
  const moreShortcuts = [
    { title: 'Contacts', description: 'People you know', icon: Users, action: () => setActiveTab('contacts'), accent: 'cream' },
    { title: 'NV Number', description: 'Your Nanivio identity', icon: Fingerprint, action: () => setActiveTab('nvnumber'), accent: 'violet' },
    { title: 'Services', description: 'Verified people & live', icon: Tv, action: () => setActiveTab('services'), accent: 'cyan' },
    { title: 'Malvi', description: 'Your personal assistant', icon: Sparkles, action: () => setActiveTab('malvi'), accent: 'cream' },
  ];

  const unreadCount = conversations.reduce((count, item) => count + (item.unreadCount || 0), 0);
  const greeting = firstName ? `Hello, ${firstName}` : 'Hello';

  return (
    <div className="nv-home nv-home-dashboard home-dashboard mx-auto w-full max-w-7xl">
      <section className="home-overview" aria-label="Your Nanivio overview">
        <div className="nv-home-hero home-profile-card">
          <div className="home-profile-avatar">
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            ) : null}
            <span>{currentUser.initials || firstName?.slice(0, 1) || 'N'}</span>
            {currentUser.isOnline && <i aria-label="Online" />}
          </div>
          <div className="home-profile-copy">
            <p className="home-overline">YOUR NANIVIO</p>
            <h1 id="home-title">{greeting}<span aria-hidden="true">.</span></h1>
            <p className="home-welcome">Welcome back.</p>
          </div>
          <div className="home-profile-id">
            <span><Fingerprint size={14} /> NANIVIO ID</span>
            <strong>{nvId || 'Not assigned'}</strong>
            {nvId && (
              <button onClick={copyId} aria-label="Copy Nanivio ID">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
        </div>

        <section className="home-wallet-card" aria-labelledby="wallet-heading">
          <div className="home-wallet-heading">
            <div>
              <p className="home-overline">NANIVIO CREDITS</p>
              <h2 id="wallet-heading">Your credit balance</h2>
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
            <span><ShieldCheck size={14} /> For Nanivio services &amp; P2P credits</span>
            <button type="button" onClick={goToWallet}>Manage credits <ArrowUpRight size={15} /></button>
          </div>
          <div className="home-wallet-light" aria-hidden="true" />
        </section>
      </section>

      <section className="home-shortcuts-section" aria-labelledby="home-shortcuts-title">
        <div className="home-section-title">
          <div><p className="home-overline">QUICK ACCESS</p><h2 id="home-shortcuts-title">Where to?</h2></div>
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
