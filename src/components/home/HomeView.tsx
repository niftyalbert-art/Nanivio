import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  AudioLines,
  Check,
  Copy,
  CreditCard,
  Fingerprint,
  Globe2,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Tv,
  Users,
  Video,
  Eye,
  EyeOff,
  Clock3,
  Languages,
  MoreHorizontal,
  Send,
  Wallet,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { lookupNanivioUser } from '../../utils/userLookup';
import { VerifiedServicesLocationSection } from './VerifiedServicesLocationSection';
import './HomeView.css';

const currencyFormatter = (currency: string, amount: number) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
};

const activityLabel = (serviceType: string) =>
  serviceType.replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

const valueFrom = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
};

const parseMoney = (value: unknown) => {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : undefined;
};

const safeActivityDate = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '';
  const date = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value as string | number);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const activityTimestamp = (value: unknown) => {
  if (value === undefined || value === null || value === '') return 0;
  const timestamp = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value as string | number).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const HomeView: React.FC = () => {
  const {
    currentUser,
    authUser,
    setActiveTab,
    start1on1Call,
    startDirectChatWithUser,
    contacts,
    adminFeatures,
    billingSummary,
    setPendingBillingAction,
    conversations,
  } = useNanivio();
  const audioEnabled = adminFeatures?.audioCallsEnabled !== false;
  const videoEnabled = adminFeatures?.videoCallsEnabled !== false;
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; user?: any; error?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
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

  const recentActivity = useMemo(() => {
    if (!ownedSummary) return [];
    return [...(ownedSummary.recentTransactions ?? [])]
      .filter((transaction) => {
        const rowOwner = valueFrom(transaction as unknown as Record<string, unknown>, 'userId', 'user_id');
        return rowOwner === undefined || rowOwner === ownerId;
      })
      .sort((a, b) => {
        const aDate = valueFrom(a as unknown as Record<string, unknown>, 'createdAt', 'created_at');
        const bDate = valueFrom(b as unknown as Record<string, unknown>, 'createdAt', 'created_at');
        return activityTimestamp(bDate) - activityTimestamp(aDate);
      })
      .slice(0, 4);
  }, [ownedSummary, ownerId]);

  const goToWallet = () => {
    setPendingBillingAction({ subTab: 'overview' });
    setActiveTab('billing');
  };

  const searchUser = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value || loading) return;
    setLoading(true);
    setFeedback(null);
    try {
      const saved = contacts.find((person) =>
        [person.nanivioNumber, person.nvId, person.name, person.username].some((field) =>
          field?.toLowerCase().includes(value.toLowerCase()),
        ),
      );
      const user = saved || (await lookupNanivioUser(value));
      setFeedback(
        user
          ? { message: `${user.name} · ${user.nanivioNumber || user.nvId || 'Nanivio member'}`, user }
          : { message: `No Nanivio member found for “${value}”. Check the ID and try again.`, error: true },
      );
    } catch {
      setFeedback({ message: 'Directory lookup is unavailable right now. Try again shortly.', error: true });
    } finally {
      setLoading(false);
    }
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
    { title: 'Langpretation', description: 'Language controls in chat', icon: Languages, action: () => setActiveTab('chat'), accent: 'cream' },
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
    <div className="nv-home nv-home-dashboard home-dashboard mx-auto w-full max-w-7xl px-4 pb-8 pt-5 sm:px-6 lg:px-8">
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
              <span className="home-shortcut-icon"><Icon size={19} strokeWidth={1.8} /></span>
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

      <section className="home-activity" aria-labelledby="home-activity-title">
        <div className="home-section-title home-activity-heading">
          <div><p className="home-overline">FROM YOUR ACCOUNT</p><h2 id="home-activity-title">Recent activity</h2></div>
          <button className="home-text-link" onClick={goToWallet}>See all <ArrowUpRight size={14} /></button>
        </div>
        {!ownedSummary ? (
          <div className="home-activity-empty">
            <Clock3 size={17} /><span>Activity will appear here when your billing details are available.</span>
          </div>
        ) : recentActivity.length ? (
          <div className="home-activity-list">
            {recentActivity.map((transaction) => {
              const record = transaction as unknown as Record<string, unknown>;
              const title = String(valueFrom(record, 'providerName', 'provider_name') || activityLabel(String(valueFrom(record, 'serviceType', 'service_type') || 'credit activity')));
              const service = String(valueFrom(record, 'serviceType', 'service_type') || 'credit activity');
              const rawStatus = String(valueFrom(record, 'status') || 'Recorded');
              const status = activityLabel(rawStatus);
              const amount = parseMoney(valueFrom(record, 'total', 'total_amount', 'amount'));
              const currency = String(valueFrom(record, 'currency') || '');
              const activityDate = safeActivityDate(valueFrom(record, 'createdAt', 'created_at'));
              const transactionId = String(valueFrom(record, 'transactionId', 'transaction_id', 'referenceId', 'reference_id') || `${service}-${activityDate}`);
              return (
                <button className="home-activity-row" key={transactionId} onClick={goToWallet}>
                  <span className={`home-activity-icon ${rawStatus.toUpperCase() === 'COMPLETED' ? 'is-complete' : ''}`}>
                    <CreditCard size={17} />
                  </span>
                  <span className="home-activity-main">
                    <strong>{title}</strong>
                    <small>{activityLabel(service)}{activityDate ? ` · ${activityDate}` : ''}</small>
                  </span>
                  <span className="home-activity-amount">
                    <strong>{amount !== undefined && currency ? currencyFormatter(currency, amount) : amount !== undefined ? `${amount.toLocaleString()} ${currency}`.trim() : '—'}</strong>
                    <small>{status}</small>
                  </span>
                  <ArrowUpRight className="home-activity-arrow" size={14} />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="home-activity-empty">
            <Clock3 size={17} /><span>No credit activity to show yet.</span>
          </div>
        )}
      </section>

      <section className="home-find" aria-labelledby="home-find-title">
        <div className="home-find-heading">
          <div><p className="home-overline">PEOPLE, EVERYWHERE</p><h2 id="home-find-title">Find someone on Nanivio</h2></div>
          <button className="home-text-link" onClick={() => setActiveTab('contacts')}>Your contacts <ArrowUpRight size={14} /></button>
        </div>
        <form className="home-lookup" onSubmit={searchUser}>
          <Search size={18} aria-hidden="true" />
          <input aria-label="Search by Nanivio ID or name" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nanivio ID, phone number, or name" />
          <button type="submit" disabled={loading || !query.trim()}>{loading ? 'Searching…' : 'Find person'} <ArrowUpRight size={15} /></button>
        </form>
        {feedback && (
          <div className={`home-lookup-result ${feedback.error ? 'is-error' : ''}`} role={feedback.error ? 'alert' : 'status'}>
            <span>{feedback.message}</span>
            {feedback.user && <div className="home-result-actions">
              <button aria-label="Start audio call" disabled={!audioEnabled} onClick={() => audioEnabled && start1on1Call(feedback.user, 'audio')}><Phone size={16} /></button>
              <button aria-label="Start video call" disabled={!videoEnabled} onClick={() => videoEnabled && start1on1Call(feedback.user, 'video')}><Video size={16} /></button>
              <button aria-label="Open chat" onClick={() => startDirectChatWithUser({
                ...feedback.user,
                myLanguage: feedback.user.myLanguage || feedback.user.preferredLanguage || 'en',
                role: feedback.user.role || 'user',
              })}><MessageCircle size={16} /></button>
            </div>}
          </div>
        )}
      </section>

      <section className="home-language-note" aria-label="Langpretation">
        <span className="home-language-icon"><Globe2 size={19} /></span>
        <div><p className="home-overline">LANGPRETATION</p><p>Make every conversation understood. Find Langpretation in your chat and call controls.</p></div>
        <button onClick={() => setActiveTab('chat')} aria-label="Open chat to use Langpretation"><ArrowUpRight size={16} /></button>
      </section>

      <section className="home-services" aria-labelledby="home-services-title">
        <div className="home-services-heading">
          <div><p className="home-overline">EXPLORE NANIVIO</p><h2 id="home-services-title">Verified services &amp; live</h2></div>
          <button className="home-text-link" onClick={() => setActiveTab('services')}>Open services <ArrowUpRight size={14} /></button>
        </div>
        <VerifiedServicesLocationSection />
      </section>
    </div>
  );
};
